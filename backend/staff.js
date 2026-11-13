// Vía Traslados — auth de equipo y controles administrativos para D1.
// La contraseña maestra legacy solo sirve como recuperación/arranque del administrador.
// Nunca se devuelve un hash, sal ni token de otras personas.
import {normalizeEmail} from './auth.js';
import {normalizeStaffPhone as normalizeFounderPhone} from './staff-phone.js';
import {ASSIGNABLE_STATUSES,assignmentError,occupiedInterval,scheduleConflicts} from './assignment-rules.js';

const TE=new TextEncoder();
const HEX=a=>Array.from(new Uint8Array(a)).map(v=>v.toString(16).padStart(2,'0')).join('');
const sha=async x=>HEX(await crypto.subtle.digest('SHA-256',TE.encode(x)));
const rand=(n=32)=>HEX(crypto.getRandomValues(new Uint8Array(n)));
const now=()=>Math.floor(Date.now()/1000);
// Cloudflare Workers limita WebCrypto PBKDF2 a 100.000 iteraciones por operación.
const ITERATIONS=100000;
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
const publicStaff=x=>({id:x.id,name:x.display_name,email:x.email,phone:x.phone||null,emailVerified:Boolean(x.email_verified_at),role:x.role,status:x.status,createdAt:x.created_at,updatedAt:x.updated_at,vehicle:x.license_plate!==undefined?{plate:x.license_plate||null,make:x.make||null,model:x.model||null,passengerCapacity:x.passenger_capacity??null,luggageCapacity:x.luggage_capacity??null}:null});
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
 // Solo el fundador, identificado por cuenta autenticada y par teléfono/correo
 // previamente configurado, puede conceder o retirar permisos administrativos.
 async function founderAuthorized(){
  if(actor.master||!actor.id||!env.VIA_FOUNDER_PHONE||!env.VIA_FOUNDER_EMAIL)return false;
  try{
   const contact=await env.DB.prepare('SELECT phone,email_verified_at FROM staff_contacts WHERE staff_id=?').bind(actor.id).first();
   return !!contact?.email_verified_at && contact.phone===normalizeFounderPhone(env.VIA_FOUNDER_PHONE)
    &&actor.email===normalizeEmail(env.VIA_FOUNDER_EMAIL);
  }catch{return false}
 }
 if(path==='/api/admin/team'&&req.method==='GET'){
  if(!await founderAuthorized())return err('Solo el administrador fundador puede gestionar otros administradores',403);
  const result=await env.DB.prepare("SELECT u.id,u.email,u.display_name,u.role,u.status,u.created_at,u.updated_at,c.phone,c.email_verified_at FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id WHERE u.role='admin' ORDER BY u.created_at ASC LIMIT 50").all();
  return send({admins:result.results.map(publicStaff),canManageRoles:true,founderId:actor.id});
 }
 const roleMatch=path.match(/^\/api\/admin\/team\/([a-f0-9-]{36})\/role$/i);
 if(roleMatch&&req.method==='PATCH'){
  if(!await founderAuthorized())return err('Solo el administrador fundador puede gestionar otros administradores',403);
  if(roleMatch[1]===actor.id)return err('No podés retirar tu propia cuenta fundadora',409);
  let p;try{p=await bodyLimit(req)}catch{return err('Datos inválidos',400)}
  if(p.role!=='admin'&&p.role!=='driver')return err('Rol inválido',400);
  const target=await env.DB.prepare('SELECT u.id,u.role,u.status,c.email_verified_at FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id WHERE u.id=?').bind(roleMatch[1]).first();
  if(!target)return err('Cuenta no encontrada',404);
  if(target.status!=='approved'||!target.email_verified_at)return err('La cuenta debe estar aprobada y con correo verificado',409);
  if(target.role===p.role)return send({id:target.id,role:target.role,unchanged:true});
  const update=await env.DB.prepare('UPDATE staff_users SET role=?,updated_at=unixepoch() WHERE id=? AND role=? AND status=?')
   .bind(p.role,target.id,target.role,'approved').run();
  if(update.meta?.changes!==1)return err('La cuenta cambió. Actualizá y volvé a intentar.',409);
  await env.DB.batch([
   env.DB.prepare('UPDATE staff_sessions SET revoked_at=unixepoch() WHERE staff_id=?').bind(target.id),
   env.DB.prepare('UPDATE staff_refresh_tokens SET revoked_at=unixepoch() WHERE staff_id=?').bind(target.id)
  ]);
  await audit(env,actor,'team-role',target.id,target.role+' -> '+p.role);
  return send({id:target.id,role:p.role,requiresNewLogin:true});
 }
 if(path==='/api/admin/drivers'&&req.method==='GET'){
   const users=await env.DB.prepare("SELECT u.id,u.email,u.display_name,u.role,u.status,u.created_at,u.updated_at,c.phone,c.email_verified_at,v.license_plate,v.make,v.model,v.passenger_capacity,v.luggage_capacity FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id LEFT JOIN driver_vehicle_profiles v ON v.staff_id=u.id WHERE u.role='driver' ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,u.created_at DESC LIMIT 250").all();
   return send({drivers:users.results.map(publicStaff)});
 }
 const vehiclePath=path.match(/^\/api\/admin\/drivers\/([a-f0-9-]{36})\/vehicle$/i);
 if(vehiclePath&&req.method==='PATCH'){
   let p;try{p=await bodyLimit(req)}catch{return err('Datos de vehículo inválidos',400)}
   const staff=await env.DB.prepare("SELECT id FROM staff_users WHERE id=? AND role='driver'").bind(vehiclePath[1]).first();
   if(!staff)return err('Conductor no encontrado',404);
   if(typeof p.plate!=='string'||typeof p.make!=='string'||typeof p.model!=='string')
     return err('Completá matrícula, marca y modelo con texto válido',400);
   const plate=p.plate.trim().toUpperCase(),make=p.make.trim(),model=p.model.trim();
   if(!/^[A-Z0-9 -]{0,12}$/.test(plate) || make.length>45||model.length>45 ||
      /[\r\n]/.test(make+model))return err('Datos de vehículo fuera de formato',400);
   const seats=p.passengerCapacity===null?null:p.passengerCapacity;
   const bags=p.luggageCapacity===null?null:p.luggageCapacity;
   if(seats!==null&&(!Number.isInteger(seats)||seats<1||seats>8))
     return err('Capacidad de pasajeros inválida',400);
   if(bags!==null&&(!Number.isInteger(bags)||bags<0||bags>10))
     return err('Capacidad de equipaje inválida',400);
   await env.DB.prepare("INSERT INTO driver_vehicle_profiles(staff_id,license_plate,make,model,passenger_capacity,luggage_capacity) VALUES (?,?,?,?,?,?) ON CONFLICT(staff_id) DO UPDATE SET license_plate=excluded.license_plate,make=excluded.make,model=excluded.model,passenger_capacity=excluded.passenger_capacity,luggage_capacity=excluded.luggage_capacity,updated_at=unixepoch()")
     .bind(staff.id,plate,make,model,seats,bags).run();
   await audit(env,actor,'driver-vehicle',staff.id,'Ficha del vehículo actualizada');
   return send({driverId:staff.id,vehicle:{plate:plate||null,make:make||null,
     model:model||null,passengerCapacity:seats,luggageCapacity:bags}});
 }
 const driver=path.match(/^\/api\/admin\/drivers\/([a-f0-9-]{36})$/i);
 if(driver&&req.method==='PATCH'){
   let p;try{p=await bodyLimit(req)}catch{return err('Datos inválidos')}
   if(!allowedStatus.has(p.status))return err('Estado inválido');
   const row=await env.DB.prepare("SELECT id,status FROM staff_users WHERE id=? AND role='driver'").bind(driver[1]).first();
   if(!row)return err('Conductor no encontrado',404);
   if(p.status==='approved'){
     const check=await env.DB.prepare('SELECT email_verified_at FROM staff_contacts WHERE staff_id=?').bind(driver[1]).first();
     if(check && !check.email_verified_at)return err('El conductor debe verificar primero su correo electrónico',409);
   }
   await env.DB.prepare("UPDATE staff_users SET status=?,updated_at=unixepoch(),approved_at=CASE WHEN ?='approved' THEN unixepoch() ELSE approved_at END WHERE id=? AND role='driver'").bind(p.status,p.status,driver[1]).run();
   if(p.status==='blocked'){
     await env.DB.prepare('UPDATE staff_sessions SET revoked_at=unixepoch() WHERE staff_id=?').bind(driver[1]).run();
     await env.DB.prepare('UPDATE staff_refresh_tokens SET revoked_at=unixepoch() WHERE staff_id=?').bind(driver[1]).run();
   }
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

 // Estado de asignación sin GPS inventado: muestra únicamente conflictos de agenda.
 const options=path.match(/^\/api\/admin\/requests\/([A-Z0-9-]+)\/assignment-options$/);
 const assign=path.match(/^\/api\/admin\/requests\/([A-Z0-9-]+)\/assign$/);
 async function readAssignmentContext(id) {
   const booking=await env.DB.prepare(
     "SELECT b.id,b.status,b.trip_date,b.trip_time,b.passengers,b.bags,COALESCE(r.duration_s,0) AS duration_s FROM bookings b LEFT JOIN booking_routes r ON r.booking_id=b.id WHERE b.id=?"
   ).bind(id).first();
   if(!booking)return null;
   const current=await env.DB.prepare("SELECT a.driver_id,u.display_name AS driver_name FROM driver_assignments a JOIN staff_users u ON a.driver_id=u.id WHERE a.booking_id=?").bind(id).first();
   const slots=await env.DB.prepare(
     "SELECT a.driver_id,b.id,b.trip_date,b.trip_time,b.status,COALESCE(r.duration_s,0) AS duration_s FROM driver_assignments a JOIN bookings b ON b.id=a.booking_id LEFT JOIN booking_routes r ON r.booking_id=b.id WHERE b.status NOT IN ('cancelled','completed') AND b.id<>? AND b.trip_date BETWEEN date(?, '-1 day') AND date(?, '+1 day')"
   ).bind(id,booking.trip_date,booking.trip_date).all();
   return {booking,current,slots:slots.results};
 }
 if(options&&req.method==='GET'){
   const context=await readAssignmentContext(options[1]);
   if(!context)return err('Solicitud no encontrada',404);
   const drivers=await env.DB.prepare(
     "SELECT u.id,u.display_name,u.status,c.email_verified_at,c.phone,v.license_plate,v.make,v.model,v.passenger_capacity,v.luggage_capacity FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id LEFT JOIN driver_vehicle_profiles v ON v.staff_id=u.id WHERE u.role='driver' AND u.status='approved' ORDER BY u.display_name COLLATE NOCASE LIMIT 250"
   ).all();
   return send({
     bookingId:context.booking.id,bookingStatus:context.booking.status,
     assignable:ASSIGNABLE_STATUSES.includes(context.booking.status),
     assignedDriverId:context.current?.driver_id||null,
     assignedDriverName:context.current?.driver_name||null,
     availabilitySource:'schedule-only',gpsAvailable:false,
     drivers:drivers.results.map(user=>({
       id:user.id,name:user.display_name,status:user.status,phone:user.phone||null,
       emailVerified:Boolean(user.email_verified_at),
       vehicle:{plate:user.license_plate||null,make:user.make||null,model:user.model||null,passengerCapacity:user.passenger_capacity??null,luggageCapacity:user.luggage_capacity??null},
       capacityConflict:(user.passenger_capacity!==null&&user.passenger_capacity!==undefined&&user.passenger_capacity<Number(context.booking.passengers))||(user.luggage_capacity!==null&&user.luggage_capacity!==undefined&&user.luggage_capacity<Number(context.booking.bags)),
       conflicts:scheduleConflicts(context.booking,context.slots,user.id)
     }))
   });
 }
 if(assign&&req.method==='POST'){
   let p;try{p=await bodyLimit(req)}catch{return err('Datos inválidos',400)}
   const context=await readAssignmentContext(assign[1]);
   if(!context)return err('Solicitud no encontrada',404);
   const reason=assignmentError(context.booking,context.booking.status);
   if(reason)return err(reason,409);
   const previous=context.current?.driver_id||null;
   if(Object.prototype.hasOwnProperty.call(p,'expectedDriverId') &&
      p.expectedDriverId!==previous)return err('La asignación cambió. Actualizá la pantalla y volvé a intentar.',409);
   if(p.driverId===null){
     if(!previous)return send({bookingId:assign[1],driverId:null,unchanged:true});
     const removal=await env.DB.prepare('DELETE FROM driver_assignments WHERE booking_id=? AND driver_id=?')
       .bind(assign[1],previous).run();
     if(removal.meta?.changes!==1)return err('Asignación modificada. Volvé a consultar.',409);
     await audit(env,actor,'unassign',assign[1],previous);
     return send({bookingId:assign[1],driverId:null});
   }
   if(typeof p.driverId!=='string'||!(/^[a-f0-9-]{36}$/i.test(p.driverId)))return err('Conductor inválido',400);
   const user=await env.DB.prepare(
     "SELECT u.id,c.email_verified_at,v.passenger_capacity,v.luggage_capacity FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id LEFT JOIN driver_vehicle_profiles v ON v.staff_id=u.id WHERE u.id=? AND u.role='driver' AND u.status='approved'"
   ).bind(p.driverId).first();
   if(!user||!user.email_verified_at)return err('Conductor no aprobado o sin correo verificado',409);
   if(user.passenger_capacity!==null&&user.passenger_capacity!==undefined&&user.passenger_capacity<context.booking.passengers ||
      user.luggage_capacity!==null&&user.luggage_capacity!==undefined&&user.luggage_capacity<context.booking.bags)
      return err('Capacidad del vehículo insuficiente para pasajeros o equipaje',409);
   if(previous===user.id)return send({bookingId:assign[1],driverId:user.id,unchanged:true});
   const conflicts=scheduleConflicts(context.booking,context.slots,user.id);
   if(conflicts.length)return err('El conductor ya tiene un traslado que se cruza con este horario.',409);
   const window=occupiedInterval(context.booking);
   if(!window)return err('Horario de traslado inválido',409);
   // Inserción atómica: evita pisar una asignación que otro administrador cambió
   // y vuelve a validar agenda dentro de una única operación SQL sobre D1.
   const sql="INSERT INTO driver_assignments(booking_id,driver_id,assigned_by) "+
    "SELECT ?,?,? WHERE COALESCE((SELECT driver_id FROM driver_assignments WHERE booking_id=?),'')=? "+
    "AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status IN ('requested','quoted','accepted','confirmed')) "+
    "AND EXISTS(SELECT 1 FROM staff_users u JOIN staff_contacts c ON c.staff_id=u.id WHERE u.id=? AND u.role='driver' AND u.status='approved' AND c.email_verified_at IS NOT NULL) "+
    "AND NOT EXISTS(SELECT 1 FROM driver_assignments a JOIN bookings b ON b.id=a.booking_id "+
    "LEFT JOIN booking_routes r ON r.booking_id=b.id WHERE a.driver_id=? AND a.booking_id<>? "+
    "AND b.status NOT IN ('cancelled','completed') "+
    "AND CAST(strftime('%s',b.trip_date||' '||b.trip_time) AS INTEGER) < ? "+
    "AND CAST(strftime('%s',b.trip_date||' '||b.trip_time) AS INTEGER)+MAX(3600,COALESCE(r.duration_s,0))+1800 > ?) "+
    "ON CONFLICT(booking_id) DO UPDATE SET driver_id=excluded.driver_id,assigned_by=excluded.assigned_by,assigned_at=unixepoch() "+
    "WHERE driver_assignments.driver_id=?";
   const changed=await env.DB.prepare(sql)
     .bind(assign[1],user.id,actor.id,assign[1],previous||'',assign[1],user.id,user.id,assign[1],
       window.end,window.start,previous||'').run();
   if(changed.meta?.changes!==1)return err('La agenda o la asignación cambió. Revisá el conductor seleccionado.',409);
   await audit(env,actor,'assign',assign[1],(previous||'sin asignar')+' -> '+user.id);
   return send({bookingId:assign[1],driverId:user.id,assigned:true});
 }
 if(path==='/api/admin/audit'&&req.method==='GET'){
   // La bitácora contiene identificadores internos y eventos del fundador:
   // no exponerlos a administradores delegados.
   if(!await founderAuthorized())return err('Acceso reservado',403);
   const rows=await env.DB.prepare('SELECT actor_id,action,target,detail,created_at FROM admin_audit ORDER BY id DESC LIMIT 100').all();
   return send({events:rows.results});
 }
 return err('Ruta administrativa no encontrada',404);
}
