// Smoke E2E de la D1 QA: usar solo IDs VIA-QA y restaurar al salir.
import assert from 'node:assert/strict';
const base='https://via-traslados-api-qa.marcelof-gx.workers.dev';
async function call(path,{method='GET',token,data,expect=200}={}){
 const resp=await fetch(base+path,{method,
  headers:{...(token?{Authorization:'Bearer '+token}:{}),
   ...(data?{'Content-Type':'application/json'}:{})},
  body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(12000)});
 const payload=await resp.json().catch(()=>({error:'Respuesta JSON inválida'}));
 assert.equal(resp.status,expect,method+' '+path+': '+JSON.stringify(payload).slice(0,350));
 return payload;
}
async function session(role){
 const x=await call('/api/qa/session',{method:'POST',data:{role}});
 assert.equal(x.qa,true);
 return x.token;
}
const admin=await session('admin'),partner=await session('partner'),contractor=await session('contractor');
const id='VIA-QA-002';
try{
 const partnerRows=await call('/api/operator/requests',{token:partner});
 assert(partnerRows.some(x=>x.id===id),'Socio no ve solicitudes generales');
 const contractorRows=await call('/api/operator/requests',{token:contractor});
 assert(!contractorRows.some(x=>x.id===id),'Contratado vio viaje sin liberar');
 await call('/api/operator/requests/'+id,{token:contractor,method:'PATCH',
  data:{status:'quoted',price:1600},expect:403});
 await call('/api/operator/requests/'+id+'/release',{
  token:partner,method:'POST',data:{}});
 const afterRelease=await call('/api/operator/requests',{token:contractor});
 assert(afterRelease.some(x=>x.id===id&&x.canQuote),'Contratado no ve viaje liberado');
 const quoted=await call('/api/operator/requests/'+id,{token:contractor,
  method:'PATCH',data:{status:'quoted',price:1600}});
 assert.equal(quoted.price,1600);
 assert.equal(quoted.status,'quoted');
 await call('/api/operator/requests/'+id,{token:partner,
  method:'PATCH',data:{status:'quoted',price:2000},expect:403});
 const accepted=await call('/api/qa/accept',{token:admin,method:'POST',data:{id}});
 assert.equal(accepted.status,'accepted');
 for(const state of ['confirmed','en_route','arrived','in_progress','completed']){
  const before=(await call('/api/operator/requests',{token:admin}))
    .find(r=>r.id===id);
  console.log('QA transitioning',before?.status,'to',state);
  let row;
  try{
    row=await call('/api/operator/requests/'+id,{
      token:contractor,method:'PATCH',data:{status:state}});
  }catch(e){
    const after=(await call('/api/operator/requests',{token:admin}))
      .find(r=>r.id===id);
    console.log('QA failure post-state:',after?.status,'assigned:',
      Boolean(after?.assignedDriverId),'price:',after?.price);
    throw e;
  }
  assert.equal(row.status,state);
 }
 const ledger=await call('/api/admin/commissions',{token:admin});
 const commission=ledger.items.find(x=>x.bookingId===id);
 assert(commission,'No se devengó comisión de conductor contratado');
 assert.equal(commission.rateBps,2500);
 assert.equal(commission.commissionUyu,400);
 assert.equal(commission.paymentStatus,'pending');
 console.log('OK QA ONLINE: liberación, cotización exclusiva, aceptación, 5 estados y comisión 25% en D1 real');
}finally{
 const reset=await call('/api/qa/reset',{token:admin,method:'POST',
  data:{confirm:'REINICIAR_QA'}});
 assert.equal(reset.reset,true);
 const list=await call('/api/operator/requests',{token:admin});
 assert(list.some(x=>x.id===id&&x.status==='requested'));
 console.log('QA restablecida: las 5 solicitudes de ensayo quedaron listas para la APK');
}
