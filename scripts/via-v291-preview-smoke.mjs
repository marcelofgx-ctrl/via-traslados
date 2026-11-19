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
  const beforeStable=await page.evaluate(()=>{
    const login=document.querySelector('#mine-login-card'),signup=document.querySelector('#mine-signup-card');
    return {loginClass:login?.className,signupClass:signup?.className,
      loginDisplay:getComputedStyle(login).display,signupDisplay:getComputedStyle(signup).display};
  });
  if(beforeStable.loginDisplay!=='none')console.log('VIA_V291_TRANSITION_DIAG',JSON.stringify({width,...beforeStable}));
  await page.waitForFunction(()=>{
    const login=document.querySelector('#mine-login-card'),signup=document.querySelector('#mine-signup-card');
    return login&&signup&&getComputedStyle(login).display==='none'&&getComputedStyle(signup).display!=='none';
  },null,{timeout:12000});
  assert.equal(await page.locator('#mine-login-card').isVisible(),false,'Login duplicado después de finalizar transición');
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
 // Reproducir el fallo reportado: nunca enviar código REAL desde la vista previa.
 const ctx=await browser.newContext({viewport:{width:390,height:800},isMobile:true,hasTouch:true});
 const pg=await ctx.newPage();
 const failures=[];
 pg.on('pageerror',e=>failures.push(e.message));
 let apiCalls=0;
 pg.on('request',request=>{if(request.url().includes('/api/auth/start'))apiCalls++});
 await pg.goto(url+'mis-reservas.html?accion=registro',{waitUntil:'domcontentloaded'});
 await pg.locator('#mine-signup-card').waitFor({state:'visible',timeout:15000});
 assert.match(await pg.locator('#mine-signup-card').innerText(),/no se envían correos/i);
 assert.equal(await pg.locator('#mine-signup-send').textContent(),'Generar código de prueba');
 await pg.locator('#mine-signup-name').fill('Persona Prueba V291');
 await pg.locator('#mine-signup-phone').fill('099875431');
 await pg.locator('#mine-signup-email').fill('no-es-un-destinatario@example.com');
 await pg.locator('#mine-signup-send').click();
 assert.match(await pg.locator('#mine-signup-feedback').textContent(),/no envía correos/i);
 assert.equal(apiCalls,0,'Correo normal generó solicitud desde preview');
 await pg.locator('#mine-signup-email').fill('persona.preview.v291@qa.invalid');
 await pg.locator('#mine-signup-send').click();
 await pg.waitForFunction(()=>document.querySelector('#mine-signup-feedback')?.textContent?.includes('123456'),null,{timeout:15000});
 assert.equal(await pg.locator('#mine-signup-verify').isVisible(),true,'No mostró confirmación del OTP sintético');
 assert.equal(apiCalls,1,'El OTP sintético no llegó a la API QA');
 await pg.locator('#mine-signup-code').fill('123456');
 await pg.locator('#mine-signup-confirm').click();
 await pg.waitForFunction(()=>window.ViaStore?.customer()?.profile?.email==='persona.preview.v291@qa.invalid',null,{timeout:20000});
 assert.equal(failures.length,0,failures.join('; '));
 console.log('VIA_V291_PREVIEW_SYNTHETIC_REGISTRATION_OK no_real_email=true otp=synthetic account_isolated=true');
 await ctx.close();
}finally{await browser.close();}
