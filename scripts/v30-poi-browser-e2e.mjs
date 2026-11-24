// V30 POI — prueba de navegador real con parche de autocompletado NO PUBLICADO.
// Solo GET de assets públicos; TODA llamada a /api/* se intercepta y responde con mocks.
// Jamás crea reservas ni lee/cambia D1 de producción.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
const PROD='https://viatraslados.com';
const patch=await readFile('v30-poi-browser-proof/address-autocomplete-qa.js','utf8');
const OUT='v30-poi-browser-proof';
console.log('VIA_POI_DISPLAY_CODE '+patch.slice(patch.indexOf('function display('),patch.indexOf('function display(')+4200).replace(/\s+/g,' ').slice(0,4200));
await mkdir(OUT,{recursive:true});
const poi={
  label:'Radisson Victoria Plaza Hotel, Montevideo, Montevideo',
  street:'Radisson Victoria Plaza Hotel',city:'Montevideo',department:'Montevideo',
  lat:-34.905,lng:-56.198,accuracy:'poi',kind:'place',source:'Geoapify Places',
  detail:'Confirmar entrada de recogida',placeId:'mock-qa-radisson'
};
const ua={
 android:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
 ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
};
let passed=0;
for(const [os,w,h] of [['android',390,844],['ios',375,667]]){
 const browser=await (os==='ios'?webkit:chromium).launch(os==='ios'?
  {headless:true}:{headless:true,channel:'chrome',args:['--no-sandbox']});
 const ctx=await browser.newContext({
  viewport:{width:w,height:h},screen:{width:w,height:h},
  isMobile:true,deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block',
  userAgent:ua[os],locale:'es-UY'
 });
 const page=await ctx.newPage();
 const seen={places:[],suggest:[],routes:[],deniedWrites:0};
 const jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===PROD&&url.pathname==='/address-autocomplete.js'){
   return route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:patch});
  }
  if(url.pathname==='/api/direcciones'){
   if(req.method()!=='GET'){seen.deniedWrites++;return route.fulfill({status:403,json:{error:'QA escritura bloqueada'}})}
   const q=url.searchParams.get('q')||'',mode=url.searchParams.get('mode')||'suggest';
   if(mode==='places'){
    seen.places.push(q);
    return route.fulfill({status:200,json:{mode:'places',provider:'QA Geoapify mock',results:
       /radisson/i.test(q)?[poi]:/hertz/i.test(q)?[{...poi,label:'Hertz Alquiler de Autos, Carrasco',street:'Hertz Alquiler de Autos',lat:-34.832,lng:-56.035,placeId:'mock-qa-hertz'}]:[]}});
   }
   if(mode==='suggest'){
    seen.suggest.push(q);
    const rows=/av(?:enida)?\.?\s*italia\s*1000/i.test(q)?
      [{label:'Avenida Italia 1000, Montevideo, Montevideo',
        street:'Avenida Italia 1000',city:'Montevideo',department:'Montevideo',
        lat:-34.868,lng:-56.149,kind:'address',accuracy:'portal',source:'IDE Uruguay'}]:[];
    return route.fulfill({status:200,json:{results:rows,mode:'suggest',provider:'IDE Uruguay QA mock'}});
   }
   return route.fulfill({status:200,json:{results:[]}});
  }
  if(url.pathname==='/api/public/route-preview'){
   seen.routes.push(JSON.parse(req.postData()||'{}'));
   return route.fulfill({status:200,json:{distanceKm:21.4,durationMinutes:30,source:'QA ruta simulada'}});
  }
  if(url.pathname.startsWith('/api/')||url.hostname.includes('via-traslados-api')){
   if(req.method()!=='GET')seen.deniedWrites++;
   return route.fulfill({status:503,json:{error:'Aislamiento QA: API real deshabilitada'}});
  }
  if(url.origin===PROD&&req.method()==='GET')return route.continue();
  if(req.method()!=='GET')seen.deniedWrites++;
  return route.abort();
 });
 try{
  await page.goto(PROD+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.ViaAddress?.set==='function');
  const patched=await page.evaluate(()=>window.ViaAddress.get('home-destination')!==null);
  assert(patched,'No existe la interfaz de autocompletado esperada');
  await page.evaluate(()=>{
   window.ViaAddress.set('home-origin',{
    label:'Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones',
    lat:-34.83696,lng:-56.01638,source:'Catálogo verificado',accuracy:'poi',kind:'place'});
  });
  const field=page.locator('#home-destination');
  await field.fill('Radisson');
  await page.waitForFunction(()=>document.querySelector('#address-suggestions button')?.textContent?.includes('Radisson'),
    undefined,{timeout:15000});
  assert(seen.places.some(q=>q==='Radisson'),os+' no solicitó modo places para nombre propio');
  const selection=page.locator('#address-suggestions button').filter({hasText:'Radisson'}).first();
  await selection.click();
  const selected=await page.evaluate(()=>window.ViaAddress.get('home-destination'));
  console.log('VIA_V30_POI_SELECTED_DEBUG '+JSON.stringify({os,selected}));
  assert.equal(selected.lat,poi.lat,'Latitude perdida al elegir comercio');
  assert.equal(selected.lng,poi.lng,'Longitude perdida al elegir comercio');
  assert.equal(selected.source,poi.source,'Fuente perdida');
  assert.equal(selected.accuracy,'poi','El origen del punto no es POI');
  await page.locator('#start-booking').click();
  await page.waitForFunction(()=>document.querySelector('#via-route-distance')?.textContent?.includes('21,4'),
     undefined,{timeout:16000});
  assert(seen.routes.some(p=>p.destinationLocation?.lat===poi.lat&&p.destinationLocation?.lng===poi.lng),
    os+' la cotización vial no recibió las coordenadas elegidas');
  await page.screenshot({path:OUT+'/'+os+'-poi-route-v30.png',fullPage:false});
  // Prueba independiente de calle/portal: debe consultar suggest, NO places.
  const checkPage=await ctx.newPage();
  const extraPlaces=seen.places.length;
  await checkPage.goto(PROD+'/index.html',{waitUntil:'domcontentloaded'});
  await checkPage.waitForFunction(()=>typeof window.ViaAddress?.set==='function');
  await checkPage.locator('#home-destination').fill('Av Italia 1000');
  await checkPage.waitForFunction(()=>document.querySelector('#address-suggestions button')?.textContent?.includes('Avenida Italia 1000'),
    undefined,{timeout:15000});
  assert.equal(seen.places.length,extraPlaces,os+' consultó Places para calle y número');
  await checkPage.locator('#address-suggestions button').first().click();
  const street=await checkPage.evaluate(()=>window.ViaAddress.get('home-destination'));
  assert.equal(street.accuracy,'portal','Se degradó la precisión del portal IDE');
  assert.deepEqual(jsErrors,[],os+' JS exceptions '+jsErrors.join(' / '));
  console.log('VIA_V30_POI_BROWSER_E2E_PASS '+JSON.stringify({
   os,placesRequests:seen.places.length,selectedPoi:true,coordsToRoute:true,streetPortal:true,
   noProductionWrites:true,api: '100% interceptada',frontend:'V30 real con parche QA'}));
  await checkPage.close();
  passed++;
 }finally{await ctx.close();await browser.close()}
}
assert.equal(passed,2);
console.log('VIA_V30_POI_BROWSER_ALL_PASS '+passed);
