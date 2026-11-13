#!/usr/bin/env python3
"""Prueba SQL real de asignaciones V26 en SQLite aislado (no usa D1 remoto)."""
import json
import pathlib
import re
import sqlite3
from datetime import datetime, timezone

root = pathlib.Path(__file__).resolve().parents[1]
source = (root / 'backend/staff.js').read_text()
match = re.search(r'const sql=([\s\S]*?);\n   const changed=', source)
assert match, 'No se encuentra la sentencia de asignación usada por el backend'
parts = re.findall(r'"(?:\\.|[^"\\])*"', match.group(1))
sql = ''.join(json.loads(segment) for segment in parts)
assert sql.startswith('INSERT INTO driver_assignments')
assert sql.count('?') == 12

def setup():
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript((root / 'backend/schema.sql').read_text())
    db.execute("""INSERT INTO staff_users
      (id,email,display_name,password_salt,password_hash,iterations,role,status)
      VALUES ('d1','driver@qa.invalid','Conductor QA','s','h',100000,'driver','approved')""")
    db.execute("""INSERT INTO staff_contacts(staff_id,phone,email_verified_at)
      VALUES ('d1','099000111',1790000000)""")
    for booking, time in [('VIA-TARGET','10:00'),('VIA-OTHER','12:00')]:
        db.execute("""INSERT INTO bookings
        (id,customer_name,phone,email,origin,destination,trip_date,trip_time,
         passengers,bags,access_token_hash,status) VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (booking,'Persona QA','099000000','test@qa.invalid','Origen','Destino',
         '2026-11-20',time,1,1,'hash','accepted'))
        db.execute("""INSERT INTO booking_routes(booking_id,distance_m,duration_s,provider)
          VALUES(?,5000,600,'geoapify')""",(booking,))
    return db

def apply(db, target='VIA-TARGET', expected='', driver='d1',
          starting='10:00', duration=600):
    start=int(datetime.fromisoformat('2026-11-20T'+starting+':00+00:00').timestamp())
    end=start+max(3600,duration)+1800
    args=(target,driver,'master',target,expected,target,driver,driver,target,end,start,expected)
    return db.execute(sql,args).rowcount

db=setup()
assert apply(db)==1, 'La primera asignación debió permitirse'
assert apply(db)==0, 'Una asignación obsoleta no debe sobrescribir'
assert db.execute("SELECT driver_id FROM driver_assignments WHERE booking_id='VIA-TARGET'").fetchone()[0]=='d1'

db=setup()
db.execute("""INSERT INTO driver_assignments(booking_id,driver_id,assigned_by)
  VALUES('VIA-OTHER','d1','master')""")
db.execute("UPDATE bookings SET trip_time='10:30' WHERE id='VIA-OTHER'")
assert apply(db)==0, 'No puede asignarse un conductor con horario solapado'

db=setup()
db.execute("UPDATE staff_contacts SET email_verified_at=NULL WHERE staff_id='d1'")
assert apply(db)==0, 'No puede asignarse un conductor sin correo verificado'

db=setup()
db.execute("UPDATE staff_users SET status='blocked' WHERE id='d1'")
assert apply(db)==0, 'No puede asignarse un conductor bloqueado'

db=setup()
db.execute("UPDATE bookings SET status='in_progress' WHERE id='VIA-TARGET'")
assert apply(db)==0, 'No puede asignarse cuando el viaje está en curso'

db=setup()
db.execute("UPDATE bookings SET status='confirmed' WHERE id='VIA-TARGET'")
assert apply(db)==1, 'Asignación de reserva confirmada debe ser válida'

print('OK: SQL operacional V26, conflicto, autorización, cambio concurrente y estados sobre SQLite real')
