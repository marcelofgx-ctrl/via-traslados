// Pruebas SOLO LECTURA sobre viatraslados.com V29.1 después del deploy.
// No se envía OTP ni se crea solicitud/reserva.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
const url='https://viatraslados.com/';
const digest=x=>createHash('sha256').update(x).digest('hex');
async function fetchAsset(path){
 const r=await fetch(url+path,{signal:AbortSignal.timeout(40000)});
 assert.equal(r.status,200,'Asset HTTP '+r.status+' '+path);
 return Buffer.from(await r.arrayBuffer());
}
assert.equal(digest(await fetchAsset('geo-v2/core.mjs?v=3')),'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1');
assert.equal(digest(await fetchAsset('descargas/via-traslados-conductor-v35.apk')),'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3');
const api=await fetch('https://via-traslados-api.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(20000)});
assert.equal(api.status,200);
const health=await api.json();
assert.equal(health.ok,true);
assert.equal(health.otpAvailable,true);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,360,390,412]){
  const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(response.status(),200,'Portada prod 404');
  await page.locator('#start-booking').waitFor({state:'visible',timeout:14000});
  await page.locator('#via-home-account-invite').waitFor({state:'visible',timeout:14000});
  assert.equal(await page.locator('#via-home-user-greeting').isVisible(),false);
  const config=await page.evaluate(()=>window.VIA_CONFIG);
  assert(config?.apiUrl?.includes('via-traslados-api.marcelof-gx.workers.dev'),'Se filtró API QA en producción');
  assert(config?.turnstileSiteKey?.length>12,'No hay Turnstile de producción');
  assert.equal(await page.locator('#via-maestro-qa-access').count(),0);
  await page.locator('#via-home-account-invite a').click();
  await page.locator('#mine-signup-card').waitFor({state:'visible',timeout:16000});
  assert.equal(await page.locator('#mine-login-card').isVisible(),false);
  assert.equal((await page.locator('#mine-signup-send').textContent()).trim(),'Enviar código al correo','Sigue en OTP sintético');
  assert.equal(await page.locator('#mine-signup-card').innerText().then(x=>x.includes('no se envían correos')),false);
  await page.locator('#mine-existing').click();
  await page.locator('#mine-login-card').waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('#mine-signup-card').isVisible(),false);
  const size=await page.evaluate(()=>({screen:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert(size.scroll<=size.screen+2,'Desborde horizontal '+width);
  assert.equal(errors.length,0,'JS errors '+JSON.stringify(errors));
  console.log('VIA_V291_REAL_PRODUCTION_BROWSER_OK '+JSON.stringify({width,web:200,apiV35:true,otpConfigured:true,turnstileConfigured:true,noHorizontalScroll:true,noQA:true}));
  await context.close();
 }
 console.log('VIA_V291_PRODUCTION_READONLY_SMOKE_OK');
}finally{await browser.close();}
