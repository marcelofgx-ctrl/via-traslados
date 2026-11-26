-- Candidate only. NOT auto-applied; rehearse with foreign_keys=ON first.
-- Based on verified QA schema 2026-11-25, run 45739287286.
-- Do not DROP bookings: child foreign keys use ON DELETE CASCADE.
ALTER TABLE bookings RENAME COLUMN destination TO destination_v30_legacy;
ALTER TABLE bookings ADD COLUMN destination TEXT;
UPDATE bookings SET destination=destination_v30_legacy;
ALTER TABLE bookings DROP COLUMN destination_v30_legacy;
ALTER TABLE bookings ADD COLUMN service_type TEXT NOT NULL DEFAULT 'point_to_point' CHECK(service_type IN ('point_to_point','hourly'));
ALTER TABLE bookings ADD COLUMN requested_duration_minutes INTEGER CHECK(requested_duration_minutes IS NULL OR (typeof(requested_duration_minutes)='integer' AND requested_duration_minutes BETWEEN 60 AND 1440 AND requested_duration_minutes%30=0));
ALTER TABLE bookings ADD COLUMN itinerary_notes TEXT CHECK(itinerary_notes IS NULL OR length(itinerary_notes)<=1000);
ALTER TABLE booking_quotes ADD COLUMN included_duration_minutes INTEGER CHECK(included_duration_minutes IS NULL OR (typeof(included_duration_minutes)='integer' AND included_duration_minutes BETWEEN 60 AND 1440 AND included_duration_minutes%30=0));
ALTER TABLE booking_quotes ADD COLUMN included_km INTEGER CHECK(included_km IS NULL OR (typeof(included_km)='integer' AND included_km BETWEEN 0 AND 5000));
ALTER TABLE booking_quotes ADD COLUMN extra_time_terms TEXT CHECK(extra_time_terms IS NULL OR length(extra_time_terms)<=1500);
ALTER TABLE booking_quotes ADD COLUMN extra_km_terms TEXT CHECK(extra_km_terms IS NULL OR length(extra_km_terms)<=1500);
ALTER TABLE booking_quotes ADD COLUMN quote_notes TEXT CHECK(quote_notes IS NULL OR length(quote_notes)<=1500);
CREATE TRIGGER via_booking_modality_insert BEFORE INSERT ON bookings
WHEN (NEW.service_type='hourly' AND (NEW.destination IS NOT NULL OR NEW.requested_duration_minutes IS NULL))
 OR (NEW.service_type='point_to_point' AND (NEW.destination IS NULL OR NEW.requested_duration_minutes IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'VIA_SERVICE_MODALITY'); END;
CREATE TRIGGER via_booking_modality_update BEFORE UPDATE OF destination,service_type,requested_duration_minutes ON bookings
WHEN (NEW.service_type='hourly' AND (NEW.destination IS NOT NULL OR NEW.requested_duration_minutes IS NULL))
 OR (NEW.service_type='point_to_point' AND (NEW.destination IS NULL OR NEW.requested_duration_minutes IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'VIA_SERVICE_MODALITY'); END;
-- Retain original quote guard, commit trigger and commission trigger.
-- An additional assignment guard also runs inside the existing quote INSERT.
-- Conservative interval: reserve the longer of requested/offered durations,
-- pending business decision on differing durations; no automatic extra charge.
CREATE VIEW via_service_intervals AS
 SELECT b.id,b.status,b.service_type,
 CAST(strftime('%s',b.trip_date||' '||b.trip_time) AS INTEGER) AS starts,
 CAST(strftime('%s',b.trip_date||' '||b.trip_time) AS INTEGER)
 + CASE WHEN b.service_type='hourly' THEN MAX(b.requested_duration_minutes,COALESCE(q.included_duration_minutes,0))*60
 ELSE MAX(3600,COALESCE(r.duration_s,0)) END+1800 AS ends
 FROM bookings b LEFT JOIN booking_routes r ON r.booking_id=b.id
 LEFT JOIN booking_quotes q ON q.booking_id=b.id;
CREATE TRIGGER via_hourly_quote_fields BEFORE INSERT ON booking_quotes
WHEN EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND service_type='hourly')
 AND NEW.included_duration_minutes IS NULL
BEGIN SELECT RAISE(ABORT,'VIA_HOURLY_QUOTE_FIELDS'); END;
CREATE TRIGGER via_hourly_quote_immutable BEFORE UPDATE ON booking_quotes
WHEN EXISTS(SELECT 1 FROM bookings WHERE id=OLD.booking_id AND service_type='hourly')
BEGIN SELECT RAISE(ABORT,'VIA_HOURLY_QUOTE_IMMUTABLE'); END;
CREATE TRIGGER via_hourly_assignment_insert BEFORE INSERT ON driver_assignments
BEGIN
 SELECT RAISE(ABORT,'VIA_QUOTE_OVERLAP') WHERE EXISTS(
 SELECT 1 FROM via_service_intervals target
 JOIN driver_assignments a ON a.driver_id=NEW.driver_id
 JOIN via_service_intervals other ON other.id=a.booking_id
 WHERE target.id=NEW.booking_id AND other.id<>target.id
 AND (target.service_type='hourly' OR other.service_type='hourly')
 AND target.status NOT IN ('cancelled','completed') AND other.status NOT IN ('cancelled','completed')
 AND (target.starts IS NULL OR other.starts IS NULL OR target.ends IS NULL OR other.ends IS NULL
 OR (target.starts<other.ends AND other.starts<target.ends)));
END;
CREATE TRIGGER via_hourly_assignment_update BEFORE UPDATE OF driver_id,booking_id ON driver_assignments
BEGIN
 SELECT RAISE(ABORT,'VIA_QUOTE_OVERLAP') WHERE EXISTS(
 SELECT 1 FROM via_service_intervals target
 JOIN driver_assignments a ON a.driver_id=NEW.driver_id
 JOIN via_service_intervals other ON other.id=a.booking_id
 WHERE target.id=NEW.booking_id AND other.id<>target.id
 AND (target.service_type='hourly' OR other.service_type='hourly')
 AND target.status NOT IN ('cancelled','completed') AND other.status NOT IN ('cancelled','completed')
 AND (target.starts IS NULL OR other.starts IS NULL OR target.ends IS NULL OR other.ends IS NULL
 OR (target.starts<other.ends AND other.starts<target.ends)));
END;
CREATE TRIGGER via_hourly_schedule_update AFTER UPDATE OF trip_date,trip_time,requested_duration_minutes,service_type,status ON bookings
WHEN NEW.status NOT IN ('cancelled','completed')
BEGIN
 SELECT RAISE(ABORT,'VIA_QUOTE_OVERLAP') WHERE EXISTS(
 SELECT 1 FROM driver_assignments current JOIN via_service_intervals target ON target.id=current.booking_id
 JOIN driver_assignments a ON a.driver_id=current.driver_id
 JOIN via_service_intervals other ON other.id=a.booking_id
 WHERE target.id=NEW.id AND other.id<>target.id
 AND (target.service_type='hourly' OR other.service_type='hourly')
 AND other.status NOT IN ('cancelled','completed')
 AND (target.starts IS NULL OR other.starts IS NULL OR target.ends IS NULL OR other.ends IS NULL
 OR (target.starts<other.ends AND other.starts<target.ends)));
END;
-- Do not store an imaginary driving route for an hourly booking.
CREATE TRIGGER via_hourly_no_route_insert BEFORE INSERT ON booking_routes
WHEN EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND service_type='hourly')
BEGIN SELECT RAISE(ABORT,'VIA_HOURLY_NO_ROUTE'); END;
CREATE TRIGGER via_hourly_no_route_update BEFORE UPDATE ON booking_routes
WHEN EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND service_type='hourly')
BEGIN SELECT RAISE(ABORT,'VIA_HOURLY_NO_ROUTE'); END;

-- Idempotency scoped to account; historical rows unchanged.
ALTER TABLE bookings ADD COLUMN hourly_request_id TEXT;
ALTER TABLE bookings ADD COLUMN hourly_request_hash TEXT;
CREATE UNIQUE INDEX via_hourly_request_unique ON bookings(email,hourly_request_id) WHERE hourly_request_id IS NOT NULL;
CREATE TRIGGER via_hourly_accept_guard BEFORE UPDATE OF status ON bookings
WHEN NEW.service_type='hourly' AND NEW.status='accepted' AND OLD.status<>'accepted'
BEGIN
 SELECT RAISE(ABORT,'VIA_HOURLY_ACCEPT') WHERE NOT EXISTS(
 SELECT 1 FROM booking_quotes q JOIN driver_assignments a ON a.booking_id=q.booking_id
 WHERE q.booking_id=NEW.id AND q.included_duration_minutes IS NOT NULL);
END;
-- A late route must not silently create an overlap with a booked hourly service.
CREATE TRIGGER via_hourly_late_route_insert AFTER INSERT ON booking_routes
BEGIN
 SELECT RAISE(ABORT,'VIA_ROUTE_SCHEDULE_CONFLICT') WHERE EXISTS(
 SELECT 1 FROM driver_assignments current JOIN via_service_intervals target ON target.id=current.booking_id
 JOIN driver_assignments a ON a.driver_id=current.driver_id
 JOIN via_service_intervals other ON other.id=a.booking_id
 WHERE target.id=NEW.booking_id AND other.id<>target.id
 AND other.service_type='hourly' AND target.status NOT IN ('cancelled','completed')
 AND other.status NOT IN ('cancelled','completed')
 AND target.starts<other.ends AND other.starts<target.ends);
END;
CREATE TRIGGER via_hourly_late_route_update AFTER UPDATE OF duration_s ON booking_routes
BEGIN
 SELECT RAISE(ABORT,'VIA_ROUTE_SCHEDULE_CONFLICT') WHERE EXISTS(
 SELECT 1 FROM driver_assignments current JOIN via_service_intervals target ON target.id=current.booking_id
 JOIN driver_assignments a ON a.driver_id=current.driver_id
 JOIN via_service_intervals other ON other.id=a.booking_id
 WHERE target.id=NEW.booking_id AND other.id<>target.id
 AND other.service_type='hourly' AND target.status NOT IN ('cancelled','completed')
 AND other.status NOT IN ('cancelled','completed')
 AND target.starts<other.ends AND other.starts<target.ends);
END;
