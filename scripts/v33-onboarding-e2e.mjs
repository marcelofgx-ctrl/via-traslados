import assert from 'node:assert/strict';
const base='https://via-traslados-api-qa.marcelof-gx.workers.dev';
async function request(path,{method='GET',token,data,expected=200}={}){
 const res=await fetch(base+path,{method,headers:{
  ...(token?{Authorization:'Bearer '+token}:{}),
  ...(data?{'Content-Type':'application/json'}:{})},
  body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
 const json=await res.json();
 assert.equal(res.status,expected,method+' '+path+': '+JSON.stringify(json).slice(0,250));
 return json;
}
const admin=(await request('/api/qa/session',{method:'POST',data:{role:'admin'}})).token;
const settings=(await request('/api/qa/driver-form')).config;
const nonce=String(Date.now()).slice(-7),tag=String(Date.now()).slice(-3);
let id=null,passed=false;
try{
 await request('/api/qa/driver-form',{method:'PATCH',token:admin,
  data:{open:true,photoRequired:true}});
 const data={name:'Conductor de Prueba '+tag,phone:'099000'+tag,
  email:'chofer-'+nonce+'@qa.invalid',password:'ViaQA-2026-Segura!',
  vehicle:{make:'Geely QA',model:'EX5 Demo',year:2027,
   plate:'QA'+nonce,passengers:4,bags:2,color:'Blanco de ensayo'},
  photoJpegBase64:"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIooopnzx//9k="};
 const result=await request('/api/qa/driver-applications',{
  method:'POST',data,expected:201});
 id=result.id;
 assert.equal(result.status,'pending');
 await request('/api/qa/driver-login',{
  method:'POST',data:{email:data.email,password:data.password},expected:403});
 const listing=await request('/api/qa/driver-applications',{token:admin});
 assert(listing.pending>=1);
 const record=listing.items.find(x=>x.id===id);
 assert.equal(record.vehicle.year,2027);
 assert.equal(record.vehicle.plate,data.vehicle.plate);
 assert.equal(record.vehicle.hasPhoto,true);
 const image=await request('/api/qa/driver-applications/'+id+'/photo',{token:admin});
 assert.equal(image.jpegBase64,data.photoJpegBase64);
 const approved=await request('/api/qa/driver-applications/'+id,{
  method:'PATCH',token:admin,data:{action:'approve',note:'QA validada'}});
 assert.equal(approved.status,'approved');
 const logged=await request('/api/qa/driver-login',{
  method:'POST',data:{email:data.email,password:data.password}});
 assert.equal(logged.user.role,'driver');
 const rows=await request('/api/operator/requests',{token:logged.token});
 assert(Array.isArray(rows),'No se pudo consultar solicitudes tras aprobar');
 assert(rows.every(x=>x.status==='requested'&&x.released===true),
  'El contratado recién aprobado no debe acceder a solicitudes generales sin liberar');
 passed=true;
 console.log('OK V33: inscripción, foto JPEG, bandeja, bloqueo, aprobación, login y permisos');
}finally{
 if(id){
  await request('/api/qa/driver-applications/'+id,{
   method:'DELETE',token:admin});
 }
 await request('/api/qa/driver-form',{
  method:'PATCH',token:admin,data:settings});
 if(!passed)console.log('El ensayo fue limpiado y preferencias restauradas');
}
