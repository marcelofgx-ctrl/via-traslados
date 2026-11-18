// Verificación read-only de la cuenta fundadora: no extraer ni imprimir PII.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Cloudflare credentials missing');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const list=await fetch(endpoint+'?name=via-traslados-db',{headers,signal:AbortSignal.timeout(20000)}).then(r=>r.json());
assert(list.success===true,'Could not list Cloudflare D1');
const dbs=(list.result||[]).filter(x=>x.name==='via-traslados-db');
assert(dbs.length===1,'Unique production D1 missing');
const uuid=dbs[0].uuid;
async function query(sql){
 assert(/^SELECT\s/i.test(sql),'Only SELECT');
 const r=await fetch(endpoint+'/'+uuid+'/query',{method:'POST',headers,body:JSON.stringify({sql}),signal:AbortSignal.timeout(20000)});
 const j=await r.json().catch(()=>({}));
 assert(r.ok&&j.success===true&&j.result?.[0]?.success===true,'D1 read failed: '+r.status);
 return j.result[0].results||[];
}
const res=await query(`SELECT
 COUNT(*) AS totalAdminAccounts,
 SUM(CASE WHEN u.role='admin' AND u.status='approved' THEN 1 ELSE 0 END) AS approvedAdmins,
 SUM(CASE WHEN u.role='admin' AND u.status='approved' AND c.phone='+59894842756' THEN 1 ELSE 0 END) AS approvedAdminWithExpectedPhone,
 SUM(CASE WHEN u.role='admin' AND u.status='approved' AND c.phone='+59894842756' AND c.email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS expectedPhoneVerified,
 SUM(CASE WHEN u.role='admin' AND u.status='approved' AND (c.phone IS NULL OR c.phone<>'+59894842756') THEN 1 ELSE 0 END) AS otherApprovedAdmins
 FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id WHERE u.role='admin'`);
const out=res[0];
console.log('VIA_FOUNDER_READONLY_CHECK '+JSON.stringify(out));
console.log('NO_PHONE_OR_EMAIL_RETRIEVED_NO_DB_CHANGES');
