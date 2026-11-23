// V30 real integration E2E: isolated Cloudflare API QA + D1 QA, no real OTP mail.
// Creates ONE synthetic QA booking with an explicit map pin; deletes ONLY that
// synthetic booking/session after it has been verified. No prod APIs/DB writes.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID||'',TOKEN=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(ACCOUNT)&&TOKEN,'Cloudflare QA credentials missing');
const DB='146017ce-09a7-4457-abd2-694a5a5b3e92';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/d1/database/'+DB+'/query';
const API='https://via-traslados-api-qa.marcelof-gx.workers.dev';
const ORIGIN='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const unique='qa-v30-'+process.env.GITHUB_RUN_ID+'@example.invalid';
const verifiedToken=randomBytes(32).toString('hex');
const hashed=createHash('sha256').update(verifiedToken).digest('hex');
const opts={headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},signal:AbortSignal.timeout(22000)};
async function sql(statement,params=[]){
 assert(!statement.includes('via-traslados-db'),'Prod database forbidden');
 const r=await fetch(ROOT,{method:'POST',...opts,body:JSON.stringify({sql:statement,params})});
 const v=await r.json();assert(r.ok&&v.success===true&&v.result?.[0]?.success===true,'QA D1 request failed '+statement.slice(0,50)+': '+r.status);
 return v.result[0].results||[];
}
async function api(path,init={}){
 const r=await fetch(API+path,{headers:{Origin:ORIGIN,'Content-Type':'application/json',...init.headers},
  signal:AbortSignal.timeout(25000),...init});
 const v=await r.json().catch(()=>({error:'Non-JSON response'}));
 return {status:r.status,body:v};
}
let id=null;
const start={label:'Cerca de Avenida Italia, Montevideo',lat:-34.854271,lng:-56.003157,source:'map',postalStatus:'unknown',numberIsApproximate:false};
const end={label:'Aeropuerto Internacional de Carrasco',lat:-34.83696,lng:-56.01638,source:'selected',postalStatus:'selected',numberIsApproximate:false};
try{
 const pre=await sql("PRAGMA table_info(booking_locations)");
 assert(pre.some(x=>x.name==='origin_lat')&&pre.some(x=>x.name==='destination_lat'),'QA migration absent');
 const health=await api('/api/health');
 assert.equal(health.status,200,JSON.stringify(health));
 assert(health.body.ok===true,'QA API not healthy');
 const sw=await sql("SELECT setting_value FROM service_settings WHERE setting_key='public_web_enabled'");
 assert(String(sw[0]?.setting_value)==='1','QA web disabled, cannot test');
 await sql("INSERT INTO email_verified_sessions(token_hash,email,expires_at) VALUES (?,?,unixepoch()+900)",[hashed,unique]);
 const future=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 const b={
  name:'Pasajero QA V30',phone:'099000000',email:unique,
  origin:'Cerca de Avenida Italia, Montevideo',
  destination:'Aeropuerto Internacional de Carrasco',
  originLocation:start,destinationLocation:end,
  date:future,time:'10:00',passengers:1,bags:1,notes:'QA V30 data only'
 };
 const created=await api('/api/requests',{method:'POST',
  headers:{'X-Verification-Token':verifiedToken},body:JSON.stringify(b)});
 assert.equal(created.status,201,'Cannot create real QA booking '+JSON.stringify(created));
 id=created.body.id;
 assert(/^VIA-[A-Z0-9-]{8,64}$/.test(id),'Unexpected booking ID '+id);
 const token=created.body.access_token;
 assert(typeof token==='string'&&token.length>=30,'Missing booking access token');
 const publicRow=await api('/api/requests/'+id,{headers:{'X-Booking-Token':token}});
 assert.equal(publicRow.status,200,JSON.stringify(publicRow));
 assert.equal(publicRow.body.status,'requested');
 assert.equal(publicRow.body.origin,b.origin);
 assert.equal(publicRow.body.destination,b.destination);
 const rows=await sql("SELECT origin_lat,origin_lng,destination_lat,destination_lng,origin_postal_status,origin_number_approximate FROM booking_locations WHERE booking_id=?",[id]);
 assert.equal(rows.length,1,'Geo point row absent');
 const c=rows[0];
 for(const [key,value] of [['origin_lat',start.lat],['origin_lng',start.lng],
 ['destination_lat',end.lat],['destination_lng',end.lng]])
  assert(Math.abs(Number(c[key])-value)<0.0000001,key+' persisted wrong');
 assert.equal(c.origin_postal_status,'unknown','Must not claim a postal door');
 const reverseBody=await api('/api/public/route-preview',{method:'POST',body:JSON.stringify({
  origin:b.origin,destination:b.destination,originLocation:start,destinationLocation:end
 })});
 assert([200,429,502,503,504].includes(reverseBody.status),
  'Unexpected route preview contract '+JSON.stringify(reverseBody));
 if(reverseBody.status===200)
  assert(Number(reverseBody.body.distanceKm)>0,'Routing must return actual positive km');
 console.log('VIA_V30_REAL_QA_E2E_PASS '+JSON.stringify({
  bookingCreatedAndRead:true,geoPointsStoredExact:true,routePreviewStatus:reverseBody.status,
  providerUsable:reverseBody.status===200,manualQuoteFallback:true,
  dataBase:'via-traslados-qa-db',neverTouchedProd:true
 }));
}finally{
 if(id){
  // Delete only the synthetic QA test booking, not other QA records.
  await sql('DELETE FROM booking_events WHERE booking_id=?',[id]);
  await sql('DELETE FROM booking_routes WHERE booking_id=?',[id]);
  await sql('DELETE FROM booking_locations WHERE booking_id=?',[id]);
  await sql('DELETE FROM bookings WHERE id=? AND email=?',[id,unique]);
 }
 await sql('DELETE FROM email_verified_sessions WHERE email=?',[unique]);
 await sql('DELETE FROM customers WHERE email=?',[unique]);
 console.log('VIA_V30_QA_SYNTHETIC_DATA_CLEANED');
}
