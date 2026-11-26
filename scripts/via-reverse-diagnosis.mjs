import {readFileSync} from 'node:fs';
const hosts={production:'https://viatraslados.com',candidate:'https://05496efa-via-traslados-web-prod.marcelof-gx.workers.dev',api:'https://via-traslados-api.marcelof-gx.workers.dev'};
const points=[[-34.9061,-56.1999],[-34.9057,-56.1912],[-34.9015,-56.1646],[-34.83696,-56.01638]];
const core=await (await fetch(hosts.production+'/geo-v2/core.mjs',{signal:AbortSignal.timeout(12000)})).text();
const geo=await import('data:text/javascript;base64,'+Buffer.from(core).toString('base64'));
async function probe(name,base,lat,lng){
 const t=Date.now();
 try{
 const r=await fetch(base+'/api/direcciones?mode=reverse&lat='+lat+'&lng='+lng,{signal:AbortSignal.timeout(15000),cache:'no-store',headers:{Accept:'application/json',Origin:hosts.production}});
 const raw=await r.text();let j;try{j=JSON.parse(raw)}catch{}
 const rows=Array.isArray(j?.results)?j.results:[];
 const d=geo.buildPickupDisplay({point:{lat,lng,source:'gps',accuracyMeters:12,timestamp:Date.now()},reverseCandidates:rows});
 // No user locations, no response headers with credentials, no unrestricted bodies.
 console.log('VIA_REVERSE_DIAG '+JSON.stringify({name,lat,lng,status:r.status,ms:Date.now()-t,contentType:r.headers.get('content-type'),keys:Object.keys(j||{}),error:typeof j?.error==='string'?j.error.slice(0,240):null,count:rows.length,rows:rows.slice(0,4).map(x=>({street:x.street,distanceMeters:x.distanceMeters,lat:x.lat,lng:x.lng,source:x.source})),postalStatus:d.postalStatus,subtitle:d.subtitle}));
 }catch(e){console.log('VIA_REVERSE_DIAG_ERROR '+JSON.stringify({name,lat,lng,ms:Date.now()-t,error:e.name,message:e.message}))}
}
for(const point of points)await Promise.all(Object.entries(hosts).map(([n,h])=>probe(n,h,...point)));
