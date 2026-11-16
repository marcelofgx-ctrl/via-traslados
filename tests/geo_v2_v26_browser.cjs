/* Smoke test no destructivo del Worker QA. Nunca registra pasajeros ni crea reservas. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.VIA_QA_URL||'https://via-traslados-web-geov2-v26-qa.marcelof-gx.workers.dev';
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 try{
  for(const [width,height]of [[390,844],[320,640]]){
   const context=await browser.newContext({
    viewport:{width,height},isMobile:true,hasTouch:true,locale:'es-UY',
    permissions:['geolocation'],geolocation:{latitude:-34.905,longitude:-56.185,accuracy:18}
   });
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/?qa_v26=1',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForSelector('.via-map-shortcut',{timeout:18000});
   assert.equal(await page.evaluate(()=>window.VIA_CONFIG?.demo),false);
   assert.equal(await page.locator('.via-map-shortcut').count(),4);
   await page.locator('#location-shortcut').click();
   await page.waitForFunction(()=>{
    const input=document.getElementById('home-origin');
    return input?.dataset?.lat&&input?.dataset?.lng;
   },{timeout:16000});
   const GPS=await page.evaluate(()=>window.ViaAddress.get('home-origin'));
   assert.ok(Math.abs(GPS.lat+34.905)<0.003&&Math.abs(GPS.lng+56.185)<0.003);
   assert.equal(GPS.accuracy,'gps');
   await page.getByRole('button',{name:'Elegir origen en el mapa'}).click();
   await page.waitForSelector('.via-picker-map.maplibregl-map',{timeout:25000});
   const geo=await page.evaluate(()=>!!window.maplibregl?.Map);
   assert.ok(geo,'MapLibre no cargó; no lanzar versión que degrade a mosaicos');
   await page.locator('.via-picker-confirm').click();
   await page.waitForFunction(()=>document.querySelector('.via-picker-backdrop')?.hidden===true,{timeout:13000});
   const after=await page.evaluate(()=>window.ViaAddress.get('home-origin'));
   assert.ok(Number.isFinite(after.lat)&&Number.isFinite(after.lng));
   assert.ok(after.label.length>=5);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   assert.ok(overflow<=5,'Desbordamiento horizontal: '+overflow);
   assert.deepEqual(errors,[],'Errores de JavaScript en la portada');
   console.log('MOBILE_QA_OK',width,height,'postalStatus',after.postalStatus,'map',after.accuracy);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error('MOBILE_QA_FAILED',error.stack||String(error));process.exit(1)});
