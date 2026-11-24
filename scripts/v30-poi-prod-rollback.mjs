// Vía V30 Geoapify — rollback de ambas versiones activas exactas en Cloudflare.
// No toca D1, reservas, usuarios, APK, ni variables/secrets. Requiere credenciales
// preexistentes de CI. Es seguro ejecutar repetidamente.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[0-9a-f]{32}$/i.test(account||'')||!token)throw Error('Credenciales Cloudflare no disponibles');
const versions=[
 ['via-traslados-web-prod','ac8e0a7e-a032-47f8-8328-bd7b716a4342'],
 ['via-traslados-api','9349f01a-5824-4401-848f-edb4f3f7d5b0']
];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/';
async function cf(name,method='GET',body){
 const r=await fetch(root+name+'/deployments',{method,
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const json=await r.json().catch(()=>({}));
 if(!r.ok||json.success!==true)throw Error('Rollback Cloudflare rechazado '+name+' '+r.status);
 return json.result;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const [name,oldId] of versions){
 const history=await cf(name);
 const actual=history.deployments?.[0]?.versions||[];
 if(actual.length===1&&actual[0].version_id===oldId&&Number(actual[0].percentage)===100){
  console.log('VIA_POI_WORKER_ALREADY_BASE '+name+' '+oldId);continue;
 }
 if(!history.deployments?.some(d=>d.versions?.some(v=>v.version_id===oldId)))
  throw Error('No se encuentra la versión anterior de '+name+'; abortar sin inventar rollback');
 await cf(name,'POST',{strategy:'percentage',versions:[{percentage:100,version_id:oldId}],
  annotations:{'workers/message':'Rollback V30 Places: restaurar versión estable previa, no tocar D1'}});
 let success=false;
 for(let attempt=0;attempt<14;attempt++){
  const current=(await cf(name)).deployments?.[0]?.versions||[];
  if(current.length===1&&current[0].version_id===oldId&&Number(current[0].percentage)===100){
   success=true;break;
  }
  await wait(2000);
 }
 if(!success)throw Error('Rollback no comprobado '+name);
 console.log('VIA_POI_ROLLBACK_VERIFIED '+name+' '+oldId);
}
