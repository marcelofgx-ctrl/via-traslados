const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const base=process.env.VIA_QA_URL||'https://via-traslados-web-review-v29-qa.marcelof-gx.workers.dev';
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const cases=[[390,740],[360,740],[320,720],[390,844]];
 try{
  for(const [width,height] of cases){
   const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,locale:'es-UY'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/?qa_v29=review',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>Boolean(window.ViaStore?.estimateRoute&&window.ViaAddress?.set),null,{timeout:18000});
   await page.evaluate(()=>{
    window.ViaStore.estimateRoute=async()=>({distanceKm:3.4,durationMinutes:5});
    const origin='Cerca de ROQUE SAENZ PEÑA 1711, Shangrilá, CANELONES';
    const destination='Cerca de AVENIDA INGENIERO LUIS GIANNATTASIO 3407, Barra de Carrasco, CANELONES';
    document.getElementById('home-origin').value=origin;
    document.getElementById('home-destination').value=destination;
    document.getElementById('home-date').value='2026-11-20';
    document.getElementById('home-time').value='10:00';
    document.getElementById('home-passengers').value='1';
   });
   await page.locator('#start-booking').click();
   await page.waitForFunction(()=>document.body.classList.contains('in-booking')&&!document.querySelector('[data-step="1"]').classList.contains('hidden'),null,{timeout:11000});
   await page.waitForFunction(()=>document.querySelector('#origin-readout .route-readout-text')?.textContent?.includes('1711'),null,{timeout:11000});
   await page.waitForFunction(()=>document.getElementById('via-route-distance')?.textContent?.includes('3,4'),null,{timeout:11000});
   const metric=await page.evaluate(()=>{
    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height}};
    const address=id=>document.querySelector('#'+id+'-readout .route-readout-text').textContent;
    const button=rect('to-contact');
    return{
     width:window.innerWidth,height:window.innerHeight,
     pageHeight:document.documentElement.scrollHeight,
     bodyHeight:document.body.scrollHeight,
     scrollY:window.scrollY,button,
     origin:address('origin'),destination:address('destination'),
     hiddenPrefix:[address('origin'),address('destination')].every(s=>!/^Cerca de/i.test(s)),
     routeSummary:document.getElementById('via-route-distance').textContent,
     stepBounds:rect('solicitar')
    };
   });
   console.log('V29_REVIEW_METRICS',JSON.stringify(metric));
   assert(metric.hiddenPrefix,'La pantalla todavía muestra «Cerca de»');
   assert(metric.origin.includes('1711')&&metric.destination.includes('3407'),'Falta número de puerta');
   assert(metric.button.bottom<=metric.height-6&&metric.button.top>=0,
     'Continuar queda fuera de la pantalla '+JSON.stringify(metric));
   assert(metric.pageHeight<=metric.height+4,
     'La pantalla sigue necesitando scroll '+JSON.stringify(metric));
   assert.equal(errors.filter(x=>/wizard|review-compact-v29|address-selected/i.test(x)).length,0);
   await page.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error('V29_REVIEW_FAILED',error.stack||String(error));process.exit(1)});
