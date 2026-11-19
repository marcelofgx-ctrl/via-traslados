// Vía Traslados V29.1: control e identificación de Workers antes/después y rollback automático.
// ÚNICOS comandos de escritura: POST deployment del Worker WEB en rollback.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'No hay cuenta/token Cloudflare');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/';
const WEB='via-traslados-web-prod',APP='via-traslados-api';
const OLD_WEB='ec35bd52-b832-4cff-bcb2-6a6b84c34c79';
const OLD_API='9f0db4cc-29b8-4d79-8ce8-8fb0588bd079';
const OLD_GEO='17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1';
const OLD_APK='324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function cf(name,method='GET',path='/deployments',body){
 const response=await fetch(api+name+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const raw=await response.text();
 if(!response.ok)throw Error('Cloudflare '+method+' '+name+path+' HTTP '+response.status+' '+raw.slice(0,500));
 const result=JSON.parse(raw);
 if(result.success!==true)throw Error('Cloudflare '+name+' success=false '+JSON.stringify(result.errors||[]).slice(0,500));
 return result.result;
}
async function active(name){
 const all=await cf(name);
 const rows=Array.isArray(all)?all:all.deployments||[];
 const deployment=rows[0];
 assert(deployment?.versions?.length===1&&Number(deployment.versions[0].percentage)===100,'Deployment dividido o inesperado '+name);
 return {deployment_id:deployment.id,version_id:deployment.versions[0].version_id,created:deployment.created_on};
}
async function get(path){
 const response=await fetch('https://viatraslados.com/'+path,{redirect:'follow',signal:AbortSignal.timeout(35000),headers:{'Cache-Control':'no-cache'}});
 if(!response.ok)throw Error('Público HTTP '+response.status+' en '+path);
 return Buffer.from(await response.arrayBuffer());
}
async function checkPublic(version,expected){
 const html=(await get('')).toString('utf8');
 assert(html.includes('app.js?v='+version),'Versión pública incorrecta app.js');
 assert(html.includes('store.js?v='+(version==='29'?'19':'19.1')),'Versión pública incorrecta store');
 if(version==='29.1'){
  assert(html.includes('via-release-version')&&html.includes('via-home-user-greeting'),'Saludo y meta V29.1 ausentes');
  assert(!html.includes('VÍA TRASLADOS · V29.1 PREVISUALIZACIÓN'),'Banner staging filtrado a producción');
  assert(!html.includes('via-maestro-api'),'API QA filtrada');
  for(const file of ['app.js?v=29.1','store.js?v=19.1','mis-reservas.html','mine-identity-v291.css?v=1','via-v291-home-account.js?v=1','via-v291-home-account.css?v=1']){
   const bytes=await get(file);
   assert(bytes.length>200,'Asset vacío '+file);
   if(file==='mis-reservas.html')assert(bytes.toString().includes('Crear tu cuenta'),'No hay registro');
  }
 } else assert(!html.includes('via-release-version'),'V29 antigua no restaurada');
 const geo=await get('geo-v2/core.mjs?v=3');
 assert.equal(sha(geo),OLD_GEO,'Motor geográfico público sufrió cambios');
 const apk=await get('descargas/via-traslados-conductor-v35.apk');
 assert.equal(sha(apk),OLD_APK,'APK firmada V35 cambió o desapareció');
 const config=await get('config.js');
 const cfgSha=sha(config);
 const check=expected?.configSha256;
 if(check)assert.equal(cfgSha,check,'config.js API cambió');
 return {htmlVersion:version,geoSha256:sha(geo),apkSha256:sha(apk),configSha256:cfgSha,apkBytes:apk.length};
}
async function record(name,obj){
 await mkdir('release-proof',{recursive:true});
 await writeFile('release-proof/'+name+'.json',JSON.stringify({timestamp:new Date().toISOString(),...obj},null,2)+'\n');
}
const mode=process.argv[2];
if(mode==='before'){
 const web=await active(WEB),back=await active(APP);
 assert.equal(web.version_id,OLD_WEB,'Version WEB activa cambió — abortar sin publicar');
 assert.equal(back.version_id,OLD_API,'Versión API V35 cambió — abortar');
 const publicBefore=await checkPublic('29');
 const h=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(20000)});
 assert.equal(h.status,200,'API health no responde');
 const health=await h.json();
 assert(health.ok===true&&health.otpAvailable===true,'OTP producción no está configurado');
 await record('before',{web,api:back,public:publicBefore,otpConfigured:true,rollbackWebVersion:OLD_WEB});
 console.log('VIA_V291_PROD_BEFORE_OK',JSON.stringify({web,api:back,public:publicBefore,otpConfigured:true}));
}else if(mode==='after'){
 const previous=JSON.parse(await readFile('release-proof/before.json','utf8'));
 const web=await active(WEB),back=await active(APP);
 assert.notEqual(web.version_id,OLD_WEB,'No cambió el Worker público');
 assert.equal(back.version_id,OLD_API,'API cambió durante deploy web');
 let publicAfter;
 for(let attempt=0;attempt<8;attempt++){
  try{publicAfter=await checkPublic('29.1',previous.public);break}
  catch(e){if(attempt===7)throw e;await new Promise(done=>setTimeout(done,4500))}
 }
 const h=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health');
 assert.equal(h.status,200);
 const health=await h.json();
 assert(health.ok===true&&health.otpAvailable===true,'API OTP dejó de estar configurada');
 await record('after',{web,api:back,public:publicAfter,rollbackWebVersion:OLD_WEB});
 console.log('VIA_V291_PRODUCTION_RELEASE_OK',JSON.stringify({web,api:back,public:publicAfter,rollbackWebVersion:OLD_WEB}));
}else if(mode==='rollback'){
 const currently=await active(WEB);
 if(currently.version_id!==OLD_WEB){
  const result=await cf(WEB,'POST','/deployments',{strategy:'percentage',versions:[{version_id:OLD_WEB,percentage:100}]});
  console.log('VIA_V291_AUTOMATIC_ROLLBACK_REQUESTED',JSON.stringify({from:currently.version_id,to:OLD_WEB,deployment_id:result.id||null}));
 }
 let restored=false;
 for(let i=0;i<9;i++){
  try{
   const now=await active(WEB);
   if(now.version_id===OLD_WEB){
    const before=JSON.parse(await readFile('release-proof/before.json','utf8'));
    const pub=await checkPublic('29',before.public);
    await record('rollback',{web:now,public:pub});
    console.log('VIA_V291_ROLLBACK_VERIFIED',JSON.stringify({web:now,public:pub}));
    restored=true;break;
   }
  }catch(e){console.log('VIA_V291_ROLLBACK_PROPAGATION',e.message)}
  await new Promise(done=>setTimeout(done,4500));
 }
 if(!restored)throw Error('Rollback solicitado pero no comprobado');
}else throw Error('Use before / after / rollback');
