/* Vía Traslados v29.1.15 — real Android Chrome / iOS WebKit map, DOM and Leaflet.
 * Only geolocation sensor and /api/direcciones are simulated. Leaflet executes
 * the real library; original picker and GPS scripts run unchanged except v15 patch.
 * No real bookings, D1, OTP email or service writes. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
const leaf=await readFile('node_modules/leaflet/dist/leaflet.js');
const QA='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const OUT='via-v29115-map-proof';
const p={latitude:-34.854300,longitude:-56.003146,accuracy:16};
const profile={name:'Persona de prueba',phone:'099000000',email:'qa@example.invalid'};
const session={sessionToken:'a'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+3600,profile};
await mkdir(OUT,{recursive:true});
const ua={
 android:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
 ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
};
let checks=0;
async function run(os,w,h){
 const browser=await (os==='ios'?webkit:chromium).launch(os==='ios'?{headless:true}:{headless:true,channel:'chrome',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},
  isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',
  userAgent:ua[os],locale:'es-UY'});
 await context.grantPermissions(['geolocation'],{origin:QA});
 await context.setGeolocation(p);
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(([s,fix])=>{
  localStorage.setItem('via-customer-session-v1',JSON.stringify(s));
  // No physical iPhone sensor in CI: supply deterministic readings at the
  // navigator boundary while retaining real WebKit event/rendering semantics.
  if(/iPhone/.test(navigator.userAgent)){
   let seq=0;const active=new Set(),geo={
    watchPosition(ok,bad,opts){
     const id=++seq;active.add(id);
     Promise.resolve().then(()=>{if(active.has(id))ok({coords:{...fix},timestamp:Date.now()})});
     return id;
    },
    clearWatch(id){active.delete(id)},
    getCurrentPosition(ok){ok({coords:{...fix},timestamp:Date.now()})}
   };
   Object.defineProperty(navigator,'geolocation',{configurable:true,get:()=>geo});
  }
 },[session,p]);
 let rows=[],reverseCalls=0,mode='normal';
 const street={street:'Roque Sáenz Peña',lat:p.latitude,lng:p.longitude,city:'Shangrilá',department:'Canelones',distanceMeters:12,source:'ide'};
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(/unpkg.com\/leaflet@1\.9\.4\/dist\/leaflet\.js/.test(u.href))
   return route.fulfill({status:200,body:leaf,contentType:'application/javascript'});
  if(u.hostname.includes('unpkg.com')||u.hostname.includes('tile.openstreetmap.org')||
     u.hostname.includes('tiles.openfreemap.org'))return route.abort();
  if(u.origin===QA && u.pathname==='/api/direcciones' && u.searchParams.get('mode')==='reverse'){
   reverseCalls++;
   if(mode==='hang')return new Promise(resolve=>setTimeout(()=>{
    route.fulfill({status:200,json:{results:[{...street,street:'Calle tardía 900'}]}}).catch(()=>{}).finally(resolve);
   },8500));
   return route.fulfill({status:200,json:{results:rows}});
  }
  if(u.origin===QA&&u.pathname==='/api/customer/me')
   return route.fulfill({status:200,json:{profile,passkeys:1,expiresAt:session.expiresAt}});
  if(u.origin===QA&&u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA only'}});
  if(u.origin===QA)return route.continue();
  return route.abort();
 });
 async function panel(){
  return page.evaluate(()=>{
   const origin=document.getElementById('home-origin');
   const note=document.querySelector('#via-gps-feedback');
   const modal=document.querySelector('.via-picker-backdrop');
   const ref=document.querySelector('.via-picker-reference');
   const box=modal?.getBoundingClientRect();
   const date=document.querySelector('#home-date');
   return {
    gpsNote:note?.textContent||'',origin:origin?.value||'',latitude:origin?.dataset?.lat||'',
    longitude:origin?.dataset?.lng||'',postalStatus:origin?.dataset?.postalStatus||'',
    numberApprox:origin?.dataset?.numberIsApproximate||'',
    mapVisible:!!modal&&!modal.hidden,eyebrow:document.querySelector('.via-picker-eyebrow')?.textContent||'',
    mapStatus:ref?.textContent||'',pointText:document.querySelector('.via-picker-coordinates')?.textContent||'',
    mapBox:box?{width:box.width,left:box.left,right:box.right}:null,
    screen:innerWidth,documentWidth:document.documentElement.scrollWidth,
    session:localStorage.getItem('via-customer-session-v1'),
    dateWidth:date?.getBoundingClientRect().width||0,dateParentWidth:date?.parentElement.getBoundingClientRect().width||0,
    dateFont:date?getComputedStyle(date).fontSize:''
   }
  })
 }
 try{
  await page.goto(QA+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.ViaMapPicker?.openFor && window.ViaAddress?.set,{timeout:14000});
  assert((await page.locator('#via-release-indicator').innerText()).includes('29.1.15'),'Version not updated');
  assert((await panel()).dateWidth>55,'Date input collapsed');
  // The user's screenshot: GPS got coordinates but no street response.
  rows=[];
  await page.locator('#location-shortcut').click();
  await page.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.textContent.includes('Confirmá el punto'),
   undefined,{timeout:11000});
  let a=await panel();
  assert(a.gpsNote.includes('no identificó la calle')&&!a.gpsNote.includes('Encontramos la calle'),
    'Contradictory street-found message with no reverse result');
  assert(a.origin.includes('Punto de recogida')&&a.latitude===String(p.latitude),
    'GPS point not retained when address unavailable');
  assert(a.session?.includes(session.sessionToken),'Customer session lost');
  checks++;console.log('VIA_V29115_MAP_PASS_'+os+'_'+w+'_UNKNOWN_STREET_NOT_CLAIMED');

  // Open the ACTUAL map module and use the REAL Leaflet map center.
  await page.locator('#via-gps-feedback button').getByText('Elegir en el mapa').click();
  await page.locator('.via-picker-reference').waitFor();
  await page.waitForFunction(()=>document.querySelector('.via-picker-reference')?.textContent.includes('Punto marcado'),
   undefined,{timeout:11000});
  a=await panel();
  assert(a.mapVisible && a.eyebrow==='SELECCIÓN PRECISA' && !a.eyebrow.includes('QA'),'QA banner leaked in production-facing modal');
  assert(a.pointText.includes('-34.854300')&&a.pointText.includes('-56.003146'),'Exact GPS/map coordinate not preserved');
  assert(a.mapBox.left>=-1&&a.mapBox.right<=w+1&&a.documentWidth<=w+2,'Map modal horizontal overflow');
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-map-no-address.png',fullPage:false});
  checks++;console.log('VIA_V29115_MAP_PASS_'+os+'_'+w+'_NO_QA_BANNER_ACCURATE_POINT');

  // Confirm coordinates even if postal reverse geocoder cannot find street.
  await page.locator('.via-picker-confirm').click();
  await page.waitForFunction(()=>document.querySelector('.via-picker-backdrop')?.hidden===true);
  a=await panel();
  // Leaflet rounds the visible center to six decimals, but stores the actual
  // chosen map center at higher precision (within ~1 m of the displayed marker).
  const atMarkedPoint=state=>Math.abs(Number(state.latitude)-p.latitude)<0.000012&&
   Math.abs(Number(state.longitude)-p.longitude)<0.000012;
  assert(atMarkedPoint(a)&&a.postalStatus==='unknown',
   'Map confirmation did not save pin center without a street '+JSON.stringify(a));
  checks++;console.log('VIA_V29115_MAP_PASS_'+os+'_'+w+'_CONFIRM_COORDS_WITHOUT_STREET');

  // Reverse geocoder returns only a street. No invented door number.
  rows=[street];
  await page.locator('.via-map-shortcut').first().click();
  await page.waitForFunction(()=>document.querySelector('.via-picker-reference')?.textContent.includes('Número por confirmar'),
   undefined,{timeout:12000});
  a=await panel();
  assert(a.mapStatus.includes('Roque Sáenz Peña')&&!a.mapStatus.includes('1711'),
   'Street-only map display wrongly introduced a number');
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-street-only.png',fullPage:false});
  checks++;console.log('VIA_V29115_MAP_PASS_'+os+'_'+w+'_STREET_WITHOUT_DOOR');
  await page.locator('.via-picker-close').click();

  // A genuinely nearby numbered reference is ORIENTATIVE only.
  rows=[{...street,street:'Roque Sáenz Peña 1711'}];
  await page.locator('.via-map-shortcut').first().click();
  await page.waitForFunction(()=>document.querySelector('.via-picker-reference')?.textContent.includes('N.º orientativo'),
   undefined,{timeout:12000});
  a=await panel();
  assert(a.mapStatus.includes('1711')&&a.mapStatus.includes('N.º orientativo'),'Nearby door presented as certain');
  checks++;console.log('VIA_V29115_MAP_PASS_'+os+'_'+w+'_NEARBY_NUMBER_ORIENTATIVE');
  await page.locator('.via-picker-close').click();

  // If the reverse service hangs, status MUST leave Identificando after 6.2s.
  mode='hang';
  await page.evaluate(()=>window.ViaAddress.set('home-origin',null));
  await page.locator('.via-map-shortcut').first().click();
  await page.waitForFunction(()=>{
   const text=document.querySelector('.via-picker-reference')?.textContent||'';
   return text.includes('No pudimos identificar la calle')||
    text.includes('Punto marcado en el mapa');
  },undefined,{timeout:8500}).catch(async()=>{throw Error(
   'Reverse lookup did not reach terminal state '+JSON.stringify(await panel())
  )});
  a=await panel();
  assert(!a.mapStatus.includes('Identificando')&&a.mapVisible,
    'Reverse status left pending past deadline '+JSON.stringify(a));
  const started=Date.now();
  await page.locator('.via-picker-confirm').click();
  await page.waitForFunction(()=>document.querySelector('.via-picker-backdrop')?.hidden===true,
    undefined,{timeout:2500});
  assert(Date.now()-started<2400,'Confirmation still blocked by failed geocoder');
  a=await panel();
  assert(atMarkedPoint(a)&&a.postalStatus==='unknown',
   'Timed-out reverse should still preserve pin-centered coordinates '+JSON.stringify(a));
  checks++;console.log('VIA_V29115_MAP_PASS_'+os+'_'+w+'_REVERSE_WATCHDOG_AND_IMMEDIATE_CONFIRM');
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-after-timeout-confirm.png',fullPage:false});
  assert.deepEqual(errors.filter(x=>!x.includes('Leaflet')&&!x.includes('maplibregl')),[],
    'Unexpected page JS errors '+errors.join(';'));
  console.log('VIA_V29115_MAP_BROWSER_'+os+'_'+w+'x'+h+'_PASSED '+JSON.stringify({checks:6,reverseCalls}));
 }finally{await context.close();await browser.close()}
}
for(const args of [['android',320,640],['android',390,844]])
 await run(...args);
console.log('VIA_V29115_ALL_MAP_QA_PASSED '+checks);
