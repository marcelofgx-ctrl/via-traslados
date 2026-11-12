// Vía Traslados: OTP WhatsApp mediante puente QA de MacroDroid, nunca desde el navegador.
// El puente es opcional: si no está conectado, solo se ofrece correo electrónico.
import {challenge} from './auth.js';

const enc=new TextEncoder(),now=()=>Math.floor(Date.now()/1000);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const sha=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const result=(data,status=200)=>({data,status});
const secure=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0};
const configured=env=>Boolean(env.DB&&env.OTP_PEPPER?.length>=32&&env.WHATSAPP_BRIDGE_KEY?.length>=32&&env.TURNSTILE_SECRET_KEY);
function phoneOf(input){
 const n=String(input??'').replace(/\D/g,'');
 if(!/^\d{8,15}$/.test(n))throw Error('Celular inválido');
 if(n.length===11&&n.startsWith('598'))return '0'+n.slice(3);
 if(n.length===8&&n.startsWith('9'))return '0'+n;
 return n;
}
function waAddress(phone){
 const p=phoneOf(phone);
 if(/^09\d{7}$/.test(p))return '598'+p.slice(1);
 if(/^[1-9]\d{9,14}$/.test(p))return p;
 throw Error('Usá un celular uruguayo o un número internacional con prefijo');
}
async function hmac(env,text){
 const key=await crypto.subtle.importKey('raw',enc.encode(env.OTP_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode('via-wa-otp-v1:'+text))));
}
async function cipherKey(env){
 const bytes=await crypto.subtle.digest('SHA-256',enc.encode('via-wa-bridge-v1:'+env.WHATSAPP_BRIDGE_KEY));
 return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encrypt(env,message){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(env),enc.encode(message));
 return base64(iv)+'.'+base64(new Uint8Array(ciphertext));
}
async function decrypt(env,payload){
 const [iv,data]=String(payload||'').split('.');
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(iv)},await cipherKey(env),from64(data)));
}
async function limited(env,label,max,windowSeconds){
 const key=await sha('via-whatsapp:'+label);
 const r=await env.DB.prepare('INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(key,windowSeconds,windowSeconds).first();
 return Number(r?.attempts||0)<=max;
}
async function body(req){
 if(Number(req.headers.get('Content-Length')||0)>3500)throw Error('Solicitud demasiado grande');
 const text=await req.text();if(text.length>3500)throw Error('Solicitud demasiado grande');
 const p=JSON.parse(text);if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Datos incorrectos');return p;
}
async function live(env){
 if(!configured(env))return false;
 const r=await env.DB.prepare('SELECT last_seen FROM whatsapp_bridge_health WHERE id=1').first();
 return Number(r?.last_seen||0)>now()-150;
}
export async function consumeWhatsAppProof(env,phone,purpose,token){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))return false;
 const normalized=phoneOf(phone);
 const row=await env.DB.prepare("UPDATE whatsapp_verified_sessions SET consumed_at=unixepoch() WHERE token_hash=? AND phone=? AND purpose=? AND consumed_at IS NULL AND expires_at>unixepoch() RETURNING phone").bind(await sha(token.toLowerCase()),normalized,purpose).first();
 return Boolean(row?.phone);
}
async function sendStart(req,env,p,findAccount){
 if(!await live(env))return result({error:'WhatsApp no está disponible. Elegí el correo electrónico.'},503);
 let phone,recipient;
 try{phone=phoneOf(p.phone);recipient=waAddress(phone)}catch{return result({error:'Ingresá un número válido de WhatsApp'},400)}
 const purpose=p.purpose==='registration'?'registration':p.purpose==='recovery'?'recovery':null;
 if(!purpose)return result({error:'Operación inválida'},400);
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await limited(env,'start:'+phone,3,900)||!await limited(env,'ip:'+ip,10,900)||!await limited(env,'global',80,86400))
  return result({error:'Límite de códigos alcanzado. Probá más tarde.'},429);
 if(!await challenge(req,env,p.turnstileToken))return result({error:'Completá la comprobación de seguridad'},403);
 const existing=await findAccount(env,phone);
 if(purpose==='registration'&&existing)return result({error:'Este celular ya tiene una cuenta. Ingresá con tu PIN o huella.'},409);
 if(purpose==='recovery'){
  if(!existing)return result({error:'No se puede recuperar esta cuenta por WhatsApp. Elegí correo.'},403);
  const channel=await env.DB.prepare('SELECT phone_verified_at,verified_phone FROM customer_verified_channels WHERE email=?').bind(existing.email).first();
  if(!channel?.phone_verified_at||phoneOf(channel.verified_phone)!==phone)
   return result({error:'Este celular todavía no tiene WhatsApp verificado. Recuperá por correo.'},403);
 }
 const number=crypto.getRandomValues(new Uint32Array(1))[0];
 const code=String(100000+number%900000);
 const hash=await hmac(env,phone+':'+purpose+':'+code);
 const message='Vía Traslados: tu código de verificación es '+code+'. Vence en 10 minutos. No lo compartas.';
 const encrypted=await encrypt(env,message);
 const id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO whatsapp_otp_codes(phone,purpose,code_hash,payload,delivery_id,expires_at,attempts,delivery_status,lease_until) VALUES (?,?,?,?,?,unixepoch()+600,0,'queued',0) ON CONFLICT(phone,purpose) DO UPDATE SET code_hash=excluded.code_hash,payload=excluded.payload,delivery_id=excluded.delivery_id,expires_at=excluded.expires_at,attempts=0,delivery_status='queued',lease_until=0")
  .bind(phone,purpose,hash,encrypted,id).run();
 return result({queued:true,channel:'whatsapp',message:'Código preparado para envío por WhatsApp. Si no llega, elegí correo.'});
}
async function verify(req,env,p,findAccount,makeSession){
 let phone;try{phone=phoneOf(p.phone)}catch{return result({error:'Código incorrecto o vencido'},401)}
 const purpose=p.purpose==='registration'?'registration':p.purpose==='recovery'?'recovery':null;
 if(!purpose||!/^\d{6}$/.test(String(p.code??'')))return result({error:'Ingresá el código de seis cifras'},400);
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await limited(env,'verify:'+phone,10,900)||!await limited(env,'verify-ip:'+ip,30,900))
  return result({error:'Demasiados intentos'},429);
 const row=await env.DB.prepare("UPDATE whatsapp_otp_codes SET attempts=attempts+1 WHERE phone=? AND purpose=? AND attempts<5 AND expires_at>unixepoch() RETURNING code_hash").bind(phone,purpose).first();
 const digest=await hmac(env,phone+':'+purpose+':'+p.code);
 if(!row||!secure(digest,row.code_hash))return result({error:'Código incorrecto o vencido'},401);
 const deleted=await env.DB.prepare("DELETE FROM whatsapp_otp_codes WHERE phone=? AND purpose=? AND code_hash=? AND expires_at>unixepoch() RETURNING phone").bind(phone,purpose,digest).first();
 if(!deleted?.phone)return result({error:'Código incorrecto o vencido'},401);
 if(purpose==='recovery'){
  const account=await findAccount(env,phone);
  if(!account)return result({error:'Cuenta no disponible'},401);
  const channel=await env.DB.prepare('SELECT phone_verified_at,verified_phone FROM customer_verified_channels WHERE email=?').bind(account.email).first();
  if(!channel?.phone_verified_at||phoneOf(channel.verified_phone)!==phone)return result({error:'WhatsApp no verificado'},401);
  const session=await makeSession(env,account.email);
  return result({sessionToken:session.token,expiresAt:session.expiresAt,profile:account,channel:'whatsapp'});
 }
 const token=random();
 await env.DB.prepare("INSERT INTO whatsapp_verified_sessions(token_hash,phone,purpose,expires_at) VALUES (?,?,?,unixepoch()+900)").bind(await sha(token),phone,purpose).run();
 return result({verified:true,verificationToken:token,channel:'whatsapp'});
}
async function bridgeNext(env){
 await env.DB.prepare("INSERT INTO whatsapp_bridge_health(id,last_seen) VALUES (1,unixepoch()) ON CONFLICT(id) DO UPDATE SET last_seen=unixepoch()").run();
 const row=await env.DB.prepare("UPDATE whatsapp_otp_codes SET delivery_status='leased',lease_until=unixepoch()+90 WHERE delivery_id=(SELECT delivery_id FROM whatsapp_otp_codes WHERE expires_at>unixepoch() AND (delivery_status='queued' OR (delivery_status='leased' AND lease_until<unixepoch())) ORDER BY expires_at ASC LIMIT 1) RETURNING delivery_id,phone,payload").first();
 if(!row)return {item:null};
 try{
  const recipient=waAddress(row.phone);
  return {item:{id:row.delivery_id,recipient:'+'+recipient,message:await decrypt(env,row.payload)}};
 }catch{return {item:null}}
}
async function bridgeAck(env,p){
 const id=String(p.id||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||typeof p.sent!=='boolean')return result({error:'Confirmación inválida'},400);
 const row=await env.DB.prepare("UPDATE whatsapp_otp_codes SET delivery_status=?,lease_until=? WHERE delivery_id=? AND delivery_status='leased' AND expires_at>unixepoch() RETURNING delivery_id")
  .bind(p.sent?'sent':'queued',p.sent?0:now()+90,id).first();
 return row?result({accepted:true}):result({error:'Envío no encontrado o vencido'},404);
}
function bridgeAuthorized(req,env){
 const match=(req.headers.get('Authorization')||'').match(/^Bearer (.+)$/);
 return configured(env)&&secure(match?.[1],env.WHATSAPP_BRIDGE_KEY);
}
export async function customerWhatsAppRoutes(req,env,path,send,findAccount,makeSession){
 const respond=(r)=>send(r.data,r.status);
 if(path==='/api/customer/verification/channels'&&req.method==='GET'){
  const whatsapp=await live(env);
  return send({email:true,whatsapp,whatsappExperimental:true});
 }
 if(!path.startsWith('/api/customer/whatsapp/'))return null;
 if(path==='/api/customer/whatsapp/bridge/next'&&req.method==='GET'){
  if(!bridgeAuthorized(req,env))return send({error:'No autorizado'},401);
  return send(await bridgeNext(env));
 }
 if(path==='/api/customer/whatsapp/bridge/ack'&&req.method==='POST'){
  if(!bridgeAuthorized(req,env))return send({error:'No autorizado'},401);
  let p;try{p=await body(req)}catch{return send({error:'Datos incorrectos'},400)}
  return respond(await bridgeAck(env,p));
 }
 if(!new Set(['/api/customer/whatsapp/start','/api/customer/whatsapp/verify']).has(path)||req.method!=='POST')return null;
 if(!configured(env))return send({error:'WhatsApp no está habilitado. Elegí correo.'},503);
 let p;try{p=await body(req)}catch{return send({error:'Datos incorrectos'},400)}
 return respond(path.endsWith('/start')?await sendStart(req,env,p,findAccount):await verify(req,env,p,findAccount,makeSession));
}
