import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker from '../backend/worker.js';
import {submissionFromRequest,findExistingSubmission,storeBookingAtomic} from '../backend/booking-submission.js';

const tripDate=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
const booking={name:'Ana Pereira',phone:'099 123 456',email:'ana@example.com',
 origin:'Shangrilá, Canelones',destination:'Aeropuerto Internacional de Carrasco',
 date:tripDate,time:'10:00',notes:'',passengers:2,bags:1};
const key='0123456789abcdef'.repeat(4);
const origin='https://viatraslados.com';
const headers={'Content-Type':'application/json',Origin:origin,
 Authorization:'Bearer '+'a'.repeat(64),'Idempotency-Key':key};
const clone=m=>new Map([...m].map(([k,v])=>[k,structuredClone(v)]));
class FakeDb {
 constructor(){
  this.sessionEmail=booking.email;
  this.state={customers:new Map(),bookings:new Map(),events:new Map(),keys:new Map()};
  this.failKind='';
 }
 prepare(sql){
  const obj={sql,args:[],bind(...args){obj.args=args;return obj},
   first:async()=>{
    if(sql.startsWith('SELECT setting_value FROM service_settings'))return {setting_value:'1'};
    if(sql.startsWith('SELECT s.email,s.expires_at,c.name,c.phone FROM customer_sessions'))
      return {email:this.sessionEmail,name:booking.name,phone:booking.phone,expires_at:2000000000};
    if(sql.startsWith('SELECT s.payload_hash,s.email,s.booking_id,b.status')){
      const entry=this.state.keys.get(obj.args[0]);
      if(!entry)return null;
      return {...entry,status:this.state.bookings.get(entry.booking_id)?.status};
    }
    return null;
   }};
  return obj;
 }
 async batch(statements){
  const snapshot={customers:clone(this.state.customers),bookings:clone(this.state.bookings),
    events:clone(this.state.events),keys:clone(this.state.keys)};
  for(const stmt of statements){
   const {sql,args}=stmt;
   if(sql.startsWith('INSERT INTO customers')){
    snapshot.customers.set(args[0],{email:args[0],name:args[1],phone:args[2]});
   }else if(sql.startsWith('INSERT INTO bookings')){
    if(this.failKind==='booking')throw Error('simulated booking failure');
    if(snapshot.bookings.has(args[0]))throw Error('UNIQUE bookings id');
    snapshot.bookings.set(args[0],{id:args[0],email:args[3],status:args[12]});
   }else if(sql.startsWith('INSERT INTO booking_events')){
    if(this.failKind==='event')throw Error('simulated event failure');
    snapshot.events.set(args[0],{booking_id:args[0],to:args[2]});
   }else if(sql.startsWith('INSERT INTO booking_submission_keys')){
    if(this.failKind==='idempotency')throw Error('simulated idempotency failure');
    if(snapshot.keys.has(args[0]))throw Error('UNIQUE booking_submission_keys');
    snapshot.keys.set(args[0],{payload_hash:args[1],email:args[2],booking_id:args[3]});
   }else throw Error('unexpected SQL '+sql);
  }
  this.state=snapshot;
  return statements.map(()=>({success:true}));
 }
}
const request=(body=booking,keyOverride=key)=>new Request('https://via-traslados-api.example/api/requests',{
 method:'POST',headers:{...headers,'Idempotency-Key':keyOverride},body:JSON.stringify(body)
});

test('la misma clave da el mismo hash y token de acceso sin guardarlos en D1',async()=>{
 const one=await submissionFromRequest(request(),booking);
 const two=await submissionFromRequest(request(),booking);
 assert.deepEqual(one,two);
 assert.equal(one.keyHash.length,64);
 assert.equal(one.token.length,64);
 assert.notEqual(one.token,key);
 assert.notEqual(one.keyHash,key);
});
test('sin cabecera mantiene contrato V29 y una clave mal formada se rechaza',async()=>{
 assert.equal(await submissionFromRequest(new Request('https://test.example'),booking),null);
 await assert.rejects(()=>submissionFromRequest(request(booking,'abc'),booking),/inválida/);
});
test('una transacción crea reserva, evento y clave o revierte todo',async()=>{
 const db=new FakeDb(),sub=await submissionFromRequest(request(),booking);
 for(const failKind of ['booking','event','idempotency']){
  db.failKind=failKind;
  await assert.rejects(()=>storeBookingAtomic({DB:db},booking,'VIA-ONE','hash',sub));
  assert.equal(db.state.bookings.size,0);
  assert.equal(db.state.events.size,0);
  assert.equal(db.state.keys.size,0);
 }
 db.failKind='';
 await storeBookingAtomic({DB:db},booking,'VIA-ONE','hash',sub);
 assert.equal(db.state.bookings.size,1);
 assert.equal(db.state.events.size,1);
 assert.equal(db.state.keys.size,1);
 const replay=await findExistingSubmission({DB:db},sub);
 assert.equal(replay.id,'VIA-ONE');
 assert.equal(replay.replayed,true);
 await assert.rejects(()=>storeBookingAtomic({DB:db},booking,'VIA-TWO','hash',sub),/UNIQUE/);
 assert.equal(db.state.bookings.size,1);
 assert.equal(db.state.events.size,1);
});
test('misma clave con otros datos nunca recupera una reserva ajena',async()=>{
 const db=new FakeDb(),sub=await submissionFromRequest(request(),booking);
 await storeBookingAtomic({DB:db},booking,'VIA-ONE','hash',sub);
 const changed=await submissionFromRequest(request({...booking,time:'11:00'}),{...booking,time:'11:00'});
 const result=await findExistingSubmission({DB:db},changed);
 assert.equal(result.status,409);
});
test('E2E HTTP: dos envíos con misma clave producen un solo 201 original y un 201 recuperado',async()=>{
 const db=new FakeDb(),env={DB:db,PUBLIC_ORIGIN:origin,OPERATOR_ORIGIN:origin};
 const one=await worker.fetch(request(),env);
 assert.equal(one.status,201);
 const first=await one.json();
 assert.match(first.id,/^VIA-/);
 assert.equal(first.status,'requested');
 const two=await worker.fetch(request(),env);
 assert.equal(two.status,201);
 const second=await two.json();
 assert.equal(second.id,first.id);
 assert.equal(second.access_token,first.access_token);
 assert.equal(second.replayed,true);
 assert.equal(db.state.bookings.size,1);
 assert.equal(db.state.events.size,1);
});
test('E2E HTTP: clave repetida con payload nuevo devuelve 409 y no modifica reservas',async()=>{
 const db=new FakeDb(),env={DB:db,PUBLIC_ORIGIN:origin,OPERATOR_ORIGIN:origin};
 assert.equal((await worker.fetch(request(),env)).status,201);
 const changed={...booking,time:'11:00'};
 const response=await worker.fetch(request(changed),env);
 assert.equal(response.status,409);
 assert.equal(db.state.bookings.size,1);
});
test('CORS permite Idempotency-Key en preflight',async()=>{
 const env={DB:new FakeDb(),PUBLIC_ORIGIN:origin,OPERATOR_ORIGIN:origin};
 const result=await worker.fetch(new Request('https://api.example/api/requests',{method:'OPTIONS',
 headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type,Idempotency-Key'}}),env);
 assert.equal(result.status,204);
 assert.match(result.headers.get('Access-Control-Allow-Headers'),/Idempotency-Key/);
});

test('dos envíos concurrentes reutilizan una sola reserva y evento',async()=>{
 const db=new FakeDb(),env={DB:db,PUBLIC_ORIGIN:origin,OPERATOR_ORIGIN:origin};
 const [one,two]=await Promise.all([
   worker.fetch(request(),env),
   worker.fetch(request(),env)
 ]);
 assert.equal(one.status,201);
 assert.equal(two.status,201);
 const [a,b]=await Promise.all([one.json(),two.json()]);
 assert.equal(a.id,b.id);
 assert.equal(a.access_token,b.access_token);
 assert.equal(db.state.bookings.size,1);
 assert.equal(db.state.events.size,1);
});
test('sesión B no puede recuperar por clave secreta una reserva de A',async()=>{
 const db=new FakeDb(),env={DB:db,PUBLIC_ORIGIN:origin,OPERATOR_ORIGIN:origin};
 assert.equal((await worker.fetch(request(),env)).status,201);
 db.sessionEmail='b@example.com';
 const attempt=await worker.fetch(request(),env);
 assert.equal(attempt.status,403);
 assert.equal(db.state.bookings.size,1);
});
