-- Vía Traslados V30: additive, non-destructive geospatial booking points.
-- Apply to isolated D1 QA FIRST and verify. No ALTER/drop of existing tables.
-- Compatible with all old booking rows and the existing signed conductor APK.
CREATE TABLE IF NOT EXISTS booking_locations (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 origin_lat REAL CHECK(origin_lat BETWEEN -36 AND -30),
 origin_lng REAL CHECK(origin_lng BETWEEN -59 AND -52),
 destination_lat REAL CHECK(destination_lat BETWEEN -36 AND -30),
 destination_lng REAL CHECK(destination_lng BETWEEN -59 AND -52),
 origin_source TEXT,
 destination_source TEXT,
 origin_postal_status TEXT DEFAULT 'unknown',
 destination_postal_status TEXT DEFAULT 'unknown',
 origin_number_approximate INTEGER NOT NULL DEFAULT 0 CHECK(origin_number_approximate IN (0,1)),
 destination_number_approximate INTEGER NOT NULL DEFAULT 0 CHECK(destination_number_approximate IN (0,1))
);
