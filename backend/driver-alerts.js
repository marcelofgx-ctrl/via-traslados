import {identity} from './staff.js';
const configured=e=>e.VIA_DRIVER_ALERTS_ENABLED==='true';
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{12,100}$/.test(s);
const validToken=s=>typeof s==='string'&&/^[A-Za-z0-9_:\-.]{30,4096}$/.test(s);
const run=(e,sql,...args)=>e.DB.prepare(sql).bind(...args);
const generic={title:'Vía Traslados',body:'Nueva solicitud de traslado. Abrí la aplicación para revisar.'};
export async function driverAlertRoutes(req,env,path,send,ctx){
 if(!path.startsWith('/api/operator/alerts'))return null;
 if(!configured(env))return send({error:'Avisos no habilitados'},503);
 const a=await identity(req,env);
 if(!a||a.master||a.status!=='approved')return send({error:'Acceso no autorizado'},403);
 if(path==='/api/operator/alerts'&&req.method==='GET'){
  const d=await run(env,'SELECT device_id,available FROM driver_alert_devices WHERE staff_id=?',a.id).first();
  const rows=await run(env,'SELECT s.booking_id FROM driver_alert_seen s JOIN driver_alert_eligible e ON e.staff_id=s.staff_id AND e.booking_id=s.booking_id WHERE s.staff_id=? LIMIT 500',a.id).all();
  return send({available:!!d?.available,deviceId:d?.device_id||null,seen:(rows.results||[]).map(r=>r.booking_id)});
 }
 if(req.method!=='POST')return send({error:'Ruta no disponible'},404);
 let p;try{const body=await req.text();if(body.length>5000)return send({error:'Solicitud demasiado grande'},413);p=JSON.parse(body)}catch{return send({error:'Datos incorrectos'},400)}
 if(path==='/api/operator/alerts/availability'){
  if(!validId(p.deviceId)||typeof p.available!=='boolean'||p.available&&!validToken(p.token))return send({error:'Dispositivo o token inválido'},400);
  if(!p.available){
   await run(env,'UPDATE driver_alert_devices SET available=0,token=NULL,updated_at=unixepoch() WHERE staff_id=? AND device_id=?',a.id,p.deviceId).run();
   return send({available:false});
  }
  if(!env.VIA_FCM_PROJECT_ID||!env.VIA_FCM_SERVICE_ACCOUNT)return send({error:'Firebase sin configurar'},503);
  // Only one active phone per account. A token cannot silently transfer between accounts.
  try{await run(env,'INSERT INTO driver_alert_devices(staff_id,device_id,token,available) VALUES(?,?,?,1) ON CONFLICT(staff_id) DO UPDATE SET device_id=excluded.device_id,token=excluded.token,available=1,updated_at=unixepoch()',a.id,p.deviceId,p.token).run()}
  catch{return send({error:'Dispositivo ya registrado; desactivá la sesión anterior'},409)}
  queueDriverAlerts(env,ctx);
  return send({available:true});
 }
 if(path==='/api/operator/alerts/seen'){
  if(!validId(p.bookingId))return send({error:'Solicitud incorrecta'},400);
  const r=await run(env,'INSERT OR IGNORE INTO driver_alert_seen(staff_id,booking_id) SELECT staff_id,booking_id FROM driver_alert_eligible WHERE staff_id=? AND booking_id=?',a.id,p.bookingId).run();
  return send({seen:true,recorded:!!r.meta?.changes});
 }
 return send({error:'Ruta no disponible'},404);
}
let cachedAccess=null;
const b64=v=>btoa(String.fromCharCode(...v)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const enc=v=>b64(new TextEncoder().encode(JSON.stringify(v)));
async function access(env,fetcher){
 const s=JSON.parse(env.VIA_FCM_SERVICE_ACCOUNT);
 if(!s.client_email||!s.private_key||s.project_id!==env.VIA_FCM_PROJECT_ID)throw Error('FCM configuration');
 const now=Math.floor(Date.now()/1000);
 if(cachedAccess?.email===s.client_email&&cachedAccess.exp>now+60)return cachedAccess.token;
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(s.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const claims=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:s.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(claims));
 const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:claims+'.'+b64(new Uint8Array(signature))}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('FCM OAuth');
 const j=await r.json();if(!j.access_token)throw Error('FCM OAuth payload');
 cachedAccess={email:s.client_email,token:j.access_token,exp:now+Math.min(3600,Number(j.expires_in)||0)};return j.access_token;
}
export function pushMessage(token,bookingId,deviceId){
 // No passenger names, address, image, credentials or personal data on lock screen.
 return {message:{token,data:{kind:'new_request',bookingId,deviceId,title:generic.title,body:generic.body},android:{priority:'HIGH',ttl:'3600s'}}};
}
export async function drainDriverAlerts(env,fetcher=fetch){
 if(!configured(env)||!env.VIA_FCM_PROJECT_ID||!env.VIA_FCM_SERVICE_ACCOUNT)return;
 await run(env,"INSERT OR IGNORE INTO driver_alert_outbox(staff_id,booking_id) SELECT e.staff_id,e.booking_id FROM driver_alert_eligible e JOIN driver_alert_devices d ON d.staff_id=e.staff_id AND d.available=1 AND d.token IS NOT NULL LEFT JOIN driver_alert_seen s ON s.staff_id=e.staff_id AND s.booking_id=e.booking_id WHERE s.booking_id IS NULL ORDER BY e.created_at DESC LIMIT 200").run();
 const due=await run(env,"SELECT o.staff_id,o.booking_id FROM driver_alert_outbox o JOIN driver_alert_eligible e ON e.staff_id=o.staff_id AND e.booking_id=o.booking_id JOIN driver_alert_devices d ON d.staff_id=o.staff_id AND d.available=1 AND d.token IS NOT NULL LEFT JOIN driver_alert_seen s ON s.staff_id=o.staff_id AND s.booking_id=o.booking_id WHERE o.sent_at IS NULL AND o.attempts<6 AND o.retry_at<=unixepoch() AND s.booking_id IS NULL ORDER BY o.retry_at LIMIT 12").all();
 if(!due.results?.length)return;
 const bearer=await access(env,fetcher);
 for(const row of due.results){
  const lease=crypto.randomUUID(),args=[row.staff_id,row.booking_id];
  const claimed=await run(env,'UPDATE driver_alert_outbox SET lease=?,retry_at=unixepoch()+120,attempts=attempts+1 WHERE staff_id=? AND booking_id=? AND sent_at IS NULL AND retry_at<=unixepoch() AND attempts<6 RETURNING attempts',lease,...args).first();
  if(!claimed)continue;
  const d=await run(env,"SELECT d.token,d.device_id FROM driver_alert_devices d JOIN driver_alert_eligible e ON e.staff_id=d.staff_id AND e.booking_id=? LEFT JOIN driver_alert_seen s ON s.staff_id=e.staff_id AND s.booking_id=e.booking_id WHERE d.staff_id=? AND d.available=1 AND d.token IS NOT NULL AND s.booking_id IS NULL",row.booking_id,row.staff_id).first();
  if(!d)continue;
  try{
   const r=await fetcher('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(env.VIA_FCM_PROJECT_ID)+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify(pushMessage(d.token,row.booking_id,d.device_id)),signal:AbortSignal.timeout(10000)});
   const j=await r.json();
   if(r.ok&&typeof j.name==='string')await run(env,'UPDATE driver_alert_outbox SET sent_at=unixepoch(),lease=NULL WHERE staff_id=? AND booking_id=? AND lease=?',...args,lease).run();
   else if(j.error?.details?.some(x=>x.errorCode==='UNREGISTERED'))await run(env,'UPDATE driver_alert_devices SET available=0,token=NULL WHERE staff_id=? AND token=?',row.staff_id,d.token).run();
  }catch{/* lease expiry permits bounded retry; client notification tags deduplicate */}
 }
}
export function queueDriverAlerts(env,ctx){
 if(configured(env)&&ctx?.waitUntil)ctx.waitUntil(drainDriverAlerts(env).catch(e=>console.error('via-driver-alerts',e?.name||'Error')));
}
