// Prueba de integración de los endpoints REALES de pasajero y conductor
// en Worker + D1 V35 aislados. No usa contraseña real ni correo externo.
import assert from 'node:assert/strict';
const BASE='https://via-traslados-api-v35-qa.marcelof-gx.workers.dev';
const EMAIL='pasajero.v35@qa.invalid';
async function call(path,{method='GET',token,bookingToken,verificationToken,data,expect=200}={}){
 const r=await fetch(BASE+path,{method,headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(bookingToken?{'X-Booking-Token':bookingToken}:{}),
  ...(verificationToken?{'X-Verification-Token':verificationToken}:{}),
  ...(data?{'Content-Type':'application/json'}:{})
 },body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
 let payload;try{payload=await r.json()}catch{throw Error(method+' '+path+' no devuelve JSON')}
 assert.equal(r.status,expect,method+' '+path+' [HTTP '+r.status+']: '+JSON.stringify(payload).slice(0,250));
 return payload;
}
async function role(r){
 const result=await call('/api/qa/session',{method:'POST',data:{role:r}});
 assert(result.qa&&result.token,'Sesión QA inválida');
 return result.token;
}
const health=await call('/api/health');
assert.equal(health.qa,true);
assert.equal(health.production,false);
const admin=await role('admin'),partner=await role('partner'),contractor=await role('contractor');
let id=null,guest=null;
try {
 const verified=await call('/api/v35/verified-session',{method:'POST',token:admin});
 assert.equal(verified.email,EMAIL);
 const date=new Date(Date.now()+25*86400000).toISOString().slice(0,10);
 const newBooking=await call('/api/requests',{method:'POST',expect:201,
  verificationToken:verified.verificationToken,
  data:{name:'Pasajero Sintético V35',phone:'099000000',email:EMAIL,
   origin:'Aeropuerto de Carrasco, Canelones',destination:'Punta Carretas, Montevideo',
   date,time:'10:00',passengers:2,bags:1,notes:'Ensayo integrado V35; datos ficticios'}});
 id=newBooking.id;guest=newBooking.access_token;
 assert(/^VIA-[A-Z0-9-]+$/.test(id)&&guest&&newBooking.status==='requested');
 await call('/api/requests/'+id,{expect:404});
 const own=await call('/api/requests/'+id,{bookingToken:guest});
 assert.equal(own.status,'requested');
 await call('/api/requests/'+id+'/accept',{method:'POST',bookingToken:guest,expect:409});
 const allAdmin=await call('/api/operator/requests',{token:admin});
 assert(allAdmin.some(x=>x.id===id&&x.status==='requested'));
 const allPartner=await call('/api/operator/requests',{token:partner});
 const visiblePartner=allPartner.find(x=>x.id===id);
 assert(visiblePartner?.canQuote,'El socio autorizado no ve el viaje nuevo');
 assert.equal(visiblePartner.phone,null,'Un socio sin viaje asignado ve teléfono privado');
 const allContractor=await call('/api/operator/requests',{token:contractor});
 assert(!allContractor.some(x=>x.id===id),'El contratado vio un viaje no liberado');
 await call('/api/operator/requests/'+id,{token:contractor,method:'PATCH',
  data:{status:'quoted',price:1600},expect:403});
 const released=await call('/api/operator/requests/'+id+'/release',{
  token:partner,method:'POST',data:{}});
 assert(released.released);
 const contractorRows=await call('/api/operator/requests',{token:contractor});
 const candidate=contractorRows.find(x=>x.id===id);
 assert(candidate?.canQuote,'El contratado no recibió la solicitud liberada');
 assert.equal(candidate.phone,null,'Se reveló el teléfono antes de adjudicar');
 const quoted=await call('/api/operator/requests/'+id,{token:contractor,
  method:'PATCH',data:{status:'quoted',price:1600}});
 assert.equal(quoted.status,'quoted');assert.equal(quoted.price,1600);
 assert(quoted.assignedDriverId,'Falta conductor asignado al cotizar');
 await call('/api/operator/requests/'+id,{token:partner,method:'PATCH',
  data:{status:'quoted',price:1900},expect:403});
 const passenger=await call('/api/requests/'+id,{bookingToken:guest});
 assert.equal(passenger.status,'quoted');assert.equal(passenger.price,1600);
 const accepted=await call('/api/requests/'+id+'/accept',{method:'POST',bookingToken:guest});
 assert.equal(accepted.status,'accepted');
 await call('/api/requests/'+id+'/accept',{method:'POST',bookingToken:guest,expect:409});
 for (const status of ['confirmed','en_route','arrived','in_progress','completed']) {
  const updated=await call('/api/operator/requests/'+id,{
   token:contractor,method:'PATCH',data:{status}});
  assert.equal(updated.status,status);
 }
 const final=await call('/api/requests/'+id,{bookingToken:guest});
 assert.equal(final.status,'completed');
 const ledger=await call('/api/admin/commissions',{token:admin});
 const commission=ledger.items.find(x=>x.bookingId===id);
 assert(commission,'No se devengó comisión en D1 QA');
 assert.equal(commission.rateBps,2500);
 assert.equal(commission.commissionUyu,400);
 console.log('V35_STAGING_E2E_OK: pasajero POST real; oferta, privacidad, asignación, aceptación POST real, cierre y 25% en D1 aislada.');
} finally {
 if(id) {
  const result=await call('/api/v35/cleanup',{method:'POST',token:admin,data:{id}});
  assert.equal(result.deleted,true);
  const again=await call('/api/operator/requests',{token:admin});
  assert(!again.some(x=>x.id===id),'No se eliminó reserva sintética');
  console.log('V35_STAGING_CLEANUP_OK: reserva ficticia borrada, otras reservas conservadas');
 }
}
