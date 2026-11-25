import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker from '../backend/worker.js';

const rows=new Map();
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))))
 .map(x=>x.toString(16).padStart(2,'0')).join('');
const operatorSecret='master-test-key-do-not-use-in-production';
const adminHeaders={'X-Operator-Key':operatorSecret};
const ORIGIN='https://viatraslados.com';
function db(){
 const bookings=[],cache=new Map(),rates=new Map();let apiRequests=0;
 return {bookings,cache,rates,get apiRequests(){return apiRequests},
  // El Worker usa D1.batch para evitar reservas sin evento; el mock debe
  // conservar el mismo contrato transaccional sin recurrir a producción.
  async batch(statements){
   const oldLength=bookings.length;
   try{
    for(const statement of statements)await statement.run();
    return statements.map(()=>({success:true}));
   }catch(error){
    bookings.length=oldLength;
    throw error;
   }
  },
  prepare(sql){
  let args=[];
  const q={bind(...x){args=x;return q},async first(){
   if(sql.startsWith('INSERT INTO otp_rate_limits')){
    const counter=(rates.get(args[0])||0)+1;rates.set(args[0],counter);
    return {attempts:counter};
   }
   if(sql.startsWith('SELECT setting_value FROM service_settings'))return{setting_value:'1'};
   if(sql.startsWith('UPDATE email_verified_sessions'))return{email:args[1]};
   if(sql.startsWith('SELECT distance_m,duration_s,provider,updated_at FROM booking_routes')){
    return cache.get(args[0])||null;
   }
   return null;
  },async run(){
   if(sql.startsWith('INSERT INTO bookings (')){
    bookings.push({id:args[0],customer_name:args[1],phone:args[2],email:args[3],
      origin:args[4],destination:args[5],trip_date:args[6],trip_time:args[7],
      passengers:args[8],bags:args[9],notes:args[10],status:args[12],price_uyu:null});
   }
   if(sql.startsWith('INSERT INTO booking_routes')){
    apiRequests++;
    cache.set(args[0],{distance_m:args[1],duration_s:args[2],
      provider:args[3],updated_at:Math.floor(Date.now()/1000)});
   }
   return{meta:{changes:1}};
  },async all(){
   if(sql.includes('FROM bookings ORDER BY')){
    return{results:bookings.map(b=>({
     ...b,assigned_driver_id:null,assigned_driver_name:null,
     route_distance_m:cache.get(b.id)?.distance_m??null,
     route_duration_s:cache.get(b.id)?.duration_s??null,
     route_provider:cache.get(b.id)?.provider??null
    }))};
   }
   return{results:[]};
  }};
  return q;
 }};
}
const makeEnv=async DB=>({DB,PUBLIC_ORIGIN:ORIGIN,OPERATOR_ORIGIN:ORIGIN,
 OPERATOR_KEY_HASH:await digest(operatorSecret),VIA_GEOAPIFY_API_KEY:'geoapify-test-only-key'});
const trip={name:'Persona de Prueba',phone:'099 123 456',email:'cliente@example.com',
 origin:'Montevideo Shopping, Montevideo',
 destination:'Aeropuerto Internacional de Carrasco, Canelones',
 date:'2027-01-20',time:'12:30',passengers:2,bags:1};
function get(path,headers={}){
 return new Request('https://api.example'+path,{headers:{Origin:ORIGIN,...headers}});
}
test('al crear una reserva se calcula sin actualizar pantalla, se guarda y se entrega en la lista',async()=>{
 const DB=db(),env=await makeEnv(DB),original=globalThis.fetch;
 const jobs=[];let calls=0;
 const ctx={waitUntil(task){jobs.push(task)}};
 globalThis.fetch=async url=>{
  const u=new URL(url);
  assert.equal(u.hostname,'api.geoapify.com');
  assert.equal(u.pathname,'/v1/routing');
  calls++;
  return new Response(JSON.stringify({results:[{distance:18450,time:1520}]}),{status:200});
 };
 try{
  const created=await worker.fetch(new Request('https://api.example/api/requests',{
   method:'POST',
   headers:{Origin:ORIGIN,'Content-Type':'application/json','X-Verification-Token':'a'.repeat(64)},
   body:JSON.stringify(trip)
  }),env,ctx);
  assert.equal(created.status,201);
  assert.equal(jobs.length,1,'Cloudflare procesa ruta sin botón de actualizar');
  await Promise.all(jobs);
  assert.equal(DB.bookings.length,1);
  assert.equal(DB.apiRequests,1);
  const listed=await worker.fetch(get('/api/operator/requests',adminHeaders),env,ctx);
  assert.equal(listed.status,200);
  const data=await listed.json();
  assert.equal(data.length,1);
  assert.equal(data[0].route.distanceKm,18.5);
  assert.equal(data[0].route.durationMinutes,26);
  assert.equal(data[0].route.source,'Geoapify');
  assert.equal(data[0].route.attributionUrl,'https://www.geoapify.com/');
  assert.equal(calls,1);
  assert.equal(jobs.length,1,'no genera trabajos si los km están guardados');
 }finally{globalThis.fetch=original}
});
test('reservas antiguas obtienen automáticamente km sin acción manual y sin duplicar consultas',async()=>{
 const DB=db(),env=await makeEnv(DB),original=globalThis.fetch;
 DB.bookings.push({id:'VIA-LEGACY1',origin:trip.origin,destination:trip.destination,
  trip_date:trip.date,trip_time:'13:00',status:'requested',customer_name:'Reserva previa',
  passengers:1,bags:0,phone:trip.phone,email:trip.email,notes:'',price_uyu:null});
 let calls=0;const jobs=[];const ctx={waitUntil(task){jobs.push(task)}};
 globalThis.fetch=async url=>{
  calls++;assert.equal(new URL(url).pathname,'/v1/routing');
  return new Response(JSON.stringify({results:[{distance:18450,time:1520}]}),{status:200});
 };
 try{
  const first=await worker.fetch(get('/api/operator/requests',adminHeaders),env,ctx);
  assert.equal(first.status,200);
  assert.equal((await first.json())[0].route,null);
  await Promise.all(jobs);
  const second=await worker.fetch(get('/api/operator/requests',adminHeaders),env,ctx);
  assert.equal((await second.json())[0].route.distanceKm,18.5);
  assert.equal(DB.apiRequests,1);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
test('sin clave Geoapify la reserva se conserva y la lista no inventa kilómetros',async()=>{
 const DB=db(),env=await makeEnv(DB),original=globalThis.fetch;
 delete env.VIA_GEOAPIFY_API_KEY;
 const jobs=[];let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('No debe consultar proveedores')};
 try{
  const created=await worker.fetch(new Request('https://api.example/api/requests',{
   method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','X-Verification-Token':'b'.repeat(64)},
   body:JSON.stringify(trip)
  }),env,{waitUntil(promise){jobs.push(promise)}});
  assert.equal(created.status,201);
  await Promise.all(jobs);
  assert.equal(calls,0);
  assert.equal(DB.bookings.length,1);
  const view=await worker.fetch(get('/api/operator/requests',adminHeaders),env);
  assert.equal((await view.json())[0].route,null);
 }finally{globalThis.fetch=original}
});
