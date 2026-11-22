/* Controlled production D1 reset (only Vía Traslados), explicitly requested.
 * Retain founder ADMIN account/contacts/staff authentication and settings.
 * Remove passenger, booking, ephemeral OTP and non-admin trial data only.
 * Cloudflare D1 Time Travel bookmark recorded before any destructive SQL. */
import assert from 'node:assert/strict';
const A=process.env.CLOUDFLARE_ACCOUNT_ID||'',T=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(A)&&T,'Missing Cloudflare credentials');
const API='https://api.cloudflare.com/client/v4/accounts/'+A+'/d1/database';
const HEAD={Authorization:'Bearer '+T,'Content-Type':'application/json'};
async function api(url,options={}){
 const r=await fetch(url,{headers:HEAD,signal:AbortSignal.timeout(30000),...options});
 const txt=await r.text();
 if(!r.ok)throw Error('Cloudflare HTTP '+r.status+' '+txt.slice(0,450));
 const data=JSON.parse(txt);
 assert(data.success===true,'Cloudflare error '+JSON.stringify(data.errors||[]).slice(0,350));
 return data.result;
}
const dbs=await api(API+'?per_page=100');
const prod=dbs.filter(x=>x.name==='via-traslados-db'),qa=dbs.filter(x=>x.name==='via-traslados-qa-db');
assert(prod.length===1&&qa.length===1&&prod[0].uuid!==qa[0].uuid,'Prod D1 and QA not isolated');
assert(prod[0].uuid==='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0','Database id differs from audited production');
const URL=API+'/'+prod[0].uuid;
async function query(sql,readonly=true){
 if(readonly)assert(/^SELECT\s+/i.test(sql),'Read-only gate refused SQL');
 const r=await api(URL+'/query',{method:'POST',body:JSON.stringify({sql})});
 assert(Array.isArray(r)&&r.every(x=>x.success===true),'D1 query/batch failed');
 return r;
}
const get=async sql=>(await query(sql))[0].results||[];
async function inspect(){
 const admins=await get('SELECT u.id,u.email,u.role,u.status,c.phone,c.email_verified_at FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id');
 const norm=s=>String(s||'').replace(/\D/g,'');
 assert(admins.length===1,'Production has additional staff; refuse deletion');
 const a=admins[0];
 assert(a.email.toLowerCase()==='marcelof.gx@gmail.com'&&norm(a.phone).endsWith('94842756')&&a.role==='admin'&&a.status==='approved'&&a.email_verified_at!=null,'Founder admin identity is not the expected account');
 const setting=(await get("SELECT setting_value FROM service_settings WHERE setting_key='public_web_enabled'"))[0]?.setting_value;
 assert(['1','true'].includes(String(setting)),'Public service state unexpectedly changed');
 const tables=['bookings','booking_events','booking_quotes','booking_routes','booking_commission_ledger',
  'booking_dispatch_releases','driver_assignments','driver_vehicle_profiles','driver_commercial_profiles',
  'customers','customer_sessions','customer_passkeys','customer_passkey_challenges','customer_pins',
  'email_otp_codes','email_verified_sessions','otp_rate_limits','route_preview_cache','admin_audit',
  'staff_users','staff_contacts','staff_sessions','staff_refresh_tokens','staff_email_codes',
  'staff_password_resets','service_settings'];
 const count={};
 for(const name of tables)count[name]=Number((await get('SELECT COUNT(*) AS n FROM "'+name+'"'))[0]?.n??-1);
 return {adminId:a.id,account:a.email,counts:count,setting};
}
const before=await inspect();
assert(before.counts.bookings===17&&before.counts.customers===3,'Production passenger/booking totals changed after audit; no delete');
assert(before.counts.staff_users===1&&before.counts.staff_contacts===1,'Admin account/contact missing');
assert(before.counts.staff_sessions===17&&before.counts.staff_refresh_tokens===14,
 'Staff session state changed, refuse to touch unknown session context');
const bookmark=(await api(URL+'/time_travel/bookmark'))?.bookmark;
assert(typeof bookmark==='string'&&bookmark.length>20,'No predelete D1 Time Travel recovery point');
console.log('VIA_D1_PREDELETE_RECOVERY '+JSON.stringify({
 database:'via-traslados-db',account_role:'admin',admin_verified:true,
 retain_admin_staff_auth:true,retain_service_settings:true,
 before_counts:before.counts,
 recovery_bookmark:bookmark,
 reminder:'Cloudflare Time Travel recovery is limited; use bookmark before expiration'
}));
const deletes=[
 'booking_commission_ledger','booking_quotes','booking_dispatch_releases','booking_routes','booking_events',
 'driver_assignments','bookings',
 'customer_sessions','customer_passkeys','customer_pins','customer_passkey_challenges','customers',
 'email_verified_sessions','email_otp_codes','otp_rate_limits','route_preview_cache','admin_audit',
 'driver_vehicle_profiles','driver_commercial_profiles'
];
// Protect the administrator and all authentication/settings rows BY OMITTING these tables.
const forbidden=new Set(['staff_users','staff_contacts','staff_sessions','staff_refresh_tokens',
 'staff_email_codes','staff_password_resets','service_settings','_cf_KV']);
assert(deletes.length===19&&deletes.every(t=>!forbidden.has(t)),'Admin preservation guard failed');
assert(new Set(deletes).size===deletes.length,'Duplicate reset table');
if(process.env.VIA_ALLOW_D1_PROD_CLEAN!=='EXPLICITLY_APPROVED_2026_11_22')
 throw Error('Dry-run complete. Destructive approval marker absent.');
// Single multi-statement REST request; backend executes as D1 batch.
// NOT a schema change, only DELETE from strictly allowlisted transient tables.
const sql=deletes.map(t=>'DELETE FROM "'+t+'"').join(';\n')+';';
const result=await query(sql,false);
console.log('VIA_D1_PURGE_BATCH_RETURNED '+JSON.stringify({statements:deletes.length,
 statement_results:result.length,all_success:result.every(x=>x.success===true)}));
const after=await inspect();
for(const table of deletes)assert(after.counts[table]===0,'Postdelete table not empty: '+table);
for(const t of ['staff_users','staff_contacts','staff_sessions','staff_refresh_tokens',
 'staff_email_codes','staff_password_resets','service_settings'])
 assert(after.counts[t]===before.counts[t],'Admin or settings data count changed: '+t);
assert(after.adminId===before.adminId&&after.account===before.account,'Founder account altered');
console.log('VIA_D1_ADMIN_ONLY_CLEANUP_VERIFIED '+JSON.stringify({
 db:'via-traslados-db',admin_preserved:true,staff_total:after.counts.staff_users,
 passengers:after.counts.customers,bookings:after.counts.bookings,
 bookings_events:after.counts.booking_events,customer_sessions:after.counts.customer_sessions,
 staff_auth_preserved:true,api_untouched:true,qa_untouched:true,
 recovery_bookmark:bookmark
}));
