// Offline contract. No actual requests; live smoke verifies real routing after deploy.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
let failPrimary=false;
const requests=[];
globalThis.fetch=async input=>{
 const u=String(input);requests.push(u);
 if(u.startsWith('https://routing.openstreetmap.de/routed-car/route/v1/driving/')){
  if(failPrimary)return new Response('upstream unavailable',{status:502});
  return Response.json({code:'Ok',routes:[{distance:13234,duration:1299}]});
 }
 if(u.startsWith('https://valhalla1.openstreetmap.de/route?')){
  const request=JSON.parse(new URL(u).searchParams.get('json'));
  assert.equal(request.costing,'auto');
  return Response.json({trip:{summary:{length:13.2,time:1299}}});
 }
 throw Error('Unexpected routing endpoint '+u.slice(0,90));
};
const worker=(await import(pathToFileURL(resolve('via-current-qa/worker.mjs')).href)).default;
const env={ASSETS:{fetch:()=>new Response('asset')}};
async function call(path,method,body){
 const req=new Request('https://qa.example'+path,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const response=await worker.fetch(req,env);
 return {status:response.status,data:await response.json()};
}
const o={lat:-34.880922,lng:-56.079391};
const a={lat:-34.83696,lng:-56.01638};
for(const payload of [
 {origin:o,destination:a},
 {origin:{...o,address:'Av Italia 5781'},destination:'Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones'}
]){
 const r=await call('/api/public/route-preview','POST',payload);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.data.qaOnly,true);
 assert.equal(r.data.source,'OSRM QA');
 assert.equal(r.data.distanceKm,13.2);
 assert.equal(r.data.durationMinutes,22);
}
failPrimary=true;
const fallback=await call('/api/public/route-preview','POST',{origin:o,destination:a});
assert.equal(fallback.status,200,JSON.stringify(fallback));
assert.equal(fallback.data.source,'Valhalla QA');
assert.equal(fallback.data.distanceKm,13.2);
assert.equal(fallback.data.durationMinutes,22);
assert.equal((await call('/api/public/route-preview','POST',{})).status,400);
assert.equal((await call('/api/public/route-preview','POST',{origin:'',destination:'Aeropuerto Internacional de Carrasco'})).status,422);
assert.equal((await call('/api/requests','POST',{})).status,503);
assert.equal(requests.length,4);
console.log('QA_ROUTE_CONTRACT_OK: real-coordinate shape, verified airport, OSRM-to-Valhalla failover, write isolation');
