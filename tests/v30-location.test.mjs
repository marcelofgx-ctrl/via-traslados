import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {locationPoint} from '../backend/location-v30.js';
import {routeEstimateRoutes,precalculateBookingRoute} from '../backend/route-estimate.js';
import {validateBooking} from '../backend/worker.js';

const from={lat:-34.854271,lng:-56.003157,source:'map',postalStatus:'unknown',numberIsApproximate:false};
const to={lat:-34.83696,lng:-56.01638,source:'selected',postalStatus:'selected'};
test('location point rejects invalid and out-of-country GPS instead of inventing positions',()=>{
 assert.equal(locationPoint({lat:'',lng:0}),null);
 assert.equal(locationPoint({lat:-34.8,lng:undefined}),null);
 assert.equal(locationPoint({lat:-90,lng:0}),null);
 assert.equal(locationPoint({lat:-34.8,lng:0}),null);
 assert.deepEqual(locationPoint(from),{lat:from.lat,lon:from.lng,source:'map',postalStatus:'unknown',numberIsApproximate:false});
});
test('booking validation keeps proper city labels and explicit map points',()=>{
 const date=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 const q=validateBooking({name:'Pasajero QA',phone:'099123456',email:'qa@example.com',
  origin:'Avenida Italia, Montevideo',destination:'Aeropuerto Internacional de Carrasco',
  date,time:'10:00',passengers:1,bags:1,originLocation:from,destinationLocation:to});
 assert.equal(q.origin,'Avenida Italia, Montevideo');
 assert.equal(q.originLocation.lat,from.lat);
 assert.equal(q.destinationLocation.lon,to.lng);
});
const makeDB=()=>{
 const rates=new Map(),cache=new Map();
 return {prepare(sql){
  let args=[];
  const q={bind(...v){args=v;return q},
   async first(){
    if(sql.startsWith('INSERT INTO otp_rate_limits')){
     const key=args[0];const count=(rates.get(key)||0)+1;rates.set(key,count);return{attempts:count}
    }
    if(sql.includes('route_preview_cache'))return cache.get(args[0])||null;
    if(sql.includes('booking_locations'))return{
     origin_lat:from.lat,origin_lng:from.lng,
     destination_lat:to.lat,destination_lng:to.lng};
    if(sql.includes('booking_routes'))return null;
    return null
   },
   async run(){
    if(sql.startsWith('INSERT INTO route_preview_cache'))
     cache.set(args[0],{distance_m:args[1],duration_s:args[2],updated_at:Math.floor(Date.now()/1000)});
    return {meta:{changes:1}}
   }};
  return q;
 }};
};
test('street without number but confirmed map pin routes directly without geocoding text',async()=>{
 const old=globalThis.fetch,points=[];
 globalThis.fetch=async url=>{
  const u=new URL(url);
  assert.equal(u.hostname,'api.geoapify.com');
  assert.equal(u.pathname,'/v1/routing');
  points.push(u.searchParams.get('waypoints'));
  return new Response(JSON.stringify({results:[{distance:12100,time:920}]}),{status:200});
 };
 try{
  const env={DB:makeDB(),OTP_PEPPER:'test-long-pepper',
   VIA_GEOAPIFY_API_KEY:'test-route-key-long'};
  const body=JSON.stringify({
   origin:'Avenida Italia, Montevideo',
   destination:'Aeropuerto Internacional de Carrasco',
   originLocation:from,destinationLocation:to});
  const req=new Request('https://via-traslados-api.marcelof-gx.workers.dev/api/public/route-preview',{
   method:'POST',headers:{Origin:'https://viatraslados.com','Content-Type':'application/json'},body});
  const resp=await routeEstimateRoutes(req,env,'/api/public/route-preview');
  assert.equal(resp.status,200,await resp.text());
  assert.equal(points[0],'-34.854271,-56.003157|-34.836960,-56.016380');
  assert.equal(points.length,1,'Coordinates should not invoke postal IDE/Geoapify geocoding');
 }finally{globalThis.fetch=old}
});
test('route preview cache keys include actual pins, not just unchanged address text',async()=>{
 const old=globalThis.fetch;let routes=0;
 globalThis.fetch=async url=>{
  const u=new URL(url);assert.equal(u.pathname,'/v1/routing');routes++;
  return new Response(JSON.stringify({results:[{distance:10000+routes*200,time:1000}]}),{status:200});
 };
 try{
  const env={DB:makeDB(),OTP_PEPPER:'test-long-pepper',
   VIA_GEOAPIFY_API_KEY:'test-route-key-long'};
  for(const coord of [from,{...from,lat:from.lat+0.0003}]){
   const req=new Request('https://via.example/api/public/route-preview',{
    method:'POST',headers:{Origin:'https://viatraslados.com'},
    body:JSON.stringify({origin:'Avenida Italia',destination:'Aeropuerto de Carrasco',
     originLocation:coord,destinationLocation:to})});
   const resp=await routeEstimateRoutes(req,env,'/api/public/route-preview');
   assert.equal(resp.status,200);
  }
  assert.equal(routes,2,'GPS pin was changed but old route cache was reused');
 }finally{globalThis.fetch=old}
});
test('saved booking pins drive estimated route even when old postal label is inexact',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async u=>{
  const url=new URL(u);assert.equal(url.pathname,'/v1/routing');calls++;
  return new Response(JSON.stringify({results:[{distance:12500,time:930}]}),{status:200})
 };
 try{
  const DB=makeDB();
  const env={DB,VIA_GEOAPIFY_API_KEY:'long-api-key-v30'};
  const b={id:'VIA-TEST30',origin:'Avenida Italia sin número',
   destination:'Aeropuerto Internacional de Carrasco'};
  const result=await precalculateBookingRoute(env,b,'qa-v30');
  assert.equal(result.status,200,JSON.stringify(result));
  assert.equal(calls,1);
 }finally{globalThis.fetch=old}
});
