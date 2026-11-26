"""Local schema rehearsal only; entirely synthetic in-memory records."""
import sqlite3, sys
from pathlib import Path
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
if len(sys.argv)>1:
    db.executescript(Path(sys.argv[1]).read_text())
else:
    db.executescript(Path('backend/schema.sql').read_text())
    db.executescript(Path('backend/migrations/004_booking_locations_v30.sql').read_text())
def run(q, p=()): return db.execute(q,p)
def one(q,p=()): return run(q,p).fetchone()
def reject(q,p=(),reason=None):
    try: run(q,p)
    except sqlite3.IntegrityError as e:
        if reason: assert reason in str(e),str(e)
    else: raise AssertionError('Expected rejection: '+q)
def booking(i,t='10:00',date='2026-12-01',hour=None):
    base=(i,'QA','099000000','qa@example.invalid','Pickup',None if hour else 'Dropoff',date,t,2,0,'hash')
    if hour is None:
        run('INSERT INTO bookings(id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,access_token_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)',base)
    else:
        run("INSERT INTO bookings(id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,access_token_hash,service_type,requested_duration_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,'hourly',?)",base+(hour,))
def driver(i):
    run("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status) VALUES(?,?,?,?,?,1,'driver','approved')",(i,i+'@example.invalid','QA','salt','hash'))
    run('INSERT INTO staff_contacts(staff_id,phone,email_verified_at) VALUES(?,?,1)',(i,i))
    run("INSERT INTO driver_commercial_profiles(staff_id,mode,can_quote_all,commission_bps) VALUES(?,'contractor',1,2500)",(i,))
def quote(i,d,h=None):
    if h is None: run('INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps) VALUES(?,?,4000,2500)',(i,d))
    else: run('INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps,included_duration_minutes) VALUES(?,?,4000,2500,?)',(i,d,h))
driver('d1');driver('d2')
booking('legacy','07:00')
run("INSERT INTO booking_locations(booking_id,origin_lat,origin_lng) VALUES('legacy',-34.8,-56)")
run("INSERT INTO booking_routes(booking_id,distance_m,duration_s,provider) VALUES('legacy',3000,300,'geoapify')")
quote('legacy','d1')
children=['booking_locations','booking_routes','booking_quotes','driver_assignments','booking_events']
before={t:run('SELECT * FROM '+t).fetchall() for t in children}
db.executescript(Path('qa/hourly/005_hourly_candidate.sql').read_text())
assert one("SELECT destination,service_type FROM bookings WHERE id='legacy'")==('Dropoff','point_to_point')
for t,rows in before.items():
    current=run('SELECT * FROM '+t).fetchall()
    assert len(current)==len(rows)
    assert [r[:len(rows[0])] for r in current]==rows,t
assert run('PRAGMA foreign_key_check').fetchall()==[]
booking('hour','10:00',hour=240)
reject('INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps) VALUES(?,?,4000,2500)',('hour','d1'),'VIA_HOURLY_QUOTE_FIELDS')
quote('hour','d1',240)
assert one("SELECT status FROM bookings WHERE id='hour'")==('quoted',)
assert one("SELECT driver_id FROM driver_assignments WHERE booking_id='hour'")==('d1',)
assert one("SELECT ends-starts FROM via_service_intervals WHERE id='hour'")== (16200,)
booking('conflict','13:00')
reject("INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps) VALUES('conflict','d1',4000,2500)",reason='VIA_QUOTE_OVERLAP')
assert one("SELECT status FROM bookings WHERE id='conflict'")==('requested',)
assert one("SELECT 1 FROM booking_quotes WHERE booking_id='conflict'") is None
quote('conflict','d2')
reject("UPDATE driver_assignments SET driver_id='d1' WHERE booking_id='conflict'",reason='VIA_QUOTE_OVERLAP')
booking('reverse','12:00',hour=120)
reject("INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps,included_duration_minutes) VALUES('reverse','d2',4000,2500,120)",reason='VIA_QUOTE_OVERLAP')
booking('boundary','14:30')
quote('boundary','d1')
booking('night','23:00',hour=120)
quote('night','d1',120)
booking('midnight','00:30','2026-12-02')
reject("INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps) VALUES('midnight','d1',4000,2500)",reason='VIA_QUOTE_OVERLAP')
run("UPDATE bookings SET status='cancelled' WHERE id='night'")
quote('midnight','d1')
reject("UPDATE bookings SET trip_time='13:30' WHERE id='boundary'",reason='VIA_QUOTE_OVERLAP')
reject("INSERT INTO booking_routes(booking_id,distance_m,duration_s,provider) VALUES('hour',3000,300,'geoapify')",reason='VIA_HOURLY_NO_ROUTE')
reject("UPDATE booking_quotes SET included_duration_minutes=60 WHERE booking_id='hour'",reason='VIA_HOURLY_QUOTE_IMMUTABLE')
run("UPDATE bookings SET status='completed' WHERE id='hour'")
assert one("SELECT commission_cents FROM booking_commission_ledger WHERE booking_id='hour'")== (100000,)
booking('full','10:00','2026-12-03',hour=1440)
quote('full','d1',1440)
assert one("SELECT ends-starts FROM via_service_intervals WHERE id='full'")== (88200,)
assert run('PRAGMA foreign_key_check').fetchall()==[]
print('PASS: preservation, quote assignment, cross-mode overlap, reassignment, boundary, midnight, cancellation, no fake route, commission, 24h')
