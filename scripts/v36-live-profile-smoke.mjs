import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base='https://via-traslados-api-v36-qa.marcelof-gx.workers.dev';
const req=async(path,method='GET',key='',data)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(25000)});return {status:r.status,j:await r.json()}};
const health=await req('/api/health');assert.equal(health.j.environment,'V36-PROFILE-PRIVATE');assert.equal(health.j.production,false);
const keys=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
const sessions=[];for(const k of keys){const r=await req('/api/qa/session','POST','',{installKey:k});assert.equal(r.status,200);assert.equal(r.j.token,k);sessions.push(r.j.user.id);assert.equal((await req('/api/operator/requests','GET',k)).status,200);const profile=await req('/api/staff/driver-profile','GET',k);assert.equal(profile.j.state,'missing');assert.equal(profile.j.vehicle.make,'Toyota');assert.equal(profile.j.vehicle.model,'Corolla');assert.equal(profile.j.vehicle.color,'Gris');assert.equal(profile.j.vehicle.year,2024);assert.equal(profile.j.vehicle.plate,'')}
assert.notEqual(sessions[0],sessions[1]);assert.equal((await req('/api/qa/session','POST','',{installKey:keys[0]})).j.user.id,sessions[0]);
const jpeg=n=>Buffer.from([255,216,255,192,0,11,8,1,224,2,128,1,1,17,n,255,218,0,8,1,1,0,0,63,0,2,255,217]).toString('base64');
const p={consent:true,plate:'ABC1234',make:'Marca QA',model:'Modelo QA',color:'Blanco',year:2023,photos:{driver:jpeg(1),front:jpeg(2),rear:jpeg(3)},recognition:{face:'pass',front:'pass',rear:'review',frontPlate:'ABC1234',rearPlate:'ABC1234'}};
const uploaded=await req('/api/staff/driver-profile','POST',keys[0],p);assert.equal(uploaded.status,201,JSON.stringify(uploaded.j));
const path='/api/admin/driver-profiles';
assert.equal((await req(path,'GET',keys[0])).j.profiles.length,1);assert.equal((await req(path,'GET',keys[1])).j.profiles.length,0);
assert.equal((await req(path+'/'+sessions[0],'GET',keys[1])).status,404);
assert.equal((await req(path+'/'+sessions[0],'GET',keys[0])).j.photos.front,jpeg(2));
assert.equal((await req(path+'/'+sessions[0],'PATCH',keys[0],{state:'approved',revision:uploaded.j.revision})).status,200);
const approved=(await req('/api/staff/driver-profile','GET',keys[0])).j;assert.equal(approved.state,'approved');assert.equal(approved.vehicle.year,2023);assert.equal(approved.vehicle.color,'Blanco');
console.log('V36 live QA login, photo storage, isolated review, approval and session persistence PASS');
