// Verifica reservas y cuentas posteriores al reset del 18/11, exclusivamente SELECT.
// No cambia D1 ni imprime correo, teléfono, ubicaciones o secretos.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Faltan credenciales Cloudflare');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const resp=await fetch(base+'?name=via-traslados-db',{headers,signal:AbortSignal.timeout(22000)});
assert(resp.ok,'No se puede listar D1');
const data=await resp.json();
assert(data.success===true,'No se puede verificar D1');
const matches=(data.result||[]).filter(x=>x.name==='via-traslados-db');
assert(matches.length===1,'D1 de producción no encontrada');
const id=matches[0].uuid;
const qares=await fetch(base+'?name=via-traslados-qa-db',{headers,signal:AbortSignal.timeout(20000)});
const qa=await qares.json();
assert(qa.success===true&&!(qa.result||[]).some(x=>x.uuid===id),'No aislada de D1 QA');
async function select(sql) {
 assert(/^SELECT\s/i.test(sql),'Solo lectura');
 const res=await fetch(base+'/'+id+'/query',{method:'POST',headers,
  body:JSON.stringify({sql}),signal:AbortSignal.timeout(23000)});
 const j=await res.json().catch(()=>({}));
 assert(res.ok&&j.success===true&&j.result?.[0]?.success===true,
  'No se pudo completar SELECT en D1. HTTP '+res.status);
 return j.result[0].results||[];
}
const counts=(await select(`SELECT
 (SELECT COUNT(*) FROM bookings) AS bookings,
 (SELECT COUNT(*) FROM bookings WHERE created_at>='2026-11-18 02:08:33') AS newBookings,
 (SELECT COUNT(*) FROM customers) AS customers,
 (SELECT COUNT(*) FROM customer_sessions WHERE revoked_at IS NULL AND expires_at>unixepoch()) AS activeCustomerSessions,
 (SELECT COUNT(*) FROM customer_passkeys) AS passkeys,
 (SELECT COUNT(*) FROM customer_pins) AS pins,
 (SELECT COUNT(*) FROM booking_events) AS events,
 (SELECT COUNT(*) FROM booking_quotes) AS quotes,
 (SELECT COUNT(*) FROM driver_assignments) AS assignments,
 (SELECT COUNT(*) FROM booking_commission_ledger) AS commissions,
 (SELECT COUNT(*) FROM staff_users WHERE role='admin' AND status='approved') AS admins,
 (SELECT COUNT(*) FROM staff_users WHERE role='driver' AND status='pending') AS pendingDrivers,
 (SELECT COUNT(*) FROM staff_users WHERE role='driver' AND status='approved') AS approvedDrivers,
 (SELECT COUNT(*) FROM booking_routes) AS calculatedBookingRoutes,
 (SELECT COUNT(*) FROM route_preview_cache) AS previewCache`))[0];
const bookings=await select(`SELECT b.id,b.status,b.trip_date,b.trip_time,b.created_at,
 CASE WHEN c.email IS NOT NULL THEN 1 ELSE 0 END AS customerLinked,
 CASE WHEN b.access_token_hash IS NOT NULL AND length(b.access_token_hash)=64 THEN 1 ELSE 0 END AS accessTokenHashValid,
 CASE WHEN r.distance_m>0 AND r.duration_s>0 AND r.provider='geoapify' THEN 1 ELSE 0 END AS routeCalculated,
 CASE WHEN q.booking_id IS NOT NULL THEN 1 ELSE 0 END AS quoted,
 CASE WHEN a.booking_id IS NOT NULL THEN 1 ELSE 0 END AS assigned,
 (SELECT COUNT(*) FROM booking_events ev WHERE ev.booking_id=b.id) AS eventCount,
 (SELECT COUNT(*) FROM customer_sessions cs WHERE cs.email=b.email AND cs.revoked_at IS NULL AND cs.expires_at>unixepoch()) AS linkedActiveSessions
 FROM bookings b
 LEFT JOIN customers c ON c.email=b.email
 LEFT JOIN booking_routes r ON r.booking_id=b.id
 LEFT JOIN booking_quotes q ON q.booking_id=b.id
 LEFT JOIN driver_assignments a ON a.booking_id=b.id
 ORDER BY b.created_at DESC,b.id DESC LIMIT 10`);
const userRows=(await select(`SELECT
 (SELECT COUNT(*) FROM customers c WHERE EXISTS(SELECT 1 FROM bookings b WHERE b.email=c.email)) AS customersWithBookings,
 (SELECT COUNT(*) FROM customers c WHERE NOT EXISTS(SELECT 1 FROM bookings b WHERE b.email=c.email)) AS customersWithoutBookings,
 (SELECT COUNT(*) FROM bookings b WHERE NOT EXISTS(SELECT 1 FROM customers c WHERE c.email=b.email)) AS bookingsWithoutCustomer,
 (SELECT COUNT(*) FROM bookings b WHERE NOT EXISTS(SELECT 1 FROM booking_events e WHERE e.booking_id=b.id AND e.new_status='requested')) AS bookingsMissingCreationEvent,
 (SELECT COUNT(*) FROM booking_events e WHERE NOT EXISTS(SELECT 1 FROM bookings b WHERE b.id=e.booking_id)) AS orphanEvents`))[0];
const status=await select('SELECT status,COUNT(*) AS n FROM bookings GROUP BY status ORDER BY status');
const web=(await fetch('https://viatraslados.com/api/public/status',{signal:AbortSignal.timeout(12000)}).then(async r=>({status:r.status,contentType:r.headers.get('content-type')})).catch(()=>({status:0})));
const health=(await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(12000)}).then(async r=>({status:r.status,data:r.status===200?await r.json():null})).catch(()=>({status:0})));
const result={database:'via-traslados-db',qaIsolated:true,checkedAt:new Date().toISOString(),counts,
 userConsistency:userRows,bookingStatuses:status,bookings:bookings.map(x=>({...x,id:'…'+x.id.slice(-6)})),
 publicStatusResponse:web.status,apiHealth:health.status===200&&health.data?.ok===true?'OK':'ERROR',
 apiOtpReady:health.data?.otpAvailable===true};
console.log('VIA_BOOKING_USER_READONLY_AUDIT '+JSON.stringify(result));
console.log('READONLY_OK: NO_PII_EXPOSED_NO_CHANGES.');
