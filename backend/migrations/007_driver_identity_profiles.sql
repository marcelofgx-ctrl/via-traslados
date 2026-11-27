-- Additive; existing reservations and vehicle profiles remain intact.
CREATE TABLE IF NOT EXISTS driver_identity_profiles (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 revision TEXT NOT NULL,
 review_state TEXT NOT NULL CHECK(review_state IN ('pending','approved','rejected')),
 plate TEXT NOT NULL, make TEXT NOT NULL, model TEXT NOT NULL, color TEXT NOT NULL,
 driver_jpeg TEXT NOT NULL CHECK(length(driver_jpeg) BETWEEN 4 AND 240000),
 front_jpeg TEXT NOT NULL CHECK(length(front_jpeg) BETWEEN 4 AND 240000),
 rear_jpeg TEXT NOT NULL CHECK(length(rear_jpeg) BETWEEN 4 AND 240000),
 recognition_json TEXT NOT NULL CHECK(length(recognition_json)<=1500),
 consent_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 reviewed_at INTEGER, reviewed_by TEXT, review_action TEXT, review_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS driver_identity_review_idx ON driver_identity_profiles(review_state,updated_at);
