// Auditoría NO DESTRUCTIVA del esquema de la D1 productiva.
// Consulta exclusivamente metadata SQLite y contadores agregados; jamás lee reservas.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Credenciales Cloudflare ausentes');
const hdr={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const ctl=AbortSignal.timeout(25000);
const list=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database?name=via-traslados-db',{
 headers:hdr,signal:ctl});
assert(list.ok,'Cloudflare lista D1 HTTP '+list.status);
const databases=await list.json();
assert(databases.success===true,'Cloudflare lista D1 no disponible');
const prod=databases.result.filter(db=>db.name==='via-traslados-db');
assert(prod.length===1,'Base de datos productiva única no encontrada');
const uuid=prod[0].uuid;
const qa=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database?name=via-traslados-qa-db',{headers:hdr,signal:AbortSignal.timeout(25000)}).then(r=>r.json());
assert(qa.result?.every(db=>db.uuid!==uuid),'D1 productiva coincide con QA');
async function select(sql){
 assert(/^(?:SELECT|PRAGMA\s+table_info\()/i.test(sql.trim()),'Consulta no permitida');
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+uuid+'/query',{
  method:'POST',headers:hdr,body:JSON.stringify({sql}),signal:AbortSignal.timeout(25000)});
 assert(response.ok,'Cloudflare D1 HTTP '+response.status);
 const data=await response.json();
 assert(data.success===true&&data.result?.[0]?.success===true,'Consulta D1 de sólo lectura fallida');
 return data.result[0].results||[];
}
const objects=await select("SELECT type,name FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type,name");
const tables=objects.filter(x=>x.type==='table').map(x=>x.name);
const triggers=objects.filter(x=>x.type==='trigger').map(x=>x.name);
const count=await select("SELECT COUNT(*) AS n FROM bookings");
const bookingsCols=(await select("PRAGMA table_info(bookings)")).map(x=>x.name);
const pending=['driver_commercial_profiles','booking_dispatch_releases','booking_quotes','booking_commission_ledger'].filter(x=>!tables.includes(x));
const presentRequired=['bookings','staff_users','driver_assignments','customer_sessions','customer_passkeys','booking_routes'].filter(x=>tables.includes(x));
console.log(JSON.stringify({database:'via-traslados-db',confirmedIsolatedFromQA:true,
 numberOfTables:tables.length,existingRequiredTables:presentRequired,
 additionalCommercialTablesMissing:pending,triggerCount:triggers.length,
 bookingCount:Number(count[0]?.n||0),bookingColumnsValid:['id','origin','destination','status','price_uyu'].every(x=>bookingsCols.includes(x))},null,2));
assert(presentRequired.length===6,'Esquema productivo incompatible; intervención manual requerida');
assert(['id','origin','destination','status','price_uyu'].every(x=>bookingsCols.includes(x)),'Columnas de bookings inesperadas');
console.log('AUDITORIA_D1_READONLY_OK: sin nombres, teléfonos, correos, reservas ni escritura.');
