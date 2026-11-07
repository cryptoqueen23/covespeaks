-- Cove Speaks D1 schema
CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discussions (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, display_name TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(visitor_id) REFERENCES visitors(id));
CREATE INDEX IF NOT EXISTS discussions_recent ON discussions(status,created_at DESC);
CREATE TABLE IF NOT EXISTS replies (id TEXT PRIMARY KEY, discussion_id TEXT NOT NULL, parent_id TEXT, visitor_id TEXT NOT NULL, display_name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(discussion_id) REFERENCES discussions(id));
CREATE INDEX IF NOT EXISTS replies_discussion ON replies(discussion_id,status,created_at);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, target_type TEXT NOT NULL CHECK(target_type IN ('discussion','reply')), target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(visitor_id,target_type,target_id));

-- People's Pulse community survey. One response per visitor cookie (not identity verification).
CREATE TABLE IF NOT EXISTS survey_responses (id TEXT PRIMARY KEY, survey_key TEXT NOT NULL, visitor_id TEXT NOT NULL, answers TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(survey_key,visitor_id));
CREATE INDEX IF NOT EXISTS survey_responses_key ON survey_responses(survey_key);

-- Moderated recognition and accountability nominations
CREATE TABLE IF NOT EXISTS nominations (id TEXT PRIMARY KEY,visitor_id TEXT NOT NULL,hall TEXT NOT NULL CHECK(hall IN ('fame','shame')),nominee TEXT NOT NULL,role TEXT NOT NULL,details TEXT NOT NULL,source_url TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS nominations_by_hall ON nominations(hall,status,created_at DESC);

-- Opt-in insurance inquiries; never joined to civic participation records
CREATE TABLE IF NOT EXISTS insurance_leads (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT,interest TEXT NOT NULL,consent_text TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'cove-speaks',status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS insurance_leads_recent ON insurance_leads(created_at DESC);

-- Moderated, non-ranked resident candidate feedback; one submission per browser per candidate
CREATE TABLE IF NOT EXISTS candidate_feedback (id TEXT PRIMARY KEY,visitor_id TEXT NOT NULL,place INTEGER NOT NULL CHECK(place IN (6,7)),candidate TEXT NOT NULL,topic TEXT NOT NULL,comment TEXT NOT NULL,source_url TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(visitor_id,place,candidate));
CREATE INDEX IF NOT EXISTS candidate_feedback_listing ON candidate_feedback(place,candidate,status,created_at DESC);
