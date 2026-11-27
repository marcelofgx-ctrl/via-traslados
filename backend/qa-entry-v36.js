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
    env.DB.prepare("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status,approved_at) VALUES(?,?,'Conductor de ensayo QA','disabled','disabled',100000,'admin','approved',unixepoch())").bind(id,email),
    env.DB.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+604800)').bind(digest,id)
   ]);
  }catch{}
  existing=await env.DB.prepare('SELECT staff_id FROM staff_sessions WHERE token_hash=? AND revoked_at IS NULL').bind(digest).first();
 }
 if(!existing)return reply({error:'No se pudo crear la sesión QA'},503);
 await env.DB.prepare('UPDATE staff_sessions SET expires_at=unixepoch()+604800 WHERE token_hash=? AND revoked_at IS NULL').bind(digest).run();
 return reply({token:key,expiresIn:604800,user:{id:existing.staff_id,role:'admin',name:'Conductor de ensayo QA',status:'approved',capabilities:{canManageRoles:false}},qa:true,environment:'V36-PROFILE-PRIVATE'});
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
  if(path==='/api/operator/requests'&&method==='GET')return reply([]);
  if(path==='/api/admin/driver-profiles'&&method==='GET'){
   const r=await env.DB.prepare("SELECT p.staff_id AS id,u.display_name AS name,p.revision,p.review_state AS state,p.plate,p.make,p.model,p.color FROM driver_identity_profiles p JOIN staff_users u ON u.id=p.staff_id WHERE p.staff_id=? AND p.review_state='pending'").bind(actor.id).all();
   return reply({profiles:r.results||[]});
  }
  if(path==='/api/staff/driver-profile'&&['GET','POST'].includes(method))return worker.fetch(req,env,ctx);
  if(path==='/api/admin/driver-profiles/'+actor.id&&['GET','PATCH'].includes(method))return worker.fetch(req,env,ctx);
  return reply({error:'Ruta fuera de este ensayo privado'},404);
 }catch(e){console.error('v36-profile-qa',e?.name||'Error');return reply({error:'No se pudo completar la prueba'},500)}
}};
