// Vía Traslados — auth de equipo y controles administrativos para D1.
// La contraseña maestra legacy solo sirve como recuperación/arranque del administrador.
// Nunca se devuelve un hash, sal ni token de otras personas.
import {normalizeEmail} from './auth.js';

const TE=new TextEncoder();
const HEX=a=>Array.from(new Uint8Array(a)).map(v=>v.toString(16).padStart(2,'0')).join('');
const sha=async x=>HEX(await crypto.subtle.digest('SHA-256',TE.encode(x)));
const rand=(n=32)=>HEX(crypto.getRandomValues(new Uint8Array(n)));
const now=()=>Math.floor(Date.now()/1000);
const ITERATIONS=150000;
const EQUAL=(x,y)=>{if(typeof x!=='string'||typeof y!=='string'||x.length!==y.length)return false;let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0};
const allowedStatus=new Set(['approved','blocked']);
function bodyLimit(req,max=3500) {
 if(Number(req.headers.get('Content-Length')||0)>max)throw Error('Datos demasiado extensos');
 return req.text().then(raw=>{
   if(raw.length>max)throw Error('Datos demasiado extensos');
   const j=JSON.parse(raw);
   if(!j||typeof j!=='object'||Array.isArray(j))throw Error('Datos inválidos');
   return j;
 });
}
function cleanName(name){const s=String(name??'').trim().replace(/\s+/g,' ');if(s.length<3||s.length>100)throw Error('Ingresá un nombre entre 3 y 100 caracteres');return s}
function cleanPassword(p){if(typeof p!=='string'||p.length<12||p.length>128)throw Error('La contraseña debe tener entre 12 y 128 caracteres');return p}
async function derive(password,salt,iterations){
 const key=await crypto.subtle.importKey('raw',TE.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g).map(x=>parseInt(x,16))),iterations,hash:'SHA-256'},key,256);
 return HEX(bits);
}
async function hashPassword(password) {
 const salt=rand(16);
 return {salt,hash:await derive(password,salt,ITERATIONS),iterations:ITERATIONS};
}
async function throttle(env,scope,limit,seconds) {
 const k=await sha('staff:'+scope);
 const row=await env.DB.prepare('INSERT INTO otp_rate_limits (rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(k,seconds,seconds).first();
 return Number(row?.attempts||0)<=limit;
}
const publicStaff=x=>({id:x.id,name:x.display_name,email:x.email,role:x.role,status:x.status,createdAt:x.created_at,updatedAt:x.updated_at});
const ip=req=>(req.headers.get('CF-Connecting-IP')||'unknown').slice(0,72);

export async function identity(req,env){
 const master=req.headers.get('X-Operator-Key')||'';
 if(master&&master.length<=512&&env.OPERATOR_KEY_HASH&&EQUAL(await sha(master),env.OPERATOR_KEY_HASH.toLowerCase()))
   return {id:'master',name:'Administrador principal',email:null,role:'admin',status:'approved',master:true};
 const auth=req.headers.get('Authorization')||'';
 const token=/^Bearer ([a-f0-9]{64})$/i.exec(auth);
 if(!token||!env.DB)return null;
 const row=await env.DB.prepare("SELECT u.id,u.email,u.display_name,u.role,u.status FROM staff_sessions s JOIN staff_users u ON u.id=s.staff_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>unixepoch() AND u.status='approved'").bind(await sha(token[1])).first();
 return row?{...publicStaff(row),master:false}:null;
}

export async function webEnabled(env){
 const row=await env.DB.prepare('SELECT setting_value FROM service_settings WHERE setting_key=?').bind('public_web_enabled').first();
 return row?.setting_value!=='0';
}

async function audit(env,actor,action,target,detail=''){
 await env.DB.prepare('INSERT INTO admin_audit(actor_id,action,target,detail) VALUES (?,?,?,?)').bind(actor.id,action,target,String(detail).slice(0,400)).run();
}
async function createStaff(env,name,email,password,role,status){
 let pass;
 try {pass=await hashPassword(password)}catch(e){console.error('via-staff', 'PASSWORD_DERIVE',e?.name);throw Object.assign(new Error('Alta no disponible'),{phase:'KDF_'+String(e?.name||'ERROR').slice(0,32)})}
 const id=crypto.randomUUID();
 try {
  await env.DB.prepare('INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status,approved_at) VALUES (?,?,?,?,?,?,?,?,?)')
   .bind(id,email,name,pass.salt,pass.hash,pass.iterations,role,status,status==='approved'?now():null).run();
 }catch(e){if(String(e).includes('UNIQUE'))throw e;console.error('via-staff','STAFF_INSERT',e?.name);throw Object.assign(new Error('Alta no disponible'),{phase:'D1_INSERT'})}
 return {id,email,name,role,status};
}

export async function staffRoutes(req,env,path,send,err){
 if(path==='/api/public/status'&&req.method==='GET'){
   return send({enabled:await webEnabled(env)});
 }
 if(path==='/api/staff/register'&&req.method==='POST'){
   try{if(!await throttle(env,'register-ip:'+ip(req),5,3600))return err('Demasiados registros. Intentá más tarde.',429)}catch(e){console.error('via-staff','RATE_LIMIT',e?.name);return err('Registro no disponible (R1)',503)}
   let p,name,email,password;
   try{p=await bodyLimit(req);name=cleanName(p.name);email=normalizeEmail(p.email);password=cleanPassword(p.password)}
   catch(e){return err(e.message||'Datos inválidos',400)}
   try{
     const user=await createStaff(env,name,email,password,'driver','pending');
     await audit(env,{id:'self-register'},'driver-register',user.id,'Solicitud pendiente de aprobación');
     return send({registered:true,status:'pending',message:'Tu cuenta está pendiente de aprobación del administrador.'},201);
   }catch(e){if(String(e).includes('UNIQUE'))return err('Ese correo ya está registrado',409);console.error('via-staff','REGISTRATION',e?.phase||e?.name);return err('No se pudo crear la cuenta ('+(e?.phase||'AUDIT')+')',500)}
 }
 if(path==='/api/staff/login'&&req.method==='POST'){
   let p,email,password;
   try{p=await bodyLimit(req);email=normalizeEmail(p.email);password=String(p.password||'');if(password.length>128)throw Error('Acceso incorrecto')}
   catch{return err('Correo o contraseña incorrectos',401)}
   if(!await throttle(env,'login-ip:'+ip(req),18,900)||!await throttle(env,'login-email:'+email,10,900))
     return err('Demasiados intentos. Probá más tarde.',429);
   const row=await env.DB.prepare('SELECT * FROM staff_users WHERE email=?').bind(email).first();
   if(!row||!row.password_hash||!row.password_salt||!password)return err('Correo o contraseña incorrectos',401);
   const hash=await derive(password,row.password_salt,Number(row.iterations));
   if(!EQUAL(hash,row.password_hash))return err('Correo o contraseña incorrectos',401);
   if(row.status!=='approved')return err(row.status==='pending'?'Tu cuenta está esperando aprobación.':'La cuenta está bloqueada.',403);
   const token=rand();
   await env.DB.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES (?,?,?)').bind(await sha(token),row.id,now()+12*3600).run();
   return send({token,expiresIn:12*3600,user:publicStaff(row)});
 }
 if(path==='/api/admin/bootstrap'&&req.method==='POST'){
   const actor=await identity(req,env);
   if(!actor?.master)return err('Se requiere la clave maestra',403);
   let p,name,email,password;
   try{p=await bodyLimit(req);name=cleanName(p.name);email=normalizeEmail(p.email);password=cleanPassword(p.password)}
   catch(e){return err(e.message||'Datos inválidos')}
   const existing=await env.DB.prepare("SELECT COUNT(*) AS n FROM staff_users WHERE role='admin'").first();
   if(Number(existing?.n)>0)return err('El administrador ya está registrado',409);
   const pass=await hashPassword(password),id=crypto.randomUUID();
   const result=await env.DB.prepare("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status,approved_at) SELECT ?,?,?,?,?,?,'admin','approved',unixepoch() WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE role='admin')").bind(id,email,name,pass.salt,pass.hash,pass.iterations).run();
   if(result.meta.changes!==1)return err('El administrador ya fue registrado',409);
   await audit(env,actor,'admin-bootstrap',id,'Administrador creado');
   return send({created:true,id,email},201);
 }
 if(path==='/api/staff/me'&&req.method==='GET'){
   const actor=await identity(req,env);
   return actor?send({user:actor}):err('No autorizado',401);
 }
 if(path==='/api/staff/logout'&&req.method==='POST'){
   const bearer=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.get('Authorization')||'');
   if(bearer)await env.DB.prepare('UPDATE staff_sessions SET revoked_at=unixepoch() WHERE token_hash=?').bind(await sha(bearer[1])).run();
   return send({ok:true});
 }
 if(!path.startsWith('/api/admin/'))return null;
 const actor=await identity(req,env);
 if(actor?.role!=='admin')return err('Solo el administrador puede realizar esta operación',403);
 if(path==='/api/admin/drivers'&&req.method==='GET'){
   const users=await env.DB.prepare("SELECT id,email,display_name,role,status,created_at,updated_at FROM staff_users WHERE role='driver' ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC LIMIT 250").all();
   return send({drivers:users.results.map(publicStaff)});
 }
 const driver=path.match(/^\/api\/admin\/drivers\/([a-f0-9-]{36})$/i);
 if(driver&&req.method==='PATCH'){
   let p;try{p=await bodyLimit(req)}catch{return err('Datos inválidos')}
   if(!allowedStatus.has(p.status))return err('Estado inválido');
   const row=await env.DB.prepare("SELECT id,status FROM staff_users WHERE id=? AND role='driver'").bind(driver[1]).first();
   if(!row)return err('Conductor no encontrado',404);
   await env.DB.prepare("UPDATE staff_users SET status=?,updated_at=unixepoch(),approved_at=CASE WHEN ?='approved' THEN unixepoch() ELSE approved_at END WHERE id=? AND role='driver'").bind(p.status,p.status,driver[1]).run();
   if(p.status==='blocked')await env.DB.prepare('UPDATE staff_sessions SET revoked_at=unixepoch() WHERE staff_id=?').bind(driver[1]).run();
   await audit(env,actor,'driver-status',driver[1],row.status+' -> '+p.status);
   return send({id:driver[1],status:p.status});
 }
 if(path==='/api/admin/settings'&&req.method==='GET'){
   const enabled=await webEnabled(env);
   const counts=await env.DB.prepare("SELECT status,COUNT(*) as total FROM staff_users WHERE role='driver' GROUP BY status").all();
   return send({publicEnabled:enabled,drivers:counts.results});
 }
 if(path==='/api/admin/settings'&&req.method==='PATCH'){
   let p;try{p=await bodyLimit(req)}catch{return err('Datos inválidos')}
   if(typeof p.publicEnabled!=='boolean')return err('Valor inválido');
   const before=await webEnabled(env);
   if(before===p.publicEnabled)return send({publicEnabled:before,unchanged:true});
   await env.DB.prepare("INSERT INTO service_settings(setting_key,setting_value,updated_at,updated_by) VALUES ('public_web_enabled',?,unixepoch(),?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(p.publicEnabled?'1':'0',actor.id).run();
   await audit(env,actor,'public-web-switch','viatraslados.com',before+' -> '+p.publicEnabled);
   return send({publicEnabled:p.publicEnabled});
 }
 const assign=path.match(/^\/api\/admin\/requests\/([A-Z0-9-]+)\/assign$/);
 if(assign&&req.method==='POST'){
   let p;try{p=await bodyLimit(req)}catch{return err('Datos inválidos')}
   const booking=await env.DB.prepare("SELECT id,status FROM bookings WHERE id=?").bind(assign[1]).first();
   if(!booking)return err('Solicitud no encontrada',404);
   if(!['requested','quoted'].includes(booking.status))return err('Solo se puede asignar antes de la aceptación',409);
   if(p.driverId===null){
     await env.DB.prepare('DELETE FROM driver_assignments WHERE booking_id=?').bind(assign[1]).run();
     await audit(env,actor,'unassign',assign[1]);
     return send({bookingId:assign[1],driverId:null});
   }
   if(typeof p.driverId!=='string')return err('Conductor inválido');
   const user=await env.DB.prepare("SELECT id FROM staff_users WHERE id=? AND role='driver' AND status='approved'").bind(p.driverId).first();
   if(!user)return err('Conductor no aprobado',409);
   await env.DB.prepare('INSERT INTO driver_assignments(booking_id,driver_id,assigned_by) VALUES (?,?,?) ON CONFLICT(booking_id) DO UPDATE SET driver_id=excluded.driver_id,assigned_by=excluded.assigned_by,assigned_at=unixepoch()').bind(assign[1],user.id,actor.id).run();
   await audit(env,actor,'assign',assign[1],user.id);
   return send({bookingId:assign[1],driverId:user.id});
 }
 if(path==='/api/admin/audit'&&req.method==='GET'){
   const rows=await env.DB.prepare('SELECT actor_id,action,target,detail,created_at FROM admin_audit ORDER BY id DESC LIMIT 100').all();
   return send({events:rows.results});
 }
 return err('Ruta administrativa no encontrada',404);
}
