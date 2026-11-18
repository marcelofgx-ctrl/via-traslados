// Prueba real Chromium solo sobre QA pública, sin crear reservas en producción.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const QA_WEB_URL='https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,360,390,412]){
  const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  const errors=[],network=[];
  page.on('pageerror',err=>errors.push(String(err.message).slice(0,140)));
  page.on('response',resp=>{if(resp.url().includes('via-traslados-maestro-api-qa'))network.push({path:new URL(resp.url()).pathname,status:resp.status()});});
  page.on('requestfailed',req=>{if(req.url().includes('via-traslados-maestro-api-qa'))network.push({path:new URL(req.url()).pathname,failed:req.failure()?.errorText});});
  const response=await page.goto(QA_WEB_URL,{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(response?.status(),200,'home QA '+width);
  const panel=page.locator('#via-maestro-qa-access');
  await panel.waitFor({state:'visible',timeout:20000});
  assert.match(await panel.innerText(),/ENTORNO DE PRUEBAS/);
  await page.locator('button[data-via-qa="A"]').click();
  try{
    await page.waitForFunction(()=>window.ViaStore?.customer()?.profile?.email==='pasajero.a@qa.invalid',null,{timeout:8000});
  }catch(err){
    const state=await page.evaluate(()=>({store:!!window.ViaStore,config:window.VIA_CONFIG?.apiUrl,
      customer:window.ViaStore?.customer()?.profile?.email||null,
      qaStatus:document.querySelector('#via-qa-active')?.textContent,
      selected:document.querySelector('button[data-via-qa="A"]')?.disabled}));
    console.error('MAESTRO_BROWSER_DIAG',JSON.stringify({width,state,network,errors}));
    throw err;
  }
  await page.locator('button[data-via-qa="B"]').click();
  await page.waitForFunction(()=>window.ViaStore?.customer()?.profile?.email==='pasajero.b@qa.invalid',null,{timeout:20000});
  const metrics=await page.evaluate(()=>({
    width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
    email:window.ViaStore.customer().profile.email,
    qa:window.VIA_CONFIG.apiUrl.includes('via-traslados-maestro-api-qa')
  }));
  assert(metrics.qa,'store QA apunta a producción');
  assert.equal(metrics.email,'pasajero.b@qa.invalid');
  assert(metrics.scrollWidth<=metrics.width+2,'Scroll horizontal '+JSON.stringify(metrics));
  await page.locator('button[data-via-qa="out"]').click();
  await page.waitForFunction(()=>window.ViaStore?.customer()===null,null,{timeout:20000});
  console.log('MAESTRO_BROWSER_QA_OK',JSON.stringify({width,horizontalScroll:false,loginAB:true,logout:true,pageErrors:errors}));
  await context.close();
 }
}finally{await browser.close()}
