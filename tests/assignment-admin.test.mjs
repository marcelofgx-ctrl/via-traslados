import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {staffRoutes} from '../backend/staff.js';
import {scheduleConflicts} from '../backend/assignment-rules.js';
const req=(path,body,headers={})=>new Request('https://via.example'+path,{
  method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',...headers},
  body:body===undefined?undefined:JSON.stringify(body)
});
const send=(value,status=200)=>new Response(JSON.stringify(value),{status});
const err=(message,status=400)=>send({error:message},status);
async function master(){
  const key='qa-only-master-secret-not-in-production';
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))]
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  return {key,hash};
}
function fakeDB(){
  const booking={id:'VIA-TEST',status:'accepted',trip_date:'2026-11-20',trip_time:'10:00',
    duration_s:600,passengers:2,bags:1};
  const driver={id:'12345678-aaaa-4bbb-8ccc-123456789012',display_name:'Conductor QA',
    status:'approved',email_verified_at:1795000000,passenger_capacity:4,luggage_capacity:3,
    license_plate:'APP0061',make:'BYD',model:'Yuan Pro'};
  const state={booking,driver,assigned:null,slots:[],audit:[],writes:[]};
  const DB={prepare(sql){
    let args=[];
    const q={
      bind(...a){args=a;return q},
      async first(){
        if(sql.startsWith('SELECT b.id,b.status'))return state.booking;
        if(sql.startsWith('SELECT a.driver_id,u.display_name'))
          return state.assigned?{driver_id:state.assigned,driver_name:driver.display_name}:null;
        if(sql.startsWith('SELECT u.id,c.email_verified_at'))
          return args[0]===driver.id?driver:null;
        return null;
      },
      async all(){
        if(sql.startsWith('SELECT a.driver_id,b.id'))return{results:state.slots};
        if(sql.startsWith('SELECT u.id,u.display_name,u.status'))return{results:[driver]};
        return{results:[]};
      },
      async run(){
        state.writes.push(sql);
        if(sql.startsWith('INSERT INTO driver_assignments')){
          const [bookingId,next,actor,_,expected]=args;
          assert.match(sql,/NOT EXISTS/);
          assert.match(sql,/COALESCE/);
          if(bookingId!==booking.id||expected!==(state.assigned||''))return{meta:{changes:0}};
          if(scheduleConflicts(booking,state.slots,next).length)return{meta:{changes:0}};
          state.assigned=next;
          return{meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM driver_assignments')){
          if(state.assigned!==args[1])return{meta:{changes:0}};
          state.assigned=null;
          return{meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO admin_audit'))state.audit.push(args);
        return{meta:{changes:1}};
      }
    };
    return q;
  }};
  return {DB,state};
}
async function adminEnv(){
  const access=await master();
  const db=fakeDB();
  return {db,env:{DB:db.DB,OPERATOR_KEY_HASH:access.hash},headers:{'X-Operator-Key':access.key}};
}
async function call(env,request){
  return staffRoutes(request,env,new URL(request.url).pathname,send,err);
}
test('consulta de conductor exige permisos de administrador',async()=>{
  const {env}=await adminEnv();
  const r=await call(env,req('/api/admin/requests/VIA-TEST/assignment-options'));
  assert.equal(r.status,403);
});
test('la consulta indica cruce de agenda y no inventa GPS',async()=>{
  const {db,env,headers}=await adminEnv();
  db.state.slots.push({...db.state.booking,id:'VIA-CLASH',trip_time:'10:30',driver_id:db.state.driver.id});
  const r=await call(env,req('/api/admin/requests/VIA-TEST/assignment-options',undefined,headers));
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.availabilitySource,'schedule-only');
  assert.equal(body.gpsAvailable,false);
  assert.equal(body.assignable,true);
  assert.equal(body.drivers[0].conflicts.length,1);
  assert.equal(body.drivers[0].vehicle.plate,'APP0061');
});
test('asigna una propuesta aceptada y evita pisar cambios concurrentes',async()=>{
  const {db,env,headers}=await adminEnv();
  const payload={driverId:db.state.driver.id,expectedDriverId:null};
  const first=await call(env,req('/api/admin/requests/VIA-TEST/assign',payload,headers));
  assert.equal(first.status,200);
  assert.equal(db.state.assigned,payload.driverId);
  db.state.assigned=null; // representa una modificación concurrente posterior
  const stale=await call(env,req('/api/admin/requests/VIA-TEST/assign',{
    driverId:payload.driverId,expectedDriverId:payload.driverId
  },headers));
  assert.equal(stale.status,409);
});
test('bloquea cruce, falta de verificación, capacidad insuficiente y viaje en marcha',async()=>{
  const {db,env,headers}=await adminEnv();
  const make=()=>req('/api/admin/requests/VIA-TEST/assign',{
    driverId:db.state.driver.id,expectedDriverId:null
  },headers);
  db.state.slots=[{...db.state.booking,id:'VIA-OTHER',trip_time:'10:45',driver_id:db.state.driver.id}];
  assert.equal((await call(env,make())).status,409);
  db.state.slots=[];
  db.state.driver.passenger_capacity=1;
  assert.equal((await call(env,make())).status,409);
  db.state.driver.passenger_capacity=4;
  db.state.driver.email_verified_at=null;
  assert.equal((await call(env,make())).status,409);
  db.state.driver.email_verified_at=1795000000;
  db.state.booking.status='en_route';
  assert.equal((await call(env,make())).status,409);
});
