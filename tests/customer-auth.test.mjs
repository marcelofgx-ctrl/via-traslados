import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {normalizePhone,customerRoutes,customerSession} from '../backend/customer-auth.js';
import {customerPasskeyRoutes} from '../backend/customer-passkeys.js';
import worker from '../backend/worker.js';
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))
 .map(x=>x.toString(16).padStart(2,'0')).join('');
const fake={
 ip:'192.0.2.20',email:'cliente@example.com',name:'Ana Pérez',phone:'094 123 456'
};
function db(){
 const customers=new Map([[fake.email,fake]]),rates=new Map(),codes=new Map(),
 verifications=new Map(),sessions=new Map(),passkeys=[];
 const DB={customers,codes,sessions,verifications,prepare(sql){
  let args=[];
  const q={bind(...vals){args=vals;return q},async first(){
   if(sql.startsWith('INSERT INTO otp_rate_limits')){
    let n=rates.get(args[0])||0;n++;rates.set(args[0],n);return{attempts:n};
   }
   if(sql.startsWith('SELECT email,name,phone FROM customers WHERE length(phone)')){
    return null; // the code uses all(), not first()
   }
   if(sql.startsWith('UPDATE email_otp_codes SET attempts')){
    const c=codes.get(args[0]);if(!c||c.attempts>=5)return null;
    c.attempts++;return{code_hash:c.hash};
   }
   if(sql.startsWith('DELETE FROM email_otp_codes')&&sql.includes('RETURNING')){
    const c=codes.get(args[0]);if(!c||c.hash!==args[1])return null;
    codes.delete(args[0]);return{email:args[0]};
   }
   if(sql.startsWith('UPDATE email_verified_sessions')){
    const row=verifications.get(args[0]);
    if(!row||row.email!==args[1]||row.used)return null;
    row.used=true;return{email:row.email};
   }
   if(sql.startsWith('SELECT s.email,s.expires_at,c.name,c.phone FROM customer_sessions')){
    const token=sessions.get(args[0]);if(!token||token.revoked||token.expiresAt<Date.now()/1000)return null;
    const customer=customers.get(token.email);
    return customer?{email:token.email,name:customer.name,phone:customer.phone,expires_at:token.expiresAt}:null;
   }
   if(sql.startsWith('SELECT COUNT(*) AS n FROM customer_passkeys'))return{n:0};
   if(sql.startsWith('SELECT setting_value FROM service_settings'))return{setting_value:'1'};
   if(sql.startsWith('SELECT email,name,phone FROM customers WHERE email='))return customers.get(args[0])||null;
   return null;
  },async all(){
   if(sql.startsWith('SELECT email,name,phone FROM customers WHERE length(phone)'))
    return{results:Array.from(customers.values())};
   if(sql.startsWith('SELECT id,origin,destination,trip_date AS date'))
    return{results:[]};
   if(sql.startsWith('SELECT credential_id,transports FROM customer_passkeys'))
    return{results:passkeys};
   return{results:[]};
  },async run(){
   if(sql.startsWith('INSERT INTO email_otp_codes')){
    codes.set(args[0],{hash:args[1],attempts:0});
   }else if(sql.startsWith('DELETE FROM email_otp_codes')){
    const old=codes.get(args[0]);if(old?.hash===args[1])codes.delete(args[0]);
   }else if(sql.startsWith('INSERT INTO email_verified_sessions')){
    verifications.set(args[0],{email:args[1],used:false});
   }else if(sql.startsWith('INSERT INTO customer_sessions')){
    sessions.set(args[0],{email:args[1],expiresAt:args[2],revoked:false});
   }else if(sql.startsWith('UPDATE customer_sessions SET revoked_at')){
    const row=sessions.get(args[0]);if(row)row.revoked=true;
   }else if(sql.startsWith('INSERT INTO customers')){
    customers.set(args[0],{email:args[0],name:args[1],phone:args[2]});
   }
   return{meta:{changes:1}};
  }};
  return q;
 }};
 return DB;
}
const env=DB=>({DB,PUBLIC_ORIGIN:'https://viatraslados.com',OPERATOR_ORIGIN:'https://viatraslados.com',
 RESEND_API_KEY:'test-resend-key',RESEND_FROM:'Vía Traslados <reservas@viatraslados.com>',
 TURNSTILE_SECRET_KEY:'test-turnstile',OTP_PEPPER:'test-pepper-32-char-string-for-unit-tests'});
function post(path,body,headers={}){
 return new Request('https://api.example'+path,{method:'POST',
  headers:{'Content-Type':'application/json','CF-Connecting-IP':fake.ip,'Origin':'https://viatraslados.com',...headers},
  body:JSON.stringify(body)});
}
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('normalización del celular (local e internacional), no es autenticación',()=>{
 assert.equal(normalizePhone('094 123 456'),'094123456');
 assert.equal(normalizePhone('+598 94 123 456'),'094123456');
 assert.equal(normalizePhone('94123456'),'094123456');
 assert.throws(()=>normalizePhone('123'));
});
test('sin correo o passkey verificados, teléfono no concede ninguna sesión',async()=>{
 const DB=db(),e=env(DB);
 const me=await customerRoutes(post('/api/customer/me',{}),e,'/api/customer/me',send);
 assert.equal(me.status,401);
 const bare=await customerSession(post('/api/customer/bookings',{phone:fake.phone}),e);
 assert.equal(bare,null);
 const invalid=await customerPasskeyRoutes(post('/api/customer/passkeys/register/options',{phone:fake.phone}),
  e,'/api/customer/passkeys/register/options',send);
 assert.equal(invalid.status,401);
});
test('celular → correo asociado → OTP válido → sesión 30 días → logout',async()=>{
 const DB=db(),e=env(DB),original=globalThis.fetch;
 let otp='',mailCount=0;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('siteverify'))return new Response(JSON.stringify({success:true,action:'otp',hostname:'viatraslados.com'}),{status:200});
  if(String(url).includes('api.resend.com')){
   mailCount++;
   otp=JSON.parse(options.body).text.match(/\b\d{6}\b/)[0];
   return new Response(JSON.stringify({id:'message-test'}),{status:200});
  }
  throw Error('Solicitud no esperada');
 };
 try{
  const missing=await customerRoutes(post('/api/customer/login/start',{phone:'099 555 555',turnstileToken:'captcha'}),e,'/api/customer/login/start',send);
  assert.equal(missing.status,200);
  assert.equal((await missing.json()).recognized,false);
  assert.equal(mailCount,0);
  const begin=await customerRoutes(post('/api/customer/login/start',{phone:'+598 94 123 456',turnstileToken:'captcha'}),
   e,'/api/customer/login/start',send);
  assert.equal(begin.status,200);
  const summary=await begin.json();
  assert.equal(summary.recognized,true);
  assert.equal(summary.sent,true);
  assert.ok(summary.maskedEmail.includes('•••@'));
  assert.equal(summary.maskedEmail.includes(fake.email),false);
  assert.equal(mailCount,1);
  const incorrect=await customerRoutes(post('/api/customer/login/verify',{phone:fake.phone,code:'000000'}),
   e,'/api/customer/login/verify',send);
  assert.equal(incorrect.status,401);
  const verified=await customerRoutes(post('/api/customer/login/verify',{phone:fake.phone,code:otp}),
   e,'/api/customer/login/verify',send);
  assert.equal(verified.status,200);
  const session=await verified.json();
  assert.equal(session.profile.email,fake.email);
  assert.match(session.sessionToken,/^[0-9a-f]{64}$/);
  assert.ok(session.expiresAt>Math.floor(Date.now()/1000)+29*86400);
  const token=DB.sessions.keys().next().value;
  assert.notEqual(token,session.sessionToken,'Token solo se almacena hasheado');
  const headers={'Authorization':'Bearer '+session.sessionToken};
  const account=await customerRoutes(post('/api/customer/me',{},headers),e,'/api/customer/me',send);
  assert.equal(account.status,200);
  assert.equal((await account.json()).profile.name,fake.name);
  const replay=await customerRoutes(post('/api/customer/login/verify',{phone:fake.phone,code:otp}),e,
   '/api/customer/login/verify',send);
  assert.equal(replay.status,401);
  const logout=await customerRoutes(post('/api/customer/logout',{},headers),e,'/api/customer/logout',send);
  assert.equal(logout.status,200);
  assert.equal((await customerRoutes(post('/api/customer/me',{},headers),e,'/api/customer/me',send)).status,401);
 }finally{globalThis.fetch=original}
});
test('verificación email de primera reserva crea sesión sin permitir nombre por teléfono solamente',async()=>{
 const DB=db(),e=env(DB),original=globalThis.fetch;
 let otp='';
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('siteverify'))return new Response(JSON.stringify({success:true,action:'otp',hostname:'viatraslados.com'}),{status:200});
  otp=JSON.parse(options.body).text.match(/\b\d{6}\b/)[0];
  return new Response(JSON.stringify({id:'test-email-id'}),{status:200});
 };
 try{
  const start=await worker.fetch(post('/api/auth/start',{email:'nuevo@example.com',turnstileToken:'captcha'}),e);
  assert.equal(start.status,200);
  const verified=await worker.fetch(post('/api/auth/verify',{email:'nuevo@example.com',code:otp}),e);
  assert.equal(verified.status,200);
  const proof=(await verified.json()).verificationToken;
  const result=await customerRoutes(post('/api/customer/session',{email:'nuevo@example.com',name:'Lucía Solis',
   phone:'099 321 456',verificationToken:proof}),e,'/api/customer/session',send);
  assert.equal(result.status,201);
  const data=await result.json();
  assert.equal(data.profile.email,'nuevo@example.com');
  assert.equal(DB.customers.has('nuevo@example.com'),true);
  const reused=await customerRoutes(post('/api/customer/session',{email:'nuevo@example.com',name:'Lucía Solis',
   phone:'099 321 456',verificationToken:proof}),e,'/api/customer/session',send);
  assert.equal(reused.status,401);
 }finally{globalThis.fetch=original}
});
