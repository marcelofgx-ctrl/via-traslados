// Read only Cloudflare API/D1 inventory for V30 release.
const a=process.env.CLOUDFLARE_ACCOUNT_ID,t=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[0-9a-f]{32}$/i.test(a||'')||!t)throw Error('Cloudflare credentials unavailable');
async function get(p){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+a+p,{
  headers:{Authorization:'Bearer '+t},signal:AbortSignal.timeout(20000)});
 const v=await r.json().catch(()=>({}));
 if(!r.ok||!v.success)throw Error('Cannot read Cloudflare '+p+': HTTP '+r.status);
 return v.result;
}
const results={};
for(const name of ['via-traslados-api','via-traslados-api-qa','via-traslados-api-v30-stage','via-traslados-web-prod']){
 try{
  const r=await get('/workers/scripts/'+name+'/deployments');
  results[name]={versions:r.deployments?.[0]?.versions?.map(x=>({id:x.version_id,traffic:x.percentage}))||[]};
 }catch(e){results[name]={not_found_or_no_access:true}}
}
const dbs=await get('/d1/database?per_page=100');
results.databases=dbs.filter(x=>/^via-traslados/.test(x.name)).map(x=>({name:x.name,uuid:x.uuid}));
console.log('VIA_V30_CF_INVENTORY_READONLY '+JSON.stringify(results));
