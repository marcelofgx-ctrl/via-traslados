# Ensayo real de SQLite, sin D1 productiva, del contrato de migración.
import sqlite3
from pathlib import Path
migration=Path('backend/migrations/20261118_booking_submission_keys.sql').read_text()
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript('CREATE TABLE bookings(id TEXT PRIMARY KEY);')
db.executescript(migration)
db.executescript(migration)
db.execute("INSERT INTO bookings VALUES('VIA-UNO')")
db.execute("INSERT INTO bookings VALUES('VIA-DOS')")
key='a'*64
pay='b'*64
db.execute("INSERT INTO booking_submission_keys(key_hash,payload_hash,email,booking_id) VALUES(?,?,?,?)",
           (key,pay,'ana@example.com','VIA-UNO'))
try:
    db.execute("INSERT INTO booking_submission_keys(key_hash,payload_hash,email,booking_id) VALUES(?,?,?,?)",
               (key,pay,'ana@example.com','VIA-DOS'))
    raise AssertionError('La clave duplicada fue aceptada')
except sqlite3.IntegrityError:
    pass
assert db.execute('SELECT COUNT(*) FROM booking_submission_keys').fetchone()[0] == 1
db.execute("DELETE FROM bookings WHERE id='VIA-UNO'")
assert db.execute('SELECT COUNT(*) FROM booking_submission_keys').fetchone()[0] == 0
print('IDEMPOTENCIA_SQLITE_MIGRACION_OK, idempotente y con unicidad/cascada comprobada')
