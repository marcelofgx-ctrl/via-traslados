import assert from 'node:assert/strict';
import {viaReverseRace} from '../addons/via-reverse-bridge.mjs';
import {reverseCacheRows} from '../addons/via-reverse-cache.mjs';
import {chromium,webkit} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
const stage='https://via-traslados-geo-integral-qa.marcelof-gx.workers.dev',backup='https://8d9255cc-via-traslados-api.marcelof-gx.workers.dev';
const points=[[-34.9061,-56.1999],[-34.9057,-56.1912],[-34.9015,-56.1646],[-34.83696,-56.01638],[-34.90562,-56.19822],[-34.91052,-56.16288]];
const core=await(await fetch(stage+'/geo-v2/core.mjs',{signal:AbortSignal.timeout(12000)})).text();
const geo=await import('data:text/javascript;base64,'+Buffer.from(core).toString('base64'));
const display=(rows,lat,lng)=>geo.buildPickupDisplay({point:{lat,lng,source:'gps',accuracyMeters:12,timestamp:Date.now()},reverseCandidates:rows});
let backupGood=0,unknown=0,selected=null,hit=false;
const evidence=[];
for(const [lat,lng] of points){
 const qs='?mode=reverse&lat='+lat+'&lng='+lng;
 const req=new Request(stage+'/api/direcciones'+qs);
 let calls=0;
 const simulatedUnavailable={fetch:async()=>Response.json({results:[]},{status:503})};
 const service={fetch:async r=>{calls++;const u=new URL(r.url);return fetch(backup+u.pathname+u.search,{signal:AbortSignal.timeout(5000)})}};
 const t=Date.now(),response=await viaReverseRace(req,{VIA_POI_API:service},simulatedUnavailable,{});
 const j=await response.json();assert.equal(calls,1);
 const b=display(j.results||[],lat,lng);
 assert.equal(b.point.lat,lat);assert.equal(b.point.lng,lng);assert.notEqual(b.postalStatus,'user_confirmed');
 if(b.postalStatus==='suggested')backupGood++;else unknown++;
 const s=await fetch(req,{signal:AbortSignal.timeout(12000)});const sj=await s.json();const sd=display(sj.results||[],lat,lng);
 if(sd.postalStatus==='suggested'&&!selected)selected={lat,lng};
 await new Promise(r=>setTimeout(r,350));
 const second=await fetch(req,{signal:AbortSignal.timeout(12000)});const sj2=await second.json();const s2=display(sj2.results||[],lat,lng);
 if(second.headers.get('X-Via-Reverse-Cache')==='HIT'){assert.equal(s2.postalStatus,'suggested');hit=true;selected={lat,lng}}
 const info={lat,lng,ide:s.headers.get('X-Via-Reverse-IDE'),fallback:s.headers.get('X-Via-Reverse-Backup'),backupStatus:response.status,backupPostal:b.postalStatus,backupMs:Date.now()-t,qaStatus:s.status,qaPostal:sd.postalStatus,repeatCache:second.headers.get('X-Via-Reverse-Cache')==='HIT'};
 console.log('VIA_GEO_INTEGRAL_POINT '+JSON.stringify(info));evidence.push(info);
 if(backupGood&&hit&&unknown)break;
}
assert(backupGood>=1,'No real usable Geoapify street reference');assert(selected,'No usable integrated reference');assert(hit,'No real D1 reverse cache hit');
const amb=display([{street:'Calle A',lat:selected.lat,lng:selected.lng,distanceMeters:5},{street:'Calle B',lat:selected.lat,lng:selected.lng,distanceMeters:7}],selected.lat,selected.lng);assert.equal(amb.postalStatus,'unknown');
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
 try{const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await c.addInitScript(({lat,lng})=>{Object.defineProperty(navigator,'geolocation',{value:{watchPosition(ok){setTimeout(()=>ok({coords:{latitude:lat,longitude:lng,accuracy:12},timestamp:Date.now()}),250);return 1},clearWatch(){}},configurable:true});if(navigator.permissions)Object.defineProperty(navigator.permissions,'query',{value:async()=>({state:'granted'}),configurable:true});},selected);
 const p=await c.newPage();await p.goto(stage+'/index.html',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.ViaAddress);
 assert.equal((await p.locator('#via-visible-release').innerText()).trim(),'V30.4.10.10 QA');
 assert(await p.locator('#via-geography-credit').isVisible());
 let calls=0;p.on('request',r=>{if(r.url().includes('/api/direcciones?mode=reverse'))calls++});
 await p.locator('#location-shortcut').click();
 await p.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.dataset.viaWait==='gps'||[...document.querySelectorAll('#via-gps-feedback button')].some(b=>b.textContent==='Permitir ubicación'));
 const perm=p.getByRole('button',{name:'Permitir ubicación',exact:true});if(await perm.count())await perm.click();
 await p.waitForFunction(()=>!document.getElementById('location-shortcut').disabled&&window.ViaAddress.get('home-origin')?.postalStatus==='suggested',{timeout:20000});
 const picked=await p.evaluate(()=>ViaAddress.get('home-origin'));assert.equal(picked.lat,selected.lat);assert.equal(picked.lng,selected.lng);assert(calls>=1&&calls<=2);
 assert.equal(await p.locator('#via-gps-feedback .via-wait-track:visible').count(),0);
 console.log('VIA_GEO_INTEGRAL_BROWSER_PASS '+JSON.stringify({name,oneTap:true,calls,coordinatesPreserved:true,postalStatus:picked.postalStatus}));
 await c.close();
 }finally{await browser.close()}
}
const denied=await fetch(stage+'/api/customer/me');assert.equal(denied.status,503);
const blocked=await fetch(stage+'/api/requests',{method:'POST',body:'{}'});assert.equal(blocked.status,503);
mkdirSync('v30410-visual/geo-evidence',{recursive:true});writeFileSync('v30410-visual/geo-evidence/result.json',JSON.stringify({backupGood,unknown,cacheHit:hit,evidence,qa:stage},null,2));
console.log('VIA_GEO_INTEGRAL_PASS '+JSON.stringify({backupGood,unknown,cacheHit:hit,realProviders:true,bookingBlocked:true}));
