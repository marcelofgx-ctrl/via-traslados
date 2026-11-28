import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
const base='https://via-traslados-api-v36-qa.marcelof-gx.workers.dev';
async function req(path,method='GET',token='',p){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(p?{body:JSON.stringify(p)}:{}),signal:AbortSignal.timeout(25000)});return {status:r.status,j:await r.json()}}
const k=randomBytes(32).toString('hex'),other=randomBytes(32).toString('hex');for(const key of [k,other])assert.equal((await req('/api/qa/session','POST','',{installKey:key})).status,200);
const a=await req('/api/qa/session','POST','',{installKey:k,role:'admin'});assert.equal(a.status,200);const admin=a.j.token;
const list=await req('/api/operator/requests','GET',k);assert.equal(list.status,200);assert.equal(list.j.length,1);const id=list.j[0].id;assert.equal(list.j[0].status,'requested');assert.equal(list.j[0].canQuote,true);
assert.equal((await req('/api/operator/requests/'+id+'/price-guide','GET',other)).status,404);
assert.equal((await req('/api/operator/requests/'+id,'PATCH',k,{status:'quoted',price:900})).status,200);
assert.equal((await req('/api/qa/accept','POST',admin,{id})).status,200);
for(const status of ['confirmed','en_route','arrived','in_progress','completed'])assert.equal((await req('/api/operator/requests/'+id,'PATCH',k,{status})).status,200,status);
assert.equal((await req('/api/operator/requests','GET',k)).j[0].status,'completed');
console.log('V37 isolated booking lifecycle PASS');