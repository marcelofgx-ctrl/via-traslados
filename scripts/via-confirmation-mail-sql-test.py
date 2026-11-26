import sqlite3,pathlib
db=sqlite3.connect(':memory:')
db.executescript("""
CREATE TABLE bookings(id TEXT PRIMARY KEY,email TEXT,customer_name TEXT,origin TEXT,destination TEXT,trip_date TEXT,trip_time TEXT,passengers INTEGER,bags INTEGER,price_uyu INTEGER,status TEXT);
CREATE TABLE booking_routes(booking_id TEXT PRIMARY KEY,distance_m INTEGER,duration_s INTEGER);
INSERT INTO bookings VALUES('VIA-DEMO-1','test@example.invalid','Demo','A','B','2026-11-27','10:00',1,1,1000,'requested');
INSERT INTO booking_routes VALUES('VIA-DEMO-1',3400,300);
""")
db.executescript(pathlib.Path('backend/migrations/005_confirmation_mail.sql').read_text())
for status in ['quoted','accepted']:
 db.execute('UPDATE bookings SET status=?',(status,))
 assert db.execute('SELECT count(*) FROM booking_confirmation_mail').fetchone()[0]==0
db.execute("UPDATE bookings SET status='confirmed'")
import json
row=db.execute('SELECT booking_id,payload,state FROM booking_confirmation_mail').fetchone()
assert row[0]=='VIA-DEMO-1' and row[2]=='pending'
assert json.loads(row[1])['distance_m']==3400
db.execute("UPDATE bookings SET status='confirmed'")
db.execute("UPDATE bookings SET status='en_route'")
assert db.execute('SELECT count(*) FROM booking_confirmation_mail').fetchone()[0]==1
print('VIA_CONFIRMATION_MAIL_SQL_PASS')
