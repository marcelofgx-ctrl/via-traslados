import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='https://viatraslados.com',api='https://via-traslados-api.marcelof-gx.workers.dev';

const cors=await fetch(api+'/api/public/route-preview',{method:'OPTIONS',headers:{Origin:base,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
console.log('VIA_V302_OLD_ORIGIN '+JSON.stringify({status:cors.status,allowOrigin:cors.headers.get('access-control-allow-origin')}));
const places=await fetch(base+'/api/direcciones?mode=places&q='+encodeURIComponent('Plaza Italia Shopping'));const data=await places.json();
const dest=data.results?.find(x=>x.source==='Geoapify Places'&&Number.isFinite(x.lat)&&Number.isFinite(x.lng));
assert(dest,'Plaza Italia missing');
const origin={label:'Aeropuerto Internacional de Carrasco',lat:-34.83696,lng:-56.01638,source:'map',postalStatus:'unknown'};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'es-UY',serviceWorkers:'block'});
await ctx.route('**/*',route=>{const r=route.request(),p=new URL(r.url()).pathname;if(['GET','HEAD','OPTIONS'].includes(r.method())||(r.method()==='POST'&&p==='/api/public/route-preview'))return route.continue();return route.abort();});
const page=await ctx.newPage(),requests=[],responses=[];
page.on('request',r=>{if(new URL(r.url()).pathname==='/api/public/route-preview'&&r.method()==='POST')requests.push(r)});
page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/public/route-preview'){const j=await r.json().catch(()=>({}));responses.push({status:r.status(),km:j.distanceKm,error:j.error,cached:j.cached});}});
try{
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);
 const select=async()=>{await page.evaluate(({a,b})=>{ViaAddress.set('home-origin',a);ViaAddress.set('home-destination',b)},{a:origin,b:dest});await page.locator('#start-booking').click();await page.waitForFunction(()=>/\d[\d,.]* km/.test(document.querySelector('#via-route-distance')?.textContent||''),undefined,{timeout:30000});};
 assert((await page.locator('#via-release-indicator').innerText()).includes('30.2'));
 await select();await page.waitForTimeout(1000);assert.equal(requests.length,1);
 assert.equal(responses[0]?.status,200);assert(responses[0]?.km>0);
 await page.locator('#wizard-back').click();await select();assert.equal(requests.length,1);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);await select();assert.equal(requests.length,1);
 console.log('VIA_V302_PROD_BROWSER_PASS '+JSON.stringify({requests:requests.length,responses,back:0,reload:0}));
}catch(e){console.log('VIA_V302_REAL_BROWSER_FAIL '+JSON.stringify({requests:requests.length,responses,message:e.message}));throw e}
finally{await browser.close()}
