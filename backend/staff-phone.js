// Vía Traslados: acceso con celular + contraseña, correo verificado y
// credencial renovable que Android cifra con una clave biométrica en el Keystore.
// Módulo separado para no alterar el sistema de reservas ni las cuentas de pasajeros.
import {normalizeEmail} from './auth.js';
const enc = new TextEncoder();
const bytesToHex = bytes => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const hash = async input => bytesToHex(await crypto.subtle.digest('SHA-256',enc.encode(input)));
const random = n=>bytesToHex(crypto.getRandomValues(new Uint8Array(n)));
const now = ()=>Math.floor(Date.now()/1000);
const strongEqual=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let k=0;for(let i=0;i<a.length;i++)k|=a.charCodeAt(i)^b.charCodeAt(i);return k===0;};
const KDF_ITERATIONS=100000; // límite admitido por WebCrypto en Workers
const OTP_TTL=600;
const ACCESS_TTL=12*3600;
const REFRESH_TTL=30*86400;
const emailMask=email=>{const [u,d]=email.split('@');return u.slice(0,2)+'•••@'+d;};
// La titularidad nunca se decide desde la APK ni por orden de llegada.
// Se requieren teléfono y correo del fundador configurados en el Worker;
// la prueba de posesión del correo se hace mediante OTP antes de elevar el rol.
function isFounder(env,user){
 if(!env.VIA_FOUNDER_PHONE||!env.VIA_FOUNDER_EMAIL)return false;
 try{
  return user.phone===normalizeStaffPhone(env.VIA_FOUNDER_PHONE)
    &&user.email===normalizeEmail(env.VIA_FOUNDER_EMAIL);
 }catch{return false}
}
async function activateFounder(env,user){
 if(!isFounder(env,user)||user.status==='blocked')return false;
 if(user.role==='admin'&&user.status==='approved')return true;
 const result=await env.DB.prepare("UPDATE staff_users SET role='admin',status='approved',approved_at=unixepoch(),updated_at=unixepoch() WHERE id=? AND role='driver' AND status IN ('pending','approved')")
  .bind(user.id).run();
 if((result?.meta?.changes||0)>0){
  await env.DB.prepare('INSERT INTO admin_audit(actor_id,action,target,detail) VALUES (?,?,?,?)')
   .bind(user.id,'founder-activated',user.id,'Cuenta fundadora activada mediante verificación autenticada').run();
  return true;
 }
 return false;
}

export function normalizeStaffPhone(value){
 if(typeof value!=='string')throw Error('Celular inválido');
 let valueClean=value.trim();
 if(!/^[+\d() .-]{8,30}$/.test(valueClean))throw Error('Celular inválido');
 valueClean=valueClean.replace(/[() .-]/g,'');
 let number;
 if(/^09\d{7}$/.test(valueClean))number='+598'+valueClean.slice(1);
 else if(/^5989\d{7}$/.test(valueClean))number='+'+valueClean;
 else if(/^\+5989\d{7}$/.test(valueClean))number=valueClean;
 else if(/^\+[1-9]\d{7,14}$/.test(valueClean))number=valueClean;
 else throw Error('Ingresá tu celular, por ejemplo 099 123 456');
 return number;
}

async function parseJson(req){
 if(Number(req.headers.get('Content-Length')||0)>4000)throw Error('Datos demasiado extensos');
 const raw=await req.text();if(raw.length>4000)throw Error('Datos demasiado extensos');
 const data=JSON.parse(raw);
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Datos inválidos');
 return data;
}
function validateFields(input){
 const name=String(input.name||'').trim().replace(/\s+/g,' ');
 if(name.length<3||name.length>100)throw Error('Ingresá tu nombre y apellido');
 const email=normalizeEmail(input.email);
 const phone=normalizeStaffPhone(input.phone);
 const password=input.password;
 if(typeof password!=='string'||password.length<12||password.length>128)throw Error('La contraseña debe tener entre 12 y 128 caracteres');
 return {name,email,phone,password};
}
async function secretHash(password,salt,iterations=KDF_ITERATIONS){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 return bytesToHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g).map(v=>parseInt(v,16))),iterations,hash:'SHA-256'},key,256));
}
async function otpHash(env,staffId,code){
 const key=await crypto.subtle.importKey('raw',enc.encode(env.OTP_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return bytesToHex(await crypto.subtle.sign('HMAC',key,enc.encode('via-staff-email:'+staffId+':'+code)));
}
function newOtp(){
 const b=new Uint32Array(1);
 crypto.getRandomValues(b);
 return String(100000+(b[0]%900000));
}
async function limit(env,scope,max,windowSeconds){
 const k=await hash('via-phone:'+scope);
 const row=await env.DB.prepare('INSERT INTO otp_rate_limits (rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts')
  .bind(k,windowSeconds,windowSeconds).first();
 return Number(row?.attempts||0)<=max;
}
const ip=req=>(req.headers.get('CF-Connecting-IP')||'unknown').slice(0,72);
async function emailCode(env,staffId,email){
 if(!env.RESEND_API_KEY||!env.RESEND_FROM||!env.OTP_PEPPER||env.OTP_PEPPER.length<32)return false;
 const code=newOtp(),digest=await otpHash(env,staffId,code);
 await env.DB.prepare('INSERT INTO staff_email_codes(staff_id,code_hash,expires_at,attempts,sent_at) VALUES (?,?,unixepoch()+600,0,unixepoch()) ON CONFLICT(staff_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at')
  .bind(staffId,digest).run();
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',
   headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'via-staff-'+crypto.randomUUID()},
   body:JSON.stringify({from:env.RESEND_FROM,to:[email],subject:'Verificá tu cuenta · Vía Traslados',text:'Código de verificación de tu cuenta de Vía Traslados: '+code+'\nVence dentro de 10 minutos. No compartas este código.'})});
  if(response.ok)return true;
 }catch{}
 await env.DB.prepare('DELETE FROM staff_email_codes WHERE staff_id=? AND code_hash=?').bind(staffId,digest).run();
 return false;
}
async function createUser(env,payload,role){
 const {name,email,phone,password}=validateFields(payload);
 const salt=random(16),passHash=await secretHash(password,salt),id=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status,approved_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id,email,name,salt,passHash,KDF_ITERATIONS,role,role==='admin'?'approved':'pending',role==='admin'?now():null),
  env.DB.prepare('INSERT INTO staff_contacts(staff_id,phone,email_verified_at) VALUES (?,?,NULL)').bind(id,phone),
  env.DB.prepare('INSERT INTO admin_audit(actor_id,action,target,detail) VALUES (?,?,?,?)').bind(role==='admin'?'master':'self-register',role==='admin'?'admin-bootstrap-phone':'driver-register-phone',id,'Registro pendiente de verificación del correo')
 ]);
 const sent=await emailCode(env,id,email);
 return {id,email:emailMask(email),phone,role,status:role==='admin'?'approved':'pending',emailVerificationRequired:true,emailSent:sent};
}
async function issueSession(env,staffId,user){
 const token=random(32),refreshToken=random(32);
 await env.DB.batch([
  env.DB.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES (?,?,?)').bind(await hash(token),staffId,now()+ACCESS_TTL),
  env.DB.prepare('INSERT INTO staff_refresh_tokens(token_hash,staff_id,expires_at) VALUES (?,?,?)').bind(await hash(refreshToken),staffId,now()+REFRESH_TTL)
 ]);
 return {token,refreshToken,expiresIn:ACCESS_TTL,refreshExpiresIn:REFRESH_TTL,
  user:{id:user.id,name:user.display_name,email:user.email,phone:user.phone,role:user.role,status:user.status,
   capabilities:{manageTeam:!!user.email_verified_at&&user.role==='admin'&&user.status==='approved'&&isFounder(env,user)}}};
}
export async function staffPhoneRoutes(req,env,path,send,err){
 if(!path.startsWith('/api/staff/')&&path!=='/api/admin/bootstrap-phone')return null;
 if(path==='/api/staff/register-phone'&&req.method==='POST'){
  if(!await limit(env,'register-ip:'+ip(req),5,3600))return err('Demasiados registros. Intentá más tarde.',429);
  let payload;try{payload=await parseJson(req)}catch(e){return err('Datos incorrectos',400)}
  try {const user=await createUser(env,payload,'driver');return send(user,201)}
  catch(e){if(/UNIQUE|constraint failed/i.test(String(e)))return err('Ese teléfono o correo ya está registrado',409);if(/Celular|contraseña|correo|nombre|datos/i.test(e.message))return err(e.message,400);throw e}
 }
 if(path==='/api/admin/bootstrap-phone'&&req.method==='POST'){
  const k=req.headers.get('X-Operator-Key')||'';
  if(!env.OPERATOR_KEY_HASH||!k||k.length>512||!strongEqual(await hash(k),env.OPERATOR_KEY_HASH.toLowerCase()))return err('Se requiere la clave maestra',403);
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM staff_users WHERE role='admin'").first();
  if(Number(count?.n)>0)return err('Ya existe un administrador principal',409);
  let payload;try{payload=await parseJson(req)}catch{return err('Datos incorrectos',400)}
  try{const user=await createUser(env,payload,'admin');return send(user,201)}
  catch(e){if(/UNIQUE|constraint failed/i.test(String(e)))return err('Ese teléfono o correo ya está registrado',409);if(/Celular|contraseña|correo|nombre|datos/i.test(e.message))return err(e.message,400);throw e}
 }
 if(path==='/api/admin/link-phone'&&req.method==='POST'){
  // Compatible con administradores creados en la APK anterior, sin borrarlos.
  const secret=req.headers.get('X-Operator-Key')||'';
  if(!env.OPERATOR_KEY_HASH||!secret||secret.length>512||
     !strongEqual(await hash(secret),env.OPERATOR_KEY_HASH.toLowerCase()))
     return err('Se requiere la clave maestra',403);
  let p,email,phone;
  try{p=await parseJson(req);email=normalizeEmail(p.email);phone=normalizeStaffPhone(p.phone)}
  catch(e){return err(e.message||'Datos inválidos',400)}
  const row=await env.DB.prepare("SELECT id FROM staff_users WHERE email=? AND role='admin'").bind(email).first();
  if(!row)return err('No existe un administrador con ese correo',404);
  const existing=await env.DB.prepare('SELECT phone,email_verified_at FROM staff_contacts WHERE staff_id=?').bind(row.id).first();
  if(existing && existing.phone!==phone)return err('El administrador ya tiene otro celular. Revisá la cuenta antes de reemplazarlo.',409);
  if(!existing){
   try{await env.DB.prepare('INSERT INTO staff_contacts(staff_id,phone,email_verified_at) VALUES (?,?,NULL)').bind(row.id,phone).run()}
   catch(e){if(/UNIQUE|constraint/i.test(String(e)))return err('Celular ya registrado',409);throw e}
  }
  const sent=existing?.email_verified_at?false:await emailCode(env,row.id,email);
  return send({linked:true,emailVerificationRequired:!existing?.email_verified_at,emailSent:sent});
 }
 if(path==='/api/staff/resend-email'&&req.method==='POST'){
  let p,email;try{p=await parseJson(req);email=normalizeEmail(p.email)}catch{return err('Correo inválido',400)}
  if(!await limit(env,'resend-email-ip:'+ip(req),8,3600)||!await limit(env,'resend-email:'+email,3,3600))return err('Demasiados códigos solicitados',429);
  const row=await env.DB.prepare('SELECT u.id,c.email_verified_at FROM staff_users u JOIN staff_contacts c ON c.staff_id=u.id WHERE u.email=?').bind(email).first();
  if(row&&!row.email_verified_at){
   const last=await env.DB.prepare('SELECT sent_at FROM staff_email_codes WHERE staff_id=?').bind(row.id).first();
   if(last&&now()-last.sent_at<60)return send({requested:true,waitSeconds:60});
   await emailCode(env,row.id,email);
  }
  return send({requested:true,message:'Si el correo está registrado y pendiente de verificación, llegará un código.'});
 }
 if(path==='/api/staff/verify-email'&&req.method==='POST'){
  let p,email,code;
  try{p=await parseJson(req);email=normalizeEmail(p.email);code=String(p.code||'');if(!/^\d{6}$/.test(code))return err('Ingresá seis cifras',400)}
  catch{return err('Datos inválidos',400)}
  if(!await limit(env,'verify-email-ip:'+ip(req),30,900)||!await limit(env,'verify-email:'+email,10,900))return err('Demasiados intentos',429);
  const row=await env.DB.prepare('SELECT u.id,u.email,u.role,u.status,c.phone,c.email_verified_at FROM staff_users u JOIN staff_contacts c ON c.staff_id=u.id WHERE u.email=?').bind(email).first();
  if(!row)return err('Código inválido o vencido',401);
  if(row.email_verified_at){
   // No revelar el rol o la existencia de la cuenta fundadora a quien
   // conoce solo su dirección de correo. La promoción exige login con clave.
   return send({emailVerified:true,approvalRequired:true});
  }
  const attempt=await env.DB.prepare('UPDATE staff_email_codes SET attempts=attempts+1 WHERE staff_id=? AND attempts<5 AND expires_at>unixepoch() RETURNING code_hash').bind(row.id).first();
  if(!attempt||!strongEqual(await otpHash(env,row.id,code),attempt.code_hash))return err('Código inválido o vencido',401);
  await env.DB.batch([
   env.DB.prepare('UPDATE staff_contacts SET email_verified_at=unixepoch() WHERE staff_id=? AND email_verified_at IS NULL').bind(row.id),
   env.DB.prepare('DELETE FROM staff_email_codes WHERE staff_id=?').bind(row.id),
   env.DB.prepare('INSERT INTO admin_audit(actor_id,action,target,detail) VALUES (?,?,?,?)').bind(row.id,'email-verified',row.id,'Email confirmado por código OTP')
  ]);
  const founder=await activateFounder(env,row);
  return send({emailVerified:true,approvalRequired:!founder&&row.role!=='admin',role:founder?'admin':row.role,accountReady:founder||row.role==='admin'});
 }
 if(path==='/api/staff/login-phone'&&req.method==='POST'){
  let p,phone,password;
  try{p=await parseJson(req);phone=normalizeStaffPhone(p.phone);password=String(p.password||'');if(password.length>128)throw Error('Clave inválida')}
  catch{return err('Celular o contraseña incorrectos',401)}
  if(!await limit(env,'login-phone-ip:'+ip(req),18,900)||!await limit(env,'login-phone:'+phone,10,900))return err('Demasiados intentos. Intentá más tarde.',429);
  const row=await env.DB.prepare('SELECT u.*,c.phone,c.email_verified_at FROM staff_contacts c JOIN staff_users u ON u.id=c.staff_id WHERE c.phone=?').bind(phone).first();
  if(!row||!password)return err('Celular o contraseña incorrectos',401);
  const derived=await secretHash(password,row.password_salt,Number(row.iterations));
  if(!strongEqual(derived,row.password_hash))return err('Celular o contraseña incorrectos',401);
  if(!row.email_verified_at)return err('Primero verificá tu correo electrónico',403);
  // Una cuenta previa ya verificada, con contraseña correcta, se reconoce
  // en el primer ingreso tras habilitar el fundador en el Worker.
  // Nunca promovemos cuentas bloqueadas.
  if(row.status!=='blocked' && await activateFounder(env,row)){
   row.role='admin';row.status='approved';
  }
  if(row.status!=='approved')return err(row.status==='pending'?'Cuenta pendiente de aprobación':'Cuenta bloqueada',403);
  return send(await issueSession(env,row.id,row));
 }
 if(path==='/api/staff/refresh'&&req.method==='POST'){
  let p,key;
  try{p=await parseJson(req);key=String(p.refreshToken||'');if(!/^[a-f0-9]{64}$/i.test(key))throw Error('invalid')}
  catch{return err('Sesión vencida. Ingresá con tu contraseña',401)}
  const row=await env.DB.prepare("SELECT u.id,u.email,u.display_name,u.role,u.status,c.phone,c.email_verified_at FROM staff_refresh_tokens r JOIN staff_users u ON u.id=r.staff_id JOIN staff_contacts c ON c.staff_id=u.id WHERE r.token_hash=? AND r.revoked_at IS NULL AND r.expires_at>unixepoch() AND u.status='approved' AND c.email_verified_at IS NOT NULL").bind(await hash(key)).first();
  if(!row)return err('Sesión vencida o revocada',401);
  const token=random(32);
  await env.DB.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES (?,?,?)').bind(await hash(token),row.id,now()+ACCESS_TTL).run();
  return send({token,expiresIn:ACCESS_TTL,user:{id:row.id,name:row.display_name,email:row.email,phone:row.phone,role:row.role,status:row.status,
   capabilities:{manageTeam:!!row.email_verified_at&&row.role==='admin'&&row.status==='approved'&&isFounder(env,row)}}});
 }
 if(path==='/api/staff/logout-device'&&req.method==='POST'){
  let p;try{p=await parseJson(req)}catch{p={}}
  const refresh=String(p.refreshToken||'');
  if(/^[a-f0-9]{64}$/i.test(refresh))await env.DB.prepare('UPDATE staff_refresh_tokens SET revoked_at=unixepoch() WHERE token_hash=?').bind(await hash(refresh)).run();
  const bearer=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.get('Authorization')||'');
  if(bearer)await env.DB.prepare('UPDATE staff_sessions SET revoked_at=unixepoch() WHERE token_hash=?').bind(await hash(bearer[1])).run();
  return send({ok:true});
 }
 return null;
}
