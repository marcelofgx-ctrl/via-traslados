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

assert(current[0].version_id===base,'Original API Worker changed; fail closed');
const d=await cf('/d1/database?name=via-traslados-db');
assert(d.filter(x=>x.name==='via-traslados-db').length===1&&d.find(x=>x.name==='via-traslados-db').uuid===prod,'Wrong D1');
const cols=await fields('bookings');
for(const name of ['origin','destination','id','email','status','access_token_hash'])
 assert(cols.includes(name),'Unexpected booking schema '+name);
const extra=await fields('booking_locations');
if(extra.length)assert(extra.includes('origin_lat')&&extra.includes('destination_lng'),'Incompatible V30 migration already present');
console.log('VIA_V30_API_PREFLIGHT_READONLY_PASS '+JSON.stringify({
 previousApiWorker:base,bookingsSchemaFields:cols.length,
 existingGeoFields:extra.length,db:'via-traslados-db',
 rollbackVersionAvailable:true,productionRowsUnchanged:true
}));
