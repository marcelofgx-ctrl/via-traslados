const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.VIA_QA_URL||'https://via-traslados-web-typo-v28-qa.marcelof-gx.workers.dev';
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const [width,height] of [[390,844],[320,720],[430,932]]){
   const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,locale:'es-UY'});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/?test=typo28',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>!!window.ViaAddress?.set&&!!document.getElementById('home-origin'),null,{timeout:15000});
   await page.evaluate(()=>{
    const chosen={label:'Cerca de ROQUE SAENZ PEÑA 1711, Shangrilá, Canelones',
      lat:-34.9,lng:-56.2,accuracy:'gps',source:'gps',postalStatus:'suggested',
      city:'Shangrilá',department:'Canelones',referenceDistance:12,numberIsApproximate:true};
    window.ViaAddress.set('home-origin',chosen);
    document.getElementById('home-origin').dispatchEvent(new Event('via:address',{bubbles:true}));
   });
   await page.waitForFunction(()=>{
    const el=document.querySelector('#home-origin + .via-selected-preview');
    return el && !el.hidden && el.querySelector('.via-selected-street')?.textContent?.includes('1711');
   },null,{timeout:12000});
   const metrics=await page.evaluate(()=>{
    const el=document.querySelector('#home-origin + .via-selected-preview'),
     field=el.closest('.reference-field'),headline=el.querySelector('.via-selected-street'),
     place=el.querySelector('.via-selected-place'),hint=el.querySelector('.via-selected-accuracy');
    const within=(child,parent)=>{let a=child.getBoundingClientRect(),b=parent.getBoundingClientRect();
     return a.left>=b.left-2&&a.right<=b.right+2&&a.top>=b.top-2&&a.bottom<=b.bottom+2};
    return{title:headline.textContent,place:place.textContent,hint:hint.textContent,
     titleFits:within(headline,field),localityFits:within(place,field),
     headlineOverflow:headline.scrollWidth-headline.clientWidth,
     placeOverflow:place.scrollWidth-place.clientWidth,
     approximateAccessible:el.getAttribute('aria-label').includes('orientativo'),
     inputValue:document.getElementById('home-origin').value,
     domOverflow:document.documentElement.scrollWidth-window.innerWidth};
   });
   assert.match(metrics.title,/Cerca de Roque Saenz Peña\u00a01711/);
   assert.equal(metrics.place,'Shangrilá · Canelones');
   assert.equal(metrics.hint,'n.º aprox.');
   assert(metrics.titleFits && metrics.localityFits,'Texto fuera de tarjeta '+JSON.stringify(metrics));
   assert(metrics.headlineOverflow<=2,'Título excede el contenedor');
   assert(metrics.domOverflow<=6,'Desbordamiento horizontal de portada');
   assert(metrics.approximateAccessible);
   assert.equal(metrics.inputValue,'Cerca de ROQUE SAENZ PEÑA 1711, Shangrilá, Canelones');
   // No deben aparecer errores funcionales del cambio de vista tipográfica.
   assert.equal(errors.filter(s=>s.includes('via-selected')).length,0);
   console.log('TYPOGRAPHY_V28_MOBILE_OK',width,height,JSON.stringify(metrics));
   await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error('TYPOGRAPHY_V28_FAILED',e.stack||String(e));process.exit(1)});
