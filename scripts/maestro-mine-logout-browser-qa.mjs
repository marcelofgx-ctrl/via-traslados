import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const BASE='https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
function ok(a,m){assert(a,m)}
async function choose(page,which){
 await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000});
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
  ok(await page.locator('#mine-login-card').isVisible(),'No hay acceso de cuenta existente '+width);
  ok(await page.locator('#mine-existing').isVisible(),'Falta acceso usuario existente '+width);
  ok(await page.locator('#mine-new').isVisible(),'Falta registro usuario nuevo '+width);
  await choose(page,'A');
  await mine(page);
  await page.waitForFunction(()=>!document.getElementById('mine-welcome').classList.contains('hidden'),null,{timeout:15000});
  ok(await page.locator('#mine-welcome').isVisible(),'Bienvenida A no visible '+width);
  ok(!(await page.locator('#mine-login-card').isVisible()),'Formulario de login duplicado con cuenta A '+width);
  ok(!(await page.locator('#mine-identity-choice').isVisible()),'Opciones duplicadas con A '+width);
  // El formulario debe estar oculto durante la sesión A: simular un valor
  // conservado por el navegador sin forzar que el campo oculto sea visible.
  await page.locator('#mine-login-phone').evaluate(node=>{node.value='099123456'});
  await page.locator('#mine-logout').click();
  await page.waitForFunction(()=>!window.ViaStore.customer()&&document.getElementById('mine-welcome').classList.contains('hidden'),null,{timeout:15000});
  ok(!(await page.locator('#mine-welcome').isVisible()),'No se ocultó nombre A al salir '+width);
  ok(await page.locator('#mine-login-card').isVisible(),'No se habilitó ingreso existente '+width);
  ok(await page.locator('#mine-new').isVisible(),'No se habilitó inscripción nueva '+width);
  assert.equal(await page.locator('#mine-login-phone').inputValue(),'','El teléfono anterior permanece cargado');
  assert.equal((await page.locator('#mine-greeting').textContent()).trim(),'','Persistió nombre anterior');
  const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  ok(dimensions.scroll<=dimensions.width+2,'Scroll horizontal '+width+' '+JSON.stringify(dimensions));
  await choose(page,'B');
  await mine(page);
  await page.waitForFunction(()=>window.ViaStore.customer()?.profile?.email==='pasajero.b@qa.invalid',null,{timeout:12000});
  assert.equal((await page.evaluate(()=>window.ViaStore.customer().profile.email)),'pasajero.b@qa.invalid');
  ok(!(await page.locator('#mine-login-card').isVisible()),'B con login expuesto '+width);
  await page.locator('#mine-logout').click();
  await page.waitForFunction(()=>window.ViaStore.customer()===null,null,{timeout:14000});
  await page.locator('#mine-new').click();
  await page.waitForURL(/\/index\.html/,{timeout:15000});
  ok(errors.length===0,'Errores de navegador '+width+': '+errors.join('; '));
  console.log('MINE_LOGOUT_MOBILE_QA_OK',JSON.stringify({width,logout:true,userA:true,userB:true,newUserOption:true,overflow:false}));
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
