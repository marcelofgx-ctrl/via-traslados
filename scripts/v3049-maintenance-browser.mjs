import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root='https://viatraslados.com';
const mode=process.argv[2]||'local';
const url=mode==='preview'?'https://via-traslados-v3049-maintenance-qa.marcelof-gx.workers.dev':root;
const fixture={name:'QA session',phone:'099000000',email:'qa@example.invalid'};
const token='a'.repeat(64);
const a={label:'Avenida Italia 4206, Montevideo',lat:-34.88,lng:-56.12,source:'map',postalStatus:'unknown',numberIsApproximate:true,accuracy:'gps'};
const d={label:'Aeropuerto Internacional de Carrasco',lat:-34.83696,lng:-56.01638,source:'map',postalStatus:'selected'};
for(const [os,engine] of [['Chromium',chromium],['WebKit',webkit]]){
 const browser=await engine.launch({headless:true,...(os==='Chromium'?{args:['--no-sandbox']}:{})});
 try{
  for(const scenario of ['clean','valid','expired','slow']){
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:scenario==='clean'?'light':'dark',serviceWorkers:'block'});
   let calls=0;
   await ctx.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.pathname==='/api/customer/me'){
     calls++;
     if(scenario==='slow'&&calls>1)await new Promise(r=>setTimeout(r,11000));
     const expired=scenario==='expired';
     return route.fulfill({status:expired?401:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(expired?{error:'expired'}:{profile:fixture,passkeys:0})}).catch(()=>{});
    }
    if(u.pathname==='/api/public/route-preview')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({distanceKm:3.2,durationMinutes:5})});
    if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{}',headers:{'access-control-allow-origin':'*'}});
    if(mode==='local'&&u.origin===root){
     let n=u.pathname.slice(1)||'index.html';
     if(!/^[\w./-]+$/.test(n)||n.includes('..'))return route.abort();
     try{const body=readFileSync('v3049-maintenance/assets/'+n);const ext=n.split('.').pop();const type={html:'text/html',js:'application/javascript',mjs:'application/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',svg:'image/svg+xml',webmanifest:'application/manifest+json'}[ext]||'application/octet-stream';return route.fulfill({status:200,contentType:type,body})}catch{return route.abort()}
    }
    if(mode==='preview'&&u.origin===url&&['GET','HEAD'].includes(req.method()))return route.continue();
    return route.abort();
   });
   if(scenario!=='clean')await ctx.addInitScript(({token,fixture})=>localStorage.setItem('via-customer-session-v1',JSON.stringify({sessionToken:token,expiresAt:Math.floor(Date.now()/1000)+3600,profile:fixture,passkeys:0})),{token,fixture});
   const page=await ctx.newPage();
   await page.goto(url+'/index.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);
   assert(await page.locator('#via-visible-release').isVisible());
   if(scenario==='clean'){
    await page.locator('#start-booking').click();
    assert.match(await page.locator('#to-contact').innerText(),/Continuar/);
    assert(!(await page.locator('#to-contact').isDisabled()));
   }else{
    await page.evaluate(({a,d})=>{ViaAddress.set('home-origin',a);ViaAddress.set('home-destination',d);document.getElementById('home-origin').dispatchEvent(new CustomEvent('via:address',{detail:a}));document.getElementById('home-destination').dispatchEvent(new CustomEvent('via:address',{detail:d}));},{a,d});
    await page.locator('#start-booking').click();
    await page.locator('#to-contact').click();
    await page.waitForFunction(()=>!document.querySelector('#to-contact').disabled,undefined,{timeout:12000});
    assert.match(await page.locator('#to-contact').textContent(),/Continuar/);
    if(scenario==='valid')await page.waitForFunction(()=>document.querySelector('#wizard-progress-label').textContent.includes('3 DE 3'));
    if(scenario==='slow')assert(!await page.locator('#to-contact').isDisabled());
   }
   console.log('VIA_3049_BROWSER_PASS '+JSON.stringify({os,scenario,mode,calls}));
   await ctx.close();
  }
 }finally{await browser.close()}
}
