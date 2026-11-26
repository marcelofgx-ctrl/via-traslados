import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const root='https://viatraslados.com',api='https://via-traslados-api.marcelof-gx.workers.dev';
const mode=process.argv[2]||'candidate';
const approx={label:'Aeropuerto Internacional de Carrasco, Canelones',lat:-34.83696,lng:-56.01638,accuracy:'gps',numberIsApproximate:true,source:'map',postalStatus:'unknown'};
for(const [os,engine] of [['Chromium',chromium],['WebKit',webkit]]){
 const b=await engine.launch({headless:true,...(os==='Chromium'?{args:['--no-sandbox']}:{})});
 try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',colorScheme:os==='Chromium'?'light':'dark'});
 let routes=0,queries=0;
 await ctx.route('**/*',async r=>{
  const req=r.request(),u=new URL(req.url()),p=u.pathname,m=req.method();
  if(u.origin===api&&p==='/api/public/route-preview'&&m==='POST'){routes++;return r.continue()}
  if(u.origin===root&&p==='/api/direcciones'&&m==='GET'){queries++;return r.continue()}
  if(['GET','HEAD','OPTIONS'].includes(m)&&u.origin===api&&p==='/api/health')return r.continue();
  if(u.origin===root&&!p.startsWith('/api/')&&['GET','HEAD'].includes(m)){
   if(mode==='prod')return r.continue();
   const n=p.slice(1)||'index.html';
   if(!/^[\w./-]+$/.test(n)||n.includes('..'))return r.abort();
   try{const body=readFileSync('v3049-maintenance/assets/'+n);const ext=n.split('.').pop();const type={html:'text/html',js:'application/javascript',mjs:'application/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',webmanifest:'application/manifest+json'}[ext]||'application/octet-stream';return r.fulfill({status:200,contentType:type,body})}catch{return r.abort()}
  }
  if(u.origin===root&&p.startsWith('/api/'))return r.abort();
  // Public external map tiles and fonts only, not authentication or writes.
  if(['GET','HEAD'].includes(m)&&/^(fonts\.googleapis\.com|fonts\.gstatic\.com|(?:[abc]\.)?tile\.openstreetmap\.org|unpkg\.com)$/.test(u.hostname))return r.continue();
  return r.abort();
 });
 const page=await ctx.newPage();
 page.on('pageerror',e=>console.log('VIA_BROWSER_PAGE_ERROR '+e.name));
 await page.goto(root+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore&&window.ViaSearchLocation);
 assert(await page.locator('#via-visible-release').isVisible(),'Version not visible');
 assert.equal(await page.locator('#via-qa-auth-script').count(),0);
 assert.equal(await page.locator('#via-search-distance-style').count(),1);
 await page.evaluate(()=>ViaSearchLocation.update(-34.85,-56.02));
 const input=page.locator('#home-origin'),tip=page.locator('#via-location-hint');
 await input.click();await page.setViewportSize({width:390,height:440});
 await tip.waitFor({state:'visible',timeout:5000});
 await input.fill('Costa urbana');
 await page.waitForFunction(()=>/costa urbana/i.test(document.querySelector('#address-suggestions .address-choice')?.textContent||'')&&document.querySelector('#address-suggestions .via-suggestion-distance'),undefined,{timeout:35000});
 const first=page.locator('#address-suggestions .address-choice').first();assert.match(await first.innerText(),/≈ /);
 await first.click();const dest=await page.evaluate(()=>ViaAddress.get('home-origin'));
 assert(Number.isFinite(dest.lat)&&Number.isFinite(dest.lng));
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>!document.body.classList.contains('via-address-editing'));
 assert.equal(routes,0);
 const set=async()=>page.evaluate(({a,dest})=>{for(const [id,x] of [['home-origin',a],['home-destination',dest]]){ViaAddress.set(id,x);document.getElementById(id).dispatchEvent(new CustomEvent('via:address',{detail:x}));}},{a:approx,dest});
 await set();
 const hint=page.locator('.reference-field').filter({has:page.locator('#home-origin')}).locator('.via-selected-accuracy');
 await hint.waitFor({state:'visible'});assert.equal(await hint.evaluate(e=>getComputedStyle(e).color),'rgb(49, 93, 128)');
 // A genuine input clear must hide the marker. No coordinates invented.
 await input.fill('');
 await hint.waitFor({state:'hidden'});
 await set();
 await page.locator('#start-booking').click();
 await page.waitForFunction(()=>/\d[\d,.]* km/.test(document.querySelector('#via-route-distance')?.textContent||''),undefined,{timeout:35000});
 assert.equal(routes,1);
 const routeText=await page.locator('#via-route-distance').innerText();
 assert.match(routeText,/\d/);
 await page.locator('#wizard-back').click();await set();await page.locator('#start-booking').click();
 await page.waitForFunction(()=>/\d[\d,.]* km/.test(document.querySelector('#via-route-distance')?.textContent||''));
 assert.equal(routes,1,'Route cache lost on back');
 // Wizard origin wrapper: deliberately recreate a stale displayed marker while empty.
 const info=await page.evaluate(()=>{
   const i=document.getElementById('origin');
   const parent=i.closest('.reference-field')||i.closest('.selected-field')||i.parentElement;
   return {tag:parent.tagName,cls:parent.className,markers:parent.querySelectorAll('.via-selected-accuracy').length,originValue:i.value};
 });
 console.log('VIA_WIZARD_MARKER_STRUCTURE '+JSON.stringify(info));
 const wizardOrigin=page.locator('#origin');
 if(!await wizardOrigin.isVisible()){
  const edit=page.locator('.reference-field').filter({has:wizardOrigin}).getByText('Editar',{exact:true});
  if(await edit.count()&&await edit.first().isVisible())await edit.first().click();
 }
 // Assert marker is never visible in the same origin field when input is emptied.
 await page.evaluate(()=>{
   const i=document.getElementById('origin');i.value='';
   i.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await page.waitForFunction(()=>{
   const i=document.getElementById('origin'),p=i.closest('.reference-field')||i.closest('.selected-field')||i.parentElement;
   return ![...p.querySelectorAll('.via-selected-accuracy')].some(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none');
 });
 await page.locator('#wizard-back').click();await set();await page.locator('#start-booking').click();
 await page.waitForFunction(()=>/\d[\d,.]* km/.test(document.querySelector('#via-route-distance')?.textContent||''));
 assert.equal(routes,1,'Route cache lost after origin edit');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);await set();await page.locator('#start-booking').click();
 await page.waitForFunction(()=>/\d[\d,.]* km/.test(document.querySelector('#via-route-distance')?.textContent||''));
 assert.equal(routes,1,'Route cache lost on reload');
 console.log('VIA_3049_GEOGRAPHY_PASS '+JSON.stringify({os,mode,queries,routes,routeText,approxCleared:true,cache:true}));
 }finally{await b.close()}
}
