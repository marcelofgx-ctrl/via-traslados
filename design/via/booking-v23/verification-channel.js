/* Vía Traslados: cliente de verificación opcional por WhatsApp.
   El secreto de MacroDroid permanece EXCLUSIVAMENTE en Cloudflare y el teléfono. */
(function(global){
 'use strict';
 const S=global.ViaStore,cfg=global.VIA_CONFIG||{};
 const demo=()=>S.isDemo();
 const url=path=>String(cfg.apiUrl||'').replace(/\/$/,'')+path;
 async function request(path,payload){
  const r=await fetch(url(path),{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload)});
  let j;try{j=await r.json()}catch{throw Error('Respuesta del servidor no disponible')}
  if(!r.ok)throw Error(j.error||'No se pudo verificar tu celular');
  return j;
 }
 async function availability(){
  if(demo())return {email:true,whatsapp:true,whatsappExperimental:true,demo:true};
  try{
   const r=await fetch(url('/api/customer/verification/channels'),{cache:'no-store'});
   if(!r.ok)return {email:true,whatsapp:false};
   const j=await r.json();
   return {email:true,whatsapp:j.whatsapp===true,whatsappExperimental:true};
  }catch{return {email:true,whatsapp:false}}
 }
 function digits(phone){return String(phone||'').replace(/\D/g,'').replace(/^598/,'0')}
 async function start(phone,purpose,turnstileToken){
  if(!['registration','recovery'].includes(purpose))throw Error('Operación inválida');
  if(demo()){
   sessionStorage.setItem('via-demo-wa-v1',JSON.stringify({phone:digits(phone),purpose}));
   return {queued:true,channel:'whatsapp',message:'DEMO: ingresá 123456. No se envía WhatsApp.'};
  }
  return request('/api/customer/whatsapp/start',{phone,purpose,turnstileToken});
 }
 async function verify(phone,code,purpose,profile){
  if(demo()){
   let record;try{record=JSON.parse(sessionStorage.getItem('via-demo-wa-v1')||'null')}catch{}
   if(code!=='123456'||!record||record.purpose!==purpose||record.phone!==digits(phone))
    throw Error('Código de prueba incorrecto. Usá 123456.');
   let person=profile?{name:profile.name,phone,email:'wa-demo@identidad.viatraslados.invalid'}:S.customer()?.profile;
   if(!person)throw Error('Primero registrá una cuenta de prueba.');
   const data={sessionToken:'demo-only',expiresAt:Math.floor(Date.now()/1000)+30*86400,profile:person};
   S.saveCustomer(data);sessionStorage.removeItem('via-demo-wa-v1');return data;
  }
  const validated=await request('/api/customer/whatsapp/verify',{phone,code,purpose});
  if(purpose==='recovery'){
   S.saveCustomer(validated);
   return validated;
  }
  if(!profile||!profile.name)throw Error('Completá tus datos antes de registrarte');
  const enrolled=await request('/api/customer/session',{channel:'whatsapp',name:profile.name,
   phone,verificationToken:validated.verificationToken});
  S.saveCustomer(enrolled);
  return enrolled;
 }
 global.ViaVerification={availability,start,verify};
})(window);
