import assert from 'node:assert/strict';
import {test} from 'node:test';
import backend from '../backend/qa-entry.js';
const ORIGIN='https://via-traslados-current-prod-qa.marcelof-gx.workers.dev';
const env={VIA_QA_ENV:'isolated',VIA_QA_NAME:'via-traslados-db-auth-qa-20261121',
 DB:{},PUBLIC_ORIGIN:ORIGIN,OPERATOR_ORIGIN:ORIGIN,VIA_QA_TEST_EMAILS:'qa-only@example.test'};
const req=(path,origin,method='GET',body)=>new Request(ORIGIN+path,{
 method,headers:{...(origin?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});
test('backend refuses an absent or a production D1 marker',async()=>{
 const r=await backend.fetch(req('/api/health',ORIGIN),{...env,VIA_QA_NAME:'via-traslados-db'},{});
 assert.equal(r.status,503);
 const d=await backend.fetch(req('/api/health',ORIGIN),{...env,DB:null},{});
 assert.equal(d.status,503);
});
test('backend blocks production origin before inspecting credentials',async()=>{
 const r=await backend.fetch(req('/api/health','https://viatraslados.com'),env,{});
 assert.equal(r.status,403);
});
test('QA health identifies an isolated backend and refuses unknown email',async()=>{
 const h=await backend.fetch(req('/api/health',ORIGIN),env,{});
 assert.equal(h.status,200);
 const j=await h.json();
 assert.equal(j.qaIsolated,true);
 assert.equal(j.otpAvailable,false);
 const r=await backend.fetch(req('/api/auth/start',ORIGIN,'POST',{email:'person@real.example'}),env,{});
 assert.equal(r.status,403);
});
test('OTP allowlisted email is not sent if credentials are absent',async()=>{
 const r=await backend.fetch(req('/api/auth/start',ORIGIN,'POST',{email:'qa-only@example.test'}),env,{});
 assert.equal(r.status,503);
});
