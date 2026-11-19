// V32 QA online: entrada distinta a producción, D1 aislada, sin datos reales ni correo.
// No añadir esta ruta al Worker productivo. Las cuentas QA son sintéticas y públicas.
import worker from './worker.js';
import {identity} from './staff.js';
import {customerSession} from './customer-auth.js';
import {routeEstimateRoutes} from './route-estimate.js';
import {onboarding} from './qa-driver-onboarding.js';

const PERSONAS={
 admin:{id:'00000000-0000-4000-8000-000000000001',role:'admin',name:'Administración QA'},
 partner:{id:'00000000-0000-4000-8000-000000000002',role:'driver',name:'Conductor socio QA'},
 contractor:{id:'00000000-0000-4000-8000-000000000003',role:'driver',name:'Conductor contratado QA'}
};
const QA_WEB_ORIGIN='https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev';
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',
  'Access-Control-Allow-Origin':QA_WEB_ORIGIN,'Vary':'Origin'}
});
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)))
 .map(b=>b.toString(16).padStart(2,'0')).join('');
const allowed=(path,method)=>{
 if(path==='/api/operator/requests'&&method==='GET')return true;
 if(/^\/api\/operator\/requests\/VIA-QA-[A-Z0-9-]+$/.test(path)&&method==='PATCH')return true;
 if(/^\/api\/operator\/requests\/VIA-QA-[A-Z0-9-]+\/(price-guide|route)$/.test(path)&&method==='GET')return true;
 if(/^\/api\/operator\/requests\/VIA-QA-[A-Z0-9-]+\/release$/.test(path)&&method==='POST')return true;
 if(/^\/api\/admin\/requests\/VIA-QA-[A-Z0-9-]+\/assignment-options$/.test(path)&&method==='GET')return true;
 if(/^\/api\/admin\/requests\/VIA-QA-[A-Z0-9-]+\/assign$/.test(path)&&method==='POST')return true;
 if(path==='/api/admin/drivers'&&method==='GET')return true;
 if(path==='/api/admin/team'&&method==='GET')return true;
 if(path==='/api/admin/settings'&&method==='GET')return true;
 if(path==='/api/admin/commercial-drivers'&&method==='GET')return true;
 if(path==='/api/admin/pricing'&&['GET','PATCH'].includes(method))return true;
 if(path==='/api/admin/commissions'&&method==='GET')return true;
 if(/^\/api\/admin\/commissions\/VIA-QA-[A-Z0-9-]+$/.test(path)&&method==='PATCH')return true;
 if(/^\/api\/admin\/drivers\/[a-f0-9-]{36}\/commercial$/.test(path)&&method==='PATCH')return true;
 return false;
};
async function limit(env,scope,max,window){
 const key='onlineqa:'+await sha(scope);
 const result=await env.DB.prepare(
   'INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES(?,unixepoch(),1) '+
   'ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? '+
   'THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? '+
   'THEN 1 ELSE attempts+1 END RETURNING attempts'
 ).bind(key,window,window).first();
 return Number(result?.attempts||999)<=max;
}
async function session(req,env){
 if(!(await limit(env,'session:'+req.headers.get('CF-Connecting-IP'),40,86400)))
   return reply({error:'Se alcanzó el límite diario de pruebas'},429);
 let data={};try{data=await req.json()}catch{return reply({error:'Datos inválidos'},400)}
 const user=PERSONAS[data.role||'admin'];
 if(!user)return reply({error:'Perfil QA no habilitado'},400);
 const raw=token();
 await env.DB.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+7200)')
  .bind(await sha(raw),user.id).run();
 return reply({token:raw,expiresIn:7200,user:{id:user.id,role:user.role,
  name:user.name,status:'approved',capabilities:{canManageRoles:user.role==='admin'}},
  qa:true,environment:'via-traslados-maestro-api-qa'});
}
async function accept(req,env,actor){
 if(!actor)return reply({error:'Sesión QA inválida'},401);
 let data={};try{data=await req.json()}catch{return reply({error:'Datos inválidos'},400)}
 const id=String(data.id||'');
 if(!/^VIA-QA-[A-Z0-9-]+$/.test(id))return reply({error:'Solo viajes de ensayo'},400);
 const changed=await env.DB.prepare(
  "UPDATE bookings SET status='accepted',updated_at=datetime('now') "+
  "WHERE id=? AND status='quoted'"
 ).bind(id).run();
 if(changed.meta?.changes!==1)return reply({error:'La oferta no está pendiente de aceptación'},409);
 await env.DB.prepare(
  "INSERT INTO booking_events(booking_id,old_status,new_status,actor) "+
  "VALUES(?,'quoted','accepted','passenger')"
 ).bind(id).run();
 return reply({id,status:'accepted',qa:true});
}
async function reset(req,env,actor){
 if(actor?.id!==PERSONAS.admin.id)return reply({error:'Solo administrador QA'},403);
 let data={};try{data=await req.json()}catch{return reply({error:'Datos inválidos'},400)}
 if(data.confirm!=='REINICIAR_QA')return reply({error:'Confirmación incorrecta'},400);
 await env.DB.batch([
  env.DB.prepare('DELETE FROM booking_commission_ledger WHERE booking_id LIKE \'VIA-QA-%\''),
  env.DB.prepare('DELETE FROM booking_quotes WHERE booking_id LIKE \'VIA-QA-%\''),
  env.DB.prepare('DELETE FROM booking_dispatch_releases WHERE booking_id LIKE \'VIA-QA-%\''),
  env.DB.prepare('DELETE FROM driver_assignments WHERE booking_id LIKE \'VIA-QA-%\''),
  env.DB.prepare('DELETE FROM booking_events WHERE booking_id LIKE \'VIA-QA-%\''),
  env.DB.prepare("UPDATE bookings SET status='requested',price_uyu=NULL,updated_at=datetime('now') WHERE id LIKE 'VIA-QA-%'")
 ]);
 return reply({reset:true,qa:true});
}

// MAESTRO-STAGE: ONLY ephemeral synthetic passenger path, on an independent Worker/D1.
// This supplements QA V34 but NEVER belongs in the production Worker bundle.
const STAGE_EMAIL='pasajero.v35@qa.invalid';
const QA_PASSENGERS={
 A:{email:'pasajero.a@qa.invalid',name:'Ana de prueba',phone:'099000091'},
 B:{email:'pasajero.b@qa.invalid',name:'Bruno de prueba',phone:'099000092'}
};
const allowedPassengerEmail=email=>typeof email==='string'&&(email===STAGE_EMAIL||/^[a-z0-9._+-]{1,40}@qa\.invalid$/.test(email));
async function qaPassengerLogin(req,env){
 if(!(await limit(env,'passenger:'+req.headers.get('CF-Connecting-IP'),45,86400)))
  return reply({error:'Límite QA alcanzado'},429);
 let persona='';try{persona=String((await req.json()).persona||'')}catch{return reply({error:'Solicitud inválida'},400)}
 const customer=QA_PASSENGERS[persona];
 if(!customer)return reply({error:'Solo identidades sintéticas A y B'},400);
 await env.DB.prepare('INSERT INTO customers(email,name,phone) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone')
  .bind(customer.email,customer.name,customer.phone).run();
 const raw=token(),expiresAt=Math.floor(Date.now()/1000)+7200;
 await env.DB.prepare('INSERT INTO customer_sessions(token_hash,email,expires_at) VALUES(?,?,?)')
  .bind(await sha(raw),customer.email,expiresAt).run();
 return reply({sessionToken:raw,expiresAt,profile:customer,qa:true});
}

// OTP totalmente sintético, limitado a emails .invalid y al Worker QA.
async function syntheticRegistration(req,env,path){
 if(!(await limit(env,'qa-register:'+req.headers.get('CF-Connecting-IP'),24,3600)))
  return reply({error:'Demasiados intentos de prueba'},429);
 let data={};try{data=await req.json()}catch{return reply({error:'Solicitud inválida'},400)}
 const email=String(data.email||'').trim().toLowerCase();
 if(!/^[a-z0-9._+-]{1,40}@qa\.invalid$/.test(email))
  return reply({error:'En QA usá un correo ficticio que termine en @qa.invalid'},403);
 if(path==='/api/auth/start')
  return reply({email,maskedEmail:'***@qa.invalid',qa:true,testCode:'123456'});
 if(String(data.code||'').trim()!=='123456')
  return reply({error:'Código de prueba incorrecto'},400);
 const raw=token();
 await env.DB.prepare('INSERT INTO email_verified_sessions(token_hash,email,expires_at) VALUES(?,?,unixepoch()+600)')
  .bind(await sha(raw),email).run();
 return reply({email,verificationToken:raw,qa:true});
}

// Inicio de sesión QA existente: SOLO cuentas ficticias @qa.invalid.
// No autentica teléfonos reales ni envía email; código QA 123456.
async function syntheticExistingLogin(req,env,path){
 if(!(await limit(env,'qa-existing:'+req.headers.get('CF-Connecting-IP'),35,3600)))
  return reply({error:'Demasiados intentos de prueba'},429);
 let data={};try{data=await req.json()}catch{return reply({error:'Solicitud inválida'},400)}
 const phone=String(data.phone||'').replace(/\D/g,'');
 if(!/^0?9\d{7,8}$/.test(phone))return reply({error:'Celular de prueba inválido'},400);
 const account=await env.DB.prepare("SELECT email,name,phone FROM customers WHERE REPLACE(phone,' ','')=? AND email LIKE '%@qa.invalid' LIMIT 1")
  .bind(phone).first();
 if(!account||!allowedPassengerEmail(account.email))
  return reply({sent:false,recognized:false,message:'Ese celular de prueba no está registrado; elegí Soy nuevo.'});
 if(path==='/api/customer/login/start')
  return reply({sent:true,recognized:true,maskedEmail:'***@qa.invalid',qa:true,testCode:'123456'});
 if(String(data.code||'').trim()!=='123456')
  return reply({error:'Código de prueba incorrecto'},400);
 const raw=token(),expiresAt=Math.floor(Date.now()/1000)+7200;
 await env.DB.prepare('INSERT INTO customer_sessions(token_hash,email,expires_at) VALUES(?,?,?)')
  .bind(await sha(raw),account.email,expiresAt).run();
 return reply({sessionToken:raw,expiresAt,profile:account,qa:true});
}

const STAGE_ADMIN='00000000-0000-4000-8000-000000000001';
async function stagePassenger(request,env,path,method,ctx) {
 const actor=await identity(request,env);
 if(path==='/api/v35/verified-session'&&method==='POST'){
   if(actor?.id!==STAGE_ADMIN)return reply({error:'Administrador de ensayo requerido'},403);
   const raw=token();
   await env.DB.prepare('INSERT INTO email_verified_sessions(token_hash,email,expires_at) VALUES(?,?,unixepoch()+600)')
    .bind(await sha(raw),STAGE_EMAIL).run();
   return reply({email:STAGE_EMAIL,verificationToken:raw,qa:true});
 }
 if(path==='/api/requests'&&method==='POST'){
   let data={};
   try{data=await request.clone().json()}catch{return reply({error:'Solicitud de ensayo inválida'},400)}
   if(!allowedPassengerEmail(data.email)||!/^[0-9]{8,12}$/.test(String(data.phone||'').replace(/\s/g,'')))
     return reply({error:'Solo datos sintéticos V35'},403);
   return worker.fetch(request,env,ctx);
 }
 const passenger=path.match(/^\/api\/requests\/(VIA-[A-Z0-9-]+)(?:\/(accept|cancel))?$/);
 if(passenger&&['GET','POST'].includes(method)){
   const row=await env.DB.prepare('SELECT email FROM bookings WHERE id=?').bind(passenger[1]).first();
   if(!allowedPassengerEmail(row?.email))return reply({error:'Solicitud de ensayo no disponible'},404);
   return worker.fetch(request,env,ctx);
 }
 if(path==='/api/v35/cleanup'&&method==='POST'){
   if(actor?.id!==STAGE_ADMIN)return reply({error:'Administrador de ensayo requerido'},403);
   let data={};try{data=await request.json()}catch{return reply({error:'ID inválido'},400)}
   const id=String(data.id||'');
   if(!/^VIA-[A-Z0-9-]+$/.test(id))return reply({error:'ID inválido'},400);
   const removed=await env.DB.prepare('DELETE FROM bookings WHERE id=? AND email IN (?,?,?) RETURNING id')
    .bind(id,STAGE_EMAIL,QA_PASSENGERS.A.email,QA_PASSENGERS.B.email).first();
   if(!removed)return reply({error:'Reserva QA inexistente'},404);
   await env.DB.prepare('DELETE FROM customers WHERE email=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE email=?)')
    .bind(STAGE_EMAIL,STAGE_EMAIL).run();
   await env.DB.prepare('DELETE FROM email_verified_sessions WHERE email=?').bind(STAGE_EMAIL).run();
   return reply({qa:true,deleted:true});
 }
 const staff=path.match(/^\/api\/operator\/requests\/(VIA-[A-Z0-9-]+)(?:\/(price-guide|release|route))?$/);
 if(staff&&['GET','PATCH','POST'].includes(method)){
   if(!actor)return reply({error:'Sesión QA requerida'},401);
   const row=await env.DB.prepare('SELECT email FROM bookings WHERE id=?').bind(staff[1]).first();
   if(!allowedPassengerEmail(row?.email))return reply({error:'Solicitud de ensayo no disponible'},404);
   return worker.fetch(request,env,ctx);
 }
 return null;
}

export default {async fetch(request,env,ctx){
 const path=new URL(request.url).pathname,method=request.method;
 if(env.VIA_QA_MODE!=='1'||!env.DB)
   return reply({error:'QA no configurada'},503);
 const host=new URL(request.url).hostname;
 if(!host.startsWith('via-traslados-maestro-api-qa.')||!host.endsWith('.workers.dev'))
   return reply({error:'Host QA inválido'},403);
 if(method==='OPTIONS')return new Response(null,{status:204,headers:{
   'Access-Control-Allow-Origin':env.PUBLIC_ORIGIN,
   'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
   'Access-Control-Allow-Headers':'Authorization,Content-Type,Idempotency-Key,X-Booking-Token,X-Verification-Token',
   'Cache-Control':'no-store'}});
 const origin=request.headers.get('Origin');
 if(origin&&origin!==env.PUBLIC_ORIGIN)return reply({error:'Origen no autorizado'},403);
 // Consulta pública sobre la misma implementación probada del motor real,
 // usando EXCLUSIVAMENTE D1 y credenciales configuradas en MAESTRO QA.
 // Nunca se obtiene información de otra D1 ni del Worker productivo.
 if(path==='/api/public/route-preview'&&method==='POST'){
  if(!await limit(env,'route-qa:'+request.headers.get('CF-Connecting-IP'),12,3600))
   return reply({error:'Límite de rutas de prueba alcanzado. Probá más tarde.'},429);
  if(typeof env.VIA_GEOAPIFY_API_KEY!=='string'||env.VIA_GEOAPIFY_API_KEY.trim().length<10||
     typeof env.OTP_PEPPER!=='string'||env.OTP_PEPPER.length<24){
   return reply({error:'En QA el cálculo de distancia está pendiente de configurar Geoapify. Podés continuar sin kilómetros de prueba.',
    qa:true,reason:'qa_geoapify_not_configured'},503);
  }
  return routeEstimateRoutes(request,env,path,(data,status=200)=>reply(data,status));
 }
 if(path==='/api/health'&&method==='GET'){
  const db=await env.DB.prepare('SELECT COUNT(*) AS n FROM bookings WHERE id LIKE ?')
   .bind('VIA-QA-%').first();
  return reply({ok:true,qa:true,environment:'MAESTRO-STAGE',bookings:db?.n||0,
   onboarding:true,login:'perfiles de ensayo y cuentas QA pendientes de aprobación',production:false,
   routePreviewReady:typeof env.VIA_GEOAPIFY_API_KEY==='string'&&env.VIA_GEOAPIFY_API_KEY.trim().length>=10&&
     typeof env.OTP_PEPPER==='string'&&env.OTP_PEPPER.length>=24});
 }
 const stage=await stagePassenger(request,env,path,method,ctx);
 if(stage)return stage;
 if((path==='/api/auth/start'||path==='/api/auth/verify')&&method==='POST')
  return syntheticRegistration(request,env,path);
 if((path==='/api/customer/login/start'||path==='/api/customer/login/verify')&&method==='POST')
  return syntheticExistingLogin(request,env,path);
 if(path==='/api/customer/session'&&method==='POST'){
  let data={};try{data=await request.clone().json()}catch{return reply({error:'Solicitud de alta inválida'},400)}
  if(!allowedPassengerEmail(String(data.email||'').trim().toLowerCase()))
   return reply({error:'Solo usuarios de prueba @qa.invalid'},403);
  return worker.fetch(request,env,ctx);
 }
 if(path==='/api/qa/passenger-login'&&method==='POST')return qaPassengerLogin(request,env);
 if(path==='/api/qa/session'&&method==='POST')return session(request,env);
 if(path.startsWith('/api/customer/')&&['GET','POST'].includes(method)){
  const customer=await customerSession(request,env);
  if(!customer||!allowedPassengerEmail(customer.email))
   return reply({error:'Sesión pasajero QA requerida'},401);
  return worker.fetch(request,env,ctx);
 }
 // Las solicitudes y el acceso con contraseña NO se confunden con los perfiles
 // sintéticos públicos; el estado pendiente no genera sesión.
 if(path==='/api/qa/driver-applications'&&method==='POST'||
    path==='/api/qa/driver-login'&&method==='POST'){
   if(!await limit(env,'registration:'+request.headers.get('CF-Connecting-IP'),12,3600))
     return reply({error:'Límite de registros de prueba alcanzado'},429);
   return onboarding(request,env,path,null);
 }
 if(path==='/api/qa/driver-form'&&method==='GET')
   return onboarding(request,env,path,null);
 const actor=await identity(request,env);
 if(!actor)return reply({error:'Sesión QA requerida'},401);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 if(method!=='GET'&&!await limit(env,'mutate:'+ip,150,86400))
   return reply({error:'Límite diario QA alcanzado'},429);
 if(path.startsWith('/api/qa/driver-applications')||
    path==='/api/qa/driver-form')
   return onboarding(request,env,path,actor);
 if(path==='/api/qa/accept'&&method==='POST')return accept(request,env,actor);
 if(path==='/api/qa/reset'&&method==='POST')return reset(request,env,actor);
 if(!allowed(path,method))return reply({error:'Ruta no habilitada en QA aislada'},404);
 // Reutilizar la lógica de cotización, bloqueos, estados y comisiones del Worker real.
 // El esquema y los actores son distintos de los de producción.
 return worker.fetch(request,env,ctx);
}};
