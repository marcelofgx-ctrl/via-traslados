import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {preview}=JSON.parse(readFileSync('via-reverse-api/candidate.json','utf8'));
const active='https://via-traslados-api.marcelof-gx.workers.dev';
for(const url of [active,preview]){
 const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(15000)});assert(r.ok,'health failed');
 const bad=await fetch(url+'/api/via-reverse?lat=0&lng=0',{signal:AbortSignal.timeout(12000)});
 if(url===preview)assert.equal(bad.status,400);
}
const core=await (await fetch('https://viatraslados.com/geo-v2/core.mjs',{signal:AbortSignal.timeout(10000)})).text();
const geo=await import('data:text/javascript;base64,'+Buffer.from(core).toString('base64'));
let good=0;
for(const [lat,lng] of [[-34.9061,-56.1999],[-34.9057,-56.1912],[-34.9015,-56.1646],[-34.83696,-56.01638]]){
 const t=Date.now(),r=await fetch(preview+'/api/via-reverse?lat='+lat+'&lng='+lng,{signal:AbortSignal.timeout(12000)});const j=await r.json();
 const d=geo.buildPickupDisplay({point:{lat,lng,source:'gps',accuracyMeters:12,timestamp:Date.now()},reverseCandidates:j.results||[]});
 console.log('VIA_GEOAPIFY_REAL '+JSON.stringify({status:r.status,ms:Date.now()-t,results:j.results?.length||0,postalStatus:d.postalStatus,error:j.error||null}));
 if(r.ok&&d.postalStatus==='suggested')good++;
}
assert(good>=2,'Backup did not return at least two usable real public street references');
console.log('VIA_REVERSE_API_REAL_PASS '+good+'/4; no traffic promoted');
