import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const b=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await ctx.route(u=>u.pathname.endsWith('/reference.js'),async route=>{
   const r=await route.fetch(),src=await r.text();assert(src.includes('V30.4.7: only the existing'));
   const body=src.replace('function gpsPanel(', "window.__viaTestPanel=gpsPanel; function gpsPanel(");
   assert(body!==src);await route.fulfill({response:r,body});
  });
  const p=await ctx.newPage();await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>typeof window.__viaTestPanel==='function'&&window.ViaAddress&&document.querySelector('.via-selected-accuracy'));
  assert((await p.locator('body').innerText()).includes('V30.4.8 QA'));
  const a={label:'Avenida Italia 4206, Montevideo',lat:-34.88,lng:-56.12,accuracy:'gps',numberIsApproximate:true,postalStatus:'suggested',referenceDistance:10};
  await p.evaluate(a=>{ViaAddress.set('home-origin',a);document.getElementById('home-origin').dispatchEvent(new CustomEvent('via:address',{detail:a}));window.__viaTestPanel('Número orientativo','Referencia aproximada',[{label:'Ajustar en el mapa',go:()=>{}}])},a);
  const field=p.locator('.reference-field').filter({has:p.locator('#home-origin')});
  const hint=field.locator('.via-selected-accuracy');
  await hint.waitFor({state:'visible'});
  assert.equal(await hint.innerText(),'n.º aprox.');
  assert.equal(await hint.evaluate(e=>getComputedStyle(e).color),'rgb(49, 93, 128)');
  assert.equal(await p.locator('#via-number-info-native').count(),0);
  assert.equal(await p.getByText('Número orientativo',{exact:true}).filter({visible:true}).count(),0);
  const before=await p.evaluate(()=>ViaAddress.get('home-origin'));
  await field.locator('.via-map-shortcut').click();
  await p.locator('.via-picker-backdrop').waitFor({state:'visible',timeout:8000});
  await p.locator('.via-picker-close').click();
  assert.deepEqual(await p.evaluate(()=>ViaAddress.get('home-origin')),before);
  await p.evaluate(()=>window.__viaTestPanel('Mejorando precisión','Prueba de estado alternativo',[]));
  assert(await p.getByText('Mejorando precisión',{exact:true}).isVisible());
  await p.evaluate(a=>{ViaAddress.set('home-origin',{...a,accuracy:'portal',numberIsApproximate:false,postalStatus:'user_confirmed'});document.getElementById('home-origin').dispatchEvent(new CustomEvent('via:address'));window.__viaTestPanel('','',[])},a);
  await hint.waitFor({state:'hidden'});
  console.log('VIA_NUMBER_INLINE_PASS '+JSON.stringify({os,blue:true,noExtraPanel:true,mapOpened:true,coordinatesPreserved:true,exactAddressNoHint:true}));
 }finally{await b.close()}
}
