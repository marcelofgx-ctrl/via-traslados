import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const mode=process.argv[2],root='https://viatraslados.com',target=mode==='prod'?root:JSON.parse(readFileSync('v30410-visual/release-candidate.json','utf8')).preview;
// Coordinates of public urban areas, not user data. Real reverse geocoding, no reservations.
const points=[[-34.9061,-56.1999],[-34.9057,-56.1912],[-34.9015,-56.1646]];
const geoText=await (await fetch(target+'/geo-v2/core.mjs?v=3',{signal:AbortSignal.timeout(20000)})).text();
const geo=await import('data:text/javascript;base64,'+Buffer.from(geoText).toString('base64'));
let selected=null;
for(const [lat,lng] of points){
 const url=target+'/api/direcciones?mode=reverse&lat='+lat+'&lng='+lng;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(12000),cache:'no-store'});if(!r.ok)continue;const j=await r.json();
 const d=geo.buildPickupDisplay({point:{lat,lng,source:'gps',accuracyMeters:12,timestamp:Date.now()},reverseCandidates:Array.isArray(j.results)?j.results:[]});
 console.log('VIA_REAL_REVERSE_PROBE '+JSON.stringify({mode,status:d.postalStatus,count:j.results?.length||0}));
 if(d.postalStatus==='suggested'){selected={lat,lng};break}
 }catch(e){console.log('VIA_REAL_REVERSE_PROBE_ERROR '+e.name)}
}
assert(selected,'No usable real public reverse response; do not publish');
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
 try{const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await c.addInitScript(({lat,lng})=>{
  Object.defineProperty(navigator,'geolocation',{value:{watchPosition(ok){setTimeout(()=>ok({coords:{latitude:lat,longitude:lng,accuracy:12},timestamp:Date.now()}),150);return 1},clearWatch(){}},configurable:true});
  if(navigator.permissions)Object.defineProperty(navigator.permissions,'query',{value:async()=>({state:'granted'}),configurable:true});
 },selected);
 let calls=0,realCalls=0;
 await c.route('**/*',async r=>{
  const q=r.request(),u=new URL(q.url()),p=u.pathname;
  if(u.origin===root&&p==='/api/direcciones'&&u.searchParams.get('mode')==='reverse'&&q.method()==='GET'){
   calls++;if(calls===1)return r.fulfill({status:200,contentType:'application/json',body:'{"results":[]}'});
   realCalls++;const res=await fetch(target+p+u.search,{signal:AbortSignal.timeout(12000),cache:'no-store'});
   return r.fulfill({status:res.status,contentType:res.headers.get('content-type')||'application/json',body:Buffer.from(await res.arrayBuffer())});
  }
  if(p.startsWith('/api/')||!['GET','HEAD'].includes(q.method())||u.origin!==root)return r.abort();
  const res=await fetch(target+p+u.search,{signal:AbortSignal.timeout(20000)});
  return r.fulfill({status:res.status,contentType:res.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await res.arrayBuffer())});
 });
 const p=await c.newPage();await p.goto(root+'/index.html',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.ViaAddress);
 const button=p.locator('#location-shortcut');
 await button.click();
 await p.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.dataset.viaWait==='gps'||[...document.querySelectorAll('#via-gps-feedback button')].some(b=>b.textContent==='Permitir ubicación'));
 const permission=p.getByRole('button',{name:'Permitir ubicación',exact:true});if(await permission.count())await permission.click();
 await p.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.dataset.viaWait==='reverse');
 await p.waitForFunction(()=>!document.getElementById('location-shortcut').disabled,{timeout:20000});
 const chosen=await p.evaluate(()=>ViaAddress.get('home-origin'));
 assert.equal(calls,2);assert.equal(realCalls,1);assert.equal(chosen.postalStatus,'suggested');assert.equal(chosen.lat,selected.lat);assert.equal(chosen.lng,selected.lng);
 assert.equal(await p.locator('#via-gps-feedback .via-wait-track:visible').count(),0);
 console.log('VIA_REAL_GPS_RETRY_PASS '+JSON.stringify({mode,name,calls,realCalls,postalStatus:chosen.postalStatus,coordinatePreserved:true}));await c.close();
 }finally{await b.close()}
}
