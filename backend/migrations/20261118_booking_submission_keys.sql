-- Vía Traslados: migración aditiva, segura para V29/V35 previas.
-- NO aplicar automáticamente en D1 productiva. Primero QA y respaldo.
CREATE TABLE IF NOT EXISTS booking_submission_keys (
  key_hash TEXT PRIMARY KEY CHECK(length(key_hash)=64),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  email TEXT NOT NULL,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS booking_submission_by_email ON booking_submission_keys(email,created_at);
