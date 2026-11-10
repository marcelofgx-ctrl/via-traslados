// Distancias por carretera para cotizaciones de Vía Traslados.
// Solo backend: la clave Google Routes jamás se transmite a la APK.
import {identity} from './staff.js';

const now=()=>Math.floor(Date.now()/1000);
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
const limit=async(env,scope,max,seconds)=>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('via-route:'+scope));
 const key=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const r=await env.DB.prepare('INSERT INTO otp_rate_limits (rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(key,seconds,seconds).first();
 return Number(r?.attempts||0)<=max;
};
const hasLocation=x=>typeof x==='string'&&x.length>=4&&x.length<=200;
const toOutput=(r,cached)=>({
 distanceKm:Math.round(Number(r.distance_m)/100)/10,
 durationMinutes:Math.ceil(Number(r.duration_s)/60),
 source:'Google Routes',
 estimate:true,
 trafficIncluded:false,
 cached
});

export async function routeEstimateRoutes(req,env,path){
 const route=path.match(/^\/api\/operator\/requests\/([A-Z0-9-]{5,64})\/route$/);
 if(!route||req.method!=='GET')return null;
 const actor=await identity(req,env);
 if(!actor)return json({error:'Acceso no autorizado'},401);
 const id=route[1];
 if(actor.role!=='admin'){
  const assignment=await env.DB.prepare('SELECT driver_id FROM driver_assignments WHERE booking_id=?').bind(id).first();
  if(assignment?.driver_id!==actor.id)return json({error:'Viaje no asignado a tu cuenta'},403);
 }
 const booking=await env.DB.prepare('SELECT id,origin,destination FROM bookings WHERE id=?').bind(id).first();
 if(!booking)return json({error:'Solicitud no encontrada'},404);
 const cached=await env.DB.prepare('SELECT distance_m,duration_s,updated_at FROM booking_routes WHERE booking_id=?').bind(id).first();
 if(cached&&now()-Number(cached.updated_at)<7*86400)return json(toOutput(cached,true));
 if(!env.VIA_GOOGLE_ROUTES_KEY)
  return json({error:'Cálculo por carretera aún no configurado. Podés consultar la ruta en Google Maps.',reason:'route_provider_missing'},503);
 if(!await limit(env,'user:'+actor.id,30,3600))
  return json({error:'Límite temporal de cálculos alcanzado. Volvé a intentarlo más tarde.'},429);
 if(!hasLocation(booking.origin)||!hasLocation(booking.destination))return json({error:'Direcciones insuficientes para calcular la ruta'},422);
 const body={
  origin:{address:booking.origin+', Uruguay'},
  destination:{address:booking.destination+', Uruguay'},
  travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',
  languageCode:'es-419',regionCode:'UY',units:'METRIC'
 };
 let result;
 try{
  const r=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
   method:'POST',
   headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.VIA_GOOGLE_ROUTES_KEY,
    'X-Goog-FieldMask':'routes.distanceMeters,routes.duration'},
   body:JSON.stringify(body),signal:AbortSignal.timeout(11000)
  });
  if(!r.ok)return json({error:'No se pudo calcular la ruta. Revisá las direcciones en Google Maps.'},502);
  result=await r.json();
 }catch{return json({error:'La ruta no respondió. Volvé a intentar.'},504)}
 const candidate=result?.routes?.[0];
 const distance=Number(candidate?.distanceMeters);
 const duration=Number(String(candidate?.duration||'').replace(/s$/,''));
 if(!Number.isFinite(distance)||distance<100||distance>2000000||
    !Number.isFinite(duration)||duration<=0||duration>5*86400)
   return json({error:'No se encontró una ruta de conducción válida'},422);
 await env.DB.prepare('INSERT INTO booking_routes(booking_id,distance_m,duration_s,provider,updated_at) VALUES (?,?,?,?,unixepoch()) ON CONFLICT(booking_id) DO UPDATE SET distance_m=excluded.distance_m,duration_s=excluded.duration_s,provider=excluded.provider,updated_at=excluded.updated_at')
  .bind(id,Math.round(distance),Math.round(duration),'google-routes').run();
 return json(toOutput({distance_m:distance,duration_s:duration},false));
}
