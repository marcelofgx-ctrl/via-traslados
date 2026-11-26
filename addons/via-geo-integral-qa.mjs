import {viaReverseRace} from './via-reverse-bridge.mjs';
const WEB='https://viatraslados.com',API='https://via-traslados-api.marcelof-gx.workers.dev',BACKUP='https://8d9255cc-via-traslados-api.marcelof-gx.workers.dev';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const point=p=>p&&typeof p.lat==='number'&&typeof p.lng==='number'&&p.lat>=-36&&p.lat<=-30&&p.lng>=-59&&p.lng<=-52?{lat:p.lat,lng:p.lng}:null;
const proxy=async (origin,r,timeout)=>{const u=new URL(r.url);const h=new Headers({Accept:'application/json'});const ip=r.headers.get('CF-Connecting-IP');if(ip)h.set('CF-Connecting-IP',ip);return fetch(origin+u.pathname+u.search,{headers:h,signal:AbortSignal.timeout(timeout)});};
export default {async fetch(r,env,ctx){
 const u=new URL(r.url);
 if(u.pathname==='/api/direcciones'&&r.method==='GET'){
  const mode=u.searchParams.get('mode');
  if(mode==='reverse'){
   const legacy={fetch(req){return proxy(WEB,req,7000)}};
   const service={fetch(req){return proxy(BACKUP,req,4000)}};
   return viaReverseRace(r,{POI_CACHE:env.POI_CACHE,VIA_POI_API:service},legacy,ctx);
  }
  return proxy(WEB,r,12000).catch(()=>json({error:'Búsqueda no disponible',results:[]},503));
 }
 if(u.pathname==='/api/public/route-preview'&&r.method==='POST'){
  try{
   const raw=await r.text();if(raw.length>1200)return json({error:'Consulta demasiado grande'},413);
   const j=JSON.parse(raw),a=point(j.originLocation?.point||j.originLocation),b=point(j.destinationLocation?.point||j.destinationLocation);
   if(!a||!b)return json({error:'Seleccioná los puntos'},422);
   const response=await fetch(API+u.pathname,{method:'POST',headers:{'Content-Type':'application/json',Origin:WEB},body:JSON.stringify({origin:'Punto QA',destination:'Punto QA',originLocation:a,destinationLocation:b}),signal:AbortSignal.timeout(22000)});
   const result=await response.json();return json(response.ok?{distanceKm:result.distanceKm,durationMinutes:result.durationMinutes,source:result.source,cached:result.cached,estimate:true}:{error:result.error||'Ruta no disponible'},response.status);
  }catch{return json({error:'Ruta no disponible'},503)}
 }
 if(u.pathname==='/api/health'&&r.method==='GET')return json({ok:true,environment:'geo-integral-qa',reservations:false});
 if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method))return json({error:'QA geográfica: cuentas y reservas bloqueadas'},503);
 return env.ASSETS.fetch(r);
}};
