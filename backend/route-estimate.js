// Vía Traslados: cálculo de distancias comerciales con Geoapify Free + IDE Uruguay.
// Ninguna clave sale de Cloudflare, la APK solo recibe km, minutos y atribución.
import {identity} from './staff.js';

const now=()=>Math.floor(Date.now()/1000);
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
const valid=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&
 lat>=-36&&lat<=-30&&lon>=-59&&lon<=-52;
const trim=x=>String(x??'').trim().replace(/\s+/g,' ').slice(0,200);
const fold=x=>trim(x).toLocaleLowerCase('es').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const neatCoords=p=>p.lat.toFixed(6)+','+p.lon.toFixed(6);
const haversine=(a,b)=>{
 const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 const x=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
 return 12742000*Math.asin(Math.sqrt(x));
};
// Lugares con ubicación verificada, ya existentes en el buscador de la web.
const KNOWN=[
 {prefix:'aeropuerto internacional de carrasco',lat:-34.83696,lon:-56.01638},
 {prefix:'montevideo shopping',lat:-34.9086802,lon:-56.1380179},
 {prefix:'costa urbana shopping',lat:-34.8409909,lon:-55.9933919},
 {prefix:'punta carretas shopping',lat:-34.9237858,lon:-56.1620131}
];
const knownPoint=address=>{
 const t=fold(address);
 const p=KNOWN.find(x=>t===x.prefix||t.startsWith(x.prefix+' '));
 return p?{lat:p.lat,lon:p.lon,source:'catálogo de lugares verificados'}:null;
};
const limit=async(env,scope,max,seconds)=>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('via-route:'+scope));
 const key=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const r=await env.DB.prepare('INSERT INTO otp_rate_limits (rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(key,seconds,seconds).first();
 return Number(r?.attempts||0)<=max;
};
// IDE Uruguay resuelve portales, sin consumir créditos de Geoapify.
async function lookupIde(address){
 try{
  const u=new URL('https://direcciones.ide.uy/api/v1/geocode/direcUnica');
  u.searchParams.set('q',address);
  u.searchParams.set('limit','5');
  const response=await fetch(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5500)});
  if(!response.ok)return null;
  const rows=await response.json();
  if(!Array.isArray(rows))return null;
  const hasNumber=/\b\d{1,6}\b/.test(address);
  for(const row of rows){
   const lat=Number(row.lat??row.latitud),lon=Number(row.lng??row.lon??row.longitud);
   if(!valid(lat,lon))continue;
   if(/aproxim|centroide|no encontrad|cercano/i.test(String(row.stateMsg||'')))continue;
   // Evitar centroides de calle para direcciones que llevan número de puerta.
   if(hasNumber&&row.type!=='CALLEyPORTAL')continue;
   if(!hasNumber&&!['CALLEyPORTAL','ESQUINA'].includes(row.type))continue;
   return{lat,lon,source:'IDE Uruguay'};
  }
 }catch{}
 return null;
}
async function lookupGeoapify(address,key){
 const u=new URL('https://api.geoapify.com/v1/geocode/search');
 u.searchParams.set('text',address.replace(/,\s*Uruguay$/i,'')+', Uruguay');
 u.searchParams.set('filter','countrycode:uy');
 u.searchParams.set('lang','es');
 u.searchParams.set('limit','3');
 u.searchParams.set('format','json');
 u.searchParams.set('apiKey',key);
 let response;
 try{response=await fetch(u,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}})}
 catch{return null}
 if(!response.ok)return null;
 let rows;
 try{rows=(await response.json()).results}catch{return null}
 if(!Array.isArray(rows))return null;
 const hasNumber=/\b\d{1,6}\b/.test(address);
 for(const row of rows){
  const lat=Number(row.lat),lon=Number(row.lon);
  if(!valid(lat,lon)||String(row.country_code||'').toLowerCase()!=='uy')continue;
  const confidence=Number(row.rank?.confidence??0);
  if(!Number.isFinite(confidence)||confidence<0.65)continue;
  // Sin coincidencia de puerta no se presenta una distancia aparentemente exacta.
  if(hasNumber&&!row.housenumber&&row.rank?.match_type!=='full_match')continue;
  return{lat,lon,source:'Geoapify Geocoding'};
 }
 return null;
}
async function locate(address,key){
 const known=knownPoint(address);
 if(known)return known;
 const ide=await lookupIde(address);
 if(ide)return ide;
 return lookupGeoapify(address,key);
}
async function drivingRoute(origin,destination,key){
 const url=new URL('https://api.geoapify.com/v1/routing');
 url.searchParams.set('waypoints',neatCoords(origin)+'|'+neatCoords(destination));
 url.searchParams.set('mode','drive');
 url.searchParams.set('format','json');
 url.searchParams.set('units','metric');
 url.searchParams.set('apiKey',key);
 let response;
 try{response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)})}
 catch{return{status:504,error:'La consulta de rutas tardó demasiado. Intentá nuevamente.'}}
 if(response.status===429)return{status:429,error:'Se alcanzó el límite de consultas del servicio gratuito.'};
 if(!response.ok)return{status:502,error:'El servicio de rutas no pudo calcular el recorrido.'};
 let data;
 try{data=await response.json()}catch{return{status:502,error:'Respuesta de rutas no válida.'}}
 const route=data?.results?.[0];
 const distance=Number(route?.distance),time=Number(route?.time);
 if(!Number.isFinite(distance)||distance<100||distance>2000000||
    !Number.isFinite(time)||time<=0||time>432000||
    distance<haversine(origin,destination)*0.75)
  return{status:422,error:'No se encontró una ruta de conducción válida.'};
 return{distance:Math.round(distance),time:Math.round(time)};
}
const toOutput=(r,cached)=>({
 distanceKm:Math.round(Number(r.distance_m)/100)/10,
 durationMinutes:Math.ceil(Number(r.duration_s)/60),
 source:'Geoapify',estimate:true,trafficIncluded:false,cached,
 attribution:'© OpenStreetMap contributors · Powered by Geoapify',
 attributionUrl:'https://www.geoapify.com/'
});
// Misma lógica para cualquier consumidor: al crearse la reserva, al recuperarse
// una reserva antigua o al pedir una ruta explícitamente; no requiere
// credenciales de operador para las tareas internas del Worker.
export async function precalculateBookingRoute(env,booking,scope='system'){
 if(!booking?.id)return{status:422,data:{error:'Reserva inválida'}};
 const id=booking.id;
 const cached=await env.DB.prepare('SELECT distance_m,duration_s,provider,updated_at FROM booking_routes WHERE booking_id=?').bind(id).first();
 if(cached?.provider==='geoapify'&&now()-Number(cached.updated_at)<7*86400)
  return{status:200,data:toOutput(cached,true)};
 const key=env.VIA_GEOAPIFY_API_KEY;
 if(typeof key!=='string'||key.trim().length<10)
  return{status:503,data:{error:'Motor gratuito de distancias no configurado.',reason:'route_provider_missing'}};
 // Capacidad del plan Free: el cálculo no se repite en refrescos normales;
 // este límite protege también las tareas del sistema.
 if(!await limit(env,'user:'+scope,30,3600))
  return{status:429,data:{error:'Límite de cálculos temporalmente alcanzado.'}};
 if(!await limit(env,'free-budget',250,86400))
  return{status:429,data:{error:'Presupuesto diario de rutas agotado.'}};
 if(!trim(booking.origin)||!trim(booking.destination))
  return{status:422,data:{error:'Direcciones insuficientes para calcular la ruta.'}};
 const [origin,destination]=await Promise.all([
  locate(trim(booking.origin),key),locate(trim(booking.destination),key)
 ]);
 if(!origin||!destination)
  return{status:422,data:{error:'No se pudo localizar origen o destino con suficiente precisión.'}};
 const result=await drivingRoute(origin,destination,key);
 if(result.error)return{status:result.status,data:{error:result.error}};
 await env.DB.prepare('INSERT INTO booking_routes(booking_id,distance_m,duration_s,provider,updated_at) VALUES (?,?,?,?,unixepoch()) ON CONFLICT(booking_id) DO UPDATE SET distance_m=excluded.distance_m,duration_s=excluded.duration_s,provider=excluded.provider,updated_at=excluded.updated_at')
  .bind(id,result.distance,result.time,'geoapify').run();
 return{status:200,data:toOutput({distance_m:result.distance,duration_s:result.time},false)};
}

export async function routeEstimateRoutes(req,env,path,send){
 const respond=send||json;
 const route=path.match(/^\/api\/operator\/requests\/([A-Z0-9-]{5,64})\/route$/);
 if(!route||req.method!=='GET')return null;
 const actor=await identity(req,env);
 if(!actor)return respond({error:'Acceso no autorizado'},401);
 const id=route[1];
 if(actor.role!=='admin'){
  const assignment=await env.DB.prepare('SELECT driver_id FROM driver_assignments WHERE booking_id=?').bind(id).first();
  if(assignment?.driver_id!==actor.id)return respond({error:'Viaje no asignado a tu cuenta'},403);
 }
 const booking=await env.DB.prepare('SELECT id,origin,destination FROM bookings WHERE id=?').bind(id).first();
 if(!booking)return respond({error:'Solicitud no encontrada'},404);
 const result=await precalculateBookingRoute(env,booking,actor.id);
 return respond(result.data,result.status);
}
