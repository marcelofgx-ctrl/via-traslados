-- Base exclusiva via-traslados-db. NO ejecutar contra otras bases.
CREATE TABLE IF NOT EXISTS bookings (
 id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
 origin TEXT NOT NULL, destination TEXT NOT NULL, trip_date TEXT NOT NULL, trip_time TEXT NOT NULL,
 passengers INTEGER NOT NULL CHECK(passengers BETWEEN 1 AND 8),
 bags INTEGER NOT NULL CHECK(bags BETWEEN 0 AND 5), notes TEXT NOT NULL DEFAULT '',
 access_token_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested'
 CHECK(status IN ('requested','quoted','accepted','confirmed','en_route','arrived','in_progress','completed','cancelled')),
 price_uyu INTEGER CHECK(price_uyu BETWEEN 1 AND 10000000),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bookings_date_status ON bookings(trip_date,trip_time,status);
CREATE INDEX IF NOT EXISTS bookings_email ON bookings(email);
CREATE TABLE IF NOT EXISTS booking_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 old_status TEXT, new_status TEXT NOT NULL,
 actor TEXT NOT NULL CHECK(actor IN ('passenger','operator','system')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS booking_events_booking ON booking_events(booking_id,created_at);
CREATE TABLE IF NOT EXISTS email_otp_codes (
 email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_verified_sessions (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL,
 consumed_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON email_verified_sessions(expires_at);
CREATE TABLE IF NOT EXISTS otp_rate_limits (
 rate_key TEXT PRIMARY KEY, window_started INTEGER NOT NULL, attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
 email TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);

-- Gestión de cuentas y cierre controlado del servicio, separada del OTP de pasajeros.
-- Valores por defecto: web habilitada y operadores nuevos pendientes de aprobación.
CREATE TABLE IF NOT EXISTS staff_users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 iterations INTEGER NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','driver')),
 status TEXT NOT NULL CHECK(status IN ('pending','approved','blocked')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 approved_at INTEGER
);
CREATE INDEX IF NOT EXISTS staff_users_role_status ON staff_users(role,status);
CREATE TABLE IF NOT EXISTS staff_sessions (
 token_hash TEXT PRIMARY KEY,
 staff_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS staff_sessions_by_user ON staff_sessions(staff_id,expires_at);
CREATE TABLE IF NOT EXISTS service_settings (
 setting_key TEXT PRIMARY KEY,
 setting_value TEXT NOT NULL,
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_by TEXT NOT NULL DEFAULT 'system'
);
INSERT OR IGNORE INTO service_settings(setting_key,setting_value) VALUES ('public_web_enabled','1');
CREATE TABLE IF NOT EXISTS driver_assignments (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 driver_id TEXT NOT NULL REFERENCES staff_users(id),
 assigned_by TEXT NOT NULL,
 assigned_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS driver_assignments_driver ON driver_assignments(driver_id);
-- Ficha operativa opcional por conductor: nunca simula capacidad ni matrícula.
CREATE TABLE IF NOT EXISTS driver_vehicle_profiles (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 license_plate TEXT NOT NULL DEFAULT '',
 make TEXT NOT NULL DEFAULT '',
 model TEXT NOT NULL DEFAULT '',
 passenger_capacity INTEGER CHECK(passenger_capacity BETWEEN 1 AND 8),
 luggage_capacity INTEGER CHECK(luggage_capacity BETWEEN 0 AND 10),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- V29: contratos comerciales invisibles en las respuestas operativas normales.
-- Solo el administrador fundador puede cambiar la modalidad y los porcentajes.
CREATE TABLE IF NOT EXISTS driver_commercial_profiles (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 mode TEXT NOT NULL DEFAULT 'contractor' CHECK(mode IN ('partner','contractor')),
 can_quote_all INTEGER NOT NULL DEFAULT 0 CHECK(can_quote_all IN (0,1)),
 can_release INTEGER NOT NULL DEFAULT 0 CHECK(can_release IN (0,1)),
 commission_bps INTEGER NOT NULL DEFAULT 2500 CHECK(commission_bps BETWEEN 0 AND 5000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS booking_dispatch_releases (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 released_by TEXT NOT NULL,
 released_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS booking_quotes (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 driver_id TEXT NOT NULL REFERENCES staff_users(id),
 price_uyu INTEGER NOT NULL CHECK(price_uyu BETWEEN 1 AND 10000000),
 commission_bps INTEGER NOT NULL CHECK(commission_bps BETWEEN 0 AND 5000),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS booking_quotes_by_driver ON booking_quotes(driver_id,created_at);

-- Un solo INSERT de cotización ejecuta reglas, asignación y cambio de estado.
-- Un RAISE aborta toda la transacción de SQLite/D1 (no hay doble asignación).
CREATE TRIGGER IF NOT EXISTS via_quote_guard BEFORE INSERT ON booking_quotes
BEGIN
 SELECT RAISE(ABORT,'VIA_QUOTE_STATUS')
   WHERE NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND status='requested');
 SELECT RAISE(ABORT,'VIA_QUOTE_AUTH')
   WHERE NOT EXISTS(
     SELECT 1 FROM staff_users u
     JOIN staff_contacts c ON c.staff_id=u.id
     LEFT JOIN driver_commercial_profiles p ON p.staff_id=u.id
     WHERE u.id=NEW.driver_id AND u.status='approved' AND u.role IN ('admin','driver')
       AND c.email_verified_at IS NOT NULL
       AND (u.role='admin' OR p.can_quote_all=1 OR
           EXISTS(SELECT 1 FROM booking_dispatch_releases r WHERE r.booking_id=NEW.booking_id)
           OR EXISTS(SELECT 1 FROM driver_assignments a
             WHERE a.booking_id=NEW.booking_id AND a.driver_id=NEW.driver_id))
   );
 SELECT RAISE(ABORT,'VIA_QUOTE_ASSIGNED_OTHER')
   WHERE EXISTS(SELECT 1 FROM driver_assignments
     WHERE booking_id=NEW.booking_id AND driver_id<>NEW.driver_id);
 SELECT RAISE(ABORT,'VIA_QUOTE_CAPACITY')
   WHERE EXISTS(
     SELECT 1 FROM driver_vehicle_profiles v JOIN bookings b ON b.id=NEW.booking_id
     WHERE v.staff_id=NEW.driver_id AND
     ((v.passenger_capacity IS NOT NULL AND v.passenger_capacity<b.passengers)
       OR (v.luggage_capacity IS NOT NULL AND v.luggage_capacity<b.bags))
   );
 SELECT RAISE(ABORT,'VIA_QUOTE_OVERLAP')
   WHERE EXISTS(
     SELECT 1 FROM bookings target
     JOIN driver_assignments a ON a.driver_id=NEW.driver_id
     JOIN bookings other ON other.id=a.booking_id
     LEFT JOIN booking_routes tr ON tr.booking_id=target.id
     LEFT JOIN booking_routes othr ON othr.booking_id=other.id
     WHERE target.id=NEW.booking_id AND other.id<>target.id
       AND other.status NOT IN ('cancelled','completed')
       AND CAST(strftime('%s',other.trip_date||' '||other.trip_time) AS INTEGER) <
         CAST(strftime('%s',target.trip_date||' '||target.trip_time) AS INTEGER)+
         MAX(3600,COALESCE(tr.duration_s,0))+1800
       AND CAST(strftime('%s',other.trip_date||' '||other.trip_time) AS INTEGER)+
         MAX(3600,COALESCE(othr.duration_s,0))+1800 >
         CAST(strftime('%s',target.trip_date||' '||target.trip_time) AS INTEGER)
   );
END;
CREATE TRIGGER IF NOT EXISTS via_quote_commit AFTER INSERT ON booking_quotes
BEGIN
 INSERT INTO driver_assignments(booking_id,driver_id,assigned_by)
 VALUES(NEW.booking_id,NEW.driver_id,NEW.driver_id)
 ON CONFLICT(booking_id) DO UPDATE SET driver_id=excluded.driver_id,
     assigned_by=excluded.assigned_by,assigned_at=unixepoch()
 WHERE driver_assignments.driver_id=excluded.driver_id;
 UPDATE bookings SET status='quoted',price_uyu=NEW.price_uyu,updated_at=datetime('now')
 WHERE id=NEW.booking_id AND status='requested';
 INSERT INTO booking_events(booking_id,old_status,new_status,actor)
 VALUES(NEW.booking_id,'requested','quoted','operator');
END;

-- Cuenta por cobrar interna: se devenga SOLO cuando el traslado se completa.
-- No procesa tarjetas, débito bancario ni factura automáticamente.
CREATE TABLE IF NOT EXISTS booking_commission_ledger (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 driver_id TEXT NOT NULL REFERENCES staff_users(id),
 fare_uyu INTEGER NOT NULL CHECK(fare_uyu>0),
 rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 0 AND 5000),
 commission_cents INTEGER NOT NULL CHECK(commission_cents>=0),
 payment_status TEXT NOT NULL CHECK(payment_status IN ('pending','paid','waived')),
 payment_reference TEXT NOT NULL DEFAULT '',
 completed_at INTEGER NOT NULL DEFAULT (unixepoch()),
 paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS commission_ledger_driver
 ON booking_commission_ledger(driver_id,payment_status,completed_at);

CREATE TRIGGER IF NOT EXISTS via_commission_on_completion
 AFTER UPDATE OF status ON bookings
 WHEN NEW.status='completed' AND OLD.status<>'completed'
      AND NEW.price_uyu IS NOT NULL
BEGIN
 INSERT OR IGNORE INTO booking_commission_ledger
   (booking_id,driver_id,fare_uyu,rate_bps,commission_cents,payment_status)
 SELECT NEW.id,a.driver_id,NEW.price_uyu,
   CASE WHEN q.driver_id=a.driver_id THEN q.commission_bps
        WHEN u.role='admin' OR p.mode='partner' THEN 0
        ELSE COALESCE(p.commission_bps,2500) END,
   CAST(ROUND(NEW.price_uyu*
     (CASE WHEN q.driver_id=a.driver_id THEN q.commission_bps
       WHEN u.role='admin' OR p.mode='partner' THEN 0
       ELSE COALESCE(p.commission_bps,2500) END)/100.0) AS INTEGER),
   CASE WHEN
     (CASE WHEN q.driver_id=a.driver_id THEN q.commission_bps
        WHEN u.role='admin' OR p.mode='partner' THEN 0
        ELSE COALESCE(p.commission_bps,2500) END)=0
     THEN 'waived' ELSE 'pending' END
 FROM driver_assignments a
 JOIN staff_users u ON u.id=a.driver_id
 LEFT JOIN driver_commercial_profiles p ON p.staff_id=u.id
 LEFT JOIN booking_quotes q ON q.booking_id=NEW.id
 WHERE a.booking_id=NEW.id;
END;

CREATE TABLE IF NOT EXISTS admin_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 target TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS admin_audit_recent ON admin_audit(created_at DESC);

-- Registro telefónico con verificación de correo y sesiones biométricas.
-- Tablas complementarias: sin ALTER destructivo de cuentas existentes.
CREATE TABLE IF NOT EXISTS staff_contacts (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 phone TEXT NOT NULL UNIQUE,
 email_verified_at INTEGER
);
CREATE INDEX IF NOT EXISTS staff_contacts_verified ON staff_contacts(email_verified_at);
CREATE TABLE IF NOT EXISTS staff_email_codes (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_refresh_tokens (
 token_hash TEXT PRIMARY KEY,
 staff_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS staff_refresh_by_user ON staff_refresh_tokens(staff_id,expires_at);

-- Recuperación de contraseña del equipo: independiente del OTP de registro.
-- Ejecutar solo en la D1 exclusiva via-traslados-db.
CREATE TABLE IF NOT EXISTS staff_password_resets (
 staff_id TEXT PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at INTEGER NOT NULL
);

-- Distancia de conducción estimada por proveedor; cacheo sin datos personales.
-- Tabla aislada de cotizaciones, no modifica origen/destino ni precios.
CREATE TABLE IF NOT EXISTS booking_routes (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 distance_m INTEGER NOT NULL CHECK(distance_m BETWEEN 100 AND 2000000),
 duration_s INTEGER NOT NULL CHECK(duration_s BETWEEN 1 AND 432000),
 provider TEXT NOT NULL,
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);


-- Pasajeros: sesión recordada hasta 30 días, sin contraseñas ni sesiones de staff.
-- Los tokens se guardan solo como SHA-256. El correo sigue siendo la identidad verificada.
CREATE TABLE IF NOT EXISTS customer_sessions (
 token_hash TEXT PRIMARY KEY,
 email TEXT NOT NULL REFERENCES customers(email) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS customer_sessions_email ON customer_sessions(email,expires_at);

-- Credenciales WebAuthn: solo clave pública y contador, jamás huellas ni PIN.
CREATE TABLE IF NOT EXISTS customer_passkeys (
 credential_id TEXT PRIMARY KEY,
 email TEXT NOT NULL REFERENCES customers(email) ON DELETE CASCADE,
 public_key TEXT NOT NULL,
 counter INTEGER NOT NULL DEFAULT 0,
 transports TEXT NOT NULL DEFAULT '[]',
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS customer_passkeys_email ON customer_passkeys(email);

-- Desafíos WebAuthn de uso único, con vencimiento corto.
CREATE TABLE IF NOT EXISTS customer_passkey_challenges (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 challenge TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('registration','authentication')),
 expires_at INTEGER NOT NULL,
 consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS customer_challenges_expiry ON customer_passkey_challenges(expires_at);

-- PIN de seis cifras: solo HMAC con secreto del Worker y sal por cuenta. Nunca guardar PIN en claro.
-- La recuperación exige primero una sesión obtenida con correo OTP verificado.
CREATE TABLE IF NOT EXISTS customer_pins (
 email TEXT PRIMARY KEY REFERENCES customers(email) ON DELETE CASCADE,
 salt TEXT NOT NULL CHECK(length(salt)=32),
 pin_hash TEXT NOT NULL CHECK(length(pin_hash)=64),
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Caché de trayectos públicos: solo HMAC irreversible de direcciones; 6 h de validez.
CREATE TABLE IF NOT EXISTS route_preview_cache (
 route_hash TEXT PRIMARY KEY CHECK(length(route_hash)=64),
 distance_m INTEGER NOT NULL CHECK(distance_m BETWEEN 100 AND 2000000),
 duration_s INTEGER NOT NULL CHECK(duration_s BETWEEN 1 AND 432000),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS route_preview_recent ON route_preview_cache(updated_at);

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
