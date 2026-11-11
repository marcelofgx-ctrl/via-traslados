import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {customerRoutes,createCustomerSession} from '../backend/customer-auth.js';
import {routeEstimateRoutes} from '../backend/route-estimate.js';

const user={email:'cliente@example.com',name:'Ana Pérez',phone:'094123456'};
function fixture() {
 const customers=new Map([[user.email,user]]),pins=new Map(),sessions=new Map(),rates=new Map(),preview=new Map();
 const DB={pins,rates,preview,prepare(sql){
   let p=[];
   const x={bind(...args){p=args;return x},async first(){
     if(sql.startsWith('INSERT INTO otp_rate_limits')){
       const c=(rates.get(p[0])||0)+1;rates.set(p[0],c);return{attempts:c};
     }
     if(sql.startsWith('SELECT email FROM customer_pins'))return pins.has(p[0])?{email:p[0]}:null;
     if(sql.startsWith('SELECT salt,pin_hash'))return pins.get(p[0])||null;
     if(sql.startsWith('SELECT COUNT(*) AS n FROM customer_passkeys'))return{n:0};
     if(sql.startsWith('SELECT s.email,s.expires_at,c.name,c.phone FROM customer_sessions')){
       const s=sessions.get(p[0]);if(!s)return null;
       const u=customers.get(s.email);return {...u,expires_at:s.expiresAt};
     }
     if(sql.startsWith('SELECT distance_m,duration_s,updated_at FROM route_preview_cache'))return preview.get(p[0])||null;
     return null;
   },async all(){
     if(sql.includes('FROM customers WHERE length(phone)'))return{results:[...customers.values()]};
     return{results:[]};
   },async run(){
     if(sql.startsWith('INSERT INTO customer_sessions'))sessions.set(p[0],{email:p[1],expiresAt:p[2]});
     if(sql.startsWith('INSERT INTO customer_pins'))pins.set(p[0],{salt:p[1],pin_hash:p[2],failed_attempts:0,locked_until:0});
     if(sql.startsWith('UPDATE customer_pins SET failed_attempts=0')){const row=pins.get(p[0]);row.failed_attempts=0;row.locked_until=0}
     if(sql.startsWith('UPDATE customer_pins SET failed_attempts=CASE')){const row=pins.get(p[0]);row.failed_attempts++;if(row.failed_attempts>=5)row.locked_until=Math.floor(Date.now()/1000)+900}
     if(sql.startsWith('INSERT INTO route_preview_cache'))preview.set(p[0],{distance_m:p[1],duration_s:p[2],updated_at:Math.floor(Date.now()/1000)});
     return{meta:{changes:1}};
   }};
   return x;
 }};
 const env={DB,OTP_PEPPER:'test-pepper-of-more-than-16-characters',PUBLIC_ORIGIN:'https://viatraslados.com',
  OPERATOR_ORIGIN:'https://viatraslados.com',TURNSTILE_SECRET_KEY:'test-site-secret',VIA_GEOAPIFY_API_KEY:'test-geoapify-token'};
 return{env,DB};
}
const make=(path,data,headers={})=>new Request('https://api.example'+path,{method:'POST',body:JSON.stringify(data),
 headers:{'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.8','Origin':'https://viatraslados.com',...headers}});
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('phone identification only after Turnstile and never grants an account session',async()=>{
 const {env,DB}=fixture(),before=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true,action:'otp',hostname:'viatraslados.com'}),{status:200});
 try{
  const path='/api/customer/phone/identify';
  const r=await customerRoutes(make(path,{phone:'094 123 456',turnstileToken:'valid-token'}),env,path,respond);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.registered,true);assert.equal(body.hasPin,false);
  assert.match(body.grant,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!body.sessionToken);
  const bad=await customerRoutes(make(path,{phone:'094 123 456',turnstileToken:''}),env,path,respond);
  assert.equal(bad.status,403);
  const unknown=await customerRoutes(make(path,{phone:'094 555 555',turnstileToken:'valid-token'}),env,path,respond);
  assert.equal((await unknown.json()).registered,false);
 }finally{globalThis.fetch=before}
});
test('PIN can be created ONLY with verified session and then allows phone+signed-grant login',async()=>{
 const {env,DB}=fixture(),before=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true,action:'otp',hostname:'viatraslados.com'}),{status:200});
 try{
  const set='/api/customer/pin/set',login='/api/customer/pin/login',identify='/api/customer/phone/identify';
  const unverified=await customerRoutes(make(set,{pin:'739251'}),env,set,respond);
  assert.equal(unverified.status,401);
  const s=await createCustomerSession(env,user.email);
  const sessReq=make(set,{pin:'739251'},{Authorization:'Bearer '+s.token});
  const enabled=await customerRoutes(sessReq,env,set,respond);
  assert.equal(enabled.status,200);assert.equal((await enabled.json()).configured,true);
  const row=DB.pins.get(user.email);
  assert.notEqual(row.pin_hash,'739251');assert.equal(row.pin_hash.length,64);assert.equal(row.salt.length,32);
  const idResult=await customerRoutes(make(identify,{phone:user.phone,turnstileToken:'valid-token'}),env,identify,respond);
  const info=await idResult.json();
  assert.equal(info.hasPin,true);
  const invalid=await customerRoutes(make(login,{phone:user.phone,pin:'739251',grant:'tampered'}),env,login,respond);
  assert.equal(invalid.status,403);
  const invalidPin=await customerRoutes(make(login,{phone:user.phone,pin:'111222',grant:info.grant}),env,login,respond);
  assert.equal(invalidPin.status,401);
  const valid=await customerRoutes(make(login,{phone:user.phone,pin:'739251',grant:info.grant}),env,login,respond);
  assert.equal(valid.status,200);
  const profile=await valid.json();assert.equal(profile.profile.email,user.email);
  assert.ok(profile.sessionToken?.length===64);assert.equal(DB.pins.get(user.email).failed_attempts,0);
 }finally{globalThis.fetch=before}
});
test('six-digit PIN rejects trivial values, repeated digits and unsafe unauthenticated reset',async()=>{
 const {env}=fixture(),s=await createCustomerSession(env,user.email);
 for(const pin of ['123456','000000','111111','123123','abcdef','12345']){
  const r=await customerRoutes(make('/api/customer/pin/set',{pin},{Authorization:'Bearer '+s.token}),env,'/api/customer/pin/set',respond);
  assert.equal(r.status,400,pin);
 }
 const r=await customerRoutes(make('/api/customer/pin/set',{pin:'953821'}),env,'/api/customer/pin/set',respond);
 assert.equal(r.status,401);
});
test('preview route is real Geoapify drive distance, cached and rate-protected without bookings',async()=>{
 const {env,DB}=fixture(),before=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async (url)=>{
  const u=new URL(url);calls++;
  if(u.hostname==='direcciones.ide.uy'){
   return new Response(JSON.stringify([{lat:u.searchParams.get('q').startsWith('Avenida')?-34.86:-34.9,
    lng:-56.11,type:'CALLEyPORTAL'}]),{status:200});
  }
  if(u.hostname==='api.geoapify.com'&&u.pathname==='/v1/routing'){
   assert.equal(u.searchParams.get('mode'),'drive');
   return new Response(JSON.stringify({results:[{distance:12580,time:1340}]}),{status:200});
  }
  throw Error('Unexpected external request');
 };
 try{
  const path='/api/public/route-preview';
  const input={origin:'Avenida Italia 5785, Montevideo',destination:'Doctor Luis Bonavita 1266, Montevideo'};
  const r=await routeEstimateRoutes(make(path,input),env,path,respond);assert.equal(r.status,200);
  const data=await r.json();assert.equal(data.distanceKm,12.6);assert.equal(data.durationMinutes,23);
  assert.equal(data.trafficIncluded,false);assert.equal(data.cached,false);
  const second=await routeEstimateRoutes(make(path,input),env,path,respond);assert.equal(second.status,200);
  assert.equal((await second.json()).cached,true);assert.equal(calls,3);
  assert.equal(DB.preview.size,1);assert.ok(!JSON.stringify([...DB.preview]).includes('Avenida Italia'));
 }finally{globalThis.fetch=before}
});
