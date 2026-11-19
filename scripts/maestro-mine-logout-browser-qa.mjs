import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const BASE='https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
function ok(a,m){assert(a,m)}
async function choose(page,which){
 await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#via-qa-toggle').click();
 await page.locator('button[data-via-qa="'+which+'"]').click();
 await page.waitForFunction(email=>window.ViaStore?.customer()?.profile?.email===email,
  which==='A'?'pasajero.a@qa.invalid':'pasajero.b@qa.invalid',{timeout:18000});
}
async function mine(page){
 const response=await page.goto(BASE+'/mis-reservas.html',{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response.status(),200);
 await page.waitForFunction(()=>window.ViaStore&&document.getElementById('mine-welcome'),null,{timeout:10000});
}
try{
 for(const width of [320,360,390,412]){
  const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await mine(page);
  await page.waitForFunction(()=>document.getElementById('mine-identity-choice')&&!document.getElementById('mine-identity-choice').classList.contains('hidden'),null,{timeout:12000});
  ok(!(await page.locator('#mine-welcome').isVisible()),'Tarjeta del usuario anterior visible sin sesión '+width);
  ok(await page.locator('#mine-entry-hero').isVisible(),'No aparece bienvenida inicial '+width);
  ok(!(await page.locator('#mine-login-card').isVisible()),'No debe verse login hasta elegir Ingresar '+width);
  ok(!(await page.locator('#mine-signup-card').isVisible()),'No debe verse registro hasta elegir Soy nuevo '+width);
  ok(!(await page.locator('#mine-list').isVisible()),'Listado de reservas visible sin sesión '+width);
  ok(await page.locator('#mine-existing').isVisible(),'Falta acceso usuario existente '+width);
  ok(await page.locator('#mine-new').isVisible(),'Falta registro usuario nuevo '+width);
  await choose(page,'A');
  await mine(page);
  await page.waitForFunction(()=>!document.getElementById('mine-welcome').classList.contains('hidden'),null,{timeout:15000});
  ok(await page.locator('#mine-welcome').isVisible(),'Bienvenida A no visible '+width);
  await page.waitForFunction(()=>document.getElementById('mine-greeting')?.textContent==='Hola, Ana',null,{timeout:12000});
  ok(!(await page.locator('#mine-login-card').isVisible()),'Formulario de login duplicado con cuenta A '+width);
  ok(!(await page.locator('#mine-identity-choice').isVisible()),'Opciones duplicadas con A '+width);
  // El formulario debe estar oculto durante la sesión A: simular un valor
  // conservado por el navegador sin forzar que el campo oculto sea visible.
  await page.locator('#mine-login-phone').evaluate(node=>{node.value='099123456'});
  await page.locator('#mine-logout').click();
  await page.waitForFunction(()=>!window.ViaStore.customer()&&document.getElementById('mine-welcome').classList.contains('hidden'),null,{timeout:15000});
  ok(!(await page.locator('#mine-welcome').isVisible()),'No se ocultó nombre A al salir '+width);
  ok(!(await page.locator('#mine-login-card').isVisible()),'Tras salir no debe abrirse un formulario automáticamente '+width);
  ok(await page.locator('#mine-entry-hero').isVisible(),'Tras salir no reaparece la bienvenida '+width);
  ok(await page.locator('#mine-new').isVisible(),'No se habilitó inscripción nueva '+width);
  assert.equal(await page.locator('#mine-login-phone').inputValue(),'','El teléfono anterior permanece cargado');
  assert.equal((await page.locator('#mine-greeting').textContent()).trim(),'','Persistió nombre anterior');
  const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  ok(dimensions.scroll<=dimensions.width+2,'Scroll horizontal '+width+' '+JSON.stringify(dimensions));
  await choose(page,'B');
  await mine(page);
  await page.waitForFunction(()=>window.ViaStore.customer()?.profile?.email==='pasajero.b@qa.invalid',null,{timeout:12000});
  assert.equal((await page.evaluate(()=>window.ViaStore.customer().profile.email)),'pasajero.b@qa.invalid');
  await page.waitForFunction(()=>document.getElementById('mine-greeting')?.textContent==='Hola, Bruno',null,{timeout:12000});
  ok(!(await page.locator('#mine-login-card').isVisible()),'B con login expuesto '+width);
  ok(!(await page.locator('#mine-entry-hero').isVisible()),'Bienvenida sin sesión aparece durante B '+width);
  await page.locator('#mine-logout').click();
  await page.waitForFunction(()=>window.ViaStore.customer()===null,null,{timeout:14000});
  await page.locator('#mine-existing').click();
  ok(await page.locator('#mine-login-card').isVisible(),'Ingresar no muestra su formulario '+width);
  ok(!(await page.locator('#mine-signup-card').isVisible()),'Registrar visible con login '+width);
  await page.locator('#mine-new').click();
  ok(await page.locator('#mine-signup-card').isVisible(),'No aparece registro independiente '+width);
  ok(!(await page.locator('#mine-login-card').isVisible()),'Login visible durante registro nuevo '+width);
  await page.locator('#mine-existing').click();
  ok(await page.locator('#mine-login-card').isVisible(),'No vuelve a cuenta existente '+width);
  ok(!(await page.locator('#mine-signup-card').isVisible()),'Registro nuevo no se oculta '+width);
  ok(errors.length===0,'Errores de navegador '+width+': '+errors.join('; '));
  console.log('MINE_LOGOUT_MOBILE_QA_OK',JSON.stringify({width,logout:true,userA:true,userB:true,newUserOption:true,overflow:false}));
  await context.close();
 }
 // Registro autónomo: crear cuenta con OTP sintético en QA, sin hacer reservas.
 {
  const context=await browser.newContext({viewport:{width:390,height:790},isMobile:true,hasTouch:true});
  const page=await context.newPage();await mine(page);
  await page.locator('#mine-new').click();
  await page.locator('#mine-signup-name').fill('Registro sintético QA');
  await page.locator('#mine-signup-phone').fill('099876543');
  await page.locator('#mine-signup-email').fill('signup.test.qa@qa.invalid');
  await page.locator('#mine-signup-send').click();
  await page.waitForFunction(()=>document.querySelector('#mine-signup-verify')&&!document.querySelector('#mine-signup-verify').classList.contains('hidden'),null,{timeout:15000});
  assert.match(await page.locator('#mine-signup-feedback').textContent(),/123456/,'Falta aviso de OTP ficticio');
  await page.locator('#mine-signup-code').fill('123456');
  await page.locator('#mine-signup-confirm').click();
  await page.waitForFunction(()=>window.ViaStore?.customer()?.profile?.email==='signup.test.qa@qa.invalid',null,{timeout:20000});
  ok(await page.locator('#mine-welcome').isVisible(),'El alta nueva no inició sesión');
  ok(!(await page.locator('#mine-signup-card').isVisible()),'El registro sigue visible con sesión creada');
  await page.locator('#mine-logout').click();
  await page.waitForFunction(()=>window.ViaStore.customer()===null,null,{timeout:15000});
  console.log('MINE_SIGNUP_STANDALONE_QA_OK: cuenta nueva sin crear traslado, OTP sintético y logout');
  await context.close();
 }
 // Respuesta de A demorada después de salir: nunca devolver datos de A.
 const context=await browser.newContext({viewport:{width:390,height:790},isMobile:true,hasTouch:true});
 const page=await context.newPage();
 await choose(page,'A');await mine(page);
 let arrived,release;
 const intercepted=new Promise(resolve=>arrived=resolve);
 await page.route('**/api/customer/bookings',async route=>{
  await new Promise(resolve=>{release=resolve;arrived()});
  await route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':BASE},
   body:JSON.stringify([{id:'VIA-STALE-FAKE',status:'requested',email:'pasajero.a@qa.invalid'}])});
 });
 const stale=page.evaluate(()=>window.ViaStore.mine());
 await intercepted;
 await page.locator('#mine-logout').click();
 await page.waitForFunction(()=>window.ViaStore.customer()===null,null,{timeout:12000});
 release();
 const rows=await stale;
 assert.equal(rows.length,0,'Una respuesta de la cuenta A siguió visible después de Salir');
 assert.equal((await page.locator('#mine-greeting').textContent()).trim(),'');
 console.log('MINE_LOGOUT_RACE_QA_OK: resultado tardío A descartado');
 await context.close();
}finally{await browser.close()}
