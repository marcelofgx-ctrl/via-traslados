// Safety rollback V29.1.7 visually broken on real Android keyboard.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(/^[a-f0-9]{32}$/i.test(account||'')&&token,'Missing Cloudflare release credentials');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/via-traslados-web-prod';
const headers={Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'};
async function api(path,body){
 const opts={headers,signal:AbortSignal.timeout(25000)};
 if(body){opts.method='POST';opts.body=JSON.stringify(body)}
 const res=await fetch(root+path,opts);const json=await res.json();
 assert(res.ok&&json.success===true,'Cloudflare rollback failed: '+res.status+' '+JSON.stringify(json.errors||[]).slice(0,200));
 return json.result;
}
const previous='0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b';
const broken='6be37e24-1b13-40f5-b087-50ff861f7bc4';
const deployments=(await api('/deployments')).deployments||[];
function version(d){const versions=d?.versions||[];assert(versions.length===1&&Number(versions[0].percentage)===100,'Expected single deployment at 100%');return versions[0].version_id}
const now=version(deployments[0]);
assert([previous,broken].includes(now),'Unexpected web version, refuse unsafe rollback');
assert(deployments.some(d=>(d.versions||[]).some(v=>v.version_id===previous)),'Safe v29.1.6 not in deployment history');
if(now===broken){
 await api('/deployments',{strategy:'percentage',versions:[{version_id:previous,percentage:100}],annotations:{'workers/message':'Rollback requested: V29.1.7 guest login layout broken on Android keyboard; keep v29.1.6'}});
}
for(let i=0;i<12;i++){
 try{
  const live=version((await api('/deployments')).deployments[0]);
  assert.equal(live,previous,'Old version not active yet');
  const res=await fetch('https://viatraslados.com/',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
  const txt=await res.text();
  assert(res.ok&&txt.includes('>v29.1.6</small>'),'Safe old homepage not served yet');
  const mine=await fetch('https://viatraslados.com/mis-reservas.html',{signal:AbortSignal.timeout(15000)}).then(x=>x.text());
  assert(!mine.includes('mine-premium-v2917.js'),'Broken UI still live');
  console.log('VIA_V2917_SAFETY_ROLLBACK_VERIFIED '+previous);process.exit(0);
 }catch(e){console.log('ROLLBACK_VERIFICATION_RETRY '+i+' '+String(e.message).slice(0,85));await new Promise(r=>setTimeout(r,1500))}
}
throw Error('Safe rollback did not verify within window');
