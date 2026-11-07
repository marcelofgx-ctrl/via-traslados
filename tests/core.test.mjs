import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {normalizeEmail,maskEmail,beginOtp,checkOtp,consumeVerifiedSession,emailOtpAvailable} from '../backend/auth.js';
import worker,{validateBooking,validTransition} from '../backend/worker.js';
const req=(path,body,headers={})=>new Request('https://api.example'+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.10',...headers},body:JSON.stringify(body)});
function db(){
 const rates=new Map(),codes=new Map(),sessions=new Map();
 return {codes,prepare(sql){return{bind(...args){return{
  async first(){
   if(sql.startsWith('INSERT INTO otp_rate_limits')){const [key,seconds]=args;let rate=rates.get(key);if(!rate||Date.now()-rate.at>=seconds*1000)rate={n:0,at:Date.now()};rate.n++;rates.set(key,rate);return{attempts:rate.n}}
   if(sql.startsWith('UPDATE email_otp_codes SET attempts')){const r=codes.get(args[0]);if(!r||r.n>=5||r.exp<Date.now())return null;r.n++;return{code_hash:r.hash}}
   if(sql.startsWith('DELETE FROM email_otp_codes')&&sql.includes('RETURNING')){const r=codes.get(args[0]);if(!r||r.hash!==args[1]||r.exp<Date.now())return null;codes.delete(args[0]);return{email:args[0]}}
   if(sql.startsWith('UPDATE email_verified_sessions')){const r=sessions.get(args[0]);if(!r||r.email!==args[1]||r.used||r.exp<Date.now())return null;r.used=true;return{email:r.email}}
   return null
  },
  async run(){
   if(sql.startsWith('INSERT INTO email_otp_codes'))codes.set(args[0],{hash:args[1],exp:Date.now()+600000,n:0});
   if(sql.startsWith('DELETE FROM email_otp_codes')){const r=codes.get(args[0]);if(r?.hash===args[1])codes.delete(args[0])}
   if(sql.startsWith('INSERT INTO email_verified_sessions'))sessions.set(args[0],{email:args[1],exp:Date.now()+900000,used:false});
   return{meta:{changes:1}}
  }
 }} }}}
}
const env=DB=>({DB,PUBLIC_ORIGIN:'https://via.example',OPERATOR_ORIGIN:'https://via.example',RESEND_API_KEY:'re-test-not-real',RESEND_FROM:'Vía <reservas@via.example>',TURNSTILE_SECRET_KEY:'test-secret',OTP_PEPPER:'testing-pepper-value-32-characters-minimum'});
test('email normalizado',()=>assert.equal(normalizeEmail('  Cliente@Example.Com '),'cliente@example.com'));
test('email inválido rechazado',()=>{for(const x of ['','foo','@a.com','x'.repeat(201)])assert.throws(()=>normalizeEmail(x))});
test('correo parcialmente oculto',()=>assert.equal(maskEmail('cliente@example.com'),'cl•••@example.com'));
test('se exige Resend, captcha, pepper y DB',()=>assert.equal(emailOtpAvailable({DB:{}}),false));
test('sin configuración, API OTP inactiva',async()=>assert.equal((await beginOtp(req('/api/auth/start',{email:'a@example.com'}),{DB:{}})).status,503));
test('transiciones de reserva restringidas',()=>{assert.equal(validTransition('requested','quoted'),true);assert.equal(validTransition('requested','completed'),false)});
test('la reserva exige datos completos',()=>assert.throws(()=>validateBooking({name:'A'})));
test('no aceptar reservas sin código validado',async()=>{
 const response=await worker.fetch(req('/api/requests',{name:'Ana Pereira',phone:'099 123 456',email:'ana@example.com',origin:'Aeropuerto Carrasco',destination:'Punta del Este',date:'2027-01-20',time:'12:30',passengers:2,bags:1},{Origin:'https://via.example'}),{DB:db(),PUBLIC_ORIGIN:'https://via.example'});
 assert.equal(response.status,401)
});
test('OTP enviado con Resend y código no guardado en texto claro; un solo uso',async()=>{
 const DB=db(),e=env(DB),original=globalThis.fetch;let otp='',sends=0;
 globalThis.fetch=async(url,opts)=>{
  if(String(url).includes('siteverify'))return new Response(JSON.stringify({success:true,action:'otp',hostname:'via.example'}),{status:200});
  if(String(url).includes('api.resend.com')){sends++;assert.equal(opts.headers.Authorization,'Bearer re-test-not-real');const data=JSON.parse(opts.body);otp=data.text.match(/\b\d{6}\b/)[0];return new Response(JSON.stringify({id:'test-message-id'}),{status:200})}
  throw Error('Fetch inesperado')
 };
 try{
  const a=await beginOtp(req('/api/auth/start',{email:'Cliente@example.com',turnstileToken:'captcha-token'}),e);
  assert.equal(a.status,200);assert.equal(sends,1);assert.notEqual(DB.codes.get('cliente@example.com').hash,otp);
  const bad=await checkOtp(req('/api/auth/verify',{email:'cliente@example.com',code:'000000'}),e);if(otp!=='000000')assert.equal(bad.status,401);
  const b=await checkOtp(req('/api/auth/verify',{email:'cliente@example.com',code:otp}),e);assert.equal(b.status,200);
  const reused=await checkOtp(req('/api/auth/verify',{email:'cliente@example.com',code:otp}),e);assert.equal(reused.status,401);
  const h={'X-Verification-Token':b.data.verificationToken};
  assert.equal(await consumeVerifiedSession(req('/api/requests',{},h),e,'other@example.com'),false);
  assert.equal(await consumeVerifiedSession(req('/api/requests',{},h),e,'cliente@example.com'),true);
  assert.equal(await consumeVerifiedSession(req('/api/requests',{},h),e,'cliente@example.com'),false)
 }finally{globalThis.fetch=original}
});
test('Turnstile rechazado no envía correo',async()=>{
 const DB=db(),original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({success:false}),{status:200});
 try{const r=await beginOtp(req('/api/auth/start',{email:'a@example.com',turnstileToken:'captcha-token'}),env(DB));assert.equal(r.status,403);assert.equal(DB.codes.size,0)}finally{globalThis.fetch=original}
});
test('si Resend falla se elimina el código',async()=>{
 const DB=db(),original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('siteverify')?new Response(JSON.stringify({success:true,action:'otp',hostname:'via.example'}),{status:200}):new Response(JSON.stringify({error:'no delivery'}),{status:500});
 try{const r=await beginOtp(req('/api/auth/start',{email:'a@example.com',turnstileToken:'captcha-token'}),env(DB));assert.equal(r.status,502);assert.equal(DB.codes.size,0)}finally{globalThis.fetch=original}
});
