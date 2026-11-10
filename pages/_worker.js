// Vía Traslados — Worker de Cloudflare Pages, aislado del backend y de otros proyectos.
const IDE='https://direcciones.ide.uy';
const clean=v=>String(v??'').trim().replace(/\s+/g,' ').slice(0,160);
const valid=(la,lo)=>Number.isFinite(la)&&Number.isFinite(lo)&&la>=-36&&la<=-30&&lo>=-59&&lo<=-52;
const fold=v=>clean(v).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').trim();
const number=v=>(v==null||v==='')?null:Number(v);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const km=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2),y=Math.sin((d-b)*r/2);return 12742*Math.asin(Math.sqrt(x*x+Math.cos(a*r)*Math.cos(c*r)*y*y))};
const PLACES=[
 {name:'Aeropuerto Internacional de Carrasco',aliases:['aeropuerto carrasco','aeropuerto de carrasco','mvd','carrasco airport'],city:'Colonia Nicolich',department:'Canelones',lat:-34.83696,lng:-56.01638,detail:'Terminal de pasajeros; confirmar lugar de recogida'},
 {name:'Costa Urbana Shopping',aliases:['shopping costa urbana','costa urbana','shopping lagomar'],city:'Ciudad de la Costa',department:'Canelones',lat:-34.8409909,lng:-55.9933919,detail:'Av. Giannattasio km 21'},
 {name:'Montevideo Shopping',aliases:['shopping montevideo','montevideo shopping'],city:'Montevideo',department:'Montevideo',lat:-34.9086802,lng:-56.1380179,detail:'Av. Luis Alberto de Herrera 1290'},
 {name:'Punta Carretas Shopping',aliases:['shopping punta carretas','punta carretas shopping'],city:'Montevideo',department:'Montevideo',lat:-34.9237858,lng:-56.1620131,detail:'José Ellauri 350'}
];
function normalized(row,mode){
 if(typeof row==='string')return {label:clean(row),street:clean(row),city:'',department:'',lat:null,lng:null,accuracy:'street'};
 if(!row||typeof row!=='object')return null;
 const street=clean(row.nomVia?[row.nomVia,row.portalNumber].filter(Boolean).join(' '):row.calle||row.address||row.direccion||row.nombre||'');
 const city=clean(row.localidad||''),department=clean(row.departamento||'');
 const lat=number(row.lat),lng=number(row.lng);
 if(!street||(mode!=='suggest'&&!valid(lat,lng)))return null;
 const approximate=/aproxim|cercano|centroide|no encontrad/i.test(String(row.stateMsg||''));
 const accuracy=mode==='suggest'?(row.type==='CALLEyPORTAL'&&!approximate?'portal':'street'):(row.type==='CALLEyPORTAL'&&!approximate?'portal':row.type==='ESQUINA'&&!approximate?'intersection':'approximate');
 return {label:[street,city,department].filter(Boolean).join(', '),street,city,department,lat:valid(lat,lng)?lat:null,lng:valid(lat,lng)?lng:null,accuracy,...(mode==='suggest'?{}:{source:'IDE Uruguay'})};
}
async function places(q,la,lo,signal){
 const f=fold(q),items=[];
 for(const p of PLACES){if([p.name,...p.aliases].some(n=>fold(n).includes(f)||f.includes(fold(n))))items.push({label:[p.name,p.city,p.department].join(', '),street:p.name,city:p.city,department:p.department,lat:p.lat,lng:p.lng,accuracy:'poi',kind:'place',source:'Catálogo verificado',detail:p.detail});}
 const deps=valid(la,lo)&&lo>-56.085?['Canelones','Montevideo','Maldonado']:['Montevideo','Canelones','Maldonado'];
 const found=await Promise.all(deps.map(async departamento=>{try{const u=new URL('/api/v1/geocode/direcPuntoNotable',IDE);u.searchParams.set('nombre',q);u.searchParams.set('departamento',departamento);const r=await fetch(u,{signal,headers:{Accept:'application/json'}});if(!r.ok)return [];const data=await r.json();const rows=Array.isArray(data)?data:Array.isArray(data.resultados)?data.resultados:Array.isArray(data.results)?data.results:[];return rows.slice(0,30).map(x=>{const street=clean(x.nombre||x.nombrePuntoNotable||x.puntoNotable||x.name||x.nomPoi||'');const lat=Number(x.lat??x.latitud??x.y),lng=Number(x.lng??x.lon??x.longitud??x.x);if(!street||!valid(lat,lng))return null;const city=clean(x.localidad||x.nomLocalidad||'');return {label:[street,city,departamento].filter(Boolean).join(', '),street,city,department:departamento,lat,lng,accuracy:'poi',kind:'place',source:'IDE Uruguay',detail:'Confirmar acceso de recogida'}}).filter(Boolean)}catch{return []}}));
 items.push(...found.flat());
 const distinct=[...new Map(items.map(p=>[fold(p.street)+'|'+fold(p.department),p])).values()];
 const generic=/^(shopping|shoppings|aeropuerto|hospital|clinica|hotel|terminal|supermercado|centro comercial)$/.test(f);
 const score=p=>fold(p.street).includes(f)?2:0;
 distinct.sort((a,b)=>generic&&valid(la,lo)?km(la,lo,a.lat,a.lng)-km(la,lo,b.lat,b.lng):score(b)-score(a)||(valid(la,lo)?km(la,lo,a.lat,a.lng)-km(la,lo,b.lat,b.lng):0));
 return distinct.slice(0,12).map(p=>({...p,...(valid(la,lo)?{distanceKm:Math.round(km(la,lo,p.lat,p.lng)*10)/10}:{})}));
}
async function directions(request){
 if(request.method!=='GET')return json({error:'Método no permitido'},405);
 const params=new URL(request.url).searchParams,q=clean(params.get('q')),mode=['resolve','reverse','places'].includes(params.get('mode'))?params.get('mode'):'suggest';
 const lat=Number(params.get('lat')),lng=Number(params.get('lng'));
 if(mode==='reverse'&&!valid(lat,lng))return json({error:'Coordenadas fuera de Uruguay.'},400);
 if(mode!=='reverse'&&(q.length<3||q.length>120))return json({error:'Ingresá al menos 3 caracteres de la dirección.'},400);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6500);
 try{
  if(mode==='places')return json({results:await places(q,lat,lng,ctl.signal),mode,provider:'IDE Uruguay + lugares verificados'});
  const u=new URL(mode==='suggest'?'/api/v1/geocode/candidates':mode==='reverse'?'/api/v1/geocode/reverse':'/api/v1/geocode/direcUnica',IDE);
  if(mode==='reverse'){u.searchParams.set('latitud',String(lat));u.searchParams.set('longitud',String(lng));u.searchParams.set('limit','1')}
  else{u.searchParams.set('q',q);u.searchParams.set('limit',mode==='suggest'?'30':'5')}
  const response=await fetch(u,{signal:ctl.signal,headers:{Accept:'application/json'}});if(!response.ok)throw Error('IDE no disponible');
  const rows=await response.json();if(!Array.isArray(rows))throw Error('Respuesta inválida');
  const results=rows.map(r=>normalized(r,mode)).filter(Boolean);
  if(mode==='suggest'){const nq=fold(q),tokens=nq.split(' ').filter(v=>v.length>2);const score=r=>{const name=fold(r.street);return (name===nq?7:0)+(name.startsWith(nq)?5:0)+(name.includes(nq)?3:0)+tokens.filter(t=>name.includes(t)).length*2+(fold(r.department)==='montevideo'?2:fold(r.department)==='canelones'?1.5:0)};results.sort((a,b)=>score(b)-score(a))}
  return json({results:results.slice(0,8),mode,provider:'IDE Uruguay'});
 }catch{return json({error:'El buscador de direcciones no está disponible ahora. Podés ingresar la dirección manualmente.',results:[]},503)}
 finally{clearTimeout(timer)}
}
// Control de mantenimiento leído en D1 a través de la API: no depende de JavaScript del pasajero.
// Mantiene /conductor.html y los recursos estáticos disponibles para recuperar la operación.
const API_STATUS='https://via-traslados-api.marcelof-gx.workers.dev/api/public/status';
const maintenance=()=>new Response('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vía Traslados · Servicio temporalmente suspendido</title></head><body style="font:16px system-ui;margin:10vh auto;max-width:550px;padding:24px;color:#19393b"><h1>Vía Traslados</h1><h2>Servicio temporalmente suspendido</h2><p>Las solicitudes nuevas no están disponibles en este momento. Por favor, volvé a intentarlo más tarde.</p></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Robots-Tag':'noindex'}});
const isPublicPage=(request,path)=>{
 if(request.method!=='GET')return false;
 if(path==='/conductor.html'||path==='/admin.html')return false;
 return path==='/'||path==='/index.html'||path==='/reserva.html'||path==='/mis-reservas.html'||(path.endsWith('.html')&&request.headers.get('Accept')?.includes('text/html'));
};
async function isClosed(){
 try {
   const response=await fetch(API_STATUS,{headers:{'Accept':'application/json','Cache-Control':'no-cache'},cf:{cacheTtl:0}});
   if(!response.ok)return false; // El backend se encarga de bloquear solicitudes cuando no pueda responder.
   const state=await response.json();
   return state.enabled===false;
 }catch{return false}
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(isPublicPage(request,path) && await isClosed())return maintenance();
 return path==='/api/direcciones'?directions(request):env.ASSETS.fetch(request);
}};
