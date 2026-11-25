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
 const bridge={fetch(r){const u=new URL(r.url);if(r.method!=='GET'||u.pathname!=='/api/via-places')return json({error:'QA GET only'},405);return fetch(API+u.pathname+u.search,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)});}};
 return legacy.fetch(request,{...env,VIA_PLACES_ENABLED:'true',VIA_POI_API:bridge},ctx);
}};
