import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'Cloudflare credentials required');
const web='via-traslados-web-prod',api='via-traslados-api';
const OLD='49313136-3544-4e5c-a010-2efc201de6f1';
const API='9f0db4cc-29b8-4d79-8ce8-8fb0588bd079';
const HASH_REF='a184e955c0d3d4f13c67f858093ae648cc54a60e218ecd6c6c84ab4d8b46868f';
const HASH_GEO='17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1';
const HASH_APK='324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3';
const HASH_CONF='51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273';
const HASH_NEW_REF='ef28049b873c228284787f0865982a06ce562b93759a97dec5676e18f6166680';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function getDeployment(name){
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+name+'/deployments';
 const resp=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 assert.equal(resp.status,200,'Could not read deployment '+name);
 const data=await resp.json();assert(data.success===true,'Bad CF response');
 const list=data.result?.deployments||data.result;
 assert(Array.isArray(list)&&list[0]?.versions?.length===1,'Unexpected deployment list');
 const version=list[0].versions[0];
 assert(Number(version.percentage)===100,'Traffic split unsafe');
 return {deployment:list[0].id,version:version.version_id};
}
async function asset(path){
 const r=await fetch('https://viatraslados.com/'+path,{
  signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});
 assert.equal(r.status,200,'Asset failed '+path+' status '+r.status);
 return Buffer.from(await r.arrayBuffer());
}
async function website(variant){
 const html=(await asset('')).toString('utf8');
 assert(html.includes('app.js?v=29.1'),'app.js V29.1 changed unexpectedly');
 assert(html.includes('store.js?v=19.1'),'store.js V19.1 changed unexpectedly');
 assert(!html.includes('GPS QA'),'QA banner leaked to production');
 if(variant==='before')assert(html.includes('reference.js?v=26'),'old GPS reference mismatch');
 if(variant==='after'){
  assert(html.includes('reference.js?v=27'),'new GPS version missing');
  assert(html.includes('content="29.1.1"'),'release marker absent');
 }
 const ref=hash(await asset('reference.js'));
 assert.equal(ref,variant==='after'?HASH_NEW_REF:HASH_REF,'Wrong deployed GPS source');
 assert.equal(hash(await asset('geo-v2/core.mjs?v=3')),HASH_GEO,'Core Geo changed');
 assert.equal(hash(await asset('config.js')),HASH_CONF,'Production API config changed');
 assert.equal(hash(await asset('descargas/via-traslados-conductor-v35.apk')),HASH_APK,'Signed APK changed');
 const apiHealth=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(20000)});
 assert.equal(apiHealth.status,200);
 const j=await apiHealth.json();
 assert(j.ok===true&&j.otpAvailable===true,'Prod API unhealthy');
 return {htmlVersion:variant,referenceSha256:ref,geoSha256:HASH_GEO,apkSha256:HASH_APK,configSha256:HASH_CONF};
}
async function record(file,data){
 await mkdir('gps-release-proof',{recursive:true});
 await writeFile('gps-release-proof/'+file+'.json',JSON.stringify({time:new Date().toISOString(),...data},null,2)+'\n');
}
async function rollback(){
 const cur=await getDeployment(web);
 if(cur.version!==OLD){
  const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+web+'/deployments';
  const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({strategy:'percentage',versions:[{version_id:OLD,percentage:100}]}),signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,200,'Rollback HTTP '+r.status);
  const v=await r.json();assert(v.success===true,'Rollback rejected');
 }
 for(let i=0;i<10;i++){
  try{
   const now=await getDeployment(web);
   if(now.version===OLD){
    const result=await website('before');
    await record('rollback',{web:now,verified:result});
    console.log('VIA_GPS_ROLLBACK_VERIFIED '+JSON.stringify(now));
    return;
   }
  }catch(e){console.log('GPS rollback propagation '+e.message)}
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
 throw Error('Rollback not verified');
}
const mode=process.argv[2];
if(mode==='before'){
 const [webVersion,apiVersion]=await Promise.all([getDeployment(web),getDeployment(api)]);
 assert.equal(webVersion.version,OLD,'Production web changed: must recapture');
 assert.equal(apiVersion.version,API,'API changed: must recapture');
 const files=await website('before');
 await record('before',{web:webVersion,api:apiVersion,assets:files,rollbackVersion:OLD});
 console.log('VIA_GPS_RELEASE_PREFLIGHT_OK '+JSON.stringify({webVersion,apiVersion,assets:files}));
}else if(mode==='after'){
 const [webVersion,apiVersion]=await Promise.all([getDeployment(web),getDeployment(api)]);
 assert.notEqual(webVersion.version,OLD,'GPS fix was not activated');
 assert.equal(apiVersion.version,API,'API changed unexpectedly');
 let result;
 for(let i=0;i<8;i++){try{result=await website('after');break}
 catch(e){if(i===7)throw e;await new Promise(resolve=>setTimeout(resolve,3500))}}
 await record('after',{web:webVersion,api:apiVersion,assets:result,rollbackVersion:OLD});
 console.log('VIA_GPS_RELEASE_SUCCESS '+JSON.stringify({webVersion,apiVersion,assets:result,rollbackVersion:OLD}));
}else if(mode==='rollback')await rollback();
else throw Error('Use before / after / rollback');
