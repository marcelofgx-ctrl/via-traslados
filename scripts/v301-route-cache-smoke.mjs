import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const mode=process.argv[2],web='https://viatraslados.com';
const id=readFileSync('v301-route-fix/candidate.txt','utf8').trim();
const api='https://'+(mode==='preview'?id.slice(0,8)+'-':'')+'via-traslados-api.marcelof-gx.workers.dev';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function query(path,init={}){
 const r=await fetch(api+path,{...init,signal:AbortSignal.timeout(25000)});let j={};try{j=await r.json()}catch{}
 return {r,j};
}
const headers={Origin:web,'Content-Type':'application/json'};
async function run(){
 const h=await query('/api/health',{headers});assert(h.r.ok&&h.j.ok&&h.j.otpAvailable);
 const st=await query('/api/public/status',{headers});assert(st.r.ok&&st.j.enabled);
 const denied=await query('/api/operator/requests',{headers});assert.equal(denied.r.status,401);
 const geo=await query('/api/via-places?q='+encodeURIComponent('Portones Shopping'));
 const list=geo.j.features||[];
 assert(geo.r.ok&&list.length,'POI provider failed');
 const coords=list[0].geometry.coordinates;
 const pairs=[{origin:'Aeropuerto Internacional de Carrasco',destination:'Portones Shopping',originLocation:{lat:-34.83696,lng:-56.01638},destinationLocation:{lat:coords[1],lng:coords[0]}}];
 for(const body of pairs){
  for(let i=0;i<(mode==='preview'?11:2);i++){
   const {r,j}=await query('/api/public/route-preview',{method:'POST',headers,body:JSON.stringify(body)});
   console.log('VIA_ROUTE_SMOKE '+JSON.stringify({mode,i,status:r.status,km:j.distanceKm,cached:j.cached,error:j.error}));
   assert(r.ok&&j.distanceKm>0&&j.durationMinutes>0,'route preview failed: '+r.status+' '+j.error);
   if(i>0)assert.equal(j.cached,true);
  }
 }
}
for(let i=0;i<3;i++){try{await run();break}catch(e){if(i===2)throw e;console.log('Retry '+mode+' '+e.message);await sleep(2200)}}
