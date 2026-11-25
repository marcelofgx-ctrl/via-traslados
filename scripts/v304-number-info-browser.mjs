import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const b=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',geolocation:{latitude:-34.83696,longitude:-56.01638,accuracy:15},permissions:['geolocation']});
  const p=await ctx.newPage();await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('#via-number-info-script',{state:'attached'});
  assert((await p.locator('body').innerText()).includes('V30.4.4 QA'));
  // UI-only fixture for the existing notice contract; no fake coordinates or provider result are persisted.
  await p.evaluate(()=>{const card=document.createElement('div');card.id='via-test-notice';card.innerHTML='<strong>Número orientativo</strong><p>Es un número cercano, no necesariamente tu puerta. Verificá el punto.</p><button type="button">Ajustar en el mapa</button>';card.querySelector('button').addEventListener('click',()=>card.dataset.clicked='true');document.querySelector('.reference-booking').append(card)});
  const card=p.locator('#via-test-notice');await p.waitForFunction(()=>document.querySelector('#via-test-notice').classList.contains('via-number-info'));
  const m=await card.evaluate(el=>({h:el.getBoundingClientRect().height,after:el.previousElementSibling?.querySelector('#home-origin')!==null,button:el.querySelector('button').getBoundingClientRect().height}));
  assert(m.h<=46&&m.button>=32&&m.after,JSON.stringify(m));
  await card.getByRole('button').click();assert.equal(await card.getAttribute('data-clicked'),'true');
  await card.evaluate(el=>el.querySelector('strong').textContent='Mejorando precisión');
  await p.waitForFunction(()=>!document.querySelector('#via-test-notice').classList.contains('via-number-info'));
  assert.equal(await card.getByRole('button').innerText(),'Ajustar en el mapa');
  await card.evaluate(el=>el.remove());
  console.log('VIA_NUMBER_INFO_PASS '+JSON.stringify({os,...m,actionPreserved:true,otherStatusRestored:true}));
  // Real GPS flow using browser-provided public test location. Require compact styling if orientative notice occurs.
  await p.locator('#location-shortcut').click();
  await p.waitForTimeout(2500);
  const live=await p.evaluate(()=>({notice:[...document.querySelectorAll('.reference-booking strong,.reference-booking h3')].some(e=>e.textContent.trim()==='Número orientativo'),compact:!!document.querySelector('.via-number-info')}));
  if(live.notice)assert(live.compact,'Real orientative notice did not compact');
  console.log('VIA_NUMBER_INFO_LIVE '+JSON.stringify({os,...live}));
 }finally{await b.close()}
}
