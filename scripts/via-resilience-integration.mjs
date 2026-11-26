import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const w=JSON.parse(readFileSync('via-resilience/web-candidate.json','utf8'));
const root=process.argv[2]==='prod'?'https://viatraslados.com':w.preview;
const api='https://via-traslados-api.marcelof-gx.workers.dev';
const get=async (url)=>{const start=Date.now(),r=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{Accept:'application/json','User-Agent':'ViaTrasladosV35SignedRelease'}});return {r,j:await r.json(),ms:Date.now()-start}};
assert((await get(api+'/api/health')).r.ok);
const q='Arenal Grande 2274, Montevideo';
const params=new URLSearchParams({mode:'suggest',q});
for(let i=0;i<3;i++){
 const {r,j,ms}=await get(root+'/api/direcciones?'+params);
 const exact=(j.results||[]).some(x=>x.accuracy==='portal'&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)&&/arenal grande\s+2274/i.test(x.street||'')&&/montevideo/i.test([x.city,x.department].join(' ')));
 const source=r.headers.get('X-Via-Address-Source');
 console.log('VIA_RESILIENCE_ADDRESS '+JSON.stringify({phase:process.argv[2],iteration:i,status:r.status,source,ms,exact}));
 assert(r.ok&&exact,'Address not recovered through complete web worker');
 if(i===2)assert.equal(source,'cache','Verified portal cache not reusable');
}
const resolve=await get(root+'/api/direcciones?'+new URLSearchParams({mode:'resolve',q}));
assert(resolve.r.ok&&resolve.j.results?.length===1&&resolve.j.results[0].accuracy==='portal');
const poi=await get(root+'/api/direcciones?'+new URLSearchParams({mode:'places',q:'Costa urbana',lat:'-34.85',lng:'-56.02'}));
assert(poi.r.ok&&poi.j.results?.some(x=>/costa urbana/i.test(x.name||x.label||x.street||'')),'POI regression');
const reverse=await get(root+'/api/direcciones?mode=reverse&lat=-34.9061&lng=-56.1999');
assert(reverse.r.ok&&reverse.j.results?.length>0,'Reverse regression');
const route=await fetch(api+'/api/public/route-preview',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://viatraslados.com'},body:JSON.stringify({origin:'Plaza Independencia',destination:'Aeropuerto de Carrasco',originLocation:{lat:-34.9061,lng:-56.1999},destinationLocation:{lat:-34.83696,lng:-56.01638}}),signal:AbortSignal.timeout(25000)});
const rj=await route.json();assert(route.ok&&rj.distanceKm>0&&rj.durationMinutes>0,'Route regression');
console.log('VIA_RESILIENCE_PUBLIC_READS_PASS '+JSON.stringify({phase:process.argv[2],poi:poi.j.results.length,reverse:reverse.j.results.length,routeKm:rj.distanceKm}));
