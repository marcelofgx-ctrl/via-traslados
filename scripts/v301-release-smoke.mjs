import assert from 'node:assert/strict';
const mode=process.argv[2],web='https://viatraslados.com',api='https://via-traslados-api.marcelof-gx.workers.dev',preview='https://a50f7a32-via-traslados-api.marcelof-gx.workers.dev';
const target=mode==='preview'?preview:api;
const headers={Origin:web,Accept:'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,init={}){
 const r=await fetch(url,{...init,signal:AbortSignal.timeout(22000)});
 const text=await r.text();let j;try{j=JSON.parse(text)}catch{}
 return {r,j,text};
}
async function verifyApi(){
 const h=await get(target+'/api/health',{headers});assert(h.r.ok&&h.j?.ok&&h.j?.otpAvailable,'API health/OTP failed');
 const a=await get(target+'/api/operator/requests',{headers});assert.equal(a.r.status,401);
 const state=await get(target+'/api/public/status',{headers});assert(state.r.ok&&state.j?.enabled===true);
 for(const q of ['Mcdonalds','Radisson','Hyatt']){
  const p=await get(target+'/api/via-places?q='+encodeURIComponent(q));
  assert(p.r.ok&&Array.isArray(p.j?.features)&&p.j.features.length>=(q==='Mcdonalds'?4:1),'POI API failed '+q);
  console.log('VIA_V301_API_POI '+JSON.stringify({mode,q,count:p.j.features.length}));
 }
 const route=await get(target+'/api/public/route-preview',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({origin:'Punto QA origen',destination:'Punto QA destino',originLocation:{lat:-34.905,lng:-56.185},destinationLocation:{lat:-34.83696,lng:-56.01638}})});
 assert(route.r.ok&&route.j?.distanceKm>0&&route.j?.durationMinutes>0,'API route failed');
 console.log('VIA_V301_API_ROUTE '+JSON.stringify({mode,km:route.j.distanceKm,min:route.j.durationMinutes}));
}
async function verifyWeb(){
 const h=await get(web+'/index.html');assert(h.r.ok&&h.text.includes('v30.1')&&h.text.includes('address-autocomplete.js?v=30.1'));
 const auto=await get(web+'/address-autocomplete.js?v=30.1');assert(auto.r.ok&&auto.text.includes('const poiSlots=Math.min(8'));
 const sw=await get(web+'/sw.js');assert(sw.r.ok&&sw.text.includes('via-traslados-v30.1-poi'));
 for(const q of ['Mcdonalds','Radisson','Hyatt']){
  const p=await get(web+'/api/direcciones?mode=places&q='+encodeURIComponent(q));
  const rows=p.j?.results?.filter(x=>x.source==='Geoapify Places'&&Number.isFinite(x.lat)&&Number.isFinite(x.lng))||[];
  assert(p.r.ok&&rows.length>=(q==='Mcdonalds'?4:1),'WEB POI failed '+q);
  console.log('VIA_V301_WEB_POI '+JSON.stringify({q,count:rows.length}));
 }
 const street=await get(web+'/api/direcciones?mode=suggest&q='+encodeURIComponent('Caramuru 5510'));
 assert(street.r.ok&&street.j?.results?.length>0,'IDE street failed');
 const reverse=await get(web+'/api/direcciones?mode=reverse&lat=-34.905&lng=-56.185');
 assert(reverse.r.ok&&reverse.j?.results?.length>0,'IDE reverse failed');
 console.log('VIA_V301_WEB_SMOKE_PASS');
}
for(let i=0;i<3;i++){try{await (mode==='web'?verifyWeb():verifyApi());break}catch(e){if(i===2)throw e;console.log('Retry '+mode+' '+e.message);await sleep(2500)}}
