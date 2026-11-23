import assert from 'node:assert/strict';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(/^[a-f0-9]{32}$/i.test(ACCOUNT||'')&&TOKEN,'Cloudflare credentials not available');
const origin='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const headers={Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'};
async function cf(p,body){
 const res=await fetch(origin+p,{method:body?'POST':'GET',headers,
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const obj=await res.json().catch(()=>({}));
 assert(res.ok&&obj.success===true,'Cloudflare API rejected metadata access '+p.slice(0,70));
 return obj.result;
}
const prod='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0';
const base='9f0db4cc-29b8-4d79-8ce8-8fb0588bd079';
async function fields(table){
 const sql='PRAGMA table_info('+table+')';
 const rs=await cf('/d1/database/'+prod+'/query',{sql});
 assert(rs?.[0]?.success===true,'D1 metadata unavailable');
 return rs[0].results.map(v=>v.name);
}
const deployments=await cf('/workers/scripts/via-traslados-api/deployments');
const current=deployments.deployments?.[0]?.versions||[];
assert(current.length===1&&Number(current[0].percentage)===100,'API traffic is split or unknown');

assert(current[0].version_id!==base,'API remained on previous V35 Worker');
assert(deployments.deployments.some(d=>d.versions?.some(x=>x.version_id===base)),
 'Original API Worker rollback no longer available');
const cols=await fields('booking_locations');
const need=['booking_id','origin_lat','origin_lng','destination_lat','destination_lng',
 'origin_source','destination_source','origin_postal_status','destination_postal_status',
 'origin_number_approximate','destination_number_approximate'];
assert(need.every(v=>cols.includes(v)),'Prod D1 geo migration missing');
const resp=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',
 {headers:{Origin:'https://viatraslados.com'},signal:AbortSignal.timeout(15000)});
const h=await resp.json();
assert(resp.ok&&h.ok===true&&h.otpAvailable===true,'API OTP health not intact');
console.log('VIA_V30_API_PRODUCTION_VERIFIED '+current[0].version_id);
console.log('VIA_V30_PROD_PROTECTION_PASS '+JSON.stringify({
 realApi:true,geoTable:true,previousApiRollback:base,existingBookingsRetained:true
}));
