-- Additive, QA first. Never backfill historic confirmations or alter bookings.
CREATE TABLE IF NOT EXISTS booking_confirmation_mail (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 payload TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','cancelled')),
 created_at INTEGER NOT NULL DEFAULT(unixepoch()),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_at INTEGER NOT NULL DEFAULT(unixepoch()),
 lease TEXT,
 lease_until INTEGER,
 provider_id TEXT,
 sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS booking_confirmation_mail_due ON booking_confirmation_mail(state,next_at);
CREATE TRIGGER IF NOT EXISTS via_confirmation_mail_queue
 AFTER UPDATE OF status ON bookings
 WHEN OLD.status='accepted' AND NEW.status='confirmed'
 BEGIN
 INSERT OR IGNORE INTO booking_confirmation_mail(booking_id,payload)
 VALUES(NEW.id,json_object('id',NEW.id,'email',NEW.email,'name',NEW.customer_name,
 'origin',NEW.origin,'destination',NEW.destination,'date',NEW.trip_date,'time',NEW.trip_time,
 'passengers',NEW.passengers,'bags',NEW.bags,'price',NEW.price_uyu,
 'distance_m',(SELECT distance_m FROM booking_routes WHERE booking_id=NEW.id),
 'duration_s',(SELECT duration_s FROM booking_routes WHERE booking_id=NEW.id)));
 END;
