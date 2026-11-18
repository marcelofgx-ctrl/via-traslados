// Verificación POST-reset: D1 exclusiva sigue intacta en esquema, sin registros de prueba.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Credenciales D1 ausentes');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const dbs=await fetch(api+'?name=via-traslados-db',{headers}).then(r=>r.json());
const exact=dbs.result?.filter(x=>x.name==='via-traslados-db')||[];
assert(exact.length===1,'Base de prod no encontrada');
async function query(sql){
 const r=await fetch(api+'/'+exact[0].uuid+'/query',{method:'POST',headers,
 body:JSON.stringify({sql}),signal:AbortSignal.timeout(25000)});
 const j=await r.json();
 assert(r.ok&&j.success&&j.result?.[0]?.success,'No se puede verificar D1');
 return j.result[0].results||[];
}
const cleared=['bookings','booking_events','booking_quotes','booking_routes',
 'booking_dispatch_releases','driver_assignments','booking_commission_ledger',
 'customers','customer_sessions','customer_passkeys','customer_pins',
 'customer_passkey_challenges','email_otp_codes','email_verified_sessions','otp_rate_limits'];
for(const t of cleared){
 assert((await query('SELECT COUNT(*) AS n FROM '+t))[0]?.n===0,
  'Reset incompleto: '+t+' no está vacía');
}
const admins=(await query("SELECT COUNT(*) AS n FROM staff_users WHERE role='admin' AND status='approved'"))[0].n;
const pending=(await query("SELECT COUNT(*) AS n FROM staff_users WHERE role='driver' AND status='pending'"))[0].n;
const settings=(await query("SELECT setting_value FROM service_settings WHERE setting_key='public_web_enabled'"))[0]?.setting_value;
const audit=(await query("SELECT COUNT(*) AS n FROM admin_audit WHERE action='production-test-reset-20261117'"))[0].n;
const cache=(await query('SELECT COUNT(*) AS n FROM route_preview_cache'))[0].n;
const nTriggers=(await query("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'sqlite_%'"))[0].n;
assert(admins===1&&pending===0&&settings==='1'&&audit===1&&cache>=16&&nTriggers===3,
 'Accesos, motor geográfico o auditoría no coinciden');
const health=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(12000)}).then(r=>r.json());
const pub=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/public/status',{signal:AbortSignal.timeout(12000)}).then(r=>r.json());
assert(health.ok===true&&pub.enabled===true,'Backend o web fueron alterados');
console.log('VIA_RESET_CONFIRMED: transacciones=0 pasajeros=0 passkeys=0 codigos=0; administrador=1 aprobado; pendiente=0; geo-cache='+cache+' conservado; tres triggers intactos; API y servicio activos. QA NO TOCADA.');
