const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,hasTouch:true});
  const page=await ctx.newPage();
  const errors=[],failedRequests=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('requestfailed',req=>failedRequests.push({url:new URL(req.url()).pathname,error:req.failure()?.errorText}));
  const resp=await page.goto('https://viatraslados.com/',{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForTimeout(2200);
  const data=await page.evaluate(async()=>{
   const api=window.VIA_CONFIG?.apiUrl||null;
   const stat={api,configLoaded:!!window.VIA_CONFIG,
    swControlled:!!navigator.serviceWorker?.controller,
    width:document.documentElement.scrollWidth,screen:window.innerWidth};
   if(!api)return {...stat,reason:'API config missing'};
   for(const [name,path,body] of [
    ['safe-auth','/api/auth/start',{email:'invalid'}],
    ['known-route','/api/public/route-preview',{origin:'Montevideo Shopping, Montevideo, Uruguay',destination:'Aeropuerto Internacional de Carrasco, Canelones, Uruguay'}]
   ]){
    try{
     const r=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
     const j=await r.json();
     stat[name]={status:r.status,distanceKm:j.distanceKm||null,error:String(j.error||'').slice(0,100)};
    }catch(e){stat[name]={error:String(e).slice(0,150)}}
   }
   return stat;
  });
  console.log('INCIDENT_BROWSER_SMOKE '+JSON.stringify({pageStatus:resp.status(),...data,errors,failedRequests}));
  assert(resp.status()===200,'Página de producción no carga');
  assert(data.configLoaded,'Falta configuración pública de la API');
  assert(data['safe-auth']?.status===400,'OTP del navegador falla por CORS o conexión');
  assert(data['known-route']?.status===200,'Distancia del navegador falla por CORS o conexión');
  assert(data.width<=data.screen+1,'Desbordamiento horizontal en móvil');
  console.log('INCIDENT_BROWSER_FROM_REAL_ORIGIN_OK');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
