import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedOriginsFor,expectedChallengeHostname,QA_PASSENGER_ORIGINS} from '../backend/origins.js';
import {challenge} from '../backend/auth.js';
import worker from '../backend/worker.js';

const env={PUBLIC_ORIGIN:'https://viatraslados.com',OPERATOR_ORIGIN:'https://viatraslados.com',TURNSTILE_SECRET_KEY:'test-secret'};

test('Passenger QA exact aliases can call public OTP and requests but not admin routes',()=>{
 for(const qa of QA_PASSENGER_ORIGINS){
  assert.ok(allowedOriginsFor(env,'/api/auth/start').includes(qa));
  assert.ok(allowedOriginsFor(env,'/api/customer/login/start').includes(qa));
  assert.ok(allowedOriginsFor(env,'/api/requests').includes(qa));
  assert.ok(allowedOriginsFor(env,'/api/health').includes(qa));
  assert.ok(!allowedOriginsFor(env,'/api/staff/login').includes(qa));
  assert.ok(!allowedOriginsFor(env,'/api/admin/drivers').includes(qa));
 }
 assert.ok(allowedOriginsFor(env,'/api/admin/drivers').includes('https://viatraslados.com'));
});

test('Never permit arbitrary Pages subdomains, lookalikes, HTTP or attacker domains',()=>{
 const allowed=allowedOriginsFor(env,'/api/auth/start');
 for(const origin of ['https://untrusted.via-traslados-pasajeros.pages.dev',
 'https://evil.example','https://viatraslados.com.evil.example',
 'http://via-traslados-pasajeros.pages.dev',
 'https://visual-premium-qa.via-traslados-pasajeros.pages.dev.evil.example',
 'null']){
   assert.ok(!allowed.includes(origin),origin);
 }
});

test('Token hostname must match the exact browser origin',()=>{
 const req=new Request('https://via-traslados-api.marcelof-gx.workers.dev/api/auth/start',{
  method:'POST',headers:{Origin:QA_PASSENGER_ORIGINS[1]}
 });
 assert.equal(expectedChallengeHostname(req,env),'visual-premium-qa.via-traslados-pasajeros.pages.dev');
 const evil=new Request(req.url,{method:'POST',headers:{Origin:'https://evil.example'}});
 assert.equal(expectedChallengeHostname(evil,env),null);
 const admin=new Request('https://via-traslados-api.marcelof-gx.workers.dev/api/admin/drivers',{headers:{Origin:QA_PASSENGER_ORIGINS[1]}});
 assert.equal(expectedChallengeHostname(admin,env),null);
});

test('Turnstile retains action otp and checks the real host in the verified response',async()=>{
 const prior=globalThis.fetch;
 let verifiedHost='visual-premium-qa.via-traslados-pasajeros.pages.dev';
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true,action:'otp',hostname:verifiedHost}),{status:200});
 const req=new Request('https://via-traslados-api.marcelof-gx.workers.dev/api/auth/start',{method:'POST',headers:{Origin:QA_PASSENGER_ORIGINS[1]}});
 try{
  assert.equal(await challenge(req,env,'test-valid-turnstile-token'),true);
  verifiedHost='viatraslados.com';
  assert.equal(await challenge(req,env,'test-valid-turnstile-token'),false);
  verifiedHost='visual-premium-qa.via-traslados-pasajeros.pages.dev';
  const badActionFetch=async()=>new Response(JSON.stringify({success:true,action:'admin',hostname:verifiedHost}),{status:200});
  globalThis.fetch=badActionFetch;
  assert.equal(await challenge(req,env,'test-valid-turnstile-token'),false);
 }finally{globalThis.fetch=prior}
});

test('Preflight HTTP CORS respects path-scoped exact origin allowlist',async()=>{
 async function preflight(origin,path) {
  return worker.fetch(new Request('https://via-traslados-api.marcelof-gx.workers.dev'+path,{
   method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type'}
  }),env,{waitUntil(){}});
 }
 for(const origin of [env.PUBLIC_ORIGIN,...QA_PASSENGER_ORIGINS]){
  const response=await preflight(origin,'/api/auth/start');
  assert.equal(response.status,204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.match(response.headers.get('Access-Control-Allow-Headers'),/Content-Type/);
 }
 const rejected=await preflight('https://evil.example','/api/auth/start');
 assert.notEqual(rejected.headers.get('Access-Control-Allow-Origin'),'https://evil.example');
 const admin=await preflight(QA_PASSENGER_ORIGINS[1],'/api/admin/drivers');
 assert.notEqual(admin.headers.get('Access-Control-Allow-Origin'),QA_PASSENGER_ORIGINS[1]);
});
