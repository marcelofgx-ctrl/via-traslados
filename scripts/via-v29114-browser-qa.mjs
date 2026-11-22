/* Vía Traslados V29.1.14 — real Chromium Android and WebKit iOS.
   Stage API is completely disabled. All reverse geocoding and identity are mocked.
   Validate fresh booking after old flow, geo metadata, bfcache and street/portal accuracy.
   Never send OTP, create booking, query real D1, or alter customer data. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';

const QA='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const PROD='https://viatraslados.com';
const OUT='via-v29114-proof';
const profile={name:'Ana de QA',phone:'099000000',email:'ana@example.invalid'};
const session={sessionToken:'a'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+7200,profile};
await mkdir(OUT,{recursive:true});
let passed=0;
const pos1={latitude:-34.8237,longitude:-56.1065,accuracy:18};
const pos2={latitude:-34.82415,longitude:-56.1069,accuracy:16};
const ua={
 android:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
 ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
};
const check=async(page)=>page.evaluate(()=>{
 const get=id=>{const el=document.getElementById(id);return {
  text:el?.value||'',lat:el?.dataset?.lat||'',lng:el?.dataset?.lng||'',
  source:el?.dataset?.source||'',selected:el?.dataset?.addressSelected||''
 }};
 return {home:get('home-origin'),destination:get('home-destination'),
  origin:get('origin'),wizardDestination:get('destination'),
  notes:document.getElementById('notes')?.value||'',
  bodyWidth:document.documentElement.scrollWidth,viewport:window.innerWidth,
  session:localStorage.getItem('via-customer-session-v1'),
  note:document.getElementById('via-gps-feedback')?.textContent||'',
  version:document.querySelector('#via-release-indicator')?.textContent||'',
  date:document.getElementById('home-date')?.value||'',
  inputActive:!!document.querySelector('#home-origin')
 };
});
async function instance(os,w,h){
 const engine=os==='ios'?webkit:chromium;
 const browser=await engine.launch(os==='ios'?{headless:true}:{channel:'chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},
  isMobile:true,deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block',
  userAgent:ua[os],locale:'es-UY'});
 await context.grantPermissions(['geolocation'],{origin:QA});
 await context.setGeolocation(pos1);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),session);
 let reverseRows=[{street:'Avenida Italia',lat:pos1.latitude,lng:pos1.longitude,
  city:'Montevideo',department:'Montevideo',distanceMeters:14,source:'ide'}],reverseCalls=0;
 let delayNextReverse=null;
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/direcciones'&&url.searchParams.get('mode')==='reverse'){
   reverseCalls++;
   if(delayNextReverse){const f=delayNextReverse;delayNextReverse=null;return f(route)}
   return route.fulfill({status:200,json:{results:reverseRows}});
  }
  if(url.pathname==='/api/customer/me')
   return route.fulfill({status:200,json:{profile,passkeys:1,expiresAt:session.expiresAt}});
  if(url.pathname.startsWith('/api/'))
   return route.fulfill({status:503,json:{error:'QA: no real API'}});
  if(url.origin===QA||url.origin===PROD)return route.continue();
  return route.abort();
 });
 try{
  await page.goto(QA+'/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#start-booking').waitFor();
  await page.waitForFunction(()=>typeof window.ViaAddress?.set==='function');
  assert((await check(page)).version.includes('29.1.14'),'New passenger version not served');

  // Actual previous trip's stale wizard address and note; homepage empty.
  await page.evaluate(()=>{
   document.getElementById('home-origin').value='';
   document.getElementById('home-destination').value='';
   ViaAddress.set('origin',{label:'Calle anterior 567, Montevideo',
      lat:-34.90,lng:-56.15,source:'address_search',accuracy:'portal'});
   ViaAddress.set('destination',{label:'Destino anterior 998',
      lat:-34.89,lng:-56.12,source:'address_search',accuracy:'portal'});
   document.getElementById('notes').value='Notas del viaje anterior';
  });
  await page.locator('#start-booking').click();
  let state=await check(page);
  assert(state.origin.text===''&&state.wizardDestination.text==='',
   'Old wizard route was silently reused when homepage fields were empty');
  assert(state.origin.lat===''&&state.wizardDestination.lat==='',
   'Old hidden geocoordinates survived fresh booking');
  assert(state.notes==='','Old trip notes survived new request');
  assert(state.session?.includes(session.sessionToken),'Passenger session was lost');
  assert(state.bodyWidth<=state.viewport+2,'Horizontal overflow in new wizard');
  passed++;console.log('VIA_V29114_PASS_'+os+'_'+w+'_CLEAN_EMPTY_DRAFT');

  // User consciously chooses fresh homepage origin/destination. Handoff must preserve metadata.
  await page.locator('#wizard-back').click();
  await page.evaluate(()=>{
   ViaAddress.set('home-origin',{label:'Nueva calle 222, Montevideo',lat:-34.84,lng:-56.15,
     source:'address_search',accuracy:'portal'});
   ViaAddress.set('home-destination',{label:'Aeropuerto de Carrasco',lat:-34.838,lng:-56.024,
     source:'address_search',accuracy:'poi'});
   document.getElementById('notes').value='Old note';
  });
  await page.locator('#start-booking').click();
  state=await check(page);
  assert(state.origin.text==='Nueva calle 222, Montevideo'&&state.origin.lat==='-34.84',
   'Deliberately selected fresh origin/coordinates not copied correctly');
  assert(state.wizardDestination.text==='Aeropuerto de Carrasco'&&state.wizardDestination.lat==='-34.838',
   'Deliberately selected new destination/coordinates not copied');
  assert(state.notes==='','Notes retained across trips');
  passed++;console.log('VIA_V29114_PASS_'+os+'_'+w+'_COPY_NEW_SELECTION');

  // Simulate Android/iOS history restoration from completed/accepted reservation.
  await page.evaluate(()=>{
   const e=new Event('pageshow');Object.defineProperty(e,'persisted',{value:true});
   window.dispatchEvent(e);
  });
  state=await check(page);
  assert(state.home.text===''&&state.origin.text===''&&state.destination.text===''
     &&state.wizardDestination.text==='','Back/forward cache restored previous booking');
  assert(state.home.lat===''&&state.origin.lat==='','Back/forward cache retained old coordinates');
  assert(state.session?.includes(session.sessionToken),'BFCache reset lost validated identity');
  passed++;console.log('VIA_V29114_PASS_'+os+'_'+w+'_BFCACHE_NEW_TRIP');

  // Fresh GPS click: valid fix, reverse service returns ONLY street.
  await page.goto(QA+'/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#location-shortcut').click();
  await page.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.textContent.includes('Confirmá el número'),
   {timeout:10000}).catch(async()=>{throw Error('Street-only guidance did not appear. '+JSON.stringify(await check(page)))});
  state=await check(page);
  assert(state.home.text.includes('Avenida Italia')&&!/\b5781\b/.test(state.home.text),
   'GPS invented a door number for street-only reverse lookup');
  assert(state.home.lat!==''&&state.home.source==='gps','GPS failed to store current coordinates');
  assert(state.note.includes('número')&&state.note.includes('mapa'),'No actionable street/door guidance');
  assert(reverseCalls===1,'First GPS should make one reverse lookup; observed '+reverseCalls);
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-street-no-number.png',fullPage:false});
  passed++;console.log('VIA_V29114_PASS_'+os+'_'+w+'_GPS_STREET_ONLY');

  // A second tap must ask for fresh coordinates, not rely on the old reverse response.
  reverseRows=[{street:'Avenida Italia 5781',lat:pos2.latitude,lng:pos2.longitude,
   city:'Montevideo',department:'Montevideo',distanceMeters:12,source:'ide'}];
  await context.setGeolocation(pos2);
  await page.locator('#location-shortcut').click();
  await page.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.textContent.includes('Número orientativo'),
   {timeout:10000}).catch(async()=>{throw Error('New GPS reference not refreshed. '+JSON.stringify(await check(page)))});
  state=await check(page);
  assert(state.home.text.includes('5781')&&state.home.lat===String(pos2.latitude),
   'New GPS fix was not used after another tap');
  assert(state.note.includes('referencia')&&state.note.includes('Verificá'),
   'Approximate number displayed as definitive');
  assert(reverseCalls===2,'Two explicit GPS taps must trigger two fresh reverse requests');
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-approx-number.png',fullPage:false});
  passed++;console.log('VIA_V29114_PASS_'+os+'_'+w+'_GPS_EXPLICIT_REFRESH');

  // Do not let a late reverse geocode overwrite a manually edited origin.
  delayNextReverse=route=>new Promise(resolve=>{
   setTimeout(()=>{route.fulfill({status:200,json:{results:[{street:'Calle inventada 900',lat:pos1.latitude,
    lng:pos1.longitude,distanceMeters:9,city:'Montevideo',department:'Montevideo'}]}}).then(resolve)},450);
  });
  await page.locator('#location-shortcut').click();
  await page.waitForTimeout(80);
  await page.locator('#home-origin').evaluate(el=>{
    el.value='Mi dirección escrita 123';
    el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForTimeout(600);
  state=await check(page);
  assert(state.home.text==='Mi dirección escrita 123','Late GPS response overrode manually entered address');
  passed++;console.log('VIA_V29114_PASS_'+os+'_'+w+'_GPS_LATE_RESULT_IGNORED');

  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-GPS-confirmation.png',fullPage:false});
  assert((await check(page)).bodyWidth<=w+2,'New GPS dialog causes horizontal scroll');
  assert.deepEqual(errors,[],'JavaScript errors '+errors.join('; '));
  console.log('VIA_V29114_FULL_CYCLE_'+os+'_'+w+'x'+h+'_PASS '+JSON.stringify({checks:6,reverseCalls}));
 }finally{await context.close();await browser.close()}
}
for(const [os,w,h] of [
 ['android',320,640],['android',390,844],['android',412,915],
 ['ios',375,667],['ios',390,844],['ios',430,932]
])await instance(os,w,h);
console.log('VIA_V29114_NEW_BOOKING_BROWSER_QA_ALL_PASS '+passed);
