import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'Falta cuenta/token Cloudflare');
const WEB='via-traslados-web-prod',API='via-traslados-api';
const BASE='f2575cba-3454-4181-b985-5c627a301384';
const API_V35='9f0db4cc-29b8-4d79-8ce8-8fb0588bd079';
const OLD_REF='0d406c29b3339e3f18a3c0fdc2155ca4cd2015e72b93e4ad8d28cc44c70ba0a5';
const GEO='17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1';
const CONFIG='51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273';
const APK='324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3';
const sha=b=>createHash('sha256').update(b).digest('hex');
const newRef=sha(await readFile('gps-v2913-build/assets/reference.js'));
assert.notEqual(newRef,OLD_REF,'GPS V29.1.3 no tiene cambio');
const apiUrl=name=>'https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/deployments';
async function deployed(name){
 const r=await fetch(apiUrl(name),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'Cloudflare '+name+' HTTP '+r.status);
 const payload=await r.json();assert.equal(payload.success,true);
 const list=payload.result?.deployments||payload.result;
 assert(Array.isArray(list)&&list[0]?.versions?.length===1,'Versiones mixtas de '+name);
 const v=list[0].versions[0];
 assert.equal(Number(v.percentage),100,'Tráfico dividido '+name);
 return {deployment:list[0].id,version:v.version_id}
}
async function getAsset(path){
 const response=await fetch('https://viatraslados.com/'+path,{
  headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200,'Web '+path+' status '+response.status);
 return Buffer.from(await response.arrayBuffer());
}
async function website(phase){
 const html=(await getAsset('')).toString('utf8');
 for(const req of ['app.js?v=29.1','store.js?v=19.1','geo-v2/core.mjs?v=3'])
  assert(html.includes(req),'HTML sin '+req);
 assert(!html.includes('GPS QA'),'Marca QA filtrada a producción');
 const newer=phase==='after';
 assert(html.includes(newer?'content="29.1.3"':'content="29.1.2"'),'Meta versión inválida');
 assert(html.includes(newer?'reference.js?v=29':'reference.js?v=28'),'Versión GPS no coincide');
 const currentRef=sha(await getAsset(newer?'reference.js?v=29':'reference.js?v=28'));
 assert.equal(currentRef,newer?newRef:OLD_REF,'GPS JS incompatible con '+phase);
 assert.equal(sha(await getAsset('geo-v2/core.mjs?v=3')),GEO,'Motor vial alterado');
 assert.equal(sha(await getAsset('config.js')),CONFIG,'config.js alterado');
 assert.equal(sha(await getAsset('descargas/via-traslados-conductor-v35.apk')),APK,'APK firmada alterada');
 const health=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',{
  signal:AbortSignal.timeout(30000)});
 assert.equal(health.status,200,'API sin salud');
 const h=await health.json();
 assert(h.ok===true&&h.otpAvailable===true,'API OTP no disponible');
 return {refSha:currentRef,geoSha:GEO,configSha:CONFIG,apkSha:APK,apiHealth:true}
}
async function record(name,data){
 await mkdir('gps-v2913-release-proof',{recursive:true});
 await writeFile('gps-v2913-release-proof/'+name+'.json',
  JSON.stringify({at:new Date().toISOString(),...data},null,2)+'\n');
}
async function rollback(){
 const current=await deployed(WEB);
 if(current.version!==BASE){
  const result=await fetch(apiUrl(WEB),{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({strategy:'percentage',versions:[{version_id:BASE,percentage:100}]}),
   signal:AbortSignal.timeout(30000)});
  assert.equal(result.status,200,'Rollback HTTP '+result.status);
  const answer=await result.json();assert.equal(answer.success,true,'Rollback rechazado');
 }
 for(let attempt=0;attempt<10;attempt++){
  try{
   const version=await deployed(WEB);
   if(version.version===BASE){
    const assets=await website('before');
    await record('rollback',{web:version,assets,rollbackConfirmed:true});
    console.log('VIA_GPS_V2913_ROLLBACK_VERIFIED '+JSON.stringify(version));return;
   }
  }catch(err){console.log('Propagación rollback: '+err.message)}
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
 throw Error('Rollback no comprobado');
}
const mode=process.argv[2];
if(mode==='before'){
 const [web,api]=await Promise.all([deployed(WEB),deployed(API)]);
 assert.equal(web.version,BASE,'La web productiva cambió antes de publicar');
 assert.equal(api.version,API_V35,'La API V35 cambió');
 const files=await website('before');
 await record('before',{web,api,files,rollbackVersion:BASE,newRef});
 console.log('VIA_GPS_V2913_PROD_PREFLIGHT '+JSON.stringify({web,api,newRef}));
}else if(mode==='after'){
 let verified;
 for(let i=0;i<9;i++){
  try{verified=await website('after');break}
  catch(e){if(i===8)throw e;await new Promise(resolve=>setTimeout(resolve,3500))}
 }
 const [web,api]=await Promise.all([deployed(WEB),deployed(API)]);
 assert.notEqual(web.version,BASE,'No se activó una versión nueva');
 assert.equal(api.version,API_V35,'API productiva cambió durante publicación');
 await record('after',{web,api,files:verified,rollbackVersion:BASE});
 console.log('VIA_GPS_V2913_PROD_DEPLOY_VERIFIED '+JSON.stringify({web,api,files:verified,rollbackVersion:BASE}));
}else if(mode==='rollback')await rollback();
else throw Error('Modo esperado: before / after / rollback');
