import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {customerWhatsAppRoutes} from '../backend/customer-whatsapp.js';
import {customerRoutes,accountByPhone,createCustomerSession} from '../backend/customer-auth.js';

const phone='094 333 222';
const key='qa-bridge-secret-that-is-not-shared-with-passengers-123456';
function fixture(){
 const otp=new Map(),proofs=new Map(),customers=new Map(),channels=new Map(),sessions=new Map(),rates=new Map();
 const state={health:0};
 const DB={otp,proofs,customers,channels,sessions,state,prepare(sql){
  let a=[];
  const s={bind(...args){a=args;return s},async first(){
   if(sql.startsWith('SELECT last_seen FROM whatsapp_bridge_health'))return state.health?{last_seen:state.health}:null;
   if(sql.startsWith('INSERT INTO otp_rate_limits')){const n=(rates.get(a[0])||0)+1;rates.set(a[0],n);return{attempts:n}}
   if(sql.includes("UPDATE whatsapp_otp_codes SET delivery_status='leased'")){
    const row=[...otp.values()].find(x=>x.expires>Date.now()/1000&&
     (x.status==='queued'&&x.lease<Date.now()/1000||x.status==='leased'&&x.lease<Date.now()/1000));
    if(!row)return null;row.status='leased';row.lease=Math.floor(Date.now()/1000)+90;
    return{delivery_id:row.id,phone:row.phone,payload:row.payload};
   }
   if(sql.startsWith('UPDATE whatsapp_otp_codes SET delivery_status=?')){
    const row=[...otp.values()].find(x=>x.id===a[2]&&x.status==='leased');
    if(!row)return null;row.status=a[0];row.lease=a[1];return{delivery_id:row.id};
   }
   if(sql.startsWith('UPDATE whatsapp_otp_codes SET attempts=')){
    const row=otp.get(a[0]+':'+a[1]);
    if(!row||row.expires<Date.now()/1000||row.attempts>=5)return null;
    row.attempts++;return{code_hash:row.hash};
   }
   if(sql.startsWith('DELETE FROM whatsapp_otp_codes')&&sql.includes('RETURNING')){
    const index=a[0]+':'+a[1],row=otp.get(index);
    if(!row||row.hash!==a[2]||row.expires<Date.now()/1000)return null;
    otp.delete(index);return{phone:a[0]};
   }
   if(sql.startsWith('UPDATE whatsapp_verified_sessions')){
    const row=proofs.get(a[0]);
    if(!row||row.used||row.phone!==a[1]||row.purpose!==a[2]||row.expires<Date.now()/1000)return null;
    row.used=true;return{phone:row.phone};
   }
   if(sql.startsWith('SELECT phone_verified_at,verified_phone FROM customer_verified_channels')||
      sql.startsWith('SELECT verified_phone,phone_verified_at,email_verified_at FROM customer_verified_channels')){
    return channels.get(a[0])||null;
   }
   if(sql.startsWith('SELECT email_verified_at FROM customer_verified_channels'))return channels.get(a[0])||null;
   if(sql.startsWith('SELECT email,name,phone FROM customers WHERE email='))return customers.get(a[0])||null;
   if(sql.startsWith('SELECT COUNT(*) AS n FROM customer_passkeys'))return{n:0};
   if(sql.startsWith('SELECT email FROM customer_pins'))return null;
   return null;
  },async all(){
   if(sql.includes('FROM customers WHERE length(phone)'))return{results:[...customers.values()]};
   return{results:[]};
  },async run(){
   if(sql.startsWith('INSERT INTO whatsapp_bridge_health'))state.health=Math.floor(Date.now()/1000);
   if(sql.startsWith('INSERT INTO whatsapp_otp_codes')){
    otp.set(a[0]+':'+a[1],{phone:a[0],purpose:a[1],hash:a[2],payload:a[3],id:a[4],
     expires:Math.floor(Date.now()/1000)+600,attempts:0,status:'queued',lease:0});
   }
   if(sql.startsWith('INSERT INTO whatsapp_verified_sessions')){
    proofs.set(a[0],{phone:a[1],purpose:a[2],expires:Math.floor(Date.now()/1000)+900,used:false});
   }
   if(sql.startsWith('INSERT INTO customers'))customers.set(a[0],{email:a[0],name:a[1],phone:a[2]});
   if(sql.startsWith('INSERT INTO customer_verified_channels')){
    channels.set(a[0],{verified_phone:a[1],phone_verified_at:Math.floor(Date.now()/1000),email_verified_at:null});
   }
   if(sql.startsWith('INSERT INTO customer_sessions')){
    sessions.set(a[0],{email:a[1],expires:a[2]});
   }
   return{meta:{changes:1}};
  }};
  return s;
 }};
 const env={DB,OTP_PEPPER:'test-pepper-32-char-secret-not-for-prod-012345',
  WHATSAPP_BRIDGE_KEY:key,PUBLIC_ORIGIN:'https://viatraslados.com',TURNSTILE_SECRET_KEY:'test-turnstile'};
 return{DB,env};
}
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const request=(path,body,headers={})=>new Request('https://api.example'+path,
 {method:'POST',headers:{'Content-Type':'application/json',Origin:'https://viatraslados.com','CF-Connecting-IP':'198.51.100.11',...headers},body:JSON.stringify(body)});
const get=(path,headers={})=>new Request('https://api.example'+path,{headers:{Origin:'https://viatraslados.com',...headers}});
async function call(fixture,method,path,body,headers){
 const req=method==='GET'?get(path,headers):request(path,body,headers);
 return customerWhatsAppRoutes(req,fixture.env,path,respond,accountByPhone,createCustomerSession);
}
async function browser(fixture,path,body){
 return customerRoutes(request(path,body),fixture.env,path,respond);
}
test('WhatsApp se ofrece solamente con MacroDroid activo y se requiere clave privada para sondear',async()=>{
 const f=fixture();
 const initial=await call(f,'GET','/api/customer/verification/channels');
 assert.equal((await initial.json()).whatsapp,false);
 const unavailable=await call(f,'POST','/api/customer/whatsapp/start',{phone,purpose:'registration',turnstileToken:'okay'});
 assert.equal(unavailable.status,503);
 const denied=await call(f,'GET','/api/customer/whatsapp/bridge/next');
 assert.equal(denied.status,401);
 const poll=await call(f,'GET','/api/customer/whatsapp/bridge/next',null,{Authorization:'Bearer '+key});
 assert.equal(poll.status,200);assert.equal((await poll.json()).item,null);
 const fresh=await call(f,'GET','/api/customer/verification/channels');
 assert.equal((await fresh.json()).whatsapp,true);
});
test('registro WhatsApp: código cifrado en D1, uso único, sin inventar correo verificado; recuperación sin nuevo registro',async()=>{
 const f=fixture(),fetchBefore=globalThis.fetch;
 globalThis.fetch=async(url)=> {
  assert.match(String(url),/challenges.cloudflare.com/);
  return new Response(JSON.stringify({success:true,action:'otp',hostname:'viatraslados.com'}),{status:200});
 };
 try{
  const h={Authorization:'Bearer '+key},next='/api/customer/whatsapp/bridge/next';
  await call(f,'GET',next,null,h);
  const started=await call(f,'POST','/api/customer/whatsapp/start',{phone,purpose:'registration',turnstileToken:'okay'});
  assert.equal(started.status,200);
  assert.equal((await started.json()).queued,true);
  const queued=f.DB.otp.get('094333222:registration');
  assert.ok(queued);assert.ok(!/\b\d{6}\b/.test(queued.payload),'No OTP plaintext in queue');
  const denied=await call(f,'POST','/api/customer/whatsapp/bridge/ack',{id:queued.id,sent:true});
  assert.equal(denied.status,401);
  const delivery=await call(f,'GET',next,null,h);
  const item=(await delivery.json()).item;
  assert.equal(item.recipient,'+59894333222');
  const code=item.message.match(/\b\d{6}\b/)[0];
  const ack=await call(f,'POST','/api/customer/whatsapp/bridge/ack',{id:item.id,sent:true},h);
  assert.equal(ack.status,200);
  const bad=await call(f,'POST','/api/customer/whatsapp/verify',{phone,code:'000000',purpose:'registration'});
  assert.equal(bad.status,401);
  const verified=await call(f,'POST','/api/customer/whatsapp/verify',{phone,code,purpose:'registration'});
  assert.equal(verified.status,200);
  const proof=(await verified.json()).verificationToken;
  assert.match(proof,/^[a-f0-9]{64}$/);
  const repeat=await call(f,'POST','/api/customer/whatsapp/verify',{phone,code,purpose:'registration'});
  assert.equal(repeat.status,401);
  const enrolled=await browser(f,'/api/customer/session',{channel:'whatsapp',name:'Lucía Ramírez',phone,
   verificationToken:proof,email:'victima@example.com'});
  assert.equal(enrolled.status,201);
  const customer=(await enrolled.json()).profile;
  assert.match(customer.email,/^wa-[0-9a-f]+@identidad\.viatraslados\.invalid$/);
  assert.ok(!f.DB.customers.has('victima@example.com'),'Un correo ajeno NO debe ser utilizado como identidad');
  assert.ok(f.DB.channels.get(customer.email).phone_verified_at);
  const replay=await browser(f,'/api/customer/session',{channel:'whatsapp',name:'Otra',phone,verificationToken:proof});
  assert.equal(replay.status,409);
  const cannotReRegister=await call(f,'POST','/api/customer/whatsapp/start',{phone,purpose:'registration',turnstileToken:'okay'});
  assert.equal(cannotReRegister.status,409);
  // Recuperación WhatsApp: solo porque la cuenta conserva el celular comprobado.
  await call(f,'GET',next,null,h);
  const recovery=await call(f,'POST','/api/customer/whatsapp/start',{phone,purpose:'recovery',turnstileToken:'okay'});
  assert.equal(recovery.status,200);
  const second=(await (await call(f,'GET',next,null,h)).json()).item;
  const recoverCode=second.message.match(/\b\d{6}\b/)[0];
  const confirmed=await call(f,'POST','/api/customer/whatsapp/verify',{phone,code:recoverCode,purpose:'recovery'});
  assert.equal(confirmed.status,200);
  const data=await confirmed.json();assert.equal(data.profile.email,customer.email);
  assert.match(data.sessionToken,/^[a-f0-9]{64}$/);
  assert.equal((await call(f,'POST','/api/customer/whatsapp/verify',{phone,code:recoverCode,purpose:'recovery'})).status,401);
  const emailLogin=await browser(f,'/api/customer/login/start',{phone,turnstileToken:'okay'});
  assert.equal(emailLogin.status,403,'Un correo interno no verificado jamás permite recuperar la cuenta');
 }finally{globalThis.fetch=fetchBefore}
});
