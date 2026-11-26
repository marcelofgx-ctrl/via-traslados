import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const root='https://viatraslados.com',stage='https://via-traslados-v30410-visual-qa.marcelof-gx.workers.dev';
const remote=process.argv[2]==='preview';
const baseUA='Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const cases=[
 ['samsung',chromium,baseUA+' SamsungBrowser/29.0'],
 ['chrome-android',chromium,baseUA],
 ['edge-android',chromium,baseUA+' EdgA/142.0.0.0'],
 ['android-webview',chromium,'Mozilla/5.0 (Linux; Android 16; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Mobile Safari/537.36'],
 ['firefox-android',firefox,'Mozilla/5.0 (Android 16; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0'],
 ['ios',webkit,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1']
];
mkdirSync('v30410-visual/evidence',{recursive:true});
const results=[];
for(const [profile,engine,ua] of cases){
 const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--no-sandbox']}:{})});
 try{
 for(const scheme of ['light','dark']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2.8125,hasTouch:true,...(engine===firefox?{}:{isMobile:true}),userAgent:ua,colorScheme:scheme,serviceWorkers:'block'});
 await ctx.route('**/*',async r=>{
  const req=r.request(),u=new URL(req.url()),p=u.pathname;
  if(p.startsWith('/api/')||!['GET','HEAD'].includes(req.method()))return r.fulfill({status:503,contentType:'application/json',body:'{}'});
  if(remote&&u.origin===stage)return r.continue();
  if(!remote&&u.origin===root){
   const n=p.slice(1)||'index.html';
   if(!/^[\w./-]+$/.test(n)||n.includes('..'))return r.abort();
   try{const b=readFileSync('v30410-visual/assets/'+n);const type={html:'text/html',js:'application/javascript',mjs:'application/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',woff2:'font/woff2',webmanifest:'application/manifest+json'}[n.split('.').pop()]||'application/octet-stream';return r.fulfill({status:200,contentType:type,body:b})}catch{return r.abort()}
  }
  if(/^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname))return r.continue();
  return r.abort();
 });
 const page=await ctx.newPage();
 await page.goto((remote?stage:root)+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ViaAddress&&window.ViaStore);
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled([document.fonts.load('600 24px Manrope'),document.fonts.load('700 24px Manrope')]);await document.fonts.ready});
 assert.equal(await page.locator('html').getAttribute('data-via-visual'),profile);
 const measure=()=>page.evaluate(()=>{
  const b=document.getElementById('location-shortcut'),s=b.querySelector('svg'),r=b.getBoundingClientRect(),sr=s?.getBoundingClientRect(),cs=getComputedStyle(b);
  const title=document.querySelector('.home-intro h1')||document.querySelector('.home-intro');
  const pseudo=getComputedStyle(b,'::before');
  const surfaces=[...document.querySelectorAll('.reference-home,.reference-booking,.home-intro,.home-highlights,.reference-field,.premium-main')].slice(0,12).map(el=>{const x=getComputedStyle(el);return {bg:x.backgroundImage,filter:x.filter,backdrop:x.backdropFilter,shadow:x.boxShadow}});
  return {glyph:b.textContent.trim(),idle:b.hasAttribute('data-via-vector-idle'),pseudo:{content:pseudo.content,width:pseudo.width,height:pseudo.height,mask:pseudo.maskImage||pseudo.webkitMaskImage},fontReady:document.fonts.check('600 24px Manrope'),surfaces,button:[r.width,r.height],font:cs.fontSize,svg:sr?[sr.width,sr.height]:null,childTags:[...b.children].map(x=>x.tagName),titleFont:getComputedStyle(title).fontFamily,titleSize:getComputedStyle(title).fontSize,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 const active=await measure();
 const path='v30410-visual/evidence/'+(remote?'remote':'local')+'-'+profile+'-'+scheme;
 await page.screenshot({path:path+'-adapted.png',animations:'disabled'});
 await page.evaluate(()=>document.documentElement.dataset.viaVisual='reference');
 const reference=await measure();
 await page.screenshot({path:path+'-reference.png',animations:'disabled'});
 assert.deepEqual(active.button,reference.button,'Changed touch target geometry');
 if(profile!=='chrome-android'){const {fontReady:af,...as}=active,{fontReady:rf,...rs}=reference;assert.deepEqual(as,rs,'Reference browser unexpectedly changed');}
 else {assert(active.idle,'Unexpected GPS glyph: '+active.glyph);assert.equal(active.font,'0px');assert.equal(active.pseudo.width,'24px');assert.equal(active.pseudo.height,'24px');assert.match(active.pseudo.mask,/data:image\/svg\+xml/);assert.equal(reference.font,'24px');assert.deepEqual(active.surfaces,reference.surfaces);assert.equal(active.glyph,reference.glyph);
  // Ensure progress/error glyph remains unchanged instead of drawing idle vector.
  await page.evaluate(()=>{const b=document.getElementById('location-shortcut');b.setAttribute('aria-busy','true')});
  await page.evaluate(()=>document.documentElement.dataset.viaVisual='chrome-android');
  await page.waitForFunction(()=>!document.getElementById('location-shortcut').hasAttribute('data-via-vector-idle'));
  assert.equal((await measure()).font,'24px');
  await page.evaluate(()=>document.getElementById('location-shortcut').removeAttribute('aria-busy'));
  await page.waitForFunction(()=>document.getElementById('location-shortcut').hasAttribute('data-via-vector-idle'));
 }
 await page.evaluate(p=>document.documentElement.dataset.viaVisual=p,profile);
 // Opt-in finish must preserve target geometry and typography; compare same physical viewport.
 const finishMetrics=()=>page.evaluate(()=>{
  const ids=['start-booking','location-shortcut','home-origin','home-destination','home-date','home-time','home-passengers'];
  return {controls:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return [id,r.width,r.height]}),
    button:getComputedStyle(document.getElementById('start-booking')).backgroundImage,
    card:getComputedStyle(document.querySelector('.reference-booking')).boxShadow,
    overflow:document.documentElement.scrollWidth>innerWidth};
 });
 assert.equal(await page.locator('html').getAttribute('data-via-finish'),'reference');
 const beforeFinish=await finishMetrics();
 await page.evaluate(()=>document.documentElement.dataset.viaFinish='premium');
 const afterFinish=await finishMetrics();
 assert.deepEqual(afterFinish.controls,beforeFinish.controls,'Touch target dimensions changed');
 assert.equal(afterFinish.overflow,beforeFinish.overflow);
 assert.notEqual(afterFinish.button,beforeFinish.button,'Premium gradient not applied');
 assert.notEqual(afterFinish.card,beforeFinish.card,'Premium card shadow not applied');
 await page.screenshot({path:path+'-premium.png',animations:'disabled'});
 await page.evaluate(()=>document.documentElement.dataset.viaFinish='reference');
 assert.deepEqual(await finishMetrics(),beforeFinish,'Reference finish did not restore');
 await page.locator('#start-booking').click();
 assert.match(await page.locator('#to-contact').innerText(),/Continuar/);
 assert(!(await page.locator('#to-contact').isDisabled()));
 const row={profile,scheme,remote,active,reference};results.push(row);console.log('VIA_VISUAL_CHECK '+JSON.stringify({profile,scheme,remote,active:{glyph:active.glyph,idle:active.idle,font:active.font,pseudo:active.pseudo.width,vector:active.pseudo.mask?.includes('data:image/svg'),fontReady:active.fontReady,button:active.button},textureUnchanged:JSON.stringify(active.surfaces)===JSON.stringify(reference.surfaces)}));
 await ctx.close();
 }
 }finally{await browser.close()}
}
writeFileSync('v30410-visual/evidence/'+(remote?'remote':'local')+'-metrics.json',JSON.stringify(results,null,2));
