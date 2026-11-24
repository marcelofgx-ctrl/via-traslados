import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {routeEstimateRoutes} from '../backend/route-estimate.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
test('cached route remains available after 30 distinct misses; global budget remains enforced',async()=>{
 const rates=new Map(),cache=new Map();
 const DB={prepare(sql){let a;const stmt={bind(...args){a=args;return stmt},async first(){
  if(sql.includes('INSERT INTO otp_rate_limits')){const n=(rates.get(a[0])||0)+1;rates.set(a[0],n);return{attempts:n}}
  if(sql.includes('FROM route_preview_cache'))return cache.get(a[0])||null;
  throw Error('Unexpected read');
 },async run(){assert(sql.includes('INSERT INTO route_preview_cache'));cache.set(a[0],{distance_m:a[1],duration_s:a[2]});return{meta:{changes:1}}}};
 return stmt;}};
 const env={DB,OTP_PEPPER:'test-pepper',VIA_GEOAPIFY_API_KEY:'test-key-only'};
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async u=>{assert.equal(new URL(u).pathname,'/v1/routing');calls++;return new Response(JSON.stringify({results:[{distance:15000,time:1200}]}))};
 const send=i=>routeEstimateRoutes(new Request('https://api.example/api/public/route-preview',{method:'POST',headers:{Origin:'https://example.com','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({origin:'Public test origin '+i,destination:'Public test destination',originLocation:{lat:-34.90+i*0.0001,lng:-56.18},destinationLocation:{lat:-34.84,lng:-56.02}})}),env,'/api/public/route-preview');
 try{
  assert.equal((await send(0)).status,200);
  for(let i=0;i<12;i++){const r=await send(0);assert.equal(r.status,200);assert.equal((await r.json()).cached,true)}
  assert.equal(calls,1);
  for(let i=1;i<30;i++)assert.equal((await send(i)).status,200);
  assert.equal((await send(30)).status,429);assert.equal(calls,30);
  assert.equal((await send(0)).status,200);assert.equal(calls,30);
  const global=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('via-route:free-budget')))).map(x=>x.toString(16).padStart(2,'0')).join('');
  assert.equal(rates.get(global),30);
 }finally{globalThis.fetch=old}
});
