/* Vía Traslados · pasajeros sin contraseñas. El teléfono NO es autenticación.
   Un correo verificado o una passkey firmada permiten la sesión de 30 días. */
(function(global){
'use strict';
const cfg=global.VIA_CONFIG||{demo:true,apiUrl:''};
const DB='via-traslados-solo-demo-v3';
const ACCESS='via-traslados-solo-demo-access-v3';
const VERIFY='via-traslados-verified-session-v3';
const ACCOUNT='via-customer-session-v1';
const isDemo=()=>cfg.demo===true;
function records(){try{return JSON.parse(localStorage.getItem(DB)||'[]')}catch{return []}}
function save(list){localStorage.setItem(DB,JSON.stringify(list));global.dispatchEvent(new Event('via-updated'))}
function demoId(){return 'VIA-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function access(){try{return JSON.parse(localStorage.getItem(ACCESS)||'{}')}catch{return {}}}
function getToken(id){return access()[id]||''}
function remember(id,token){const a=access();a[id]=token;localStorage.setItem(ACCESS,JSON.stringify(a))}
function verified(){try{return JSON.parse(sessionStorage.getItem(VERIFY)||'null')}catch{return null}}
function setVerified(v){sessionStorage.setItem(VERIFY,JSON.stringify(v))}
function clearVerified(){sessionStorage.removeItem(VERIFY)}
function customer(){
 try{
  const session=JSON.parse(localStorage.getItem(ACCOUNT)||'null');
  if(!session||!session.profile||!session.expiresAt)return null;
  if(session.expiresAt*1000<Date.now()){localStorage.removeItem(ACCOUNT);return null}
  if(!isDemo()&&!/^[a-f0-9]{64}$/i.test(session.sessionToken||''))return null;
  return session;
 }catch{return null}
}
function setCustomer(data){
 if(!data?.profile||!data?.sessionToken||!data?.expiresAt)throw Error('Sesión inválida');
 localStorage.setItem(ACCOUNT,JSON.stringify({sessionToken:data.sessionToken,
   expiresAt:data.expiresAt,profile:data.profile,passkeys:data.passkeys||0}));
 global.dispatchEvent(new Event('via-customer-session'));
}
function customerHeader(){
 const c=customer();
 return c?{'Authorization':'Bearer '+c.sessionToken}:{};
}
async function request(path,opts={}){
 const base=cfg.apiUrl.replace(/\/$/,'');
 const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});
 let data;try{data=await r.json()}catch{throw new Error('El servidor no devolvió una respuesta válida')}
 if(!r.ok){
  if(r.status===401&&path==='/api/customer/me')localStorage.removeItem(ACCOUNT);
  const ex=new Error(data.error||'No se pudo completar la operación');ex.status=r.status;throw ex;
 }
 return data
}
function demoEmail(email){const value=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('Correo electrónico incorrecto');return value}
async function startVerification(email,turnstileToken){
 if(isDemo()){
  const normalized=demoEmail(email);
  sessionStorage.setItem('via-demo-otp-email-v3',normalized);clearVerified();
  return {email:normalized,maskedEmail:normalized.replace(/(^.{1,2})[^@]*(?=@)/,'$1•••'),demo:true};
 }
 return request('/api/auth/start',{method:'POST',body:JSON.stringify({email,turnstileToken})});
}
async function verifyCode(email,code,profile){
 if(isDemo()){
  if(code!=='123456'||email!==sessionStorage.getItem('via-demo-otp-email-v3'))throw Error('Código de prueba incorrecto. Usá 123456.');
  setVerified({email,token:'demo-verified',expires:Date.now()+15*60*1000});
  if(profile) {
   setCustomer({sessionToken:'demo-only',expiresAt:Math.floor(Date.now()/1000)+30*86400,
    profile:{email,name:profile.name,phone:profile.phone}});
  }
  return {verified:true};
 }
 const verifiedResult=await request('/api/auth/verify',{method:'POST',body:JSON.stringify({email,code})});
 setVerified({email:verifiedResult.email,token:verifiedResult.verificationToken,expires:Date.now()+15*60*1000});
 if(profile){
  const enrolled=await request('/api/customer/session',{method:'POST',
   body:JSON.stringify({email:verifiedResult.email,name:profile.name,phone:profile.phone,
    verificationToken:verifiedResult.verificationToken})});
  setCustomer(enrolled);
 }
 return verifiedResult;
}
async function resume(){
 const c=customer();if(!c)return null;
 if(isDemo())return c.profile;
 try{
  const live=await request('/api/customer/me',{headers:customerHeader()});
  if(!live?.profile)return null;
  setCustomer({...c,profile:live.profile,passkeys:live.passkeys||0});
  return live.profile;
 }catch(e){if(e.status===401||e.status===403)localStorage.removeItem(ACCOUNT);return null}
}
async function startPhoneLogin(phone,turnstileToken){
 if(isDemo()){
  const c=customer();
  if(!c||String(c.profile.phone||'').replace(/\D/g,'')!==String(phone||'').replace(/\D/g,''))
   return{sent:false,recognized:false,message:'En la demo, primero verificá el correo con 123456.'};
  sessionStorage.setItem('via-demo-phone-v1',phone);
  return{sent:true,recognized:true,maskedEmail:c.profile.email.replace(/(^.{1,2})[^@]*(?=@)/,'$1•••'),
   message:'DEMO: ingresá 123456. No se envía correo.'};
 }
 return request('/api/customer/login/start',{method:'POST',body:JSON.stringify({phone,turnstileToken})});
}
async function finishPhoneLogin(phone,code){
 if(isDemo()){
  const c=customer();
  if(code!=='123456'||!c)throw Error('Usá 123456 para esta demostración');
  setCustomer(c);return c;
 }
 const result=await request('/api/customer/login/verify',{method:'POST',body:JSON.stringify({phone,code})});
 setCustomer(result);return result;
}
async function logout(){
 const c=customer();
 if(c&&!isDemo())try{await request('/api/customer/logout',{method:'POST',headers:customerHeader(),body:'{}'})}catch{}
 localStorage.removeItem(ACCOUNT);
 global.dispatchEvent(new Event('via-customer-session'));
}
async function create(payload){
 const existing=customer(),auth=verified();
 const same=existing?.profile?.email?.toLowerCase()===payload.email.toLowerCase();
 if(!same&&(!auth||auth.expires<Date.now()||auth.email!==payload.email.toLowerCase()))
  throw Error('Primero verificá tu correo o ingresá a tu cuenta.');
 if(isDemo()){
  const now=new Date().toISOString(),id=demoId();
  const rec={...payload,id,status:'requested',price:null,created_at:now,updated_at:now,verification_status:'demo_only'};
  save([rec,...records()]);remember(id,'demo');clearVerified();
  return {id,access_token:'demo',status:rec.status};
 }
 const headers=same?customerHeader():{'X-Verification-Token':auth.token};
 const res=await request('/api/requests',{method:'POST',headers,body:JSON.stringify(payload)});
 remember(res.id,res.access_token);clearVerified();return res;
}
async function get(id){
 if(isDemo())return records().find(x=>x.id===id)||null;
 const token=getToken(id),user=customer();
 if(!token&&!user)throw Error('Esta reserva no está disponible en este dispositivo');
 return request('/api/requests/'+encodeURIComponent(id),{headers:{...customerHeader(),...(token?{'X-Booking-Token':token}:{})}});
}
async function mine(){
 if(isDemo())return records();
 if(customer()){
  try{return await request('/api/customer/bookings',{headers:customerHeader()})}
  catch(e){if(e.status===401)localStorage.removeItem(ACCOUNT);else throw e}
 }
 const ids=Object.keys(access());
 const list=await Promise.all(ids.map(async id=>{try{return await get(id)}catch{return null}}));
 return list.filter(Boolean);
}
async function list(key){if(isDemo())return records();return request('/api/operator/requests',{headers:{'X-Operator-Key':key}})}
async function operatorUpdate(id,patch,key){
 if(isDemo()){const rows=records(),idx=rows.findIndex(x=>x.id===id);if(idx===-1)throw new Error('Solicitud no encontrada');rows[idx]={...rows[idx],...patch,updated_at:new Date().toISOString()};save(rows);return rows[idx]}
 return request('/api/operator/requests/'+encodeURIComponent(id),{method:'PATCH',headers:{'X-Operator-Key':key},body:JSON.stringify(patch)});
}
async function accept(id){
 if(isDemo()){
  const b=await get(id);if(!b||b.status!=='quoted')throw new Error('Esta oferta no está disponible');
  const rows=records(),idx=rows.findIndex(x=>x.id===id);
  rows[idx]={...rows[idx],status:'accepted',updated_at:new Date().toISOString()};save(rows);return rows[idx];
 }
 return request('/api/requests/'+encodeURIComponent(id)+'/accept',{method:'POST',headers:{...customerHeader(),...(getToken(id)?{'X-Booking-Token':getToken(id)}:{})}});
}
async function cancel(id){
 if(isDemo()){
  const b=await get(id);if(!b||!['requested','quoted','accepted'].includes(b.status))throw new Error('No se puede cancelar esta reserva');
  const rows=records(),idx=rows.findIndex(x=>x.id===id);
  rows[idx]={...rows[idx],status:'cancelled',updated_at:new Date().toISOString()};save(rows);return rows[idx];
 }
 return request('/api/requests/'+encodeURIComponent(id)+'/cancel',{method:'POST',headers:{...customerHeader(),...(getToken(id)?{'X-Booking-Token':getToken(id)}:{})}});
}
async function passkeyRequest(path,payload){
 if(isDemo())throw Error('La huella solo se activa en viatraslados.com, no en la demo.');
 return request('/api/customer/passkeys/'+path,{method:'POST',headers:customerHeader(),body:JSON.stringify(payload||{})});
}
global.ViaStore={isDemo,startVerification,verifyCode,create,get,mine,list,operatorUpdate,
 accept,cancel,resume,customer,saveCustomer:setCustomer,customerHeader,startPhoneLogin,finishPhoneLogin,logout,passkeyRequest};
})(window);
