// DIAGNOSTIC ONLY: real public V30 in headless mobile Chromium; NEVER POST bookings.
import { chromium } from 'playwright';
const base='https://viatraslados.com';
const api='https://via-traslados-api.marcelof-gx.workers.dev';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[],responses=[],requests=[],blocked=[];
const ctx=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},
  deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block',locale:'es-UY',
  userAgent:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'});
const page=await ctx.newPage();
page.on('pageerror',err=>errors.push(String(err.message).slice(0,250)));
await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  const m=req.method();
  if(m!=='GET'&&m!=='HEAD'&&!(m==='POST'&&url.pathname==='/api/public/route-preview')){
    blocked.push({path:url.pathname,method:m});return route.abort();
  }
  if(url.pathname==='/api/public/route-preview'){
    const body=JSON.parse(req.postData()||'{}');
    requests.push({method:m,path:url.pathname,origin:body.origin,destination:body.destination,
      originCoordinates:!!body.originLocation,destinationCoordinates:!!body.destinationLocation});
  }
  return route.continue();
});
page.on('response',async res=>{
  const url=new URL(res.url());
  if(url.pathname==='/api/public/route-preview'){
    let json;try{json=await res.json()}catch{}
    responses.push({status:res.status(),km:json?.distanceKm??null,min:json?.durationMinutes??null,
      error:json?.error||null,source:json?.source||null,reason:json?.reason||null});
  }
});
try{
  const nav=await page.goto(base+'/index.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>typeof window.ViaAddress?.set==='function'&&window.ViaStore,{timeout:14000});
  const before=await page.evaluate(()=>({
    demo:window.VIA_CONFIG?.demo,
    apiUrl:window.VIA_CONFIG?.apiUrl,
    routeLabel:document.querySelector('#via-route-distance')?.textContent,
    heading:document.querySelector('title')?.textContent,
    button:!!document.querySelector('#start-booking')
  }));
  await page.evaluate(()=>{
    window.ViaAddress.set('home-origin',{label:'Centro de Montevideo',lat:-34.905,lng:-56.185,source:'map',postalStatus:'unknown'});
    window.ViaAddress.set('home-destination',{label:'Aeropuerto Internacional de Carrasco',lat:-34.83696,lng:-56.01638,source:'map',postalStatus:'unknown'});
  });
  const selected=await page.evaluate(()=>({
    origin:document.getElementById('home-origin')?.value,
    destination:document.getElementById('home-destination')?.value,
    storedOrigin:window.ViaAddress.get('home-origin'),
    storedDestination:window.ViaAddress.get('home-destination')
  }));
  const button=page.locator('#start-booking');
  if(await button.count())await button.click({timeout:15000});
  await page.waitForTimeout(5000);
  const view=await page.evaluate(()=>({
    routeLabel:document.querySelector('#via-route-distance')?.textContent,
    routeEta:document.querySelector('#via-route-eta')?.textContent,
    page:document.location.pathname,
    fields:{origin:document.getElementById('origin')?.value,destination:document.getElementById('destination')?.value}
  }));
  console.log('VIA_PROD_BROWSER_ROUTE_DIAGNOSTIC '+JSON.stringify({status:nav.status(),before,
    selected:{origin:selected.origin,destination:selected.destination,
       hasOrigin:!!selected.storedOrigin?.lat,hasDestination:!!selected.storedDestination?.lat},
    requests,responses,view,errors,blocked,at:new Date().toISOString()}));
}catch(e){
  console.log('VIA_PROD_BROWSER_ROUTE_FAILURE '+JSON.stringify({type:e.name,message:String(e.message).slice(0,250),requests,responses,errors,blocked}));
  process.exitCode=1;
}finally{await browser.close()}
