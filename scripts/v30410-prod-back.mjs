import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const root='https://viatraslados.com';
const candidate=JSON.parse(readFileSync('v30410-visual/release-candidate.json','utf8')).preview;
const origins={baseline:'https://d29d5304-via-traslados-web-prod.marcelof-gx.workers.dev',candidate,prod:root};
const mode=process.argv[2];assert(origins[mode]);
const a={label:'Avenida Italia 4206, Montevideo',lat:-34.88,lng:-56.12,source:'map',postalStatus:'unknown',numberIsApproximate:true,accuracy:'gps'};
const d={label:'Aeropuerto Internacional de Carrasco',lat:-34.83696,lng:-56.01638,source:'map',postalStatus:'selected'};
const profile={name:'QA synthetic',phone:'099000000',email:'qa@example.invalid'};
const token='a'.repeat(64);
for(const [engineName,engine] of [['Chromium',chromium],['WebKit',webkit]]){
 const browser=await engine.launch({headless:true,...(engineName==='Chromium'?{args:['--no-sandbox']}:{})});
 try{
  for(const scheme of ['light','dark']){
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:scheme,serviceWorkers:'block'});
   let sessionCalls=0,blockedWrites=0,delayNext=false,release;
   // All API calls are intercepted. No credential or synthetic request reaches production.
   await ctx.route('**/*',async r=>{
    const q=r.request(),u=new URL(q.url()),p=u.pathname,m=q.method();
    if(p==='/api/customer/me'){
      sessionCalls++;
      if(delayNext){delayNext=false;await new Promise(resolve=>{release=resolve;setTimeout(resolve,3000)})}
      return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({profile,passkeys:0})}).catch(()=>{});
    }
    if(p==='/api/public/route-preview')return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({distanceKm:3.2,durationMinutes:5})});
    if(p.startsWith('/api/')||!['GET','HEAD'].includes(m)){if(!['GET','HEAD','OPTIONS'].includes(m))blockedWrites++;return r.abort()}
    if(u.origin!==root)return r.abort();
    if(mode==='prod')return r.continue();
    const res=await fetch(origins[mode]+p+u.search,{signal:AbortSignal.timeout(15000)});
    return r.fulfill({status:res.status,contentType:res.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await res.arrayBuffer())});
   });
   await ctx.addInitScript(({token,profile})=>{localStorage.setItem('via-customer-session-v1',JSON.stringify({sessionToken:token,expiresAt:Math.floor(Date.now()/1000)+3600,profile,passkeys:0}))},{token,profile});
   const page=await ctx.newPage();
   await page.goto(root+'/index.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);
   if(mode!=='baseline')assert(await page.locator('#via-visible-release').isVisible());
   await page.evaluate(({a,d})=>{for(const [id,x] of [['home-origin',a],['home-destination',d]]){ViaAddress.set(id,x);document.getElementById(id).dispatchEvent(new CustomEvent('via:address',{detail:x}));}},{a,d});
   await page.locator('#start-booking').click();
   const btn=page.locator('#to-contact'),back=page.locator('#wizard-back');
   const step=async n=>page.waitForFunction(n=>document.querySelector('#wizard-progress-label').textContent.includes(n+' DE 3'),n,{timeout:12000});
   const snapshot=async()=>btn.evaluate(e=>({text:e.textContent.trim(),disabled:e.disabled,busy:e.getAttribute('aria-busy'),markup:e.innerHTML}));
   const initial=await snapshot();assert.match(initial.text,/Continuar/);
   const trip=()=>page.evaluate(()=>['origin','destination','date','time','passengers','bags'].map(id=>document.getElementById(id)?.value));
   const before=await trip();
   await btn.click();await step(3);await back.click();await step(1);
   const after=await snapshot();
   if(mode==='baseline'){
      console.log('VIA_BACK_BASELINE '+JSON.stringify({engine:engineName,scheme,stale:/Comprobando/.test(after.text),disabled:after.disabled}));
      assert.match(after.text,/Comprobando/,'Baseline defect not reproduced');
   }else{
      assert.match(after.text,/Continuar/);assert.equal(after.disabled,false);assert.equal(after.busy,'false');assert.equal(after.markup,initial.markup);
      assert.deepEqual(await trip(),before,'Trip draft lost on back');
      // Repeat the actual reported sequence twice.
      for(let i=0;i<2;i++){await btn.click();await step(3);await back.click();await step(1);assert.deepEqual(await snapshot(),after);assert.deepEqual(await trip(),before);}
      // Go back while a new verification is pending, immediately reopen and retry.
      delayNext=true;const prev=sessionCalls;await btn.click();
      await page.waitForFunction(()=>document.getElementById('to-contact').disabled);
      for(let i=0;i<40&&sessionCalls===prev;i++)await new Promise(r=>setTimeout(r,25));
      assert(sessionCalls>prev,'No delayed verification started');
      await back.click();await page.locator('#start-booking').click();await step(1);
      assert.match((await snapshot()).text,/Continuar/);assert.equal((await snapshot()).disabled,false);
      release?.();await btn.click();await step(3);await back.click();await step(1);assert.deepEqual(await snapshot(),after);
      assert.deepEqual(await trip(),before,'Draft lost during interrupted verification');
      console.log('VIA_BACK_FIXED '+JSON.stringify({engine:engineName,scheme,mode,sessionCalls,repeated:true,interrupted:true,tripPreserved:true}));
   }
   assert.equal(blockedWrites,0,'Unexpected attempted write');
   await ctx.close();
  }
 }finally{await browser.close()}
}
