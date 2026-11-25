import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const browser=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  assert(await p.locator('#via-qa-auth-script').count()===1);
  assert((await p.locator('body').innerText()).includes('V30.4.7 QA'));
  // Test the deployed QA helper with a minimal identity-card DOM fixture, not a real login.
  await p.evaluate(()=>{const f=document.createElement('form');f.id='via-auth-fixture';f.innerHTML='<button type="submit">Continuar con mi celular →</button><div class="cf-turnstile">Widget</div>';document.body.append(f);});
  await p.waitForFunction(()=>document.querySelector('#via-auth-fixture button')?.disabled);
  assert(await p.locator('#via-auth-fixture #via-qa-auth-note').isVisible());
  assert(!(await p.locator('#via-auth-fixture .cf-turnstile').isVisible()));
  assert((await p.locator('#via-auth-fixture #via-qa-auth-note').innerText()).includes('No se procesan cuentas ni reservas'));
  const r=await p.request.post(base+'/api/requests',{data:{}});
  assert.equal(r.status(),503);
  console.log('VIA_QA_AUTH_ISOLATION_PASS '+JSON.stringify({os,fixture:true,reservationsBlocked:true}));
 }finally{await browser.close()}
}
