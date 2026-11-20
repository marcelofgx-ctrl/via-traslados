import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const url=process.env.GPS_TEST_URL||'https://via-traslados-gps-precision-qa.marcelof-gx.workers.dev/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
function mock({permission,fix}){
 const point=m=>({coords:{latitude:-34.83362,longitude:-56.01048,accuracy:m},timestamp:Date.now()});
 window.__gpsMock={watches:0,clears:[],options:null};
 if(permission!=='unavailable-api'){
  Object.defineProperty(navigator,'permissions',{configurable:true,value:
   permission==='unsupported'?undefined:{query:async()=>({state:permission})}});
 }
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
  watchPosition(ok,bad,opts){
   const id=++window.__gpsMock.watches;window.__gpsMock.options=opts;
   if(fix==='refine'||fix==='manual'||fix==='low'){
    setTimeout(()=>ok(point(2000)),75);
    if(fix!=='low')setTimeout(()=>ok(point(35)),fix==='manual'?620:300);
   }else if(fix==='denied')setTimeout(()=>bad({code:1}),80);
   else if(fix==='unavailable')setTimeout(()=>bad({code:2}),80);
   else if(fix==='timeout')setTimeout(()=>bad({code:3}),80);
   return id;
  },
  clearWatch(id){window.__gpsMock.clears.push(id)},
  getCurrentPosition(ok,bad,options){setTimeout(()=>bad({code:1,message:'Map GPS permission unavailable in synthetic QA'}),35)}
 }});
}
async function scenario(width,permission,fix,expected){
 const context=await browser.newContext({viewport:{width,height:850},isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(mock,{permission,fix});
 await page.route('**/api/direcciones?mode=reverse*',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({
   results:[{label:'FALEGNANE 19, SAN JOSE DE CARRASCO, CANELONES',
    street:'FALEGNANE 19',city:'SAN JOSE DE CARRASCO',department:'CANELONES',
    lat:-34.83362,lng:-56.01048,accuracy:'portal',source:'IDE Uruguay'}],
   mode:'reverse',provider:'IDE Uruguay'})}));
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response.status(),200);
 await page.locator('#location-shortcut').click();
 const feedback=page.locator('#via-gps-feedback');
 if(permission==='prompt'){
  await feedback.getByText('Activá tu ubicación').waitFor();
  assert.equal(await page.evaluate(()=>window.__gpsMock.watches),0);
  await feedback.getByRole('button',{name:'Permitir ubicación'}).click();
 }else if(permission==='denied'){
  await feedback.getByText('La ubicación está bloqueada').waitFor();
  assert.equal(await page.evaluate(()=>window.__gpsMock.watches),0);
  await feedback.getByRole('button',{name:'Cómo activar el permiso'}).click();
  assert.match(await feedback.textContent(),/Ajustes/);
  if(expected==='map'){
   await feedback.getByRole('button',{name:'Elegir en el mapa'}).click();
   await page.waitForFunction(()=>!!document.querySelector('.via-picker-backdrop:not([hidden])'),null,{timeout:12000});
   assert.equal(await page.evaluate(()=>window.__gpsMock.watches),0);
  }else{
   await feedback.getByRole('button',{name:'Volver a intentar'}).click();
   await feedback.getByText('La ubicación está bloqueada').waitFor();
  }
 }else if(fix==='manual'){
  await page.waitForFunction(()=>window.__gpsMock.watches===1);
  await page.locator('#home-origin').fill('Dirección manual, Canelones');
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#home-origin').inputValue(),'Dirección manual, Canelones');
  assert.equal(await page.evaluate(()=>window.__gpsMock.clears.length),1);
 }else if(expected==='navigate'){
  await page.waitForFunction(()=>window.__gpsMock.watches===1);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(()=>window.__gpsMock.clears.length===1);
 }else if(expected==='duplicate'){
  await page.waitForFunction(()=>window.__gpsMock.watches===1);
  await page.evaluate(()=>{document.getElementById('location-shortcut').click()});
  assert.equal(await page.evaluate(()=>window.__gpsMock.watches),1);
  await page.locator('#home-origin').fill('Mi dirección');
 }else if(expected==='success'){
  await feedback.getByText('Ubicación obtenida').waitFor({timeout:10000});
  assert((await page.locator('#home-origin').inputValue()).length>5);
  assert.equal(await page.locator('#home-origin').getAttribute('data-gps-accuracy'),'35');
  assert.equal(await page.evaluate(()=>window.__gpsMock.clears.length),1);
 }else if(expected==='low'){
  await feedback.getByText('Mejorando precisión').waitFor({timeout:6000});
  assert.match(await feedback.textContent(),/±2000/);
  await feedback.getByText('Ubicación aproximada').waitFor({timeout:22000});
  assert.equal(await page.locator('#home-origin').getAttribute('data-gps-accuracy'),'2000');
 }else if(expected==='unavailable'){
  await feedback.getByText('No hay señal de ubicación').waitFor({timeout:6000});
 }else if(expected==='timeout'){
  await feedback.getByText('No logramos obtener tu ubicación').waitFor({timeout:6000});
 }
 if(permission!=='denied'&&fix!=='manual'&&expected!=='navigate'&&expected!=='duplicate')
  assert.equal(await page.evaluate(()=>window.__gpsMock.watches),1);
 const metrics=await page.evaluate(()=>({
  content:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
 assert(metrics.content<=metrics.viewport+2,'Desbordamiento horizontal '+width+' '+JSON.stringify(metrics));
 assert.deepEqual(errors,[],'Errores JS: '+JSON.stringify(errors));
 console.log('VIA_GPS_V2912_BROWSER_PASS '+JSON.stringify({width,permission,fix,expected}));
 await context.close();
}
try{
 for(const width of [320,360,390,412])await scenario(width,'granted','refine','success');
 await scenario(390,'prompt','refine','success');
 await scenario(390,'unsupported','refine','success');
 await scenario(390,'denied','denied','blocked');
 await scenario(390,'denied','denied','map');
 await scenario(390,'granted','unavailable','unavailable');
 await scenario(390,'granted','timeout','timeout');
 await scenario(390,'granted','low','low');
 await scenario(390,'granted','manual','manual');
 await scenario(390,'granted','low','navigate');
 await scenario(390,'granted','low','duplicate');
 console.log('VIA_GPS_V2912_QA_CHROME_ALL_PASSED');
}finally{await browser.close()}
