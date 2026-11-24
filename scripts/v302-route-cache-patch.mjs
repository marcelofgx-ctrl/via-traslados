import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function patchStore(source,helper){
 const marker=/async function estimateRoute\(origin,destination,originLocation=null,destinationLocation=null\)\s*\{\s*if\(isDemo\(\)\)return null;[^\n]*\n\s*return request\('\/api\/public\/route-preview',\{method:'POST',body:JSON\.stringify\(\{\s*origin,destination,originLocation,destinationLocation\s*\}\)\}\);\s*\}/g;
 if([...source.matchAll(marker)].length!==1||source.includes('via-route-preview-cache-v1'))throw Error('Unexpected production store route contract');
 const replacement=helper.replace('export function createRoutePreviewCache','function createRoutePreviewCache')+
 "\n const routeCache=createRoutePreviewCache({load:(origin,destination,originLocation,destinationLocation)=>request('/api/public/route-preview',{method:'POST',body:JSON.stringify({origin,destination,originLocation,destinationLocation})}),storage:(()=>{try{return global.localStorage}catch{return null}})()});\n async function estimateRoute(origin,destination,originLocation=null,destinationLocation=null){if(isDemo())return null;return routeCache.estimate(origin,destination,originLocation,destinationLocation);}";
 return source.replace(marker,()=>replacement);
}
export function patchApp(s){
 const a=s.indexOf('async function previewRoute(force=false)'),b=s.indexOf('function changeStep(n)',a);
 if(a<0||b<a||s.indexOf('async function previewRoute(force=false)',a+1)>=0)throw Error('Unknown production route UI');
 const prior=s.slice(a,b);
 for(const m of ['S.estimateRoute','routePending','tripLast','via-route-retry','via:address','change'])if(!prior.includes(m))throw Error('Route UI missing '+m);
 const next=String.raw`let routeTimer=null;
 function routeKey(p){return JSON.stringify([p.origin,p.destination,p.originLocation?.lat??null,p.originLocation?.lng??p.originLocation?.lon??null,p.destinationLocation?.lat??null,p.destinationLocation?.lng??p.destinationLocation?.lon??null])}
 function cancelRouteTimer(){clearTimeout(routeTimer);routeTimer=null}
 function invalidateRoute(){cancelRouteTimer();++routePending;tripLast='';routeFeedback('Elegí origen y destino','Mostraremos los kilómetros por carretera.')}
 async function previewRoute(force=false){
  cancelRouteTimer();
  if(wizard.classList.contains('hidden'))return;
  const p=trip(),key=routeKey(p);
  if(p.origin.length<5||p.destination.length<5||p.origin===p.destination){invalidateRoute();return}
  if(!force&&tripLast===key)return;
  tripLast=key;const pending=++routePending;
  const current=()=>pending===routePending&&routeKey(trip())===key&&!wizard.classList.contains('hidden');
  routeFeedback('Calculando recorrido…','Buscando ruta por carretera, sin tráfico en vivo.');
  try{
   const res=await S.estimateRoute(p.origin,p.destination,p.originLocation,p.destinationLocation);
   if(!current())return;
   const distance=Number(res?.distanceKm),minutes=Number(res?.durationMinutes);
   if(!(distance>0&&minutes>0))throw Error('Ruta no disponible');
   routeFeedback(distance.toLocaleString('es-UY',{maximumFractionDigits:1})+' km · '+minutes+' min aprox.','Ruta estimada · Sin tránsito en vivo · © OpenStreetMap / Geoapify');
  }catch(ex){
   if(!current())return;
   tripLast='';
   routeFeedback('Kilómetros por confirmar',ex?.status===429?'Límite temporal de consultas. Podés reintentar más tarde o continuar.':'Podés continuar: el presupuesto se cotiza manualmente, sin inventar una distancia.',true);
  }
 }
 function scheduleRoute(){
  if(wizard.classList.contains('hidden'))return;
  const key=routeKey(trip());
  if(tripLast===key)return;
  invalidateRoute();routeTimer=setTimeout(()=>previewRoute(),500);
 }
 $('via-route-retry')?.addEventListener('click',()=>previewRoute(true));
 for(const id of ['origin','destination']){
  const el=$(id);if(!el)continue;
  el.addEventListener('input',invalidateRoute);
  el.addEventListener('via:address',scheduleRoute);
  el.addEventListener('change',scheduleRoute);
 }
 `;
 let out=s.slice(0,a)+next+s.slice(b);
 if(out.split('setTimeout(()=>previewRoute(),180);').length!==2||out.split("++routePending;wizard.classList.add('hidden')").length!==2)throw Error('Unknown navigation anchors');
 out=out.replace('setTimeout(()=>previewRoute(),180);','scheduleRoute();').replace("++routePending;wizard.classList.add('hidden')","cancelRouteTimer();++routePending;wizard.classList.add('hidden')");
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir=process.argv[2];const h=await readFile('addons/via-route-preview-cache.mjs','utf8');
 for(const [name,fn] of [['store.js',s=>patchStore(s,h)],['app.js',patchApp]]){
  const p=dir+'/'+name;await writeFile(p,fn(await readFile(p,'utf8')),'utf8');
 }
}
