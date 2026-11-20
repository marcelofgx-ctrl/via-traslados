import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'Credenciales Cloudflare ausentes');
const WEB='via-traslados-web-prod',API='via-traslados-api';
const BASE='2d0205bf-990f-44ae-94e4-cf517a9d2093';
const API35='9f0db4cc-29b8-4d79-8ce8-8fb0588bd079';
const APP='73afe2490a64b9a1c1b6cf4ce61283c1f68184208cbe783a70126cecc3b21e69';
const STORE='3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8';
const GPS_OLD='7e4841b60c7a9796673ed7ad41e54446cac3eded802bcb1cb37971cec61fd47b';
const AUTO_OLD='bf3b671b4693b088a82259c5cbb9ed860e7b6c4f108aa43cf50e2e563a7aaf17';
const PREVIEW='bf0f7aa019eab8f42fe8dc5fe12a2c559f5871ff07266a4c8ea0dc1fb4f234e8';
const GEO='17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1';
const CONFIG='51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273';
const APK='324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3';
const sha=b=>createHash('sha256').update(b).digest('hex');
const GPS_NEW=sha(await readFile('ui-v2915-build/assets/reference.js'));
const AUTO_NEW=sha(await readFile('ui-v2915-build/assets/address-autocomplete.js'));
assert.notEqual(GPS_NEW,GPS_OLD,'V29.1.5 GPS no cambió');
assert.notEqual(AUTO_NEW,AUTO_OLD,'V29.1.5 autocompletar no cambió');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const deployments=name=>'https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/deployments';
async function deployed(name){
 const r=await fetch(deployments(name),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'CF deployment '+name+' HTTP '+r.status);
 const data=await r.json();assert.equal(data.success,true,'CF rechazó '+name);
 const versions=data.result?.deployments?.[0]?.versions;
 assert(Array.isArray(versions)&&versions.length===1&&Number(versions[0].percentage)===100,'Sin versión 100 % '+name);
 return {id:data.result.deployments[0].id,version:versions[0].version_id};
}
async function live(path){
 const r=await fetch('https://viatraslados.com/'+path,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,'Recurso live '+path+' HTTP '+r.status);
 return Buffer.from(await r.arrayBuffer());
}
async function validate(stage){
 const newer=stage==='after',html=(await live('')).toString('utf8');
 const required=['app.js?v=29.2','store.js?v=19.1','address-selected-preview.js?v=29','geo-v2/core.mjs?v=3'];
 for(const v of required)assert(html.includes(v),'HTML no conserva '+v);
 assert(html.includes(newer?'content="29.1.5"':'content="29.1.4"'),'Versión de HTML inválida');
 assert(html.includes(newer?'reference.js?v=30':'reference.js?v=29'),'GPS JS version inválida');
 assert(html.includes(newer?'address-autocomplete.js?v=27':'address-autocomplete.js?v=26'),'Autocompletar JS version inválida');
 assert(!html.includes('UI QA')&&!html.includes('IDENTIDAD QA')&&!html.includes('GPS QA'),'Banner QA contaminó producción');
 const checks=[
  ['app.js?v=29.2',APP],
  ['store.js?v=19.1',STORE],
  [newer?'reference.js?v=30':'reference.js?v=29',newer?GPS_NEW:GPS_OLD],
  [newer?'address-autocomplete.js?v=27':'address-autocomplete.js?v=26',newer?AUTO_NEW:AUTO_OLD],
  ['address-selected-preview.js?v=29',PREVIEW],
  ['geo-v2/core.mjs?v=3',GEO],
  ['config.js',CONFIG],
  ['descargas/via-traslados-conductor-v35.apk',APK]
 ];
 for(const [path,digest] of checks)assert.equal(sha(await live(path)),digest,'Hash cambió '+path);
 const response=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200,'API health HTTP '+response.status);
 const health=await response.json();
 assert(health.ok===true&&health.otpAvailable===true,'API OTP indisponible');
 return {appSha:APP,referenceSha:newer?GPS_NEW:GPS_OLD,autocompleteSha:newer?AUTO_NEW:AUTO_OLD,previewSha:PREVIEW,geoSha:GEO,configSha:CONFIG,apkSha:APK,apiHealth:true};
}
async function record(name,data){
 await mkdir('ui-v2915-release-proof',{recursive:true});
 await writeFile('ui-v2915-release-proof/'+name+'.json',JSON.stringify({when:new Date().toISOString(),...data},null,2)+'\n');
}
async function rollback(){
 const web=await deployed(WEB);
 if(web.version!==BASE){
  const response=await fetch(deployments(WEB),{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({strategy:'percentage',versions:[{version_id:BASE,percentage:100}]}),
    signal:AbortSignal.timeout(30000)
  });
  assert.equal(response.status,200,'Rollback HTTP error');
  const data=await response.json();assert.equal(data.success,true,'Rollback CF rechazado');
 }
 for(let attempt=0;attempt<10;attempt++){
  try{const web=await deployed(WEB);
   if(web.version===BASE){const files=await validate('before');
    await record('rollback',{web,files,verified:true});
    console.log('VIA_UI_V2915_ROLLBACK_VERIFIED '+JSON.stringify(web));return}
  }catch(e){console.log('Propagación rollback: '+e.message)}
  await sleep(4000);
 }
 throw Error('Rollback no verificado');
}
const mode=process.argv[2];
if(mode==='before'){
 const [web,api]=await Promise.all([deployed(WEB),deployed(API)]);
 assert.equal(web.version,BASE,'La Web productiva cambió: abortar antes de desplegar');
 assert.equal(api.version,API35,'API productiva cambió: abortar');
 const files=await validate('before');
 await record('before',{web,api,files,rollbackVersion:BASE,gpsNew:GPS_NEW,autoNew:AUTO_NEW});
 console.log('VIA_UI_V2915_PREFLIGHT '+JSON.stringify({web,api,gpsNew:GPS_NEW,autoNew:AUTO_NEW}));
}else if(mode==='after'){
 let files;
 for(let i=0;i<10;i++){
  try{files=await validate('after');break}
  catch(e){if(i===9)throw e;await sleep(3500)}
 }
 const [web,api]=await Promise.all([deployed(WEB),deployed(API)]);
 assert.notEqual(web.version,BASE,'La versión productiva no cambió');
 assert.equal(api.version,API35,'API V35 fue alterada');
 await record('after',{web,api,files,rollbackVersion:BASE});
 console.log('VIA_UI_V2915_PROD_VERIFIED '+JSON.stringify({web,api,files,rollbackVersion:BASE}));
}else if(mode==='rollback')await rollback();
else throw Error('Modo esperado: before/after/rollback');
