// Offline QA contract check. Never connects to Cloudflare, Geoapify, IDE or production.
// The real route is independently checked by the live smoke step after deployment.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const requests=[];
globalThis.fetch=async input=>{
 const url=String(input);
 requests.push(url);
 assert.match(url,/^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\//);
 return new Response(JSON.stringify({code:'Ok',routes:[{distance:13234,duration:1299}]}),{
  status:200,headers:{'content-type':'application/json'}
 });
};
const mod=await import(pathToFileURL(resolve('via-current-qa/worker.mjs')).href);
const worker=mod.default;
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
 const result=await call('/api/public/route-preview','POST',payload);
 assert.equal(result.status,200,JSON.stringify(result));
 assert.equal(result.data.qaOnly,true);
 assert.equal(result.data.source,'OSRM QA');
 assert.equal(result.data.distanceKm,13.2);
 assert.equal(result.data.durationMinutes,22);
}
const missing=await call('/api/public/route-preview','POST',{origin:'',destination:'Aeropuerto Internacional de Carrasco'});
assert.equal(missing.status,422);
const privateResult=await call('/api/requests','POST',{});
assert.equal(privateResult.status,503);
assert.equal(requests.length,2);
console.log('QA_ROUTE_CONTRACT_OK: coordinates, map+POI, invalid request and production-write isolation');
