// Datos exclusivamente sintéticos para D1 QA. No copiar cuentas ni reservas productivas.
import fs from 'node:fs';
const accounts=[
 ['00000000-0000-4000-8000-000000000001','fundador.qa@ejemplo.invalid','Administración QA','admin','+59899000099'],
 ['00000000-0000-4000-8000-000000000002','socio.qa@ejemplo.invalid','Conductor socio QA','driver','+59899000098'],
 ['00000000-0000-4000-8000-000000000003','contratado.qa@ejemplo.invalid','Conductor contratado QA','driver','+59899000097']
];
const sqlQuote=x=>"'"+String(x).replace(/'/g,"''")+"'";
let q=['PRAGMA foreign_keys=ON;'];
for(const [id,email,name,role,phone] of accounts){
 q.push(`INSERT OR IGNORE INTO staff_users
 (id,email,display_name,password_salt,password_hash,iterations,role,status,approved_at)
 VALUES(${[id,email,name,'qa-disabled-password-salt','qa-disabled-password-hash'].map(sqlQuote).join(',')},
 100000,${sqlQuote(role)},'approved',unixepoch());`);
 q.push(`INSERT OR IGNORE INTO staff_contacts(staff_id,phone,email_verified_at)
 VALUES(${sqlQuote(id)},${sqlQuote(phone)},unixepoch());`);
}
q.push(`INSERT INTO driver_commercial_profiles(staff_id,mode,can_quote_all,can_release,commission_bps)
 VALUES('00000000-0000-4000-8000-000000000002','partner',1,1,0)
 ON CONFLICT(staff_id) DO UPDATE SET mode='partner',can_quote_all=1,can_release=1,commission_bps=0;`);
q.push(`INSERT INTO driver_commercial_profiles(staff_id,mode,can_quote_all,can_release,commission_bps)
 VALUES('00000000-0000-4000-8000-000000000003','contractor',0,0,2500)
 ON CONFLICT(staff_id) DO UPDATE SET mode='contractor',can_quote_all=0,can_release=0,commission_bps=2500;`);
const fixtures=[
 ['001','Ruta 200, San José de Carrasco, Canelones','Aeropuerto Internacional de Carrasco, Canelones',1,1,5100,480],
 ['002','Av. Italia 4230, Montevideo','Bulevar Artigas 1825, Montevideo',2,2,12700,1560],
 ['003','Alberto Méndez 107, Colonia del Sacramento','Lagunillas 434, Montevideo',1,1,185000,8760],
 ['004','Aeropuerto Internacional de Carrasco, Canelones','Punta Carretas, Montevideo',3,2,23400,2280],
 ['005','Ciudad Vieja, Montevideo','Shangrilá, Canelones',1,0,26100,2520]
];
function future(n){
 const d=new Date(Date.now()+(n+6)*864e5);
 return d.toISOString().slice(0,10);
}
for(let i=0;i<fixtures.length;i++){
 const [num,origin,destination,pax,bags,distance,duration]=fixtures[i],id='VIA-QA-'+num;
 const values=[id,'Pasajero QA','099000000','pasajero.qa@ejemplo.invalid',origin,destination,
  future(i+1),'10:00',pax,bags,'Solicitud creada solo para ensayos','qa-no-public-token'];
 q.push(`INSERT OR IGNORE INTO bookings(id,customer_name,phone,email,origin,destination,
 trip_date,trip_time,passengers,bags,notes,access_token_hash)
 VALUES(${values.map((v,j)=>j===8||j===9?String(v):sqlQuote(v)).join(',')});`);
 q.push(`INSERT OR IGNORE INTO booking_routes(booking_id,distance_m,duration_s,provider)
 VALUES(${sqlQuote(id)},${distance},${duration},'geoapify');`);
}
fs.writeFileSync('qa-seed.sql',q.join('\n')+'\n');
console.log('D1 QA: 3 cuentas sintéticas y 5 reservas de ejemplo preparadas.');
