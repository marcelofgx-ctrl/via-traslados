// API-only rollback for V30. Never mutate D1, user bookings, web or APK.
import assert from 'node:assert/strict';
const base='9f0db4cc-29b8-4d79-8ce8-8fb0588bd079';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(/^[a-f0-9]{32}$/i.test(account||'')&&token,'Cloudflare creds missing');
const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/via-traslados-api/deployments';
async function call(method,body){
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const data=await r.json();assert(r.ok&&data.success===true,'API Worker status / restore failed');
 return data.result;
}
const active=async()=>{const x=await call('GET');return x.deployments?.[0]?.versions?.[0]?.version_id};
let before=await active();
if(before===base){console.log('VIA_V30_API_ALREADY_AT_BASE '+base);process.exit(0)}
const initial=await call('GET');
assert(initial.deployments.some(d=>d.versions?.some(x=>x.version_id===base)),'Original API version not present for rollback');
await call('POST',{strategy:'percentage',versions:[{percentage:100,version_id:base}],
 annotations:{'workers/message':'V30 API E2E failed; rollback only API Worker. Additive D1 table retained.'}});
let success=false;
for(let i=0;i<15;i++){
 if(await active()===base){success=true;break}
 await new Promise(resolve=>setTimeout(resolve,2000))
}
assert(success,'Could not verify original API version after rollback');
console.log('VIA_V30_API_ROLLBACK_VERIFIED '+base);
