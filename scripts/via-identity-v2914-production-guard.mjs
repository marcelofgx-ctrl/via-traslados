import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'Faltan credenciales Cloudflare');
const WEB='via-traslados-web-prod',API='via-traslados-api';
const BASE='ae77208c-2200-4a83-9411-c27170112009';
const API_V35='9f0db4cc-29b8-4d79-8ce8-8fb0588bd079';
const OLD_APP='3df13d2f4d318511ea189e90446da78fd448d8edf90fc4d41df7d7e7e0f03a0c';
const STORE='3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8';
const GPS='7e4841b60c7a9796673ed7ad41e54446cac3eded802bcb1cb37971cec61fd47b';
const GEO='17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1';
const CONFIG='51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273';
const APK='324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3';
const sha=b=>createHash('sha256').update(b).digest('hex');
const NEW_APP=sha(await readFile('identity-v2914-build/assets/app.js'));
assert.notEqual(NEW_APP,OLD_APP,'Parche no produjo un app.js distinto');
const url=name=>'https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/deployments';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function deployed(name){
 const r=await fetch(url(name),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'Cloudflare '+name+' HTTP '+r.status);
 const payload=await r.json();assert.equal(payload.success,true,'Cloudflare no confirmó '+name);
 const list=payload.result?.deployments||payload.result;
 assert(Array.isArray(list)&&list[0]?.versions?.length===1,'Deployment dividido o inválido '+name);
 const v=list[0].versions[0];assert.equal(Number(v.percentage),100,'Tráfico parcial '+name);
 return {deployment:list[0].id,version:v.version_id}
}
async function publicAsset(path){
 const r=await fetch('https://viatraslados.com/'+path,
  {headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'Sitio público '+path+' HTTP '+r.status);
 return Buffer.from(await r.arrayBuffer());
}
async function website(stage){
 const after=stage==='after',html=(await publicAsset('')).toString('utf8');
 for(const marker of ['store.js?v=19.1','reference.js?v=29','geo-v2/core.mjs?v=3'])
  assert(html.includes(marker),'HTML perdió '+marker);
 assert(!html.includes('IDENTIDAD QA')&&!html.includes('GPS QA'),'Banner QA en producción');
 assert(html.includes(after?'content="29.1.4"':'content="29.1.3"'),'Meta de versión errónea');
 assert(html.includes(after?'app.js?v=29.2':'app.js?v=29.1'),'Recurso app.js no coincide');
 const liveApp=sha(await publicAsset(after?'app.js?v=29.2':'app.js?v=29.1'));
 assert.equal(liveApp,after?NEW_APP:OLD_APP,'Código productivo app.js distinto');
 assert.equal(sha(await publicAsset('store.js?v=19.1')),STORE,'Store se alteró');
 assert.equal(sha(await publicAsset('reference.js?v=29')),GPS,'GPS se alteró');
 assert.equal(sha(await publicAsset('geo-v2/core.mjs?v=3')),GEO,'Motor Geo se alteró');
 assert.equal(sha(await publicAsset('config.js')),CONFIG,'Configuración API se alteró');
 assert.equal(sha(await publicAsset('descargas/via-traslados-conductor-v35.apk')),APK,'APK firmada se alteró');
 const health=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',
  {signal:AbortSignal.timeout(30000)});
 assert.equal(health.status,200,'API health inoperativa');
 const h=await health.json();assert(h.ok===true&&h.otpAvailable===true,'OTP API no disponible');
 return {appSha:liveApp,storeSha:STORE,gpsSha:GPS,geoSha:GEO,configSha:CONFIG,apkSha:APK,apiHealth:true}
}
async function record(label,data){
 await mkdir('identity-v2914-release-proof',{recursive:true});
 await writeFile('identity-v2914-release-proof/'+label+'.json',
  JSON.stringify({time:new Date().toISOString(),...data},null,2)+'\n');
}
async function rollback(){
 const current=await deployed(WEB);
 if(current.version!==BASE){
  const r=await fetch(url(WEB),{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({strategy:'percentage',versions:[{version_id:BASE,percentage:100}]}),
   signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,200,'HTTP rollback '+r.status);
  const data=await r.json();assert.equal(data.success,true,'Cloudflare rechazó rollback');
 }
 for(let i=0;i<10;i++){
  try{
   const web=await deployed(WEB);
   if(web.version===BASE){
    const files=await website('before');
    await record('rollback',{web,files,rollbackVerified:true});
    console.log('VIA_IDENTITY_V2914_ROLLBACK_VERIFIED '+JSON.stringify(web));
    return;
   }
  }catch(e){console.log('Propagación rollback '+e.message)}
  await pause(4000);
 }
 throw Error('Rollback no verificado');
}
const mode=process.argv[2];
if(mode==='before'){
 const [web,api]=await Promise.all([deployed(WEB),deployed(API)]);
 assert.equal(web.version,BASE,'Web cambió antes del despliegue: NO continuar');
 assert.equal(api.version,API_V35,'API V35 cambió: NO continuar');
 const files=await website('before');
 await record('before',{web,api,files,rollbackVersion:BASE,newAppSha:NEW_APP});
 console.log('VIA_IDENTITY_V2914_PROD_PREFLIGHT '+JSON.stringify({web,api,newAppSha:NEW_APP}));
}else if(mode==='after'){
 let files;
 for(let i=0;i<10;i++){
  try{files=await website('after');break}
  catch(e){if(i===9)throw e;await pause(3500)}
 }
 const [web,api]=await Promise.all([deployed(WEB),deployed(API)]);
 assert.notEqual(web.version,BASE,'No se activó V29.1.4');
 assert.equal(api.version,API_V35,'API productiva cambió durante el release');
 await record('after',{web,api,files,rollbackVersion:BASE});
 console.log('VIA_IDENTITY_V2914_PRODUCTION_VERIFIED '+JSON.stringify({web,api,files,rollbackVersion:BASE}));
}else if(mode==='rollback')await rollback();
else throw Error('Modo requerido: before / after / rollback');
