import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdirSync} from 'node:fs';
const root='https://via-traslados-search-refined-qa.marcelof-gx.workers.dev';
const old='https://via-traslados-geo-integral-qa.marcelof-gx.workers.dev';
mkdirSync('gps-premium-evidence',{recursive:true});
for(const n of ['reference.js','geo-v2/core.mjs','address-autocomplete.js','map-point-picker.js','app.js','store.js','via-visual-compat.css']){
 const [a,b]=await Promise.all([fetch(root+'/'+n),fetch(old+'/'+n)]);assert(a.ok&&b.ok);assert(Buffer.from(await a.arrayBuffer()).equals(Buffer.from(await b.arrayBuffer())),n+' differs');
}
const android='Mozilla/5.0 (Linux; Android 15; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const profiles=[['chrome',chromium,android,390,'no-preference'],['samsung',chromium,android+' SamsungBrowser/28.0',390,'no-preference'],['edge',chromium,android+' EdgA/142.0.0.0',360,'no-preference'],['webview',chromium,android.replace('SM-S918B','SM-S918B; wv')+' Version/4.0',320,'no-preference'],['firefox',firefox,'Mozilla/5.0 (Android 15; Mobile; rv:145.0) Gecko/145.0 Firefox/145.0',390,'reduce'],['safari',webkit,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',390,'no-preference']];
for(const [name,engine,ua,width,reducedMotion] of profiles){
 const b=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox']}:{} )});
 try{
 const c=await b.newContext({viewport:{width,height:width===320?568:720},userAgent:ua,hasTouch:true,deviceScaleFactor:2,reducedMotion,serviceWorkers:'block'});
 const lat=-34.9061,lng=-56.1999;
 await c.addInitScript(({lat,lng})=>{
  let id=0;const pending=new Map();
  Object.defineProperty(navigator,'geolocation',{value:{watchPosition(ok){const n=++id;const ts=[setTimeout(()=>ok({coords:{latitude:lat,longitude:lng,accuracy:350},timestamp:Date.now()}),700),setTimeout(()=>ok({coords:{latitude:lat,longitude:lng,accuracy:12},timestamp:Date.now()}),2000)];pending.set(n,ts);return n},clearWatch(n){for(const t of pending.get(n)||[])clearTimeout(t)}},configurable:true});
  if(navigator.permissions)Object.defineProperty(navigator.permissions,'query',{value:async()=>({state:'prompt'}),configurable:true});
 },{lat,lng});
 let scenario='success',calls=0;
 await c.route('**/*',async r=>{const q=r.request(),u=new URL(q.url());
  if(u.origin===root&&u.pathname==='/api/direcciones'&&u.searchParams.get('mode')==='reverse'){
   calls++;await new Promise(x=>setTimeout(x,900));
   const row={street:'Plaza Independencia 743',city:'Montevideo',department:'Montevideo',lat,lng,distanceMeters:8,source:'synthetic'};
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:scenario==='success'?[row]:[row,{...row,street:'Otra calle'}]})}).catch(()=>{});
  }
  if(u.origin===root&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(q.method()))return r.continue();
  return r.abort();
 });
 const p=await c.newPage();await p.goto(root+'/index.html',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.ViaAddress&&document.querySelector('#location-shortcut')?.dataset.viaGpsState==='idle');
 assert.equal((await p.locator('#via-visible-release').innerText()).trim(),'V30.4.10.18 QA');
 const button=p.locator('#location-shortcut'),state=s=>p.waitForFunction(x=>document.querySelector('#location-shortcut')?.dataset.viaGpsState===x,s,{timeout:12000});
 assert.equal(await p.locator('#home-origin').getAttribute('placeholder'),'¿Dónde te recogemos?');
 for(const id of ['home-origin','home-destination']){
  const style=await p.locator('#'+id).evaluate(e=>({editable:getComputedStyle(e).fontSize,prompt:getComputedStyle(e,'::placeholder').fontSize,weight:getComputedStyle(e,'::placeholder').fontWeight}));
  assert.equal(style.editable,'14px');assert.equal(style.prompt,'14px');assert.equal(style.weight,'400');
  await p.locator('#'+id).focus();assert.equal(await p.locator('#'+id).evaluate(e=>getComputedStyle(e).fontSize),'16px');
  await p.locator('#'+id).blur();
 }
 await p.waitForFunction(()=>document.querySelectorAll('.reference-home .via-map-shortcut').length===2&&window.ViaMapPicker);
 const route=await p.locator('.reference-home .reference-route-fields').evaluate(e=>{
  const a=e.querySelector('#home-origin').closest('.reference-field'),b=e.querySelector('#home-destination').closest('.reference-field'),d=e.querySelector('.route-dash');
  const r=e.getBoundingClientRect(),ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(),rd=d.getBoundingClientRect();
  return {shared:a.parentElement===e&&b.parentElement===e,background:getComputedStyle(e).backgroundImage,rowBackgrounds:[getComputedStyle(a).backgroundImage,getComputedStyle(b).backgroundImage],gap:rb.top-ra.bottom,dividerHeight:rd.height,horizontal:getComputedStyle(d,'::after').height,vertical:getComputedStyle(d,'::before').borderLeftStyle,within:ra.left>=r.left&&rb.right<=r.right,controls:a.querySelectorAll('button').length+b.querySelectorAll('button').length};
 });
 assert(route.shared&&route.background.includes('linear-gradient')&&route.within&&route.controls>=3,JSON.stringify(route));
 assert.deepEqual(route.rowBackgrounds,['none','none']);assert(route.gap>=0&&route.gap<=10,JSON.stringify(route));assert.equal(route.horizontal,'1px');assert.equal(route.vertical,'dotted');
 console.log('VIA_JOURNEY_CARD_PASS '+JSON.stringify({name,...route}));
 const box=await button.boundingBox();assert(box.width>=43.9&&box.width<=45&&box.height>=43.9&&box.height<=45);assert.equal(await button.getAttribute('aria-label'),'Mi ubicación');assert.equal(await button.getAttribute('title'),'Mi ubicación');
 // Test actual autocomplete presentation with a synthetic response, preserving real selection logic.
 const searchPage=await c.newPage();
 await searchPage.goto(root+'/index.html',{waitUntil:'domcontentloaded'});
 await searchPage.waitForFunction(()=>window.ViaAddress&&document.querySelector('#address-suggestions'));
 const dest=searchPage.locator('#home-destination');
 await dest.focus();assert.equal(await dest.evaluate(e=>getComputedStyle(e).fontSize),'16px');
 // Intercept all geographic reads in this independent page; no reservation writes.
 await searchPage.route('**/api/direcciones?**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:Array.from({length:6},(_,i)=>({street:'Aeropuerto de prueba '+i,label:'Aeropuerto de prueba '+i,city:'Canelones',department:'Canelones',lat:-34.8+i/1000,lng:-56.0,kind:'place',accuracy:'poi',distanceKm:i+1}))})}));
 await dest.fill('Aeropuerto');
 const list=searchPage.locator('#address-suggestions');
 await searchPage.waitForFunction(()=>document.querySelector('#address-suggestions')?.dataset.viaCompact==='true'&&!document.querySelector('#address-suggestions')?.classList.contains('hidden'));
 const bounds=await list.evaluate(e=>({width:e.getBoundingClientRect().width,field:document.querySelector('#home-destination').closest('.reference-field').getBoundingClientRect().width,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,viewport:innerWidth}));
 assert(Math.abs(bounds.width-bounds.field)<3&&bounds.left>=0&&bounds.right<=bounds.viewport+1,JSON.stringify(bounds));
 await searchPage.waitForFunction(()=>document.querySelector('#address-suggestions')?.dataset.viaResultsReady==='true'&&document.activeElement!==document.querySelector('#home-destination'));
 const resultStyle=await list.locator('.address-choice strong').first().evaluate(e=>({size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight}));
 assert.deepEqual(resultStyle,{size:'13px',weight:'600'});
 assert(await list.isVisible());
 await dest.focus();assert(await dest.evaluate(e=>e===document.activeElement));
 await searchPage.waitForFunction(()=>document.querySelectorAll('#address-suggestions .address-choice').length>0);
 await searchPage.waitForTimeout(650);
 assert(await dest.evaluate(e=>e===document.activeElement),'Refocusing unchanged text must not dismiss keyboard');
 await dest.fill('Aeropuerto de prueba');
 await searchPage.waitForFunction(()=>document.querySelector('#address-suggestions')?.dataset.viaResultsReady==='true'&&document.activeElement!==document.querySelector('#home-destination'));
 await list.locator('.address-choice').first().click();
 await searchPage.waitForFunction(()=>Number.isFinite(ViaAddress.get('home-destination').lat));
 assert(await list.isHidden());
 await searchPage.screenshot({path:'gps-premium-evidence/'+name+'-search.png',animations:'disabled'});
 await searchPage.close();
 const visual=await button.evaluate(e=>({border:parseFloat(getComputedStyle(e).borderLeftWidth),iconSize:parseFloat(getComputedStyle(e,'::before').width),clip:getComputedStyle(e).backgroundClip,icon:getComputedStyle(e,'::before').backgroundImage,label:getComputedStyle(e,'::after').content,scroll:document.documentElement.scrollWidth,width:innerWidth}));
 assert.equal(visual.border,3);assert.equal(visual.iconSize,20);assert.equal(visual.clip,'padding-box');assert(visual.icon.includes('data:image/svg+xml'));assert.equal(visual.label,'none');assert(visual.scroll<=visual.width);
 await p.screenshot({path:'gps-premium-evidence/'+name+'-idle.png',animations:'disabled'});
 await button.click();await state('permission');await p.getByRole('button',{name:'Permitir ubicación',exact:true}).click();
 await state('gps');assert.equal(await p.locator('.via-wait-track:visible').count(),1);
 const anim=await button.evaluate(e=>getComputedStyle(e,'::before').animationName);assert.equal(anim,reducedMotion==='reduce'?'none':'via-gps-breathe');
 await state('precision');await state('reverse');
 await p.screenshot({path:'gps-premium-evidence/'+name+'-reverse.png',animations:'allow'});
 await state('success');assert.equal(calls,1);assert.equal(await p.locator('.via-wait-track:visible').count(),0);
 assert.equal(await p.locator('#via-geography-credit').count(),1);assert(await p.locator('#via-geography-credit').isVisible());
 const picked=await p.evaluate(()=>ViaAddress.get('home-origin'));assert.equal(picked.lat,lat);assert.equal(picked.lng,lng);assert.equal(picked.postalStatus,'suggested');
 await button.click();await state('permission');scenario='ambiguous';await p.getByRole('button',{name:'Permitir ubicación',exact:true}).click();await state('confirm');
 assert.equal((await p.evaluate(()=>ViaAddress.get('home-origin'))).postalStatus,'unknown');assert.equal(await p.locator('.via-wait-track:visible').count(),0);
 const nav=p.locator('.reference-tabs a').last();await nav.scrollIntoViewIfNeeded();assert(await nav.evaluate(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth}));
 await p.screenshot({path:'gps-premium-evidence/'+name+'-confirm.png',animations:'disabled'});
 // Manual input cancels the existing operation without new requests.
 await button.scrollIntoViewIfNeeded();await button.click();await state('permission');await p.getByRole('button',{name:'Permitir ubicación',exact:true}).click();await state('gps');
 const prior=calls;await p.locator('#home-origin').fill('Dirección manual QA');await p.waitForFunction(()=>!document.getElementById('location-shortcut').disabled);
 assert.equal(await p.locator('.via-wait-track:visible').count(),0);assert.equal(await p.locator('#home-origin').inputValue(),'Dirección manual QA');assert.equal(calls,prior);
 console.log('VIA_GPS_PREMIUM_PROFILE_PASS '+JSON.stringify({name,width,reducedMotion,states:['idle','permission','gps','precision','reverse','success','confirm'],navigation:true,manualCancel:true,syntheticGps:true,actualEngine:engine.name()}));
 await c.close();
 }finally{await b.close()}
}
