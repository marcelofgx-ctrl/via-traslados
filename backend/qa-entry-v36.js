// Dedicated profile sandbox. No shared administrator; each install owns one synthetic account.
import worker from './worker.js';
import {identity} from './staff.js';
const HOST='via-traslados-api-v36-qa.marcelof-gx.workers.dev';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'}});
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');
async function limited(env,scope,max,seconds){
 const key='v36qa:'+await sha(scope);
 const q=await env.DB.prepare('INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES(?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(key,seconds,seconds).first();
 return Number(q?.attempts||999)<=max;
}
async function session(req,env){
 if(Number(req.headers.get('Content-Length')||0)>1024)return reply({error:'Solicitud inválida'},400);
 let p;try{const raw=await req.text();if(raw.length>1024)throw Error();p=JSON.parse(raw)}catch{return reply({error:'Solicitud inválida'},400)}
 const key=p?.installKey;if(typeof key!=='string'||! /^[a-f0-9]{64}$/.test(key))return reply({error:'Identificador privado inválido'},400);
 if(!await limited(env,'session:'+req.headers.get('CF-Connecting-IP'),80,86400))return reply({error:'Límite de sesiones QA'},429);
 const digest=await sha(key);
 let existing=await env.DB.prepare('SELECT staff_id FROM staff_sessions WHERE token_hash=? AND revoked_at IS NULL').bind(digest).first();
 if(!existing){
  const id=crypto.randomUUID(),email='v36-'+id+'@qa.invalid';
  if(!await limited(env,'new:'+req.headers.get('CF-Connecting-IP'),8,86400))return reply({error:'Límite de nuevas cuentas QA'},429);
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status,approved_at) VALUES(?,?,'Conductor de ensayo QA','disabled','disabled',100000,'driver','approved',unixepoch())").bind(id,email),
    env.DB.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+604800)').bind(digest,id)
   ]);
  }catch{}
  existing=await env.DB.prepare('SELECT staff_id FROM staff_sessions WHERE token_hash=? AND revoked_at IS NULL').bind(digest).first();
 }
 if(!existing)return reply({error:'No se pudo crear la sesión QA'},503);
 await env.DB.prepare('UPDATE staff_sessions SET expires_at=unixepoch()+604800 WHERE token_hash=? AND revoked_at IS NULL').bind(digest).run();
 // The old sandbox used a single self-review account. Demote it on migration.
 await env.DB.prepare("UPDATE staff_users SET role='driver' WHERE id=? AND email LIKE 'v36-%@qa.invalid'").bind(existing.staff_id).run();
 if(p.role==='admin'){
  // Explicit QA-only role simulation, separate staff record and token; restricted to this pair.
  const adminToken=await sha('v36-qa-admin:'+key),adminHash=await sha(adminToken);
  let pair=await env.DB.prepare('SELECT admin_id FROM qa_profile_pair WHERE driver_id=?').bind(existing.staff_id).first();
  if(!pair){
   const id=crypto.randomUUID();
   try{await env.DB.batch([
    env.DB.prepare("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status,approved_at) VALUES(?,?,'Administración QA','disabled','disabled',100000,'admin','approved',unixepoch())").bind(id,'v36-'+id+'@qa.invalid'),
    env.DB.prepare('INSERT INTO qa_profile_pair(driver_id,admin_id) VALUES(?,?)').bind(existing.staff_id,id),
    env.DB.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+604800)').bind(adminHash,id)
   ]);}catch{}
   pair=await env.DB.prepare('SELECT admin_id FROM qa_profile_pair WHERE driver_id=?').bind(existing.staff_id).first();
  }
  if(!pair)return reply({error:'Administración QA no disponible'},503);
  await env.DB.prepare('UPDATE staff_sessions SET expires_at=unixepoch()+604800 WHERE token_hash=? AND staff_id=? AND revoked_at IS NULL').bind(adminHash,pair.admin_id).run();
  return reply({token:adminToken,user:{id:pair.admin_id,role:'admin',name:'Administración QA',capabilities:{canManageRoles:false}},qa:true,environment:'V36-PROFILE-PRIVATE'});
 }
 return reply({token:key,expiresIn:604800,user:{id:existing.staff_id,role:'driver',name:'Conductor de ensayo QA',status:'approved',capabilities:{canManageRoles:false}},qa:true,environment:'V36-PROFILE-PRIVATE'});
}
export default {async fetch(req,env,ctx){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(url.hostname!==HOST||env.VIA_QA_MODE!=='V36_PROFILE_PRIVATE'||env.VIA_DRIVER_IDENTITY_ENABLED!=='true'||!env.DB)return reply({error:'QA no configurada'},503);
 if(req.headers.get('Origin'))return reply({error:'Solo APK QA'},403);
 try{
  if(path==='/api/health'&&method==='GET')return reply({ok:true,qa:true,production:false,environment:'V36-PROFILE-PRIVATE'});
  if(path==='/api/qa/session'&&method==='POST')return session(req,env);
  const actor=await identity(req,env);if(!actor||actor.master||!actor.email?.startsWith('v36-')||!actor.email.endsWith('@qa.invalid'))return reply({error:'Sesión QA requerida'},401);
  if(method!=='GET'&&!await limited(env,'mutate:'+actor.id,50,86400))return reply({error:'Límite de cambios QA'},429);
  const driverId=actor.role==='admin'?(await env.DB.prepare('SELECT driver_id FROM qa_profile_pair WHERE admin_id=?').bind(actor.id).first())?.driver_id:actor.id;
  if(!driverId)return reply({error:'Cuenta QA sin ámbito'},403);
  async function seed(){
   const id='VIA-QA-'+driverId.replaceAll('-','').toUpperCase(),token=await sha('qa-booking:'+driverId);
   await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO driver_commercial_profiles(staff_id,mode,can_quote_all,can_release,commission_bps) VALUES(?,'partner',1,1,0)").bind(driverId),
    env.DB.prepare("INSERT OR IGNORE INTO driver_vehicle_profiles(staff_id,license_plate,make,model,passenger_capacity,luggage_capacity) VALUES(?,'','Toyota','Corolla',4,3)").bind(driverId),
    env.DB.prepare("INSERT OR IGNORE INTO bookings(id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,notes,access_token_hash,status) VALUES(?,'Pasajero QA','000000000',?,'Shangrilá, Canelones','Aeropuerto de Carrasco',date('now','+2 days'),'14:30',2,1,'Traslado sintético de ensayo',?,'requested')").bind(id,'qa-'+driverId+'@qa.invalid',await sha(token)),
    env.DB.prepare("INSERT OR IGNORE INTO qa_booking_scope(booking_id,driver_id) VALUES(?,?)").bind(id,driverId),
    env.DB.prepare("INSERT OR IGNORE INTO booking_routes(booking_id,distance_m,duration_s,provider) VALUES(?,2900,360,'qa-fixture')").bind(id)
   ]);
  }
  if(path==='/api/operator/requests'&&method==='GET'){
   await seed();
   const allowed=await env.DB.prepare('SELECT booking_id FROM qa_booking_scope WHERE driver_id=?').bind(driverId).all();
   const ids=new Set(allowed.results.map(x=>x.booking_id));
   const response=await worker.fetch(req,env,{});if(!response.ok)return response;
   const rows=await response.json();return reply(rows.filter(x=>ids.has(x.id)));
  }
  const op=path.match(/^\/api\/operator\/requests\/([A-Z0-9-]+)(?:\/(route|price-guide|release))?$/);
  if(op){
   if(!await env.DB.prepare('SELECT booking_id FROM qa_booking_scope WHERE booking_id=? AND driver_id=?').bind(op[1],driverId).first())return reply({error:'Solicitud fuera de tu ámbito'},404);
   if(op[2]==='route'&&method==='GET')return reply({distanceKm:2.9,durationMinutes:6,source:'QA sintético',estimate:true,trafficIncluded:false});
   return worker.fetch(req,env,{});
  }
  if(path==='/api/qa/accept'&&method==='POST'){
   if(actor.role!=='admin')return reply({error:'Solo administración QA'},403);
   const p=await req.json();if(!await env.DB.prepare('SELECT booking_id FROM qa_booking_scope WHERE booking_id=? AND driver_id=?').bind(p.id,driverId).first())return reply({error:'Solicitud fuera de tu ámbito'},404);
   const token=await sha('qa-booking:'+driverId);
   return worker.fetch(new Request(url.origin+'/api/requests/'+p.id+'/accept',{method:'POST',headers:{'X-Booking-Token':token}}),env,{});
  }
  if(path==='/api/qa/reset'&&method==='POST'){
   if(actor.role!=='admin')return reply({error:'Solo administración QA'},403);
   const p=await req.json();if(p.confirm!=='REINICIAR_QA')return reply({error:'Confirmación requerida'},400);
   await env.DB.prepare('DELETE FROM bookings WHERE id IN (SELECT booking_id FROM qa_booking_scope WHERE driver_id=?)').bind(driverId).run();await seed();return reply({ok:true});
  }
  if(path.startsWith('/api/admin/driver-profiles')){
   if(actor.role!=='admin')return reply({error:'Solo administración'},403);
   const pair=await env.DB.prepare('SELECT driver_id FROM qa_profile_pair WHERE admin_id=?').bind(actor.id).first();
   if(!pair)return reply({error:'Administrador QA sin ámbito'},403);
   if(path==='/api/admin/driver-profiles'&&method==='GET'){
    const r=await env.DB.prepare("SELECT p.staff_id AS id,u.display_name AS name,p.revision,CASE WHEN p.review_state='rejected' AND p.review_action LIKE 'revoked:%' THEN 'revoked' ELSE p.review_state END AS state,p.plate,p.make,p.model,p.color FROM driver_identity_profiles p JOIN staff_users u ON u.id=p.staff_id WHERE p.staff_id=?").bind(pair.driver_id).all();
    return reply({profiles:r.results||[]});
   }
   if(path==='/api/admin/driver-profiles/'+pair.driver_id&&['GET','PATCH'].includes(method))return worker.fetch(req,env,ctx);
   return reply({error:'Ficha fuera de esta cuenta QA'},404);
  }
  if(path==='/api/staff/driver-profile'&&actor.role!=='driver')return reply({error:'Usá la cuenta de conductor'},403);
  if(path==='/api/staff/driver-profile'&&method==='GET'){
   // Synthetic registered car for QA only; never read production or overwrite an existing record.
   await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO driver_vehicle_profiles(staff_id,license_plate,make,model,passenger_capacity,luggage_capacity) SELECT ?, '', 'Toyota','Corolla',4,3 WHERE NOT EXISTS (SELECT 1 FROM driver_identity_profiles WHERE staff_id=?)").bind(actor.id,actor.id),
    env.DB.prepare("INSERT OR IGNORE INTO driver_vehicle_prefill(staff_id,make,model,color,model_year,vehicle_type) SELECT staff_id,make,model,'Gris',2024,'Sedán' FROM driver_vehicle_profiles WHERE staff_id=? AND make='Toyota' AND model='Corolla' AND license_plate=''").bind(actor.id)
   ]);
   return worker.fetch(req,env,ctx);
  }
  if(path==='/api/staff/driver-profile'&&method==='POST')return worker.fetch(req,env,ctx);

  return reply({error:'Ruta fuera de este ensayo privado'},404);
 }catch(e){console.error('v36-profile-qa',e?.name||'Error');return reply({error:'No se pudo completar la prueba'},500)}
}};
