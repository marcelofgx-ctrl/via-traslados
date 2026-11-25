import {expandedProxy,rankPlaces} from './v303-poi-expansion.mjs';
import legacy from './legacy.mjs';
const API='https://via-traslados-api.marcelof-gx.workers.dev';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const point=p=>{p=p?.point||p;const lat=p?.lat,lng=p?.lng??p?.lon;
 return typeof lat==='number'&&typeof lng==='number'&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52?{lat,lng}:null};
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/public/route-preview'&&request.method==='POST'){
  try{
   const raw=await request.text();if(raw.length>1200)return json({error:'Consulta demasiado grande'},413);
   const p=JSON.parse(raw),a=point(p.originLocation),b=point(p.destinationLocation);
   if(!a||!b)return json({error:'Seleccioná origen y destino con coordenadas'},422);
   const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://viatraslados.com'},body:JSON.stringify({origin:'Punto QA origen',destination:'Punto QA destino',originLocation:a,destinationLocation:b}),signal:AbortSignal.timeout(22000)});
   const j=await r.json();
   return json(r.ok?{distanceKm:j.distanceKm,durationMinutes:j.durationMinutes,source:j.source,cached:j.cached,estimate:true}:{error:j.error||'Ruta no disponible'},r.status);
  }catch{return json({error:'Ruta no disponible'},503)}
 }
 if(path.startsWith('/api/')&&!(path==='/api/direcciones'&&request.method==='GET'))return json({error:'QA aislada: reservas y cuentas bloqueadas'},503);
 const bridge={fetch(r){const u=new URL(r.url);if(r.method!=='GET'||u.pathname!=='/api/via-places')return json({error:'QA GET only'},405);return expandedProxy(r,req=>{const v=new URL(req.url);return fetch(API+v.pathname+v.search,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});});}};
 // The legacy search has a 4.8s signal; this bridge maintains the same overall budget
 // while the fallback is invoked only for sparse results.
 const result=await legacy.fetch(request,{...env,VIA_PLACES_ENABLED:'true',VIA_POI_API:bridge},ctx);
 if(path!=='/api/direcciones'||url.searchParams.get('mode')!=='places'||!result.ok)return result;
 try{const j=await result.clone().json();if(!Array.isArray(j.results))return result;
 return json({...j,results:rankPlaces(url.searchParams.get('q'),j.results,url.searchParams.get('lat'),url.searchParams.get('lng'))});
 }catch{return result;}
}};
