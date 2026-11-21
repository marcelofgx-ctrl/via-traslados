// Vía Traslados production audit. GET-only, no changes to Workers, D1 or customer data.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token && /^[a-f0-9]{32}$/i.test(account||''),'Faltan credenciales Cloudflare para la auditoría');
const cfRoot='https://api.cloudflare.com/client/v4/accounts/'+account;
async function cf(path){
  const r=await fetch(cfRoot+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(25000)});
  assert(r.ok,'Cloudflare GET '+path+' HTTP '+r.status);
  const body=await r.json();
  assert.equal(body.success,true,'Cloudflare rechazó consulta '+path);
  return body.result;
}
async function version(worker){
  const deployments=(await cf('/workers/scripts/'+worker+'/deployments'))?.deployments||[];
  assert(deployments.length>0,'Sin deployments para '+worker);
  const versions=deployments[0].versions||[];
  assert(versions.length===1&&Number(versions[0].percentage)===100,'Worker con traffic splitting: '+worker);
  return versions[0].version_id;
}
const sha=data=>createHash('sha256').update(data).digest('hex');
const site='https://viatraslados.com';
async function get(path){
  const r=await fetch(site+'/'+path,{headers:{'Cache-Control':'no-cache','Accept-Encoding':'identity','User-Agent':'ViaProdReleaseReadOnly/1.0'},signal:AbortSignal.timeout(40000)});
  assert(r.ok,'Sitio '+path+' HTTP '+r.status);
  const data=Buffer.from(await r.arrayBuffer());
  if(/\.(?:js|mjs|css)$/.test(path))assert(!String(r.headers.get('content-type')).includes('text/html'),'HTML en lugar de asset '+path);
  return data;
}
const web=await version('via-traslados-web-prod');
const api=await version('via-traslados-api');
const expected='0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b';
assert.equal(web,expected,'Versión web cambió respecto del snapshot del 21/11; detener para reauditar');
const paths=['','app.js','store.js','config.js','review-compact-v29.css','geo-v2/core.mjs','reserva.html','mis-reservas.html','descargas/via-traslados-conductor-v35.apk'];
const files={};let home;
for(const path of paths){
  let bytes=await get(path);
  if(path===''){
    home=bytes.toString('utf8');
    const normalized=home.replace(/<script\b[^>]*static\.cloudflareinsights\.com[^>]*>.*?<\/script>/gis,'');
    bytes=Buffer.from(normalized);
  }
  files[path||'index.html']=sha(bytes);
}
assert(home.includes('id="via-release-indicator"')&&home.includes('>v29.1.6</small>'),'Portada sin indicador v29.1.6');
assert(home.includes('content="29.1.6"'),'Meta de versión no coincide');
const footer=home.slice(home.indexOf('<footer'),home.indexOf('</footer>'));
assert(footer.includes('via-release-indicator'),'El indicador no está en el pie de portada');
assert.equal(files['geo-v2/core.mjs'],'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1','Motor geográfico modificado');
assert.equal(files['store.js'],'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8','Store productivo modificado');
assert.equal(files['descargas/via-traslados-conductor-v35.apk'],'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3','APK V35 cambió');
const d1=await cf('/d1/database?name=via-traslados-db');
const exact=d1.filter(d=>d.name==='via-traslados-db');
assert.equal(exact.length,1,'D1 no es única');
assert.equal(exact[0].uuid,'dfc6a732-4817-4c49-8f2b-16ecaff3ecc0','D1 no coincide con backend V35');
const bookmark=await cf('/d1/database/'+exact[0].uuid+'/time_travel/bookmark');
assert(/^[A-Za-z0-9-]{30,100}$/.test(bookmark?.bookmark||''),'D1 Time Travel no disponible');
const apiRoot='https://via-traslados-api.marcelof-gx.workers.dev';
const headers={Origin:site,Accept:'application/json'};
const statusResp=await fetch(apiRoot+'/api/public/status',{headers,signal:AbortSignal.timeout(24000)});
assert(statusResp.ok,'Estado del negocio no responde: '+statusResp.status);
const status=await statusResp.json();
assert.equal(status.enabled,true,'Servicio de reservas está deshabilitado');
const privateResp=await fetch(apiRoot+'/api/operator/requests',{headers,signal:AbortSignal.timeout(24000)});
assert([401,403].includes(privateResp.status),'Endpoint privado no está protegido: '+privateResp.status);
assert.equal(await version('via-traslados-web-prod'),web,'Web cambió durante auditoría');
assert.equal(await version('via-traslados-api'),api,'API cambió durante auditoría');
const manifest={audited_utc:new Date().toISOString(),site,display_version:'29.1.6',
  web_worker:'via-traslados-web-prod',web_worker_version:web,
  api_worker:'via-traslados-api',api_worker_version:api,
  d1_name:'via-traslados-db',d1_uuid:exact[0].uuid,d1_time_travel_available:true,
  commercial_service_enabled:true,rollback_previous_web_version:'d3561c58-fedf-4273-9b21-e07de026308d',
  public_sha256:files,production_modified:false};
await writeFile('via-production-release-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('PROD_RELEASE_READONLY_OK '+JSON.stringify({display:'v29.1.6',web,api,d1:'verified',timeTravel:'available',apk:'hash preserved',service:'enabled',resources:paths.length}));
