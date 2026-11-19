// Solo GET. Registro no destructivo de la versión Vía publicada y rollback.
// NO se descargan secretos, datos de clientes ni scripts privados.
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('No hay credenciales de lectura Cloudflare');
const h={Authorization:'Bearer '+token,Accept:'application/json'};
const withTimeout=()=>AbortSignal.timeout(25000);
async function cf(path){
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+path;
 const res=await fetch(url,{headers:h,signal:withTimeout()});
 if(!res.ok)throw Error('Cloudflare GET status '+res.status+' en '+path);
 const body=await res.json();
 if(body.success!==true)throw Error('Cloudflare GET success=false '+path);
 return body.result;
}
const hash=b=>createHash('sha256').update(b).digest('hex');
const workerNames=['via-traslados-web-prod','via-traslados-api'];
const workers={};
for(const name of workerNames){
 const raw=await cf('/workers/scripts/'+name+'/deployments?per_page=4');
 const deployments=Array.isArray(raw)?raw:Array.isArray(raw?.deployments)?raw.deployments:[];
 if(deployments.length===0)throw Error('Sin deployments para '+name);
 const versions=deployments[0].versions||[];
 if(!versions.length||versions.some(x=>!x.version_id))throw Error('Deployment sin versions para '+name);
 const active=versions.map(x=>({version_id:x.version_id,percentage:x.percentage}));
 if(active.reduce((a,x)=>a+(Number(x.percentage)||0),0)!==100)
  throw Error('Porcentajes activos de '+name+' no suman 100');
 workers[name]={
  active_deployment_id:deployments[0].id,
  active_deployment_created_at:deployments[0].created_on,
  active_versions:active,
  previous_deployment_id:deployments[1]?.id||null,
  previous_versions:(deployments[1]?.versions||[]).map(x=>({version_id:x.version_id,percentage:x.percentage}))
 };
 console.log('VIA_PROD_WORKER_VERSION '+JSON.stringify({name,...workers[name]}));
}
async function publicAsset(path){
 const url='https://viatraslados.com/'+path;
 const res=await fetch(url,{signal:AbortSignal.timeout(45000),redirect:'follow'});
 if(!res.ok)throw Error('Asset '+path+' HTTP '+res.status);
 const bytes=Buffer.from(await res.arrayBuffer());
 return {url,bytes,sha256:hash(bytes),bytes_length:bytes.length,status:res.status};
}
const home=await publicAsset('');
const html=home.bytes.toString('utf-8');
const app=(html.match(/(?:\.\/)?app\.js\?v=(\d+)/)||[])[1];
const store=(html.match(/(?:\.\/)?store\.js\?v=(\d+)/)||[])[1];
if(!app||!store)throw Error('No se pudo detectar la versión realmente publicada en HTML');
const assets={home:{sha256:home.sha256,bytes:home.bytes_length}};
for(const [key,path] of [
 ['app','app.js?v='+app],
 ['store','store.js?v='+store],
 ['geo','geo-v2/core.mjs?v=3'],
 ['apk','descargas/via-traslados-conductor-v35.apk']
]){
 try{const a=await publicAsset(path);assets[key]={path,sha256:a.sha256,bytes:a.bytes_length};}
 catch(e){if(key==='apk')assets[key]={path,error:String(e)};else throw e;}
}
const endpoints={};
for(const [name,url] of Object.entries({
  prod_api:'https://via-traslados-api.marcelof-gx.workers.dev/api/health',
  qa_api:'https://via-traslados-maestro-api-qa.marcelof-gx.workers.dev/api/health'
})){
 const response=await fetch(url,{signal:withTimeout()});
 if(!response.ok)throw Error(name+' HTTP '+response.status);
 const j=await response.json();
 if(j.ok!==true)throw Error(name+' sin salud');
 endpoints[name]=name==='prod_api'?{ok:j.ok,otpAvailable:j.otpAvailable===true}:
  {ok:j.ok,qa:j.qa===true,production:j.production,routePreviewReady:j.routePreviewReady===true};
}
const manifest={
 audited_at:new Date().toISOString(),
 method:'solo GET Cloudflare + HTTP público; no despliegues ni operaciones D1',
 workers,web:{html_app_version:app,html_store_version:store,assets},
 endpoints,
 source_commit:process.env.GITHUB_SHA||null
};
await mkdir('audit',{recursive:true});
await writeFile('audit/production-readonly-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('VIA_PROD_ASSET_VERSIONS '+JSON.stringify({app,store,assets}));
console.log('VIA_QA_READINESS '+JSON.stringify(endpoints));
console.log('VIA_AUDITORIA_SOLO_LECTURA_OK');
