// Vía Traslados — API pública de rutas exclusivamente para QA. Sin escrituras ni accesos a producción.
import geo from './geo-directions.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=-36&&p.lat<=-30&&p.lng>=-59&&p.lng<=-52;
const coord=p=>{
 if(!p||typeof p!=='object')return null;
 const la=p.lat??p.latitude??p.latitud??p.coordinates?.lat??p.coords?.latitude;
 const lo=p.lng??p.lon??p.longitude??p.longitud??p.coordinates?.lng??p.coords?.longitude;
 if(la==null||lo==null||la===''||lo==='')return null;
 const v={lat:Number(la),lng:Number(lo)};
 return valid(v)?v:null;
};
async function resolve(p,req,env){
 const known=coord(p);if(known)return known;
 const q=String(typeof p==='string'?p:p?.address??p?.label??p?.direccion??'').trim().slice(0,160);
 if(q.length<4)return null;
 if(/^aeropuerto internacional de carrasco(?:\b|,)/i.test(q))return {lat:-34.83696,lng:-56.01638};
 const u=new URL('/api/direcciones',req.url);u.searchParams.set('mode','resolve');u.searchParams.set('q',q);
 const response=await geo.fetch(new Request(u),env);
 if(!response.ok)return null;
 const body=await response.json();
 return (Array.isArray(body.results)?body.results:[]).map(coord).find(Boolean)||null;
}
function result(meters,seconds,source){
 if(!Number.isFinite(meters)||meters<100||meters>2000000||!Number.isFinite(seconds)||seconds<=0||seconds>432000)throw Error('invalid_route');
 return {distanceKm:Math.round(meters/100)/10,durationMinutes:Math.ceil(seconds/60),
         source,estimate:true,trafficIncluded:false,cached:false,qaOnly:true,
         attribution:'© OpenStreetMap contributors · '+source+' (solo QA)'};
}
async function osrm(host,prefix,a,b){
 const u='https://'+host+prefix+'/route/v1/driving/'+a.lng+','+a.lat+';'+b.lng+','+b.lat+'?overview=false&steps=false';
 const resp=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
 if(!resp.ok)throw Error('HTTP_'+resp.status);
 const body=await resp.json();
 if(body?.code!=='Ok')throw Error('OSRM_'+String(body?.code||'invalid').slice(0,30));
 const route=body?.routes?.[0];
 return result(Number(route?.distance),Number(route?.duration),'OSRM QA');
}
async function valhalla(a,b){
 const u=new URL('https://valhalla1.openstreetmap.de/route');
 u.searchParams.set('json',JSON.stringify({locations:[{lat:a.lat,lon:a.lng},{lat:b.lat,lon:b.lng}],costing:'auto',units:'kilometers'}));
 const resp=await fetch(u,{headers:{accept:'application/json','X-Client-Id':'viatraslados.com-qa'},signal:AbortSignal.timeout(9000)});
 if(!resp.ok)throw Error('HTTP_'+resp.status);
 const body=await resp.json();
 return result(Number(body?.trip?.summary?.length)*1000,Number(body?.trip?.summary?.time),'Valhalla QA');
}
const providers=[
 ['OSRM_FOSSGIS',(a,b)=>osrm('routing.openstreetmap.de','/routed-car',a,b)],
 ['VALHALLA_FOSSGIS',valhalla],
 ['OSRM_DEMO',(a,b)=>osrm('router.project-osrm.org','',a,b)]
];
async function route(req,env){
 if(req.method!=='POST')return json({error:'Método no permitido'},405);
 try{
  const raw=await req.text();
  if(raw.length>4096)return json({error:'Solicitud demasiado grande'},413);
  let data;
  try{data=JSON.parse(raw)}catch{return json({error:'JSON inválido'},400)}
  if(!data||typeof data!=='object'||!('origin'in data)||!('destination'in data))return json({error:'Se requieren origen y destino'},400);
  const [a,b]=await Promise.all([resolve(data.origin,req,env),resolve(data.destination,req,env)]);
  if(!a||!b)return json({error:'No se pudieron resolver las coordenadas de origen o destino; verificá la dirección'},422);
  const toRadians=Math.PI/180,dy=(b.lat-a.lat)*toRadians/2,dx=(b.lng-a.lng)*toRadians/2;
  const direct=12742000*Math.asin(Math.sqrt(Math.sin(dy)**2+Math.cos(a.lat*toRadians)*Math.cos(b.lat*toRadians)*Math.sin(dx)**2));
  if(direct<50)return json({error:'Seleccioná dos puntos diferentes'},422);
  const failures=[];
  for(const [name,fn] of providers){
   try{return json(await fn(a,b))}
   catch(e){failures.push({provider:name,reason:String(e?.message||e).slice(0,70)})}
  }
  console.error('QA_ROUTE_PROVIDER_FAILURES',JSON.stringify(failures));
  return json({error:'No se pudo consultar ningún servicio de rutas QA',qaDiagnostic:{providers:failures}},502);
 }catch(e){
  console.error('QA_ROUTE_INTERNAL_ERROR',String(e?.message||e).slice(0,100));
  return json({error:'Ruta QA temporalmente no disponible',qaDiagnostic:{type:'internal'}},502);
 }
}
export default {async fetch(req,env){
 const path=new URL(req.url).pathname;
 if(path==='/api/direcciones')return geo.fetch(req,env);
 if(path==='/api/public/route-preview')return route(req,env);
 if(path.startsWith('/api/'))return json({error:'QA aislada: API privada y de escritura deshabilitada'},503);
 return env.ASSETS.fetch(req);
}};
