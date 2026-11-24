import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const id=readFileSync('v302-route-cache/candidate.txt','utf8').trim();
const base='https://'+id.slice(0,8)+'-via-traslados-web-prod.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const browser=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'es-UY',serviceWorkers:'block'});
 let calls=0;const errors=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/public/route-preview'){
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
   calls++;const p=JSON.parse(route.request().postData()||'{}');
   const km=p.destinationLocation?.lat===-34.91?15.4:12.3;
   await new Promise(r=>setTimeout(r,250));
   return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':base},json:{distanceKm:km,durationMinutes:19,source:'Geoapify'}});
  }
  if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(route.request().method()))return route.fulfill({status:503,json:{error:'QA isolated'}});
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const select=async()=>{await page.evaluate(()=>{
  ViaAddress.set('home-origin',{label:'Punto público A, Montevideo',lat:-34.85,lng:-56.03,source:'map',postalStatus:'unknown'});
  ViaAddress.set('home-destination',{label:'Punto público B, Montevideo',lat:-34.90,lng:-56.10,source:'map',postalStatus:'unknown'});
 });await page.locator('#start-booking').click();await page.waitForFunction(()=>document.querySelector('#via-route-distance')?.textContent.includes('12,3'))};
 try{
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);
  assert((await page.locator('#via-release-indicator').innerText()).includes('30.2'));
  await select();await page.waitForTimeout(900);assert.equal(calls,1,'Duplicate first request');
  await page.locator('#wizard-back').click();await select();await page.waitForTimeout(800);assert.equal(calls,1,'Back caused network request');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);
  await select();await page.waitForTimeout(800);assert.equal(calls,1,'Reload caused network request');
  await page.evaluate(()=>{ViaAddress.set('destination',{label:'Punto público C, Montevideo',lat:-34.91,lng:-56.11,source:'map',postalStatus:'unknown'});const e=document.getElementById('destination');e.dispatchEvent(new Event('change'));e.dispatchEvent(new Event('via:address'));});
  await page.waitForFunction(()=>document.querySelector('#via-route-distance')?.textContent.includes('15,4'));await page.waitForTimeout(800);assert.equal(calls,2,'Changed destination should make exactly one request');
  const saved=await page.evaluate(()=>localStorage.getItem('via-route-preview-cache-v1'));assert(saved&&!saved.includes('Punto público')&&!saved.includes('-34.85'));
  assert.deepEqual(errors,[]);
  console.log('VIA_V302_BROWSER_PASS '+JSON.stringify({os,requests:calls,initial:1,back:0,reload:0,changedDestination:1}));
 }finally{await browser.close()}
}
