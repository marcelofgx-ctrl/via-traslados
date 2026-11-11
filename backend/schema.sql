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
