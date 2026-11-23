// Vía V30: real mobile browser against isolated web QA. Prevent regression:
// selected home map pin must flow into route preview request and wizard.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';
const STAGE='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const OUT='v30-web-browser-proof';await mkdir(OUT,{recursive:true});
let passed=0;
for(const [os,w,h] of [['android',390,844],['ios',375,667]]){
 const browser=await (os==='ios'?webkit:chromium).launch(os==='ios'?{headless:true}:{headless:true,channel:'chrome',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},
  isMobile:true,hasTouch:true,serviceWorkers:'block',locale:'es-UY',deviceScaleFactor:2});
 const page=await context.newPage(),payloads=[],jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/public/route-preview'){
   payloads.push(JSON.parse(route.request().postData()||'{}'));
   return route.fulfill({status:200,json:{distanceKm:13.2,durationMinutes:19,source:'Geoapify',cached:false}});
  }
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA isolated'}});
  if(url.origin===STAGE)return route.continue();
  return route.abort();
 });
 try{
  await page.goto(STAGE+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);
  assert((await page.locator('#via-release-indicator').innerText()).includes('30.0'),'QA wrong version');
  await page.evaluate(()=>{
   ViaAddress.set('home-origin',{label:'Avenida Italia, Montevideo',lat:-34.854271,lng:-56.003157,source:'map',postalStatus:'unknown'});
   ViaAddress.set('home-destination',{label:'Aeropuerto Internacional de Carrasco',lat:-34.83696,lng:-56.01638,source:'selected',postalStatus:'selected'});
  });
  await page.locator('#start-booking').click();
  await page.waitForFunction(()=>document.querySelector('#via-route-distance')?.textContent.includes('13,2'),undefined,{timeout:15000});
  assert(payloads.length>=1,'No route preview POST received');
  let route=payloads.at(-1);
  assert.equal(route.origin,'Avenida Italia, Montevideo');
  assert.equal(route.originLocation?.lat,-34.854271,'Frontend discarded map pin');
  assert.equal(route.originLocation?.lng,-56.003157,'Frontend discarded map longitude');
  assert.equal(route.destinationLocation?.lat,-34.83696,'Frontend discarded airport coordinates');
  assert.equal(route.destinationLocation?.lng,-56.01638,'Frontend discarded airport longitude');
  assert.deepEqual(jsErrors,[],'Browser JS errors '+jsErrors.join(';'));
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-V30-review-with-road-distance.png',fullPage:false});
  console.log('VIA_V30_BROWSER_COORDINATES_TO_PREVIEW_PASS '+JSON.stringify({os,w,h,payload:true,previewKm:13.2}));
  passed++;
 }finally{await context.close();await browser.close()}
}
console.log('VIA_V30_BROWSER_COORDINATE_FLOW_ALL_PASS '+passed);
