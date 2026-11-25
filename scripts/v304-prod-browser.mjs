import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const candidate=readFileSync('v304-prod-release/candidate.txt','utf8').trim();
const base=process.argv[2]==='prod'?'https://viatraslados.com':'https://'+candidate.slice(0,8)+'-via-traslados-web-prod.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const browser=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 // Prevent all mutations in browser except actual route preview.
 await ctx.route('**/*',r=>{const req=r.request(),path=new URL(req.url()).pathname;return ['GET','HEAD','OPTIONS'].includes(req.method())||(process.argv[2]==='prod'&&req.method()==='POST'&&path==='/api/public/route-preview')?r.continue():r.abort()});
 const page=await ctx.newPage();let routes=0;
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/public/route-preview')routes++});
 await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore&&window.ViaSearchLocation);
 assert((await page.locator('body').innerText()).includes('v30.4.8'));
 assert.equal(await page.locator('#via-qa-auth-script').count(),0);
 await page.evaluate(()=>ViaSearchLocation.update(-34.85,-56.02));
 const input=page.locator('#home-origin'),tip=page.locator('#via-location-hint');
 await input.click();await page.setViewportSize({width:390,height:440});
 await tip.waitFor({state:'visible',timeout:5000});
 await input.fill('Costa urbana');
 await page.waitForFunction(()=>/costa urbana/i.test(document.querySelector('#address-suggestions .address-choice')?.textContent||'')&&document.querySelector('#address-suggestions .via-suggestion-distance'),undefined,{timeout:35000});
 const first=page.locator('#address-suggestions .address-choice').first();
 const result=await first.innerText();assert.match(result,/≈ /);
 await first.click();const dest=await page.evaluate(()=>ViaAddress.get('home-origin'));
 assert(Number.isFinite(dest.lat)&&Number.isFinite(dest.lng));
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>!document.body.classList.contains('via-address-editing'));
 assert.equal(routes,0);
 const a={label:'Aeropuerto Internacional de Carrasco, Canelones',lat:-34.83696,lng:-56.01638,accuracy:'gps',numberIsApproximate:true,source:'map',postalStatus:'unknown'};
 await page.evaluate(({a,dest})=>{ViaAddress.set('home-origin',a);document.getElementById('home-origin').dispatchEvent(new CustomEvent('via:address',{detail:a}));ViaAddress.set('home-destination',dest);document.getElementById('home-destination').dispatchEvent(new CustomEvent('via:address',{detail:dest}))},{a,dest});
 const hint=page.locator('.reference-field').filter({has:page.locator('#home-origin')}).locator('.via-selected-accuracy');
 await hint.waitFor({state:'visible'});assert.equal(await hint.evaluate(e=>getComputedStyle(e).color),'rgb(49, 93, 128)');
 if(process.argv[2]==='prod'){
 const select=async()=>{await page.evaluate(({a,dest})=>{ViaAddress.set('home-origin',a);ViaAddress.set('home-destination',dest)},{a,dest});await page.locator('#start-booking').click();await page.waitForFunction(()=>/\d[\d,.]* km/.test(document.querySelector('#via-route-distance')?.textContent||''),undefined,{timeout:35000})};
 await select();assert.equal(routes,1);await page.locator('#wizard-back').click();await select();assert.equal(routes,1);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);await select();assert.equal(routes,1);
 }
 console.log('VIA_V304_RELEASE_BROWSER_PASS '+JSON.stringify({os,phase:process.argv[2],result,routes}));
 }finally{await browser.close()}
}
