
CREATE TABLE IF NOT EXISTS driver_profile_review_history (
 action_id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff_users(id),
 revision TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES staff_users(id),
 state TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS driver_profile_review_history_staff ON driver_profile_review_history(staff_id,created_at);
