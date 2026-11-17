const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.VIA_QA_URL||'https://via-traslados-web-auth-v27-qa.marcelof-gx.workers.dev';
 const api='https://via-traslados-api.marcelof-gx.workers.dev';
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const profile={name:'Persona QA',phone:'099000000',email:'qa@example.invalid'};
 const mockBooking={id:'VIA-QA-TEST',origin:'Calle Ficticia 100, Montevideo',destination:'Aeropuerto de Carrasco',trip_date:'2026-11-21',trip_time:'10:00',passengers:1,bags:1,status:'requested',created_at:'2026-11-16T10:00:00Z'};
 async function tab(passkeyCount,onNext){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  if(passkeyCount!==null)await context.addInitScript(arg=>{
   localStorage.setItem('via-customer-session-v1',JSON.stringify({
    sessionToken:'a'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+3600,
    profile:arg.profile,passkeys:0
   }));
  },{profile});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/passkeys.js*',async route=>{
   const original=await route.fetch();
   const body=(await original.text())+"\nwindow.ViaPasskeys.available=()=>true;window.__createdPasskey=false;window.ViaPasskeys.enable=async()=>{window.__createdPasskey=true;return {registered:true}};";
   await route.fulfill({response:original,body});
  });
  let meCalls=0;
  await page.route(api+'/**',async route=>{
   const request=route.request();
   const url=new URL(request.url());
   const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'content-type, authorization, x-booking-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   let out;
   if(url.pathname==='/api/customer/me'){
    meCalls++;
    out={profile,passkeys:meCalls>1&&onNext?1:passkeyCount,expiresAt:Math.floor(Date.now()/1000)+3600};
   }else if(url.pathname.startsWith('/api/requests/'))out=mockBooking;
   else if(url.pathname==='/api/customer/phone/identify')out={registered:true,hasPin:true,hasPasskey:false,maskedEmail:'qa***@example.invalid',grant:'test-grant'};
   else out={ok:true};
   return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(out)});
  });
  return {context,page,errors};
 }
 try{
  // Ya existe clave en servidor, pero el navegador conserva passkeys:0.
  {
   const {context,page,errors}=await tab(1,false);
   await page.goto(base+'/reserva.html?id=VIA-QA-TEST',{waitUntil:'domcontentloaded'});
   await page.locator('#passkey-setup h3').waitFor();
   await page.waitForFunction(()=>document.querySelector('#passkey-setup h3')?.textContent?.includes('ya está activo'),null,{timeout:14000});
   assert.equal(await page.locator('#enable-passkey').isVisible(),false);
   assert.equal(await page.evaluate(()=>window.__createdPasskey),false);
   assert.deepEqual(errors,[]);
   console.log('PASSKEY_ALREADY_REGISTERED_QA_OK');
   await context.close();
  }
  // Si se registró desde otro dispositivo entre la consulta y el clic,
  // nunca se invoca navigator.credentials.create.
  {
   const {context,page,errors}=await tab(0,true);
   await page.goto(base+'/reserva.html?id=VIA-QA-TEST',{waitUntil:'domcontentloaded'});
   await page.locator('#enable-passkey').waitFor({state:'visible'});
   await page.locator('#enable-passkey').click();
   await page.waitForFunction(()=>document.querySelector('#passkey-status')?.textContent?.includes('Ya existe'),null,{timeout:14000});
   assert.equal(await page.evaluate(()=>window.__createdPasskey),false);
   assert.deepEqual(errors,[]);
   console.log('PASSKEY_RACE_GUARD_QA_OK');
   await context.close();
  }
  // La verificación rechazada deja aviso; tras identificación correcta debe desaparecer.
  {
   const {context,page,errors}=await tab(null,false);
   await page.addInitScript(()=>{
    window.turnstile={
     render:(selector,callbacks)=>{window.__turnstileSuccess=callbacks.callback;return 12},
     reset:()=>{}
    };
   });
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#start-booking').click();
   await page.locator('#origin').fill('Calle Ficticia 100, Montevideo');
   await page.locator('#destination').fill('Aeropuerto de Carrasco');
   await page.locator('#date').fill('2026-11-21');
   await page.locator('#to-contact').click();
   await page.locator('#account-phone').fill('099000000');
   await page.locator('#phone-lookup').click();
   assert.match(await page.locator('#form-result').textContent(),/verificación de seguridad/);
   await page.evaluate(()=>window.__turnstileSuccess('test-turnstile-token'));
   await page.locator('#phone-lookup').click();
   await page.locator('#return-form').waitFor({state:'visible'});
   assert.equal(await page.locator('#form-result').isVisible(),false);
   assert.deepEqual(errors,[]);
   console.log('TURNSTILE_STALE_BANNER_QA_OK');
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error('AUTH_V27_QA_FAILED',e.stack||String(e));process.exit(1)});
