import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const URL='https://via-traslados-gps-precision-qa.marcelof-gx.workers.dev/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
function mockPosition(mode){
 const lat=-34.83362,lng=-56.01048;
 let watchCount=0;
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
  watchPosition(success,fail,opts){
   watchCount++;window.__gpsWatchCount=watchCount;
   window.__gpsOptions=opts;
   const point=meters=>({coords:{latitude:lat,longitude:lng,accuracy:meters},
     timestamp:Date.now()});
   setTimeout(()=>success(point(2000)),70);
   if(mode==='refine'||mode==='manual')setTimeout(()=>success(point(35)),250);
   return watchCount;
  },
  clearWatch(id){window.__gpsCleared=id}
 }});
 document.addEventListener('via:address',e=>{window.__lastGpsChange=e.detail});
}
async function check(width,mode){
 const ctx=await browser.newContext({viewport:{width,height:850},isMobile:true,hasTouch:true});
 const page=await ctx.newPage(),errors=[],reverse=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.addInitScript(mockPosition,mode);
 await page.route('**/api/direcciones?mode=reverse*',r=>{
  reverse.push(r.request().url());
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   results:[{label:'FALEGNANE 19, SAN JOSE DE CARRASCO, CANELONES',
    street:'FALEGNANE 19',city:'SAN JOSE DE CARRASCO',department:'CANELONES',
    lat:-34.83362,lng:-56.01048,accuracy:'portal',source:'IDE Uruguay'}],
   mode:'reverse',provider:'IDE Uruguay'})});
 });
 const response=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response.status(),200);
 await page.locator('#location-shortcut').click();
 await page.waitForFunction(()=>window.__gpsWatchCount===1,null,{timeout:5000});
 const options=await page.evaluate(()=>window.__gpsOptions);
 assert.equal(options.enableHighAccuracy,true);
 assert.equal(options.maximumAge,0);
 if(mode==='manual'){
  await page.locator('#home-origin').fill('Dirección elegida manualmente, Canelones');
 }
 if(mode==='low'){
  await page.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.textContent?.includes('±2000'),null,{timeout:6000});
  const status=await page.locator('#via-gps-feedback').textContent();
  assert.match(status,/Mejorando precisión/);
  assert.equal(reverse.length,0,'La app consultó dirección antes de mejorar precisión');
  console.log('VIA_GPS_PRECISION_LOW_PENDING_OK '+JSON.stringify({width,reverse:reverse.length,status}));
 }else{
  await page.waitForFunction(()=>window.__gpsCleared===1,null,{timeout:16000});
  if(mode==='refine'){
   await page.waitForFunction(()=>window.__lastGpsChange?.gpsAccuracy===35,null,{timeout:10000});
   assert.equal(reverse.length,1,'La búsqueda inversa debe ejecutarse una vez sobre el mejor GPS');
   assert(!/±2000/.test(await page.locator('#via-gps-feedback').textContent()),
    'Error de GPS aproximado quedó visible aunque ya mejoró');
   console.log('VIA_GPS_PRECISION_REFINED_OK '+JSON.stringify({width,reverse:reverse.length,
    label:await page.locator('#home-origin').inputValue()}));
  }else{
   assert.equal(await page.locator('#home-origin').inputValue(),'Dirección elegida manualmente, Canelones',
    'Resultado GPS tardío reemplazó dirección manual');
   console.log('VIA_GPS_MANUAL_INPUT_PRESERVED_OK');
  }
 }
 const dims=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 assert(dims.scroll<=dims.client+2,'Horizontal overflow at '+width);
 assert.equal(errors.length,0,JSON.stringify(errors));
 await ctx.close();
}
try{
 for(const width of [320,360,390,412])await check(width,'refine');
 await check(390,'low');
 await check(390,'manual');
 console.log('VIA_GPS_CHROME_QA_ALL_OK');
}finally{await browser.close();}
