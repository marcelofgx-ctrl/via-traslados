import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker from '../backend/worker.js';
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))
 .map(v=>v.toString(16).padStart(2,'0')).join('');
test('una sesión de otra cuenta nunca permite leer una reserva mediante un token guardado',async()=>{
 const bookingToken='booking-private-legacy-token';
 const savedHash=await digest(bookingToken);
 const booking={
  id:'VIA-ABC-123',origin:'Origen privado',destination:'Destino privado',
  trip_date:'2027-02-10',trip_time:'10:00',passengers:1,bags:1,notes:'',
  status:'requested',price_uyu:null,created_at:'2026-11-10',updated_at:'2026-11-10',
  access_token_hash:savedHash
 };
 let ownershipQueries=0;
 const DB={prepare(sql){
  let args=[];
  const entry={bind(...values){args=values;return entry},async first(){
   if(sql.startsWith('SELECT setting_value FROM service_settings'))return{setting_value:'1'};
   if(sql.startsWith('SELECT s.email,s.expires_at,c.name,c.phone FROM customer_sessions'))
    return{email:'otra@example.com',name:'Otra persona',phone:'094 111 111',expires_at:1999999999};
   if(sql.includes('WHERE id=? AND email=?')){
    ownershipQueries++;
    return args[1]==='titular@example.com'?booking:null;
   }
   if(sql.includes('access_token_hash FROM bookings WHERE id=?'))return booking;
   return null;
  }};
  return entry;
 }};
 const env={DB,PUBLIC_ORIGIN:'https://viatraslados.com',OPERATOR_ORIGIN:'https://viatraslados.com'};
 const result=await worker.fetch(new Request('https://api.example/api/requests/VIA-ABC-123',{
  method:'GET',headers:{Origin:'https://viatraslados.com',
   Authorization:'Bearer '+'a'.repeat(64),'X-Booking-Token':bookingToken}
 }),env);
 assert.equal(result.status,404,'No se debe devolver el viaje del titular a otra cuenta activa');
 assert.equal(ownershipQueries,1,'Se verifica la titularidad por correo');
});
test('reserva anterior sin sesión de pasajero conserva acceso mediante token válido',async()=>{
 const token='legacy-token-correcto',expected=await digest(token);
 const booking={
  id:'VIA-LEGACY-42',origin:'Montevideo Shopping',destination:'Aeropuerto Carrasco',
  trip_date:'2027-02-10',trip_time:'10:00',passengers:2,bags:1,notes:'',
  status:'requested',price_uyu:null,created_at:'2026-11-10',updated_at:'2026-11-10',
  access_token_hash:expected
 };
 const DB={prepare(sql){
  const q={bind(){return q},async first(){
   if(sql.startsWith('SELECT setting_value FROM service_settings'))return{setting_value:'1'};
   if(sql.includes('access_token_hash FROM bookings WHERE id=?'))return booking;
   return null;
  }};
  return q;
 }};
 const env={DB,PUBLIC_ORIGIN:'https://viatraslados.com',OPERATOR_ORIGIN:'https://viatraslados.com'};
 const req=new Request('https://api.example/api/requests/VIA-LEGACY-42',{
  headers:{Origin:'https://viatraslados.com','X-Booking-Token':token}
 });
 const response=await worker.fetch(req,env);
 assert.equal(response.status,200,'El enlace con token sigue funcionando para usuarios antiguos');
 assert.equal((await response.json()).id,booking.id);
});
