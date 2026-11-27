
-- Optional registered vehicle descriptors; keyed by registered make and model.
CREATE TABLE IF NOT EXISTS driver_vehicle_prefill (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 make TEXT NOT NULL, model TEXT NOT NULL, color TEXT NOT NULL DEFAULT '',
 model_year INTEGER CHECK(model_year BETWEEN 1900 AND 2100),
 vehicle_type TEXT NOT NULL DEFAULT ''
);
