import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const b=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  // Expose the real renderer only in this isolated test browser; no HTML fixture.
  await ctx.route(u=>u.pathname.endsWith('/reference.js'),async route=>{
   const r=await route.fetch(),src=await r.text();
   assert(src.includes('V30.4.5: presentation-only'));
   const body=src.replace('function gpsPanel(', "window.__viaTestPanel=gpsPanel; window.__viaTestMap=()=>openGpsMap(); function gpsPanel(");
   assert(body!==src);await route.fulfill({response:r,body});
  });
  const p=await ctx.newPage();await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>typeof window.__viaTestPanel==='function');
  assert((await p.locator('body').innerText()).includes('V30.4.6 QA'));
  await p.evaluate(()=>window.__viaTestPanel('Número orientativo','Es un número cercano, no necesariamente tu puerta. Verificá el punto.',[{label:'Ajustar en el mapa',go:()=>{window.__viaMapClicked=true;window.__viaTestMap()}}]));
  const card=p.locator('#via-number-info-native');await card.waitFor({state:'visible'});
  const m=await card.evaluate(el=>({h:el.getBoundingClientRect().height,after:!!el.previousElementSibling?.querySelector('#home-origin'),button:el.querySelector('button').getBoundingClientRect().height,color:getComputedStyle(el).backgroundColor}));
  assert(m.h<=46&&m.button>=32&&m.after,JSON.stringify(m));
  assert.equal(await p.getByText('Número orientativo',{exact:true}).count(),0);
  await card.getByRole('button').click();assert(await p.evaluate(()=>window.__viaMapClicked===true));
  await p.locator('.via-picker-backdrop').waitFor({state:'visible',timeout:8000});
  await p.locator('.via-picker-close').click();
  await p.evaluate(()=>window.__viaTestPanel('Mejorando precisión','Prueba de estado alternativo',[]));
  assert.equal(await card.count(),0);
  assert(await p.getByText('Mejorando precisión',{exact:true}).isVisible());
  await p.evaluate(()=>window.__viaTestPanel('Número orientativo','Referencia aproximada',[{label:'Ajustar en el mapa',go:()=>{}}]));
  await p.locator('#home-origin').fill('Shopping');assert.equal(await card.count(),0);
  console.log('VIA_NUMBER_RENDERER_PASS '+JSON.stringify({os,...m,realRenderer:true,mapOpened:true,otherStatusPreserved:true}));
 }finally{await b.close()}
}
