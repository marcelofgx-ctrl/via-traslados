import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const url=process.env.UI_TEST_URL||'https://via-traslados-gps-precision-qa.marcelof-gx.workers.dev/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const UAS={
 chrome:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
 samsung:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/128.0.0.0 Mobile Safari/537.36',
 firefox:'Mozilla/5.0 (Android 16; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0'
};
const point=(lat,lng,accuracy=35)=>({coords:{latitude:lat,longitude:lng,accuracy},timestamp:Date.now()});
let passed=0;
function installGps(){
 const point=(lat,lng,accuracy=35)=>({coords:{latitude:lat,longitude:lng,accuracy},timestamp:Date.now()});
 Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'granted'})}});
 window.__gpsStats={watches:0,clears:[],callback:null};
 const positions=[
  point(-34.81000,-56.01000),
  point(-34.81008,-56.01003),
  point(-34.82400,-56.02000)
 ];
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
  watchPosition(ok,bad,options){
   const id=++window.__gpsStats.watches;
   setTimeout(()=>ok(positions[Math.min(id-1,positions.length-1)]),75);
   return id;
  },
  clearWatch(id){window.__gpsStats.clears.push(id)},
  getCurrentPosition(ok,bad){setTimeout(()=>bad({code:1}),30)}
 }});
}
async function launch(ua=UAS.chrome,init=null,width=390){
 const context=await browser.newContext({viewport:{width,height:850},isMobile:true,hasTouch:true,userAgent:ua});
 if(init===installGps)await context.grantPermissions(['geolocation'],{origin:new URL(url).origin});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(init)await page.addInitScript(init);
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
 assert.equal(response.status(),200,'Sitio QA HTTP200');
 await page.waitForFunction(()=>typeof window.ViaAddress?.set==='function');
 return {page,context,errors};
}
async function keyboard(width){
 const {page,context,errors}=await launch(UAS.chrome,()=>{
  const vv=new EventTarget();
  Object.assign(vv,{width:window.innerWidth,height:window.innerHeight,offsetLeft:0,offsetTop:0});
  window.__mockVisualViewport=vv;
  Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
 },width);
 try{
  await page.route('**/api/direcciones?*',route=>{
   const path=new URL(route.request().url());
   const isPlaces=path.searchParams.get('mode')==='places';
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    results:isPlaces?[{label:'Aeropuerto Simulado, Canelones, Canelones',
     street:'Aeropuerto Simulado',kind:'place',accuracy:'poi',
     city:'Canelones',department:'Canelones',lat:-34.8,lng:-56.0}]:[]
   })});
  });
  const input=page.locator('#home-destination');
  await input.fill('Aeropuerto');
  await page.waitForFunction(()=>document.querySelectorAll('#address-suggestions .address-choice').length>0,
   null,{timeout:9000});
  await page.evaluate(()=>{
   const r=document.getElementById('home-destination').getBoundingClientRect();
   const height=Math.max(250,Math.min(window.innerHeight-10,r.bottom+55));
   window.__mockVisualViewport.height=height;
   window.__mockVisualViewport.dispatchEvent(new Event('resize'));
  });
  const metrics=await page.evaluate(()=>{
   const r=document.getElementById('home-destination').getBoundingClientRect();
   const p=document.getElementById('address-suggestions').getBoundingClientRect();
   const v=window.__mockVisualViewport;
   return {inputTop:r.top,inputBottom:r.bottom,panelTop:p.top,panelBottom:p.bottom,
    visibleTop:v.offsetTop,visibleBottom:v.height+v.offsetTop,
    position:document.getElementById('address-suggestions').dataset.placement,
    bodyWidth:document.documentElement.scrollWidth,screenWidth:document.documentElement.clientWidth};
  });
  assert.equal(metrics.position,'above','El desplegable debe ir arriba cuando abajo hay teclado: '+JSON.stringify(metrics));
  assert(metrics.panelTop>=metrics.visibleTop+2,'Panel por encima del área visible '+JSON.stringify(metrics));
  assert(metrics.panelBottom<=metrics.visibleBottom-4,'Panel cubierto por teclado '+JSON.stringify(metrics));
  assert(metrics.panelBottom<=metrics.inputTop+1,'Panel encima del campo '+JSON.stringify(metrics));
  assert(metrics.bodyWidth<=metrics.screenWidth+2,'Scroll horizontal '+JSON.stringify(metrics));
  await page.locator('#address-suggestions .address-choice').first().click();
  assert.match(await input.inputValue(),/Aeropuerto Simulado/);
  assert.equal(await page.locator('#address-suggestions').evaluate(el=>el.classList.contains('hidden')),true);
  assert.deepEqual(errors,[]);
  console.log('VIA_UI_V2915_BROWSER_PASS '+JSON.stringify({name:'keyboard',width,placement:metrics.position}));
  passed++;
 }finally{await context.close()}
}
async function gps(variant){
 const {page,context,errors}=await launch(UAS[variant],installGps);
 // Chrome puede reponer su objeto nativo de geolocalización después del init script.
 await page.evaluate(installGps);
 try{
  let reverse=0;
  await page.route('**/api/direcciones?mode=reverse*',route=>{
   reverse++;
   const street=reverse===1?'CALLE PRUEBA 151':reverse===2?'CALLE PRUEBA':'CALLE DIFERENTE';
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({results:[{street,label:street+', CIUDAD PRUEBA, CANELONES',
     city:'CIUDAD PRUEBA',department:'CANELONES',lat:reverse===1?-34.8101:reverse===2?-34.8102:-34.824,
     lng:reverse===1?-56.0100:reverse===2?-56.0101:-56.0200,
     accuracy:'portal',distanceMeters:14,source:'IDE Uruguay'}]})});
  });
  const start=page.locator('#location-shortcut'),source=page.locator('#home-origin');
  await start.click();
  try{await page.locator('#via-gps-feedback').getByText('Ubicación obtenida').waitFor({timeout:10000})}
  catch(err){
   console.log('VIA_UI_V2915_GPS_DIAG '+JSON.stringify(await page.evaluate(()=>({
    ua:navigator.userAgent,secure:window.isSecureContext,policy:window.__viaGpsPolicy,
    watches:window.__gpsStats?.watches,
    feedback:document.getElementById('via-gps-feedback')?.textContent,
    origin:document.getElementById('home-origin')?.value,
    source:document.getElementById('home-origin')?.dataset,
    button:document.getElementById('location-shortcut')?.disabled
   }))));
   throw err;
  }
  const policy=await page.evaluate(()=>window.__viaGpsPolicy);
  assert.equal(policy,variant==='chrome'?'chrome-family':variant==='samsung'?'samsung-internet':'other-browser');
  assert.match(await source.inputValue(),/151/,'No se recibió número GPS orientativo');
  await page.waitForTimeout(4000);
  assert.equal(await page.locator('#via-gps-feedback').isVisible(),false,'La confirmación GPS debe ser transitoria');
  if(variant==='chrome'){
   await start.click();
   await page.locator('#via-gps-feedback').getByText('Ubicación obtenida').waitFor({timeout:10000});
   assert.match(await source.inputValue(),/151/,'Reconsulta en misma calle: conservar número orientativo');
   assert.equal(await source.getAttribute('data-number-is-approximate'),'true');
   await start.click();
   await page.locator('#via-gps-feedback').getByText('Ubicación obtenida').waitFor({timeout:10000});
   assert.doesNotMatch(await source.inputValue(),/151/,'Nueva calle lejana: no conservar número anterior');
  }
  assert.deepEqual(errors,[],'Errores JS '+JSON.stringify(errors));
  console.log('VIA_UI_V2915_BROWSER_PASS '+JSON.stringify({name:'gps',variant,policy}));
  passed++;
 }finally{await context.close()}
}
try{
 for(const w of [320,360,390,412])await keyboard(w);
 for(const variant of ['chrome','samsung','firefox'])await gps(variant);
 console.log('VIA_UI_V2915_CHROME_ALL_PASSED '+passed);
}finally{await browser.close()}
