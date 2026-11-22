/* Post-cleanup independent D1 production read-only verification — 2026-11-22. */
import assert from 'node:assert/strict';
const A=process.env.CLOUDFLARE_ACCOUNT_ID||'',T=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(A)&&T,'Cloudflare credentials unavailable');
const root='https://api.cloudflare.com/client/v4/accounts/'+A+'/d1/database';
const headers={'Authorization':'Bearer '+T,'Content-Type':'application/json'};
async function request(url,options={}){
 const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000),...options});
 assert(r.ok,'Cloudflare HTTP '+r.status);
 const j=await r.json();assert(j.success===true,'Cloudflare D1 API failed');
 return j.result;
}
const dbs=await request(root+'?per_page=100');
const prod=dbs.filter(d=>d.name==='via-traslados-db');
const qa=dbs.filter(d=>d.name==='via-traslados-qa-db');
assert(prod.length===1&&qa.length===1&&prod[0].uuid!==qa[0].uuid,'D1 production/QA separation not confirmed');
assert(prod[0].uuid==='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0','Production D1 identity changed');
async function select(sql){
 assert(/^SELECT\s+/i.test(sql),'Only SELECT statements permitted');
 const result=await request(root+'/'+prod[0].uuid+'/query',{method:'POST',body:JSON.stringify({sql})});
 assert(result?.[0]?.success===true,'D1 SELECT failed');
 return result[0].results||[];
}
const allStaff=await select('SELECT u.id,u.email,u.role,u.status,c.phone,c.email_verified_at FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id');
assert(allStaff.length===1,'Administrator must be sole staff user');
const admin=allStaff[0];
assert(admin.role==='admin'&&admin.status==='approved'&&admin.email==='marcelof.gx@gmail.com'&&
 String(admin.phone||'').replace(/\D/g,'').endsWith('94842756')&&
 admin.email_verified_at!=null,'Founder admin identity changed');
const deleted=['booking_commission_ledger','booking_quotes','booking_dispatch_releases','booking_routes',
 'booking_events','driver_assignments','bookings','customer_sessions','customer_passkeys','customer_pins',
 'customer_passkey_challenges','customers','email_verified_sessions','email_otp_codes','otp_rate_limits',
 'route_preview_cache','admin_audit','driver_vehicle_profiles','driver_commercial_profiles'];
const protectedTables=['staff_users','staff_contacts','staff_sessions','staff_refresh_tokens','staff_email_codes',
 'staff_password_resets','service_settings'];
const count={};
for(const table of [...deleted,...protectedTables]){
 assert(/^[a-z_]+$/.test(table));
 count[table]=Number((await select('SELECT COUNT(*) AS n FROM "'+table+'"'))[0]?.n??-1);
}
console.log('VIA_D1_POSTDELETE_RECOUNT '+JSON.stringify(count));
const dynamic=new Set(['otp_rate_limits','route_preview_cache','admin_audit',
 'email_otp_codes','email_verified_sessions','customer_passkey_challenges']);
for(const table of deleted){
 if(dynamic.has(table))continue; // Live API can recreate ephemeral security/cache records immediately.
 assert(count[table]===0,'Persistent customer/booking data remains after cleanup '+table);
}
const expected={staff_users:1,staff_contacts:1,staff_sessions:17,
 staff_refresh_tokens:14,staff_email_codes:0,staff_password_resets:0,service_settings:1};
for(const [table,n] of Object.entries(expected))assert(count[table]===n,'Protected admin data changed '+table);
const web=(await select("SELECT setting_value FROM service_settings WHERE setting_key='public_web_enabled'"))[0];
assert(String(web.setting_value)==='1','Public web setting changed');
console.log('VIA_PROD_D1_ADMIN_ONLY_FINAL_READONLY_PASS '+JSON.stringify({
 database:'via-traslados-db',isolated_from_qa:true,admin_approved:true,
 founder_contact_verified:true,staff_users:count.staff_users,passengers:count.customers,
 bookings:count.bookings,bookings_events:count.booking_events,
 admin_auth_sessions_preserved:count.staff_sessions,
 admin_refresh_tokens_preserved:count.staff_refresh_tokens,
 protected_table_counts:Object.fromEntries(protectedTables.map(x=>[x,count[x]])),
 persistent_tables_zero:deleted.filter(t=>!dynamic.has(t)).length,
 live_ephemeral_recreated:Object.fromEntries([...dynamic].map(t=>[t,count[t]])),
 public_web_enabled:true
}));
