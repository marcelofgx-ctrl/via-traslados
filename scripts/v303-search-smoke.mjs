import assert from 'node:assert/strict';
const base='https://via-traslados-v303-search-stage.marcelof-gx.workers.dev';
const get=async(path,init)=>{for(let i=0;i<5;i++){const r=await fetch(base+path,{...init,headers:{Accept:'application/json',...(init?.headers||{})},signal:AbortSignal.timeout(25000)});const body=await r.text();try{return {r,j:JSON.parse(body)}}catch{console.log('VIA_V303_NONJSON '+JSON.stringify({status:r.status,type:r.headers.get('content-type'),retry:i,cloudflareError:body.match(/Error\s+(\d{3,4})/i)?.[1]}));if(i===4)throw Error('Non JSON '+r.status);await new Promise(r=>setTimeout(r,2500))}}};
for(const q of ['Nuevo centro shopping','Nuevo centro','Nuevocentro','Mcdonalds','Radisson','Plaza Italia Shopping']){
 const {r,j}=await get('/api/direcciones?mode=places&q='+encodeURIComponent(q)+'&lat=-34.88&lng=-56.17');
 const rows=(j.results||[]).filter(x=>x.kind==='place'&&Number.isFinite(x.lat)&&Number.isFinite(x.lng));
 console.log('VIA_V303_QUERY '+JSON.stringify({q,http:r.status,count:rows.length,labels:rows.map(x=>x.label)}));
 assert(r.ok&&rows.length,'No results: '+q);
 if(/nuevo/i.test(q))assert(rows.some(x=>/nuevocentro/i.test(x.label.replace(/\s/g,''))),'Nuevocentro missing');
}
const a=await get('/api/direcciones?mode=suggest&q=Caramuru%205510');assert(a.r.ok&&a.j.results?.length);
const b=await get('/api/requests',{method:'POST',body:'{}'});assert.equal(b.r.status,503);
const c=await get('/api/public/route-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({originLocation:{lat:-34.905,lng:-56.185},destinationLocation:{lat:-34.83696,lng:-56.01638}})});
assert(c.r.ok&&c.j.distanceKm>0);console.log('VIA_V303_ROUTE_OK '+c.j.distanceKm);
