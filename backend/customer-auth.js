import {hourlyEnabled,hourlySelect,hourlyFields} from './hourly-api.js';
// Vía Traslados: identidad de pasajeros, sin contraseña ni SMS de pago.
// Nunca autenticar por conocer solamente el teléfono: correo OTP o passkey válida.
import {beginOtp,checkOtp,consumeVerifiedSession,normalizeEmail,maskEmail,challenge} from './auth.js';

const encoder=new TextEncoder();
const sha=async str=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(str)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const now=()=>Math.floor(Date.now()/1000);
const DAYS_30=30*86400;
const clean=(v,n)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,n);
const error=(message,status=400)=>({data:{error:message},status});
const ok=(data,status=200)=>({data,status});
export function normalizePhone(value){
 const digits=String(value??'').replace(/[^\d]/g,'');
 if(!/^\d{8,15}$/.test(digits))throw Error('Número de celular inválido');
 // +598 94 842 756 y 094 842 756 refieren a la misma persona.
 if(digits.startsWith('598')&&digits.length===11)return '0'+digits.slice(3);
 if(digits.length===8&&digits.startsWith('9'))return '0'+digits;
 return digits;
}
function validProfile(profile){
 const email=normalizeEmail(profile.email);
 const name=clean(profile.name,100);
 const phone=clean(profile.phone,30);
 if(name.length<2||name.length>100)throw Error('Ingresá nombre y apellido');
 if(!/^\+?[\d\s()\-]{7,30}$/.test(phone))throw Error('Ingresá un celular válido');
 normalizePhone(phone);
 return{email,name,phone};
}
async function limited(env,label,max,window){
 const key=await sha('via-customer:'+label);
 const r=await env.DB.prepare('INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(key,window,window).first();
 return Number(r?.attempts||0)<=max;
}
async function parse(req){
 if(Number(req.headers.get('Content-Length')||0)>12000)throw Error('Solicitud demasiado grande');
 const raw=await req.text();
 if(raw.length>12000)throw Error('Solicitud demasiado grande');
 const json=JSON.parse(raw);
 if(!json||typeof json!=='object'||Array.isArray(json))throw Error('Datos inválidos');
 return json;
}
export async function accountByPhone(env,phone){
 const needle=normalizePhone(phone);
 // Retener compatibilidad con usuarios existentes creados antes de normalizar teléfonos.
 const rows=await env.DB.prepare("SELECT email,name,phone FROM customers WHERE length(phone) BETWEEN 7 AND 30 AND (replace(replace(replace(replace(replace(phone,' ',''),'-',''),'+',''),'(',''),')','') LIKE ? OR replace(replace(replace(replace(replace(phone,' ',''),'-',''),'+',''),'(',''),')','') LIKE ?) LIMIT 8").bind('%'+needle+'%', '%'+needle.replace(/^0/,'598')+'%').all();
 const matches=(rows.results||[]).filter(row=>{try{return normalizePhone(row.phone)===needle}catch{return false}});
 // Teléfono duplicado no se vincula arbitrariamente a una cuenta.
 return matches.length===1?matches[0]:null;
}
export async function createCustomerSession(env,email){
 const token=random(),hash=await sha(token),expiresAt=now()+DAYS_30;
 await env.DB.prepare('INSERT INTO customer_sessions(token_hash,email,expires_at,created_at) VALUES (?,?,?,unixepoch())').bind(hash,email,expiresAt).run();
 return{token,expiresAt};
}
export async function customerSession(req,env){
 const token=(req.headers.get('Authorization')||'').match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
 if(!token)return null;
 const row=await env.DB.prepare('SELECT s.email,s.expires_at,c.name,c.phone FROM customer_sessions s JOIN customers c ON c.email=s.email WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>unixepoch()').bind(await sha(token.toLowerCase())).first();
 return row||null;
}
async function restore(email,env){
 const row=await env.DB.prepare('SELECT email,name,phone FROM customers WHERE email=?').bind(email).first();
 return row?{email:row.email,name:row.name,phone:row.phone}:null;
}
function identityResult(account,session,passkeys=0){return{sessionToken:session.token,expiresAt:session.expiresAt,profile:account,passkeys}};
async function phoneStart(req,env,p){
 let phone;try{phone=normalizePhone(p.phone)}catch{return error('Ingresá un celular válido');}
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await limited(env,'login-phone:'+phone,4,900)||!await limited(env,'login-ip:'+ip,12,900))return error('Demasiados intentos. Probá más tarde.',429);
 if(!await validPhoneGrant(env,phone,p.grant)&&!await challenge(req,env,p.turnstileToken))return error('Completá la comprobación de seguridad',403);
 const user=await accountByPhone(env,phone);
 if(!user)return ok({sent:false,recognized:false,message:'Si es tu primera visita, registrate con tu correo.'});
 const synthetic=new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({email:user.email,turnstileToken:p.turnstileToken})});
 const started=await beginOtp(synthetic,env,{captchaVerified:true});
 if(started.status!==200)return started;
 return ok({sent:true,recognized:true,maskedEmail:maskEmail(user.email),message:'Te enviamos un código al correo asociado a tu celular.'});
}
async function phoneFinish(req,env,p){
 let phone;try{phone=normalizePhone(p.phone)}catch{return error('Datos incorrectos');}
 const code=String(p.code??'');
 if(!/^\d{6}$/.test(code))return error('Ingresá el código de seis cifras');
 const user=await accountByPhone(env,phone);
 if(!user)return error('Código incorrecto o vencido',401);
 const challengeReq=new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({email:user.email,code})});
 const verified=await checkOtp(challengeReq,env);
 if(verified.status!==200)return verified;
 const consumeReq=new Request(req.url,{method:'POST',headers:{'X-Verification-Token':verified.data.verificationToken}});
 if(!await consumeVerifiedSession(consumeReq,env,user.email))return error('El código ya se utilizó',401);
 const session=await createCustomerSession(env,user.email);
 return ok(identityResult({name:user.name,phone:user.phone,email:user.email},session));
}
// La comprobación por celular NO crea sesión: Turnstile + cupos + comprobante efímero.
const encode64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
async function signHmac(env,data){
 if(!env.OTP_PEPPER||String(env.OTP_PEPPER).length<16)throw Error('Autenticación temporalmente no disponible');
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.OTP_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(data)));
}
async function phoneGrant(env,phone){
 const bytes=encoder.encode(JSON.stringify({phone,exp:now()+300,nonce:random().slice(0,16),v:1}));
 const part=encode64(bytes);
 return part+'.'+encode64(await signHmac(env,'via-phone-check:'+part));
}
async function validPhoneGrant(env,phone,grant){
 if(typeof grant!=='string'||grant.length>900||!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(grant))return false;
 try{
  const [part,sig]=grant.split('.');
  const j=JSON.parse(new TextDecoder().decode(decode64(part)));
  if(j.v!==1||j.phone!==phone||!Number.isInteger(j.exp)||j.exp<now()||j.exp>now()+300)return false;
  const a=await signHmac(env,'via-phone-check:'+part),b=decode64(sig);
  if(a.length!==b.length)return false;
  let delta=0;for(let i=0;i<a.length;i++)delta|=a[i]^b[i];
  return delta===0;
 }catch{return false}
}
async function identifyPhone(req,env,p){
 let phone;try{phone=normalizePhone(p.phone)}catch{return error('Ingresá un celular válido')}
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await limited(env,'check-phone:'+phone,8,900)||!await limited(env,'check-ip:'+ip,20,900))
  return error('Demasiadas consultas. Probá nuevamente más tarde.',429);
 if(!await challenge(req,env,p.turnstileToken))return error('Completá la comprobación de seguridad',403);
 const user=await accountByPhone(env,phone);
 if(!user)return ok({registered:false,grant:await phoneGrant(env,phone)});
 const configured=await env.DB.prepare('SELECT email FROM customer_pins WHERE email=?').bind(user.email).first();
 const passkey=await env.DB.prepare('SELECT COUNT(*) AS n FROM customer_passkeys WHERE email=?').bind(user.email).first();
 return ok({registered:true,maskedEmail:maskEmail(user.email),hasPin:!!configured,
  hasPasskey:Number(passkey?.n||0)>0,grant:await phoneGrant(env,phone)});
}
const pinValid=p=>/^\d{6}$/.test(String(p||''))&&!/^(\d)\1{5}$/.test(p)&&
 !['123456','654321','012345','111111','000000','121212','112233','123123','999999'].includes(String(p));
const pinDigest=(env,email,salt,pin)=>signHmac(env,'via-customer-pin-v1:'+email+':'+salt+':'+pin);
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
async function pinSet(req,env,p){
 const session=await customerSession(req,env);
 if(!session)return error('Ingresá a tu cuenta antes de configurar un PIN',401);
 if(!pinValid(p.pin))return error('Elegí seis cifras que no sean repetidas ni una secuencia',400);
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await limited(env,'pin-set:'+session.email,8,86400)||!await limited(env,'pin-set-ip:'+ip,20,86400))
  return error('Demasiados cambios. Probá mañana.',429);
 const salt=random().slice(0,32),digest=hex(await pinDigest(env,session.email,salt,p.pin));
 await env.DB.prepare('INSERT INTO customer_pins(email,salt,pin_hash,failed_attempts,locked_until,updated_at) VALUES (?,?,?,0,0,unixepoch()) ON CONFLICT(email) DO UPDATE SET salt=excluded.salt,pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=0,updated_at=excluded.updated_at')
  .bind(session.email,salt,digest).run();
 return ok({configured:true});
}
async function pinLogin(req,env,p){
 let phone;try{phone=normalizePhone(p.phone)}catch{return error('Credenciales incorrectas',401)}
 if(!/^\d{6}$/.test(String(p.pin||'')))return error('Credenciales incorrectas',401);
 if(!await validPhoneGrant(env,phone,p.grant))return error('Volvé a validar tu teléfono para continuar.',403);
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await limited(env,'pin-login-phone:'+phone,5,900)||!await limited(env,'pin-login-ip:'+ip,25,900))
  return error('Demasiados intentos. Recuperá el PIN por correo o intentá más tarde.',429);
 const user=await accountByPhone(env,phone);
 if(!user)return error('Credenciales incorrectas',401);
 const row=await env.DB.prepare('SELECT salt,pin_hash,failed_attempts,locked_until FROM customer_pins WHERE email=?').bind(user.email).first();
 if(!row)return error('Todavía no hay un PIN configurado. Entrá con el código por correo.',401);
 if(Number(row.locked_until)>now())return error('PIN temporalmente bloqueado. Podés recuperarlo por correo.',429);
 const trial=hex(await pinDigest(env,user.email,row.salt,p.pin));
 let delta=0;const a=encoder.encode(trial),b=encoder.encode(String(row.pin_hash));
 if(a.length!==b.length)delta=1;
 for(let i=0;i<Math.max(a.length,b.length);i++)delta|=(a[i]||0)^(b[i]||0);
 if(delta!==0){
  await env.DB.prepare('UPDATE customer_pins SET failed_attempts=CASE WHEN locked_until>0 AND locked_until<=unixepoch() THEN 1 ELSE failed_attempts+1 END, locked_until=CASE WHEN locked_until>0 AND locked_until<=unixepoch() THEN 0 WHEN failed_attempts+1>=5 THEN unixepoch()+900 ELSE locked_until END WHERE email=?')
   .bind(user.email).run();
  return error('Credenciales incorrectas',401);
 }
 await env.DB.prepare('UPDATE customer_pins SET failed_attempts=0,locked_until=0 WHERE email=?').bind(user.email).run();
 const session=await createCustomerSession(env,user.email);
 const passkeys=await env.DB.prepare('SELECT COUNT(*) AS n FROM customer_passkeys WHERE email=?').bind(user.email).first();
 return ok(identityResult({name:user.name,phone:user.phone,email:user.email},session,Number(passkeys?.n||0)));
}

async function enroll(req,env,p){
 let profile;try{profile=validProfile(p)}catch(e){return error(e.message)}
 const verifier=p.verificationToken;
 if(!/^[a-f0-9]{64}$/i.test(String(verifier||'')))return error('Primero verificá tu correo',401);
 const proof=new Request(req.url,{headers:{'X-Verification-Token':verifier}});
 if(!await consumeVerifiedSession(proof,env,profile.email))return error('Verificación vencida o utilizada',401);
 const already=await accountByPhone(env,profile.phone);
 if(already&&already.email!==profile.email)return error('Este celular ya está vinculado a otra cuenta. Ingresá con ese número o recuperá el acceso.',409);
 await env.DB.prepare("INSERT INTO customers(email,name,phone) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,updated_at=datetime('now')").bind(profile.email,profile.name,profile.phone).run();
 const session=await createCustomerSession(env,profile.email);
 return ok(identityResult(profile,session),201);
}
export async function customerRoutes(req,env,path,send){
 if(!path.startsWith('/api/customer/'))return null;
 const reply=(data,status=200)=>send(data,status);
 if(path==='/api/customer/me'&&req.method==='GET'){
  const session=await customerSession(req,env);
  if(!session)return reply({error:'Iniciá sesión para continuar'},401);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM customer_passkeys WHERE email=?').bind(session.email).first();
  return reply({profile:{name:session.name,phone:session.phone,email:session.email},passkeys:count?.n||0,expiresAt:session.expires_at});
 }
 if(path==='/api/customer/bookings'&&req.method==='GET'){
  const session=await customerSession(req,env);
  if(!session)return reply({error:'Acceso no autorizado'},401);
  // Las rutas pertenecen a la reserva; dos subconsultas indexadas evitan N peticiones HTTP
  // y nunca exponen un recorrido de una cuenta ajena.
  const rows=await env.DB.prepare("SELECT id,origin,destination,trip_date AS date,trip_time AS time,passengers,bags,notes,status,price_uyu AS price,created_at,updated_at,"+
   "(SELECT distance_m FROM booking_routes WHERE booking_id=bookings.id AND provider='geoapify') AS route_distance_m,"+
   "(SELECT duration_s FROM booking_routes WHERE booking_id=bookings.id AND provider='geoapify') AS route_duration_s "+(hourlyEnabled(env)?hourlySelect('bookings'):'')+
   " FROM bookings WHERE email=? ORDER BY created_at DESC LIMIT 100").bind(session.email).all();
  return reply((rows.results||[]).map(row=>{
   const {route_distance_m,route_duration_s,...booking}=row;
   const {service_type,requested_duration_minutes,itinerary_notes,included_duration_minutes,included_km,extra_time_terms,extra_km_terms,quote_notes,...safe}=booking;
   return {...safe,...hourlyFields(booking),route:Number(route_distance_m)>0&&Number(route_duration_s)>0?
    {distanceKm:Math.round(Number(route_distance_m)/100)/10,
     durationMinutes:Math.ceil(Number(route_duration_s)/60),
     estimate:true,trafficIncluded:false}:null};
  }));
 }
 if(path==='/api/customer/logout'&&req.method==='POST'){
  const token=(req.headers.get('Authorization')||'').match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if(token)await env.DB.prepare('UPDATE customer_sessions SET revoked_at=unixepoch() WHERE token_hash=?').bind(await sha(token.toLowerCase())).run();
  return reply({signedOut:true});
 }
 if(req.method!=='POST')return null;
 // No consumir el cuerpo de rutas ajenas, en especial WebAuthn/passkeys.
 if(!new Set(['/api/customer/session','/api/customer/phone/identify','/api/customer/pin/set',
   '/api/customer/pin/login','/api/customer/login/start','/api/customer/login/verify']).has(path))return null;
 let p;try{p=await parse(req)}catch{return reply({error:'Datos incorrectos'},400)}
 if(path==='/api/customer/session'){
  const r=await enroll(req,env,p);return reply(r.data,r.status);
 }
 if(path==='/api/customer/phone/identify'){
  const r=await identifyPhone(req,env,p);return reply(r.data,r.status);
 }
 if(path==='/api/customer/pin/set'){
  const r=await pinSet(req,env,p);return reply(r.data,r.status);
 }
 if(path==='/api/customer/pin/login'){
  const r=await pinLogin(req,env,p);return reply(r.data,r.status);
 }
 if(path==='/api/customer/login/start'){
  const r=await phoneStart(req,env,p);return reply(r.data,r.status);
 }
 if(path==='/api/customer/login/verify'){
  const r=await phoneFinish(req,env,p);return reply(r.data,r.status);
 }
 return null;
}
