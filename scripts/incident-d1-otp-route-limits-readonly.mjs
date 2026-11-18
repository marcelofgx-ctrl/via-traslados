// Auditoría de contadores anti abuso en D1. SOLO SELECT, NO PII.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'',token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Credenciales Cloudflare ausentes');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const req=async(url,data)=>{
 const r=await fetch(url,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(22000)});
 const d=await r.json();assert(r.ok&&d.success&&(!data||d.result?.[0]?.success),
 'D1 request failed HTTP '+r.status);return d.result;
};
const dbs=(await req(base+'?name=via-traslados-db')).filter(x=>x.name==='via-traslados-db');
assert(dbs.length===1,'D1 producción ambigua');
async function query(sql){assert(/^SELECT\s/i.test(sql),'SOLO SELECT');return(await req(base+'/'+dbs[0].uuid+'/query',{sql}))[0].results}
const hashes={
 otpGlobal:createHash('sha256').update('start-global').digest('hex'),
 geoBudget:createHash('sha256').update('via-route:free-budget').digest('hex')
};
const counters=await query("SELECT CASE WHEN rate_key='"+hashes.otpGlobal+"' THEN 'otp-global' WHEN rate_key='"+hashes.geoBudget+"' THEN 'geo-budget' END AS scope, attempts, unixepoch()-window_started AS ageSeconds FROM otp_rate_limits WHERE rate_key IN ('"+hashes.otpGlobal+"','"+hashes.geoBudget+"')");
const aggregate=await query("SELECT "+
 "(SELECT COUNT(*) FROM otp_rate_limits) AS rateRows,"+
 "(SELECT COUNT(*) FROM email_otp_codes) AS passengerOtpPending,"+
 "(SELECT COUNT(*) FROM email_otp_codes WHERE sent_at>=unixepoch()-3600) AS passengerOtpIssuedLastHour,"+
 "(SELECT COUNT(*) FROM staff_email_codes) AS staffOtpPending,"+
 "(SELECT COUNT(*) FROM staff_email_codes WHERE sent_at>=unixepoch()-3600) AS staffOtpIssuedLastHour,"+
 "(SELECT COUNT(*) FROM staff_users WHERE role='driver' AND status='pending') AS pendingDrivers,"+
 "(SELECT COUNT(*) FROM staff_users u JOIN staff_contacts c ON c.staff_id=u.id WHERE u.role='driver' AND c.email_verified_at IS NULL) AS unverifiedDrivers,"+
 "(SELECT COUNT(*) FROM route_preview_cache) AS routesCached,"+
 "(SELECT COUNT(*) FROM route_preview_cache WHERE updated_at>=unixepoch()-3600) AS routesCachedLastHour,"+
 "(SELECT COUNT(*) FROM bookings WHERE created_at >= datetime('now','-1 hour')) AS bookingsLastHour");
console.log('INCIDENT_D1_RATE_LIMITS '+JSON.stringify({counters,counts:aggregate[0],checkedAt:new Date().toISOString()}));
console.log('DB_UNCHANGED_ALL_QUERIES_SELECT');
