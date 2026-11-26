import sqlite3,pathlib
db=sqlite3.connect(':memory:')
db.executescript("""
CREATE TABLE staff_users(id TEXT PRIMARY KEY,role TEXT,status TEXT);
CREATE TABLE bookings(id TEXT PRIMARY KEY,status TEXT,created_at TEXT);
CREATE TABLE driver_commercial_profiles(staff_id TEXT,can_quote_all INTEGER,can_release INTEGER);
CREATE TABLE driver_assignments(booking_id TEXT,driver_id TEXT);
CREATE TABLE booking_dispatch_releases(booking_id TEXT);
INSERT INTO staff_users VALUES('admin','admin','approved'),('partner','driver','approved'),('contract','driver','approved'),('blocked','driver','blocked'),('releaseonly','driver','approved');
INSERT INTO driver_commercial_profiles VALUES('partner',1,1),('contract',0,0),('blocked',1,1),('releaseonly',0,1);
INSERT INTO bookings VALUES('new','requested','2026-11-26'),('released','requested','2026-11-26'),('assigned','requested','2026-11-26'),('quoted','quoted','2026-11-26');
INSERT INTO booking_dispatch_releases VALUES('released');
INSERT INTO driver_assignments VALUES('assigned','contract');
""")
sql=pathlib.Path('backend/migrations/006_driver_alerts.sql').read_text()
db.executescript(sql);db.executescript(sql)
rows=set(db.execute('SELECT staff_id,booking_id FROM driver_alert_eligible'))
assert rows=={('admin','new'),('admin','released'),('partner','new'),('partner','released'),('contract','released'),('contract','assigned'),('releaseonly','released')},rows
db.execute("INSERT INTO driver_alert_seen(staff_id,booking_id) VALUES('admin','new')")
db.execute("INSERT OR IGNORE INTO driver_alert_seen(staff_id,booking_id) VALUES('admin','new')")
assert db.execute("SELECT count(*) FROM driver_alert_seen").fetchone()[0]==1
assert db.execute("SELECT count(*) FROM bookings").fetchone()[0]==4
print('VIA_DRIVER_ALERT_SQL_PASS authorization, blocked, released, assignment, dedup, repeatable migration')
