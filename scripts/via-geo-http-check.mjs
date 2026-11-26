import assert from 'node:assert/strict';
const qa='https://via-traslados-geo-integral-qa.marcelof-gx.workers.dev';
const backup='https://8d9255cc-via-traslados-api.marcelof-gx.workers.dev';
const get=async url=>fetch(url,{signal:AbortSignal.timeout(11000),cache:'no-store'});
const html=await(await get(qa+'/index.html')).text();assert(html.includes('V30.4.10.10 QA'),'Expected exact QA version');
const core=await(await get(qa+'/geo-v2/core.mjs')).text();
const geo=await import('data:text/javascript;base64,'+Buffer.from(core).toString('base64'));
const points=[[-34.9061,-56.1999],[-34.9057,-56.1912],[-34.9015,-56.1646]];
async function probe(label,url,lat,lng){
 const t=Date.now();try{
 const r=await get(url),j=await r.json(),rows=Array.isArray(j.results)?j.results:[];
 const e=geo.evaluateReverseCandidates(rows,100,{lat,lng});
 const d=geo.buildPickupDisplay({point:{lat,lng,source:'gps',accuracyMeters:12,timestamp:Date.now()},reverseCandidates:rows});
 assert.notEqual(d.postalStatus,'user_confirmed');assert.equal(d.point.lat,lat);assert.equal(d.point.lng,lng);
 const result={label,http:r.status,ms:Date.now()-t,cache:r.headers.get('X-Via-Reverse-Cache'),ide:r.headers.get('X-Via-Reverse-IDE'),fallback:r.headers.get('X-Via-Reverse-Backup'),postal:d.postalStatus,reason:e.reason,rows:rows.map(x=>({street:x.street,source:x.source,distanceMeters:x.distanceMeters})).slice(0,5)};
 console.log('VIA_HTTP_REVERSE '+JSON.stringify(result));return result;
 }catch(e){console.log('VIA_HTTP_REVERSE_ERROR '+JSON.stringify({label,error:e.name}));return null;}
}
let hit=false,valid=false;
for(const [lat,lng] of points){
 const qs='lat='+lat+'&lng='+lng,url=qa+'/api/direcciones?mode=reverse&'+qs;
 const [a,b]=await Promise.all([probe('integrated',url,lat,lng),probe('geoapify-direct',backup+'/api/via-reverse?'+qs,lat,lng)]);
 if(a?.postal==='suggested'){valid=true;await new Promise(r=>setTimeout(r,400));const c=await probe('repeat',url,lat,lng);if(c?.cache==='HIT'&&c.postal==='suggested')hit=true;}
}
assert.equal((await get(qa+'/api/customer/me')).status,503);
assert(valid,'No usable real integrated reference');
assert(hit,'No observed persistent cache hit');
console.log('VIA_HTTP_REVERSE_PASS '+JSON.stringify({valid,hit,accountsBlocked:true,version:'30.4.10.10'}));
