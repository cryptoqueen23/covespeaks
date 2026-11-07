const CATEGORIES=['City Hall & Taxes','Schools & Families','Roads & Utilities','Local Businesses','Community Life'];
const COOKIE='cove_visitor';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:message},status);
function cookie(req){const raw=req.headers.get('Cookie')||'';return raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)}
function safeText(v,max){return typeof v==='string'?v.trim().slice(0,max):''}
function validId(v){return typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)}
function cors(origin,env){return {'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}}
async function verifyTurnstile(token,req,env){if(!env.TURNSTILE_SECRET)return false;const form=new FormData();form.append('secret',env.TURNSTILE_SECRET);form.append('response',token||'');form.append('remoteip',req.headers.get('CF-Connecting-IP')||'');try{const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});return (await r.json()).success===true}catch{return false}}
async function throttle(db,id){const row=await db.prepare("SELECT COUNT(*) AS n FROM (SELECT created_at FROM discussions WHERE visitor_id=? AND created_at > datetime('now','-60 seconds') UNION ALL SELECT created_at FROM replies WHERE visitor_id=? AND created_at > datetime('now','-60 seconds'))").bind(id,id).first();return (row?.n||0)<3}
export default {async fetch(req,env){
const origin=req.headers.get('Origin');if(origin!==env.SITE_ORIGIN)return fail('Origin not allowed',403);
const h=cors(origin,env);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
if(!env.DB)return json({error:'Database not configured'},503,h);
try{
const url=new URL(req.url);const path=url.pathname;let id=cookie(req);let setCookie='';
if(!validId(id)){id=crypto.randomUUID();setCookie=`${COOKIE}=${id}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=None`;}
const headers={...h,...(setCookie?{'Set-Cookie':setCookie}:{})};
await env.DB.prepare('INSERT INTO visitors(id) VALUES (?) ON CONFLICT(id) DO NOTHING').bind(id).run();
const SURVEY_KEY='cove-report-card-2026';
const SURVEY_FIELDS=['roads','water','utility_bills','taxes','safety','spending','transparency','parks','quality_of_life','council','mayor','city_manager','police','fire','public_works','water_department','wastewater','streets','sanitation','parks_department','planning','finance','municipal_court','city_secretary','economic_development'];
const SURVEY_OPTIONS={heard:['yes','sometimes','no','unsure'],tax_value:['yes','somewhat','no','unsure'],moving:['yes','considering','no','unsure']};
const RECALL_OPTIONS=['Strohfus','Hogan','Hawk','Hale','Hart','Treadway','Smith','Mayor Dancey'];
if(path==='/api/survey/results'&&req.method==='GET'){
const rows=await env.DB.prepare('SELECT answers FROM survey_responses WHERE survey_key=?').bind(SURVEY_KEY).all();
const summary={};for(const field of SURVEY_FIELDS)summary[field]={count:0,total:0,ratings:[0,0,0,0,0]};
for(const row of rows.results){let answers;try{answers=JSON.parse(row.answers)}catch{continue}for(const field of SURVEY_FIELDS){const v=answers[field];if(Number.isInteger(v)&&v>=1&&v<=5){summary[field].count++;summary[field].total+=v;summary[field].ratings[v-1]++}}}
const choices={};for(const [field,options] of Object.entries(SURVEY_OPTIONS)){choices[field]=Object.fromEntries(options.map(v=>[v,0]))}
const recall=Object.fromEntries(RECALL_OPTIONS.map(v=>[v,0]));let recallAnswered=0;
const bills={water_sewer:{count:0,bands:{'Under $100':0,'$100–199':0,'$200–299':0,'$300–499':0,'$500+':0}},property_tax:{count:0,bands:{'Under $1,000':0,'$1,000–2,499':0,'$2,500–4,999':0,'$5,000–7,499':0,'$7,500+':0}}};
for(const row of rows.results){let a;try{a=JSON.parse(row.answers)}catch{continue}
for(const [field,options] of Object.entries(SURVEY_OPTIONS)){if(options.includes(a[field]))choices[field][a[field]]++}
if(Array.isArray(a.recall)){recallAnswered++;for(const name of a.recall)if(Object.hasOwn(recall,name))recall[name]++}
for(const field of ['water_sewer','property_tax']){const v=a[field];if(typeof v!=='number'||!Number.isFinite(v)||v<0)continue;const o=bills[field];o.count++;let band;if(field==='water_sewer')band=v<100?'Under $100':v<200?'$100–199':v<300?'$200–299':v<500?'$300–499':'$500+';else band=v<1000?'Under $1,000':v<2500?'$1,000–2,499':v<5000?'$2,500–4,999':v<7500?'$5,000–7,499':'$7,500+';o.bands[band]++}
}
for(const field of SURVEY_FIELDS){const o=summary[field];o.average=o.count?Math.round(o.total/o.count*10)/10:null;delete o.total}
const own=await env.DB.prepare('SELECT id FROM survey_responses WHERE survey_key=? AND visitor_id=?').bind(SURVEY_KEY,id).first();
return json({total:rows.results.length,summary,choices,recall,recallAnswered,bills,submitted:!!own},200,headers)}
if(path==='/api/survey/respond'&&req.method==='POST'){
if(!req.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required'},415,headers);
const body=await req.json();if(!await verifyTurnstile(body.turnstileToken,req,env))return json({error:'Security verification required'},403,headers);
const answers={};for(const field of SURVEY_FIELDS){const v=body.answers?.[field];if(v===undefined||v===null||v==='')continue;if(!Number.isInteger(v)||v<1||v>5)return json({error:'Invalid rating'},400,headers);answers[field]=v}
for(const [field,options] of Object.entries(SURVEY_OPTIONS)){const v=body.answers?.[field];if(v===undefined||v==='')continue;if(!options.includes(v))return json({error:'Invalid answer'},400,headers);answers[field]=v}
if(body.answers?.recall!==undefined){const v=body.answers.recall;if(!Array.isArray(v)||v.length>RECALL_OPTIONS.length||new Set(v).size!==v.length||v.some(n=>!RECALL_OPTIONS.includes(n)))return json({error:'Invalid selection'},400,headers);answers.recall=v}
for(const field of ['water_sewer','property_tax']){const v=body.answers?.[field];if(v===undefined||v==='')continue;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000000||Math.round(v*100)!==v*100)return json({error:'Invalid dollar amount'},400,headers);answers[field]=v}
for(const field of ['like_cove','dislike_cove']){const v=body.answers?.[field];if(v===undefined||v==='')continue;if(typeof v!=='string'||v.length>1500)return json({error:'Written response is too long'},400,headers);const cleaned=v.trim();if(cleaned)answers[field]=cleaned}
if(Object.keys(answers).length<1)return json({error:'Answer at least one question'},400,headers);
const existing=await env.DB.prepare('SELECT id FROM survey_responses WHERE survey_key=? AND visitor_id=?').bind(SURVEY_KEY,id).first();if(existing)return json({error:'A response from this browser has already been recorded'},409,headers);
await env.DB.prepare('INSERT INTO survey_responses(id,survey_key,visitor_id,answers) VALUES(?,?,?,?)').bind(crypto.randomUUID(),SURVEY_KEY,id,JSON.stringify(answers)).run();
return json({ok:true},201,headers)}
if(req.method==='GET'&&path==='/api/discussions'){
const rows=await env.DB.prepare("SELECT d.id,d.display_name,d.category,d.title,d.body,d.created_at,(SELECT COUNT(*) FROM replies r WHERE r.discussion_id=d.id AND r.status='published') AS reply_count FROM discussions d WHERE d.status='published' ORDER BY d.created_at DESC LIMIT 50").all();
return json({discussions:rows.results},200,headers)}
if(req.method==='GET'&&path.startsWith('/api/discussions/')){
const key=path.split('/')[3];if(!validId(key))return json({error:'Invalid discussion'},400,headers);
const discussion=await env.DB.prepare("SELECT id,display_name,category,title,body,created_at FROM discussions WHERE id=? AND status='published'").bind(key).first();if(!discussion)return json({error:'Not found'},404,headers);
const replies=await env.DB.prepare("SELECT id,parent_id,display_name,body,created_at FROM replies WHERE discussion_id=? AND status='published' ORDER BY created_at ASC LIMIT 300").bind(key).all();return json({discussion,replies:replies.results},200,headers)}
if(path==='/api/admin/posts'&&req.method==='GET'){
if(!env.ADMIN_TOKEN||req.headers.get('Authorization')!=='Bearer '+env.ADMIN_TOKEN)return json({error:'Unauthorized'},401,headers);
const kind=url.searchParams.get('type')||'all';if(!['all','discussion','reply'].includes(kind))return json({error:'Invalid filter'},400,headers);
const limit=50;const offset=Math.min(10000,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
const parts=[];
if(kind!=='reply')parts.push("SELECT id,'discussion' AS type,display_name,category,title,body,created_at,status,NULL AS discussion_id FROM discussions");
if(kind!=='discussion')parts.push("SELECT id,'reply' AS type,display_name,NULL AS category,NULL AS title,body,created_at,status,discussion_id FROM replies");
const union=parts.join(' UNION ALL ');
const rows=await env.DB.prepare('SELECT * FROM ('+union+') ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').bind(limit+1,offset).all();
return json({posts:rows.results.slice(0,limit),hasMore:rows.results.length>limit,nextOffset:offset+limit},200,headers)}
if(path==='/api/admin/reports'&&req.method==='GET'){
if(!env.ADMIN_TOKEN||req.headers.get('Authorization')!=='Bearer '+env.ADMIN_TOKEN)return json({error:'Unauthorized'},401,headers);
const rows=await env.DB.prepare("SELECT reports.id,reports.target_type,reports.target_id,reports.reason,reports.created_at,COALESCE(d.title,r.body,'Content unavailable') AS content,COALESCE(d.status,r.status,'missing') AS status FROM reports LEFT JOIN discussions d ON reports.target_type='discussion' AND reports.target_id=d.id LEFT JOIN replies r ON reports.target_type='reply' AND reports.target_id=r.id ORDER BY reports.created_at DESC LIMIT 200").all();
return json({reports:rows.results},200,headers)}
if(path==='/api/admin/moderate'&&req.method==='POST'){
if(!env.ADMIN_TOKEN||req.headers.get('Authorization')!=='Bearer '+env.ADMIN_TOKEN)return json({error:'Unauthorized'},401,headers);
const body=await req.json();if(!['discussion','reply'].includes(body.targetType)||!validId(body.targetId)||!['hidden','published'].includes(body.status))return json({error:'Invalid action'},400,headers);
const table=body.targetType==='discussion'?'discussions':'replies';
await env.DB.prepare(`UPDATE ${table} SET status=? WHERE id=?`).bind(body.status,body.targetId).run();
return json({ok:true},200,headers)}
if(req.method==='POST'&&['/api/discussions','/api/replies','/api/reports'].includes(path)){
if(!req.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON required'},415,headers);
const body=await req.json();if(!await verifyTurnstile(body.turnstileToken,req,env))return json({error:'Security verification required'},403,headers);
if(!await throttle(env.DB,id))return json({error:'Please wait before posting again'},429,headers);
if(path==='/api/discussions'){
const name=safeText(body.displayName,40),title=safeText(body.title,120),content=safeText(body.body,3000);
if(name.length<2||title.length<5||content.length<10||!CATEGORIES.includes(body.category))return json({error:'Please complete all fields'},400,headers);
const key=crypto.randomUUID();await env.DB.prepare('INSERT INTO discussions(id,visitor_id,display_name,category,title,body) VALUES(?,?,?,?,?,?)').bind(key,id,name,body.category,title,content).run();return json({id:key},201,headers)}
if(path==='/api/replies'){
const name=safeText(body.displayName,40),content=safeText(body.body,2000),discussionId=body.discussionId,parentId=body.parentId||null;
if(name.length<2||content.length<2||!validId(discussionId)||(parentId&&!validId(parentId)))return json({error:'Invalid reply'},400,headers);
const discussion=await env.DB.prepare("SELECT id FROM discussions WHERE id=? AND status='published'").bind(discussionId).first();if(!discussion)return json({error:'Discussion unavailable'},404,headers);
if(parentId){const parent=await env.DB.prepare("SELECT id FROM replies WHERE id=? AND discussion_id=? AND status='published'").bind(parentId,discussionId).first();if(!parent)return json({error:'Parent reply unavailable'},400,headers)}
const key=crypto.randomUUID();await env.DB.prepare('INSERT INTO replies(id,discussion_id,parent_id,visitor_id,display_name,body) VALUES(?,?,?,?,?,?)').bind(key,discussionId,parentId,id,name,content).run();return json({id:key},201,headers)}
const type=body.targetType,targetId=body.targetId,reason=safeText(body.reason,500);
if(!['discussion','reply'].includes(type)||!validId(targetId)||reason.length<5)return json({error:'Invalid report'},400,headers);
const table=type==='discussion'?'discussions':'replies';const target=await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND status='published'`).bind(targetId).first();if(!target)return json({error:'Post unavailable'},404,headers);
await env.DB.prepare('INSERT OR IGNORE INTO reports(id,visitor_id,target_type,target_id,reason) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,type,targetId,reason).run();return json({ok:true},201,headers)}
return json({error:'Not found'},404,headers)
}catch(e){return json({error:'Request could not be processed'},500,h)}
}};
