// Vía Traslados — PREDELETE AUDIT ONLY. Uses SELECT and D1 GET; no data writes.
import assert from 'node:assert/strict';
const TOKEN=process.env.CLOUDFLARE_API_TOKEN||'';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID||'';
assert(TOKEN && /^[a-f0-9]{32}$/i.test(ACCOUNT),'Cloudflare credentials unavailable');
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/d1/database';
const headers={Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'};
const request=async(url,options={})=>{
 const r=await fetch(url,{headers,signal:AbortSignal.timeout(35000),...options});
 if(!r.ok){const detail=(await r.text()).slice(0,500);throw Error('Cloudflare HTTP '+r.status+' detail '+detail)}
 const j=await r.json();assert(j.success===true,'Cloudflare API error '+JSON.stringify(j.errors||[]));
 return j.result;
};
const all=await request(ROOT+'?per_page=100');
assert(Array.isArray(all),'Unexpected D1 database list');
const prod=all.filter(d=>d.name==='via-traslados-db');
const qa=all.filter(d=>d.name==='via-traslados-qa-db');
assert(prod.length===1 && qa.length===1 && prod[0].uuid!==qa[0].uuid,'Prod vs QA isolation check failed');
const UUID=prod[0].uuid;
const query=async sql=>{
 assert(/^(SELECT|PRAGMA\s+table_info\()/i.test(sql.trim()),'Non-read-only SQL prohibited');
 const r=await request(ROOT+'/'+UUID+'/query',{method:'POST',body:JSON.stringify({sql})});
 assert(r?.[0]?.success===true,'D1 select failed');
 return r[0].results||[];
};
const tables=(await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map(r=>r.name);
const accessibleTables=tables.filter(name=>!name.startsWith('_cf_')); // Cloudflare internal _cf_KV is SQLITE_AUTH protected, never read or delete.
for(const n of ['staff_users','staff_contacts','bookings','customers','service_settings'])assert(tables.includes(n),'Required table absent: '+n);
const founderMail='marcelof.gx@gmail.com',founderDigits='94842756';
const staff=await query('SELECT u.id,u.email,u.role,u.status,c.phone,c.email_verified_at FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id');
const normalize=v=>String(v||'').replace(/\D/g,'');
const matches=staff.filter(x=>String(x.email).toLowerCase()===founderMail && normalize(x.phone).endsWith(founderDigits));
const adminCount=staff.filter(x=>x.role==='admin'&&x.status==='approved').length;
console.log('VIA_D1_FOUNDER_PRELIM '+JSON.stringify({
 founderMatches:matches.length,founderRole:matches[0]?.role||null,
 founderStatus:matches[0]?.status||null,founderVerified:matches[0]?.email_verified_at!=null,
 approvedAdmins:adminCount,staffTotal:staff.length
}));
const counts={},countFailures={};
for(const name of accessibleTables){
 assert(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name),'Unexpected table name');
 try{counts[name]=Number((await query('SELECT COUNT(*) AS total FROM "'+name+'"'))[0]?.total||0)}
 catch(error){counts[name]=null;countFailures[name]=String(error.message||error).slice(0,500)}
}
const founder=matches.length===1?matches[0]:null;
const adminSafe=!!founder&&founder.role==='admin'&&founder.status==='approved'&&founder.email_verified_at!=null;
let bookmarkStatus='unavailable',bookmark=null;
try{
 const r=await request(ROOT+'/'+UUID+'/time_travel/bookmark');
 bookmark=r?.bookmark||null;bookmarkStatus=bookmark?'present':'missing';
}catch(e){bookmarkStatus='API_NOT_AVAILABLE';}
const report={
 database:'via-traslados-db',qa_isolated:true,database_uuid:UUID,
 founder:{
  matched:!!founder,phone_matches:!!founder,email_matches:!!founder,
  role:founder?.role||null,status:founder?.status||null,
  email_verified:founder?.email_verified_at!=null,
  record_exists_in_staff:matches.length===1
 },
 admin_safe_to_preserve:adminSafe,approved_administrators:adminCount,
 staff_total:staff.length,nonfounder_staff:staff.length-(founder?1:0),
 table_count:tables.length,accessible_table_count:accessibleTables.length,internal_tables_excluded:tables.filter(x=>x.startsWith('_cf_')),table_row_counts:counts,table_count_failures:countFailures,
 d1_time_travel_bookmark_status:bookmarkStatus,
 d1_time_travel_bookmark:bookmark,
 intent:'AUDIT_READ_ONLY',deletes_performed:0
};
console.log('VIA_D1_ADMIN_ONLY_PREDELETE_AUDIT '+JSON.stringify(report));
assert(Object.keys(countFailures).length===0,'Some D1 tables cannot be counted: NO DELETE');
assert(adminSafe,'Founder admin not verified: NO DELETE');
assert(adminCount===1,'Unexpected approved admins: NO DELETE without explicit policy');
assert(bookmarkStatus==='present','No D1 time-travel bookmark: cannot proceed to deletion');
console.log('VIA_D1_ADMIN_ONLY_PREDELETE_GATES_PASSED');
