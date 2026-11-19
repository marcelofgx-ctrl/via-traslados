import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const url='https://via-traslados-v291-rc1-stage.marcelof-gx.workers.dev/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,360,390,412]){
  const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const p=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(p.status(),200,'No responde portada de la vista pública');
  await page.locator('#start-booking').waitFor({state:'visible',timeout:15000});
  await page.locator('#via-home-account-invite').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#via-home-user-greeting').isVisible(),false,'Saludo visible sin autenticar');
  assert.equal(await page.locator('#via-maestro-qa-access').count(),0,'Controles internos de QA en la candidata');
  assert.equal(await page.locator('a.reference-reservations').count(),1);
  const cfg=await page.evaluate(()=>window.VIA_CONFIG);
  assert(cfg?.apiUrl?.includes('via-traslados-maestro-api-qa'),'Vista previa apunta a API productiva');
  await page.locator('#via-home-account-invite a').click();
  await page.locator('#mine-signup-card').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#mine-login-card').isVisible(),false,'Login duplicado durante registro');
  assert.equal((await page.locator('#mine-signup-card h2').textContent()).trim(),'Crear tu cuenta');
  await page.locator('#mine-existing').click();
  await page.locator('#mine-login-card').waitFor({state:'visible',timeout:10000});
  assert.equal(await page.locator('#mine-signup-card').isVisible(),false);
  const dims=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert(dims.scroll<=dims.client+2,'Scroll horizontal '+width+': '+JSON.stringify(dims));
  assert.equal(errors.length,0,'Errores Javascript: '+errors.join('; '));
  console.log('VIA_V291_LIVE_PUBLIC_BROWSER_OK '+JSON.stringify({width,home:200,signup:true,login:true,qaApi:true,noScroll:true}));
  await context.close();
 }
}finally{await browser.close();}
