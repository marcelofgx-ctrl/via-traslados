#!/usr/bin/env python3
"""Ejecuta las reglas comerciales D1 de Vía Traslados en SQLite local, sin producción."""
import sqlite3, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
def setup():
 c=sqlite3.connect(':memory:'); c.execute('PRAGMA foreign_keys=ON')
 sql=(root/'backend/schema.sql').read_text()
 c.executescript(sql); c.executescript(sql)
 for id,role in [('owner','admin'),('partner','driver'),('contractor','driver'),('backup','driver')]:
  c.execute("""INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status)
  VALUES (?,?,?,?,?,100000,?,'approved')""",(id,id+'@qa.invalid',id,'salt','hash',role))
  c.execute("INSERT INTO staff_contacts(staff_id,phone,email_verified_at) VALUES(?,? ,1790000000)",(id,'09'+id))
 c.execute("INSERT INTO driver_commercial_profiles(staff_id,mode,can_quote_all,can_release,commission_bps) VALUES ('partner','partner',1,1,0)")
 for id,time in [('VIA-ONE','10:00'),('VIA-TWO','10:30'),('VIA-THREE','14:30'),('VIA-FOUR','17:00')]:
  c.execute("""INSERT INTO bookings(id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,access_token_hash)
             VALUES(?,'Pasajero','099','p@qa.invalid','Origen','Destino','2026-11-20',?,1,1,'hash')""",(id,time))
  c.execute("INSERT INTO booking_routes(booking_id,distance_m,duration_s,provider) VALUES(?,5000,600,'geoapify')",(id,))
 return c
def quote(c,booking,driver,price):
 row=c.execute("""INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps)
  SELECT ?,u.id,?,CASE WHEN u.role='admin' OR p.mode='partner' THEN 0 ELSE COALESCE(p.commission_bps,2500) END
  FROM staff_users u LEFT JOIN driver_commercial_profiles p ON p.staff_id=u.id
  WHERE u.id=? AND u.status='approved'""",(booking,price,driver)).rowcount
 return row
def must_fail(c, booking, driver, name):
 try:quote(c,booking,driver,5500)
 except sqlite3.IntegrityError:return
 raise AssertionError(name)
c=setup()
must_fail(c,'VIA-ONE','contractor','Sin liberación el contratado no cotiza')
assert quote(c,'VIA-ONE','partner',5500)==1
assert c.execute("SELECT status,price_uyu FROM bookings WHERE id='VIA-ONE'").fetchone()==('quoted',5500)
assert c.execute("SELECT driver_id FROM driver_assignments WHERE booking_id='VIA-ONE'").fetchone()[0]=='partner'
assert c.execute("SELECT commission_bps FROM booking_quotes WHERE booking_id='VIA-ONE'").fetchone()[0]==0
assert c.execute("SELECT COUNT(*) FROM booking_events WHERE booking_id='VIA-ONE' AND new_status='quoted'").fetchone()[0]==1
must_fail(c,'VIA-ONE','contractor','Segundo cotizador nunca desplaza primero')
must_fail(c,'VIA-TWO','partner','Mismo socio no puede cruzar horarios')
c.execute("INSERT INTO booking_dispatch_releases(booking_id,released_by) VALUES('VIA-TWO','owner')")
assert quote(c,'VIA-TWO','contractor',6000)==1
assert c.execute("SELECT commission_bps FROM booking_quotes WHERE booking_id='VIA-TWO'").fetchone()[0]==2500
must_fail(c,'VIA-TWO','backup','Una única cotización por solicitud')
assert quote(c,'VIA-THREE','owner',8000)==1
assert c.execute("SELECT commission_bps FROM booking_quotes WHERE booking_id='VIA-THREE'").fetchone()[0]==0
c.execute("INSERT INTO driver_vehicle_profiles(staff_id,passenger_capacity,luggage_capacity) VALUES('backup',1,0)")
c.execute("INSERT INTO booking_dispatch_releases(booking_id,released_by) VALUES('VIA-FOUR','owner')")
must_fail(c,'VIA-FOUR','backup','Capacidad de equipaje insuficiente')
# La comisión se devenga después del servicio completado, nunca al cotizar.
assert c.execute("SELECT COUNT(*) FROM booking_commission_ledger").fetchone()[0]==0
c.execute("UPDATE bookings SET status='completed' WHERE id='VIA-ONE'")
c.execute("UPDATE bookings SET status='completed' WHERE id='VIA-TWO'")
assert c.execute("SELECT rate_bps,commission_cents,payment_status FROM booking_commission_ledger WHERE booking_id='VIA-ONE'").fetchone()==(0,0,'waived')
assert c.execute("SELECT rate_bps,commission_cents,payment_status FROM booking_commission_ledger WHERE booking_id='VIA-TWO'").fetchone()==(2500,150000,'pending')
c.execute("UPDATE bookings SET status='completed' WHERE id='VIA-TWO'")
assert c.execute("SELECT COUNT(*) FROM booking_commission_ledger WHERE booking_id='VIA-TWO'").fetchone()[0]==1
# Un conductor preasignado por el administrador también puede cotizar sin
# estar liberado al resto de contratados.
c.execute("""INSERT INTO bookings(id,customer_name,phone,email,origin,destination,
 trip_date,trip_time,passengers,bags,access_token_hash)
 VALUES('VIA-FIVE','Pasajero','099','p@qa.invalid','Inicio','Final',
 '2026-11-22','22:00',1,0,'hash')""")
c.execute("""INSERT INTO driver_assignments(booking_id,driver_id,assigned_by)
 VALUES('VIA-FIVE','contractor','owner')""")
assert quote(c,'VIA-FIVE','contractor',1200)==1
assert c.execute("SELECT status FROM bookings WHERE id='VIA-FIVE'").fetchone()[0]=='quoted'
print('OK: D1 atómico, comisión 25% solo al completar viaje, liquidación sin duplicados')
