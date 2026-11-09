(function(global){
'use strict';
const cfg=global.VIA_CONFIG||{demo:true,apiUrl:''};
const DB='via-traslados-solo-demo-v3';
const ACCESS='via-traslados-solo-demo-access-v3';
const VERIFY='via-traslados-verified-session-v3';
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
async function request(path,opts={}){const base=cfg.apiUrl.replace(/\/$/,'');const r=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});let data;try{data=await r.json()}catch{throw new Error('El servidor no devolvió una respuesta válida')}if(!r.ok)throw new Error(data.error||'No se pudo completar la operación');return data}
function demoEmail(email){const value=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('Correo electrónico incorrecto');return value}
async function startVerification(email,turnstileToken){if(isDemo()){
 const normalized=demoEmail(email);sessionStorage.setItem('via-demo-otp-email-v3',normalized);clearVerified();return {email:normalized,maskedEmail:normalized.replace(/(^.{1,2})[^@]*(?=@)/,'$1•••'),demo:true};
 }return request('/api/auth/start',{method:'POST',body:JSON.stringify({email,turnstileToken})});}
async function verifyCode(email,code){if(isDemo()){
 if(code!=='123456'||email!==sessionStorage.getItem('via-demo-otp-email-v3'))throw Error('Código de prueba incorrecto. Usá 123456.');
 setVerified({email,token:'demo-verified',expires:Date.now()+15*60*1000});return {verified:true};
 }
 const result=await request('/api/auth/verify',{method:'POST',body:JSON.stringify({email,code})});
 setVerified({email:result.email,token:result.verificationToken,expires:Date.now()+15*60*1000});return result;
}
async function create(payload){const auth=verified();if(!auth||auth.expires<Date.now()||auth.email!==payload.email.toLowerCase())throw Error('Primero tenés que verificar tu correo electrónico.');
 if(isDemo()){
 const now=new Date().toISOString();const id=demoId();const rec={...payload,id,status:'requested',price:null,created_at:now,updated_at:now,verification_status:'demo_only'};
 save([rec,...records()]);remember(id,'demo');clearVerified();return {id,access_token:'demo',status:rec.status};
 }
 const res=await request('/api/requests',{method:'POST',headers:{'X-Verification-Token':auth.token},body:JSON.stringify(payload)});
 remember(res.id,res.access_token);clearVerified();return res;
}
async function get(id){if(isDemo())return records().find(x=>x.id===id)||null;const token=getToken(id);if(!token)throw new Error('Esta reserva no está disponible en este dispositivo');return request('/api/requests/'+encodeURIComponent(id),{headers:{'X-Booking-Token':token}})}
async function mine(){
 if(isDemo())return records();const ids=Object.keys(access());const list=await Promise.all(ids.map(async id=>{try{return await get(id)}catch{return null}}));return list.filter(Boolean);
}
async function list(key){if(isDemo())return records();return request('/api/operator/requests',{headers:{'X-Operator-Key':key}})}
async function operatorUpdate(id,patch,key){if(isDemo()){const rows=records();const idx=rows.findIndex(x=>x.id===id);if(idx===-1)throw new Error('Solicitud no encontrada');rows[idx]={...rows[idx],...patch,updated_at:new Date().toISOString()};save(rows);return rows[idx]}return request('/api/operator/requests/'+encodeURIComponent(id),{method:'PATCH',headers:{'X-Operator-Key':key},body:JSON.stringify(patch)})}
async function accept(id){if(isDemo()){const b=await get(id);if(!b||b.status!=='quoted')throw new Error('Esta oferta no está disponible');const rows=records();const idx=rows.findIndex(x=>x.id===id);rows[idx]={...rows[idx],status:'accepted',updated_at:new Date().toISOString()};save(rows);return rows[idx]}return request('/api/requests/'+encodeURIComponent(id)+'/accept',{method:'POST',headers:{'X-Booking-Token':getToken(id)}})}
async function cancel(id){if(isDemo()){const b=await get(id);if(!b||!['requested','quoted','accepted'].includes(b.status))throw new Error('No se puede cancelar esta reserva');const rows=records();const idx=rows.findIndex(x=>x.id===id);rows[idx]={...rows[idx],status:'cancelled',updated_at:new Date().toISOString()};save(rows);return rows[idx]}return request('/api/requests/'+encodeURIComponent(id)+'/cancel',{method:'POST',headers:{'X-Booking-Token':getToken(id)}})}
global.ViaStore={isDemo,startVerification,verifyCode,create,get,mine,list,operatorUpdate,accept,cancel};
})(window);
