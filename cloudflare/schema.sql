-- Cove Speaks D1 schema
CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discussions (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, display_name TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(visitor_id) REFERENCES visitors(id));
CREATE INDEX IF NOT EXISTS discussions_recent ON discussions(status,created_at DESC);
CREATE TABLE IF NOT EXISTS replies (id TEXT PRIMARY KEY, discussion_id TEXT NOT NULL, parent_id TEXT, visitor_id TEXT NOT NULL, display_name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(discussion_id) REFERENCES discussions(id));
CREATE INDEX IF NOT EXISTS replies_discussion ON replies(discussion_id,status,created_at);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, target_type TEXT NOT NULL CHECK(target_type IN ('discussion','reply')), target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(visitor_id,target_type,target_id));
