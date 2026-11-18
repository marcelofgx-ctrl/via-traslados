// Seguridad de reset D1: comparar la fotografía completa de registros afectados
// de una exportación restaurada OFFLINE con el estado actual LIVE, SIN exponer PII.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const backup=process.env.VIA_BACKUP_DB_PATH||'';
assert(backup.startsWith('/'),'VIA_BACKUP_DB_PATH necesario');
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Credenciales D1 faltantes');
const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const names=await fetch(api+'?name=via-traslados-db',{headers:h,signal:AbortSignal.timeout(25000)}).then(r=>r.json());
assert(names.success===true,'List D1 failure');
const found=names.result.filter(x=>x.name==='via-traslados-db');
assert(found.length===1,'D1 exclusiva no encontrada');
const uuid=found[0].uuid;
const qa=await fetch(api+'?name=via-traslados-qa-db',{headers:h,signal:AbortSignal.timeout(25000)}).then(r=>r.json());
assert(qa.result?.every(x=>x.uuid!==uuid),'Se prohibe cambiar D1 de QA');
async function live(sql){
 assert(sql.startsWith('SELECT '),'Solo lectura');
 const r=await fetch(api+'/'+uuid+'/query',{method:'POST',headers:h,
  body:JSON.stringify({sql}),signal:AbortSignal.timeout(25000)});
 const j=await r.json().catch(()=>({}));
 assert(r.ok&&j.success===true&&j.result?.[0]?.success===true,
  'D1 consulta denegada / error; abortar');
 return j.result[0].results;
}
function offline(sql){
 return JSON.parse(execFileSync('sqlite3',['-json',backup,sql],
  {encoding:'utf8',maxBuffer:1048576})||'[]');
}
const inspections=[
 ['bookings','id,status,price_uyu,updated_at','id'],
 ['booking_quotes','booking_id,driver_id,price_uyu','booking_id'],
 ['driver_assignments','booking_id,driver_id','booking_id'],
 ['booking_commission_ledger','booking_id,driver_id,fare_uyu,rate_bps,payment_status','booking_id'],
 ['customers','email,updated_at','email'],
 ['customer_passkeys','credential_id,email,counter','credential_id'],
 ['customer_pins','email,updated_at','email'],
 ['staff_users','id,role,status,updated_at','id'],
 ['booking_dispatch_releases','booking_id,released_by','booking_id']
];
const counts={};
for(const [t,cols,sort] of inspections){
 const sql='SELECT '+cols+' FROM '+t+' ORDER BY '+sort;
 const a=offline(sql),b=await live(sql),keys=cols.split(',');
 const shape=rows=>JSON.stringify(rows.map(row=>keys.map(k=>row[k]===undefined?null:row[k])));
 assert(shape(a)===shape(b),
  'Producción modificada después del respaldo: '+t+' (NO SE BORRA; crear backup nuevo)');
 counts[t]=a.length;
}
const pending=(await live("SELECT COUNT(*) AS n FROM staff_users WHERE role='driver' AND status='pending'"))[0].n;
const approved=(await live("SELECT COUNT(*) AS n FROM staff_users WHERE role='admin' AND status='approved'"))[0].n;
const byStatus=await live('SELECT status,count(*) AS n FROM bookings GROUP BY status ORDER BY status');
assert(counts.bookings===25&&counts.customers===4&&counts.booking_commission_ledger===0,
 'Conteos de audit cambiaron o comisiones devengadas: detener');
assert(counts.staff_users===2&&pending===1&&approved===1,'Cuentas del equipo cambiaron');
assert(JSON.stringify(byStatus)===JSON.stringify([
 {status:'cancelled',n:7},{status:'confirmed',n:2},
 {status:'quoted',n:5},{status:'requested',n:11}
 ]),'Estados de reservas cambiaron');
const settings=await live("SELECT setting_value FROM service_settings WHERE setting_key='public_web_enabled'");
assert(settings[0]?.setting_value==='1','Web estaba cerrada: detener');
console.log('PRE_RESET_SAFE: copia SQL y producción coinciden fila por fila en datos que se borrarán. 25 reservas, 4 pasajeros, 0 comisiones, 1 administrador aprobado; D1 QA aislada. No datos personales en logs.');
