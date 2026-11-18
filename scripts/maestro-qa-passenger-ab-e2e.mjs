// E2E QA: dos cuentas de pasajero en el mismo dispositivo, sin OTP real ni D1 productiva.
import assert from 'node:assert/strict';
const BASE='https://via-traslados-maestro-api-qa.marcelof-gx.workers.dev';
async function req(path,{method='GET',token,data,idemKey,expected=200}={}){
 const resp=await fetch(BASE+path,{method,headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(idemKey?{'Idempotency-Key':idemKey}:{}),
  ...(data?{'Content-Type':'application/json'}:{})
 },body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
 let result;
 try{result=await resp.json()}catch{throw Error(path+' HTTP '+resp.status+' no JSON')}
 assert.equal(resp.status,expected,path+' HTTP '+resp.status+' '+JSON.stringify(result).slice(0,140));
 return result;
}
const qa=await req('/api/health');
assert.equal(qa.qa,true);
assert.equal(qa.production,false);
const A=await req('/api/qa/passenger-login',{method:'POST',data:{persona:'A'}});
const B=await req('/api/qa/passenger-login',{method:'POST',data:{persona:'B'}});
assert(A.sessionToken&&B.sessionToken&&A.profile.email!==B.profile.email);
const admin=await req('/api/qa/session',{method:'POST',data:{role:'admin'}});
const date=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
const trip={name:A.profile.name,email:A.profile.email,phone:A.profile.phone,
 origin:'Shangrilá, Ciudad de la Costa, Canelones',
 destination:'Aeropuerto Internacional de Carrasco, Canelones',
 date,time:'11:30',passengers:2,bags:1,notes:'Prueba de identidad A/B en D1 QA'};
const idem='47'.repeat(32);
let bookingId=null;
try{
 const made=await req('/api/requests',{method:'POST',token:A.sessionToken,idemKey:idem,data:trip,expected:201});
 bookingId=made.id;
 const again=await req('/api/requests',{method:'POST',token:A.sessionToken,idemKey:idem,data:trip,expected:201});
 assert.equal(again.id,bookingId);
 assert.equal(again.replayed,true);
 const own=await req('/api/customer/bookings',{token:A.sessionToken});
 assert(own.some(x=>x.id===bookingId));
 const other=await req('/api/customer/bookings',{token:B.sessionToken});
 assert(!other.some(x=>x.id===bookingId),'B pudo ver reservas de A');
 await req('/api/requests/'+bookingId,{token:B.sessionToken,expected:404});
 await req('/api/requests/'+bookingId+'/accept',{method:'POST',token:B.sessionToken,expected:404});
 const a=await req('/api/requests/'+bookingId,{token:A.sessionToken});
 assert.equal(a.id,bookingId);
 await req('/api/customer/logout',{method:'POST',token:A.sessionToken,data:{}});
 await req('/api/customer/bookings',{token:A.sessionToken,expected:401});
 console.log('MAESTRO_PASSENGER_AB_ISOLATION_OK: usuarios A/B, reintento, permisos y token revocado');
}finally{
 if(bookingId){
  const deleted=await req('/api/v35/cleanup',{method:'POST',token:admin.token,data:{id:bookingId}});
  assert.equal(deleted.deleted,true);
  console.log('MAESTRO_PASSENGER_AB_CLEANUP_OK');
 }
}
