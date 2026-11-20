import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const QA=process.env.IDENTITY_TEST_URL||
 'https://via-traslados-gps-precision-qa.marcelof-gx.workers.dev/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const tokenA='a'.repeat(64),tokenB='b'.repeat(64);
const fake={name:'Luciana Prueba',phone:'099000000',email:'persona-qa@example.invalid'};
const alternate={name:'Otra Persona',phone:'098000000',email:'otra-qa@example.invalid'};
let passed=0;

async function scenario({name,width=390,mode='valid',action='step',delay=0}){
 const context=await browser.newContext({viewport:{width,height:860},isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[],requests=[];
 let allow=true,meHits=0;
 page.on('pageerror',e=>errors.push(e.message));
 if(mode!=='guest'){
  await page.addInitScript(({token,profile})=>{
   localStorage.setItem('via-customer-session-v1',JSON.stringify({
    sessionToken:token,expiresAt:Math.floor(Date.now()/1000)+86400,profile,
    passkeys:0
   }));
  },{token:tokenA,profile:{name:'Nombre sin validar',phone:'000000000',email:'stored@example.invalid'}});
 }
 await page.route('**/api/customer/me',async route=>{
  meHits++;
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  const auth=route.request().headers()['authorization']||'';
  const ok=allow&&mode!=='invalid'&&mode!=='offline'&&auth==='Bearer '+tokenA;
  const response=ok?{profile:fake,passkeys:0,expiresAt:Math.floor(Date.now()/1000)+86400}:
   {error:mode==='offline'?'No se puede acceder a la red':'Sesión vencida'};
  await route.fulfill({status:ok?200:mode==='offline'?503:401,
   contentType:'application/json',body:JSON.stringify(response)});
 });
 await page.route('**/api/requests',route=>{
  requests.push(JSON.parse(route.request().postData()||'{}'));
  return route.fulfill({status:201,contentType:'application/json',
   body:JSON.stringify({id:'VIA-QA-NO-REAL',access_token:'qa',status:'requested'})});
 });
 const response=await page.goto(QA,{waitUntil:'domcontentloaded',timeout:35000});
 assert.equal(response.status(),200,'QA debe entregar HTTP 200');
 await page.waitForFunction(()=>Boolean(window.ViaStore?.customer));
 // Usar inputs reales; sin disparar una reserva ni calcular una ruta externa.
 await page.evaluate(()=>{
  for(const [id,value] of [
   ['origin','Rambla Costanera 1111, Canelones'],
   ['destination','Aeropuerto Internacional de Carrasco, Canelones'],
   ['time','13:00']]){
   const el=document.getElementById(id);if(el)el.value=value;
  }
  const wizard=document.getElementById('solicitar');
  const hero=document.getElementById('inicio');
  wizard.classList.remove('hidden');
  hero?.classList.add('hidden');
 });
 const proceed=page.locator('#to-contact');
 await proceed.click();
 const step=page.locator('.wizard-step[data-step="3"]');
 const step2=page.locator('.wizard-step[data-step="2"]');
 if(mode==='valid'){
  await step.waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('#wizard-progress-label').textContent(),'PASO 3 DE 3');
  assert.match(await page.locator('#booking-confirm').textContent(),/Hola, Luciana/);
  assert.match(await page.locator('#booking-confirm').textContent(),/099000000/);
  assert.match(await page.locator('#booking-confirm').textContent(),/persona-qa@example.invalid/);
  assert.equal(await page.locator('#name').inputValue(),fake.name);
  assert.equal(await page.locator('#phone').inputValue(),fake.phone);
  assert.equal(await page.locator('#email').inputValue(),fake.email);
  assert.equal(await page.locator('#verification-group').isVisible(),false);
  assert.equal(await page.locator('#turnstile-box').isVisible(),false);
  assert.equal(requests.length,0,'No hay reserva sin pulsar confirmar');
  if(action==='submit-expired'){
   allow=false;
   await page.locator('#booking-form').evaluate(el=>
    el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   await step2.waitFor({state:'visible',timeout:12000});
   assert.equal(requests.length,0,'No enviar POST si sesión caducó');
   assert.equal(await page.locator('#known-customer').isVisible(),false);
  }else if(action==='back'){
   await page.locator('#wizard-back').click();
   await page.locator('.wizard-step[data-step="1"]').waitFor({state:'visible',timeout:5000});
   assert.equal(await page.locator('#wizard-progress-label').textContent(),'PASO 1 DE 3');
  }else if(action==='logout-other-tab'){
   await page.evaluate(()=>{
    localStorage.setItem('via-customer-session-v1',JSON.stringify({
     sessionToken:'b'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+86400,
     profile:{name:'Perfil diferente',phone:'000',email:'unauthorized@example.invalid'}
    }));
    window.dispatchEvent(new StorageEvent('storage',{key:'via-customer-session-v1'}));
   });
   await step2.waitFor({state:'visible',timeout:5000});
   assert.equal(await page.locator('#known-customer').isVisible(),false);
   assert.equal(requests.length,0);
  }
 }else{
  await step2.waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('#known-customer').isVisible(),false);
  assert.equal(await page.locator('#wizard-progress-label').textContent(),'PASO 2 DE 3');
  assert.equal(await page.locator('#booking-confirm').isVisible(),false);
  assert.equal(requests.length,0);
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=
  document.documentElement.clientWidth+2),true,'Sin desbordamiento horizontal en '+width);
 assert.deepEqual(errors,[],'Excepciones JS: '+JSON.stringify(errors));
 console.log('VIA_IDENTITY_V2914_BROWSER_PASS '+JSON.stringify({name,width,mode,action,meHits}));
 passed++;
 await context.close();
}
try{
 for(const width of [320,360,390,412])
  await scenario({name:'valid-'+width,width,mode:'valid'});
 await scenario({name:'guest',mode:'guest'});
 await scenario({name:'expired',mode:'invalid'});
 await scenario({name:'server-unavailable',mode:'offline'});
 await scenario({name:'expired-during-confirmation',mode:'valid',action:'submit-expired'});
 await scenario({name:'back-skips-unnecessary-identity',mode:'valid',action:'back'});
 await scenario({name:'other-tab-account-change',mode:'valid',action:'logout-other-tab'});
 console.log('VIA_IDENTITY_V2914_CHROME_ALL_PASSED '+passed);
}finally{await browser.close()}
