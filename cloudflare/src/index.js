const CATEGORIES=['City Hall & Taxes','Schools & Families','Roads & Utilities','Local Businesses','Community Life'];
const COOKIE='cove_visitor';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:message},status);
function cookie(req){const raw=req.headers.get('Cookie')||'';return raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)}
function safeText(v,max){return typeof v==='string'?v.trim().slice(0,max):''}
function validId(v){return typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)}
function cors(origin,env){return {'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}}
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
if(req.method==='GET'&&path==='/api/discussions'){
const rows=await env.DB.prepare("SELECT d.id,d.display_name,d.category,d.title,d.body,d.created_at,(SELECT COUNT(*) FROM replies r WHERE r.discussion_id=d.id AND r.status='published') AS reply_count FROM discussions d WHERE d.status='published' ORDER BY d.created_at DESC LIMIT 50").all();
return json({discussions:rows.results},200,headers)}
if(req.method==='GET'&&path.startsWith('/api/discussions/')){
const key=path.split('/')[3];if(!validId(key))return json({error:'Invalid discussion'},400,headers);
const discussion=await env.DB.prepare("SELECT id,display_name,category,title,body,created_at FROM discussions WHERE id=? AND status='published'").bind(key).first();if(!discussion)return json({error:'Not found'},404,headers);
const replies=await env.DB.prepare("SELECT id,parent_id,display_name,body,created_at FROM replies WHERE discussion_id=? AND status='published' ORDER BY created_at ASC LIMIT 300").bind(key).all();return json({discussion,replies:replies.results},200,headers)}
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
