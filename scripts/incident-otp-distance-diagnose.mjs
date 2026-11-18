// Incidente 18/11: diagnóstico de producción. No envía correos, no crea reservas.
import assert from 'node:assert/strict';
const origin='https://viatraslados.com';
const api='https://via-traslados-api.marcelof-gx.workers.dev';
async function probe(name,url,options={}){
 const start=Date.now();
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(26000),...options});
  const text=await response.text();
  const contentType=response.headers.get('content-type')||'';
  let data=null;
  if(contentType.includes('json'))try{data=JSON.parse(text)}catch{}
  const result={name,status:response.status,ms:Date.now()-start,
   cors:response.headers.get('access-control-allow-origin'),
   contentType:contentType.slice(0,70),
   data:data ? {ok:data.ok??null,otpAvailable:data.otpAvailable??null,
      enabled:data.enabled??null,error:String(data.error||'').slice(0,140),
      distanceKm:data.distanceKm??null,durationMinutes:data.durationMinutes??null,
      cached:data.cached??null,results:Array.isArray(data.results)?data.results.length:null} : null,
   htmlLength:data?null:text.length};
  console.log('INCIDENT_PROBE '+JSON.stringify(result));
  return result;
 }catch(e){const r={name,status:0,error:String(e).slice(0,180),ms:Date.now()-start};console.log('INCIDENT_PROBE '+JSON.stringify(r));return r}
}
const get=()=>({'Origin':origin,'Accept':'application/json'});
const headers={'Content-Type':'application/json',Origin:origin,Accept:'application/json'};
const tests=[];
tests.push(await probe('direct-api-health',api+'/api/health',{headers:get()}));
tests.push(await probe('direct-api-public-status',api+'/api/public/status',{headers:get()}));
tests.push(await probe('web-worker-reverse-geocode',origin+'/api/direcciones?mode=reverse&lat=-34.905&lng=-56.185',{headers:get()}));
tests.push(await probe('web-worker-index',origin+'/',{headers:{Accept:'text/html'}}));
tests.push(await probe('web-worker-config',origin+'/config.js',{headers:{Accept:'application/javascript'}}));
tests.push(await probe('web-worker-auth-preflight',api+'/api/auth/start',{method:'OPTIONS',headers:{
 Origin:origin,'Access-Control-Request-Method':'POST',
 'Access-Control-Request-Headers':'content-type'}}));
tests.push(await probe('auth-start-invalid-payload-safely',api+'/api/auth/start',{method:'POST',headers,body:JSON.stringify({email:'invalid'})}));
tests.push(await probe('route-invalid-payload-safely',api+'/api/public/route-preview',{method:'POST',headers,body:JSON.stringify({origin:'mismo origen',destination:'mismo origen'})}));
if(process.env.VIA_PROBE_REAL_ROUTE==='1'){
 tests.push(await probe('route-actual-montevideo-airport',api+'/api/public/route-preview',{method:'POST',headers,
 body:JSON.stringify({origin:'Montevideo Shopping, Montevideo, Uruguay',
 destination:'Aeropuerto Internacional de Carrasco, Canelones, Uruguay'})}));
 tests.push(await probe('route-shangrila-airport',api+'/api/public/route-preview',{method:'POST',headers,
 body:JSON.stringify({origin:'Roque Sáenz Peña 1711, Shangrilá, Canelones',
 destination:'Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones'})}));
}
// Inspeccionar fuente JS activa sin ejecutar ni editar el frontend.
const jsResponse=await fetch(origin+'/app.js?v=29',{signal:AbortSignal.timeout(22000)});
const jsBody=await jsResponse.text();
const needles=['route-preview','distanceKm','durationMinutes','auth/start','Turnstile','captcha'];
console.log('INCIDENT_WEB_JS'+JSON.stringify({
 status:jsResponse.status,bytes:jsBody.length,
 features:Object.fromEntries(needles.map(k=>[k,jsBody.includes(k)])),
 reference:jsBody.slice(0,70)
}));
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
if(account&&token){
 assert(/^[a-f0-9]{32}$/i.test(account),'Cloudflare ID inválido');
 const worker='via-traslados-web-prod';
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+worker+'/deployments';
 const r=await fetch(endpoint,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(23000)});
 const j=await r.json();
 assert(r.ok&&j.success&&Array.isArray(j.result?.deployments),'No se puede leer historial del Worker');
 console.log('INCIDENT_WEB_WORKER_DEPLOYMENTS '+JSON.stringify(j.result.deployments.slice(0,4).map(x=>({
  id:x.id,created_on:x.created_on,versions:x.versions?.map(v=>({version_id:v.version_id,percentage:v.percentage}))
 }))));
}
const direct=tests.find(t=>t.name==='direct-api-health');
const auth=tests.find(t=>t.name==='auth-start-invalid-payload-safely');
const preview=tests.find(t=>t.name==='route-invalid-payload-safely');
const baseline={directHealth:direct.status===200,
 otpConfigured:direct.data?.otpAvailable===true,
 otpRouteAvailable:auth.status===400, routeEndpointAvailable:preview.status===422};
console.log('INCIDENT_DIAGNOSIS '+JSON.stringify(baseline));
console.log('READ_ONLY_CHECK_COMPLETE: no OTP sent, no passenger info obtained');
