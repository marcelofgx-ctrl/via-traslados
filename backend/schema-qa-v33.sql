-- V33: EXCLUSIVO D1 QA; no aplicar a D1 de producción.
CREATE TABLE IF NOT EXISTS qa_driver_applications (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 vehicle_year INTEGER NOT NULL CHECK(vehicle_year BETWEEN 1980 AND 2100),
 vehicle_color TEXT NOT NULL DEFAULT '',
 photo_jpeg_base64 TEXT NOT NULL DEFAULT '',
 review_note TEXT NOT NULL DEFAULT '',
 reviewed_at INTEGER,
 reviewed_by TEXT,
 submitted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS qa_applications_date
 ON qa_driver_applications(submitted_at DESC);
