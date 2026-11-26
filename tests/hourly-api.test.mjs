import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import worker from '../backend/worker.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
const token=n=>n.repeat(64);
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const p of ['backend/schema.sql','backend/migrations/004_booking_locations_v30.sql','qa/hourly/005_hourly_candidate.sql'])db.exec(readFileSync(p,'utf8'));
 function prep(sql,args=[]){
  const st=db.prepare(sql);
  return {bind(...x){return prep(sql,x)},async first(){return st.get(...args)??null},async all(){return{results:st.all(...args)}},async run(){const r=st.run(...args);return{success:true,meta:{changes:Number(r.changes)}}},_run(){return st.run(...args)}};
 }
 const env={DB:{prepare:prep,async batch(list){db.exec('BEGIN IMMEDIATE');try{const v=list.map(s=>s._run());db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}}},VIA_HOURLY_ENABLED:'1',PUBLIC_ORIGIN:'https://qa.example.invalid',OPERATOR_ORIGIN:'https://qa.example.invalid'};
 for(const [email,t] of [['passenger@example.invalid','a'],['other@example.invalid','b']]){
  db.prepare('INSERT INTO customers(email,name,phone) VALUES(?,?,?)').run(email,'QA passenger','099000000');
  db.prepare('INSERT INTO customer_sessions(token_hash,email,expires_at) VALUES(?,?,unixepoch()+3600)').run(sha(token(t)),email);
 }
 for(const [id,t,phone,all] of [['d1','c','099000001',1],['d2','d','099000002',1],['d3','e','099000003',0]]){
  db.prepare("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status) VALUES(?,?,?,?,?,1,'driver','approved')").run(id,id+'@example.invalid',id,'synthetic','synthetic');
  db.prepare('INSERT INTO staff_contacts(staff_id,phone,email_verified_at) VALUES(?,?,1)').run(id,phone);
  db.prepare("INSERT INTO driver_commercial_profiles(staff_id,mode,can_quote_all,commission_bps) VALUES(?,'contractor',?,2500)").run(id,all);
  db.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+3600)').run(sha(token(t)),id);
 }
 const date=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
 const body={serviceType:'hourly',requestId:randomUUID(),origin:'Hotel QA',originLocation:{lat:-34.8,lng:-56},date,time:'10:00',requestedDurationMinutes:240,passengers:2,bags:1,itineraryNotes:'Reuniones',notes:'QA'};
 const ctx={waitUntil(){throw Error('Hourly must not schedule routing')}};
 async function call(path,t,method='GET',data){
  const headers={'Content-Type':'application/json'};
  if(t)headers.Authorization='Bearer '+token(t);
  const res=await worker.fetch(new Request('https://qa.example.invalid'+path,{method,headers,...(data===undefined?{}:{body:JSON.stringify(data)})}),env,ctx);
  return {status:res.status,body:await res.json()};
 }
 return {db,env,body,call};
}
const quote={status:'quoted',price:4000,includedDurationMinutes:240,includedKm:100,extraTimeTerms:'A convenir',extraKmTerms:'A convenir',quoteNotes:'QA'};
test('real handler hourly lifecycle, ownership, persisted quote, replay and cancellation',async()=>{
 const {db,body,call}=fixture();
 assert.equal((await call('/api/requests',null,'POST',body)).status,401);
 assert.equal((await call('/api/requests','a','POST',{...body,requestedDurationMinutes:20})).status,400);
 const created=await call('/api/requests','a','POST',body);
 assert.equal(created.status,201,JSON.stringify(created));const id=created.body.id;
 const path='/api/requests/'+id, op='/api/operator/requests/'+id;
 const replay=await call('/api/requests','a','POST',body);assert.equal(replay.status,200);assert.equal(replay.body.id,id);
 assert.equal((await call('/api/requests','a','POST',{...body,notes:'different'})).status,409);
 assert.equal((await call(path,'b')).status,404);
 assert.equal((await call(path,'a')).body.destination,null);
 assert.equal((await call(path,'a')).body.requestedDurationMinutes,240);
 const list=await call('/api/operator/requests','c');assert.equal(list.status,200);assert.equal(list.body[0].serviceType,'hourly');assert.equal(list.body[0].email,null);
 assert.equal((await call(op,'e','PATCH',quote)).status,403);
 assert.equal((await call(op,'c','PATCH',{status:'quoted',price:4000})).status,400);
 const offer=await call(op,'c','PATCH',quote);assert.equal(offer.status,200,JSON.stringify(offer));assert.equal(offer.body.quoteFinancials.commissionUyu,1000);
 assert.equal((await call(op,'d','PATCH',quote)).status,409);
 assert.equal((await call(op,'c','PATCH',quote)).status,200);
 assert.equal((await call(op,'c','PATCH',{...quote,price:5000})).status,409);
 assert.equal((await call(path,'a')).body.hourlyQuote.includedKm,100);
 const history=await call('/api/customer/bookings','a');assert.equal(history.status,200);assert.equal(history.body[0].hourlyQuote.extraTimeTerms,'A convenir');
 assert.equal((await call(path+'/accept','a','POST',{})).status,200);
 assert.equal((await call(path+'/accept','a','POST',{})).status,200);
 assert.equal(db.prepare('SELECT driver_id FROM driver_assignments WHERE booking_id=?').get(id).driver_id,'d1');
 assert.equal(db.prepare('SELECT count(*) n FROM bookings').get().n,1);
 assert.equal(db.prepare("SELECT count(*) n FROM booking_events WHERE booking_id=? AND new_status='accepted'").get(id).n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM booking_routes').get().n,0);
 assert.equal((await call(path+'/cancel','a','POST',{})).status,200);
 assert.equal((await call(path+'/cancel','a','POST',{})).status,200);
});
test('mixed-mode assignment rejects conflict and cancellation releases it',async()=>{
 const {db,body,call}=fixture();
 const a=await call('/api/requests','a','POST',body);assert.equal(a.status,201);
 const b=await call('/api/requests','a','POST',{...body,requestId:randomUUID(),time:'13:00'});assert.equal(b.status,201);
 const ap='/api/operator/requests/'+a.body.id,bp='/api/operator/requests/'+b.body.id;
 assert.equal((await call(ap,'c','PATCH',quote)).status,200);
 const conflict=await call(bp,'c','PATCH',quote);assert.equal(conflict.status,409,JSON.stringify(conflict));
 assert.equal(db.prepare('SELECT count(*) n FROM booking_quotes').get().n,1);
 assert.equal((await call('/api/requests/'+a.body.id+'/cancel','a','POST',{})).status,200);
 assert.equal((await call(bp,'c','PATCH',quote)).status,200);
});
test('feature flag disabled rejects new hourly creation without changing existing contract',async()=>{
 const {env,body,call}=fixture();delete env.VIA_HOURLY_ENABLED;
 assert.equal((await call('/api/requests','a','POST',body)).status,403);
});
