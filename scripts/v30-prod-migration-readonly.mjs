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

const cols=await fields('booking_locations');
assert(cols.length===11,'Unexpected V30 migration columns '+cols.length);
assert(cols.includes('booking_id')&&cols.includes('origin_lat')&&cols.includes('destination_lng'),'Geo table incomplete');
const booking=await fields('bookings');
assert(booking.includes('access_token_hash')&&booking.includes('status'),'Old booking table changed');
console.log('VIA_V30_PROD_MIGRATION_ADDITIVE_VERIFIED '+JSON.stringify({bookingTableIntact:true,geoFields:cols.length}));
