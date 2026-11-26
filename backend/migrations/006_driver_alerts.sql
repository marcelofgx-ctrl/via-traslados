-- Additive only; apply to isolated QA before enabling VIA_DRIVER_ALERTS_ENABLED.
CREATE TABLE IF NOT EXISTS driver_alert_devices (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL, token TEXT UNIQUE, available INTEGER NOT NULL DEFAULT 0 CHECK(available IN (0,1)),
 updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE IF NOT EXISTS driver_alert_seen (
 staff_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 seen_at INTEGER NOT NULL DEFAULT(unixepoch()), PRIMARY KEY(staff_id,booking_id)
);
CREATE TABLE IF NOT EXISTS driver_alert_outbox (
 staff_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT(unixepoch()),
 lease TEXT, sent_at INTEGER, PRIMARY KEY(staff_id,booking_id)
);
CREATE INDEX IF NOT EXISTS driver_alert_outbox_due ON driver_alert_outbox(sent_at,retry_at);
-- Match existing operator list canQuote, not merely canRelease or visibility.
CREATE VIEW IF NOT EXISTS driver_alert_eligible AS
 SELECT u.id AS staff_id,b.id AS booking_id,b.created_at
 FROM staff_users u CROSS JOIN bookings b
 LEFT JOIN driver_commercial_profiles p ON p.staff_id=u.id
 LEFT JOIN driver_assignments a ON a.booking_id=b.id
 LEFT JOIN booking_dispatch_releases r ON r.booking_id=b.id
 WHERE u.status='approved' AND b.status='requested' AND
 ((u.role='admin' AND a.driver_id IS NULL) OR
 (u.role='driver' AND (a.driver_id=u.id OR
 (a.driver_id IS NULL AND (p.can_quote_all=1 OR r.booking_id IS NOT NULL)))));
