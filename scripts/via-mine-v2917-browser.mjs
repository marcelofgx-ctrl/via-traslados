// Visual-only end-to-end smoke: no reservations or emails, only intercepted API.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';
const stage=process.env.VIA_MINE_PREMIUM_QA||'https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev/';
const origin=new URL(stage).origin;
await mkdir('mine-v2917-proof',{recursive:true});
const session={sessionToken:'a'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+86400,
 profile:{name:'Ana de prueba',email:'ana@example.invalid',phone:'099000000'}};
const date=(day)=>'2026-11-'+String(day).padStart(2,'0');
const booking=(i,st)=>({id:'qa-booking-'+i,origin:'Cerca de ROQUE SAENZ PEÑA 1711, Shangrilá, Canelones, Uruguay',
 destination:'Aeropuerto Internacional de Carrasco, Canelones, Uruguay',status:st,
 date:date(21+i),time:'10:00',price:850+i*10,route:{distanceKm:12.4},passengers:2});
const data=['confirmed','accepted','quoted','requested','en_route',
 'completed','cancelled','completed','cancelled','completed'].map((s,i)=>booking(i,s));
const iPhoneUA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const androidUA='Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
let passed=0;
async function runTest(engine,device,height,width,loggedIn){
 const browser=await engine.launch(engine===chromium?{channel:'chrome',headless:true,args:['--no-sandbox']}:{headless:true});
 const ctx=await browser.newContext({viewport:{width,height},screen:{width,height},
  isMobile:true,hasTouch:true,deviceScaleFactor:2,
  userAgent:device==='ios'?iPhoneUA:androidUA,serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(loggedIn)await page.addInitScript(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),session);
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url);calls.push(u.pathname);
  if(u.pathname==='/api/customer/me')return route.fulfill({status:200,json:{profile:session.profile,passkeys:1,expiresAt:session.expiresAt}});
  if(u.pathname==='/api/customer/bookings')return route.fulfill({status:200,json:data});
  if(u.pathname==='/api/customer/logout')return route.fulfill({status:200,json:{signedOut:true}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA API disabled'}});
  if(u.origin!==origin)return route.abort();
  return route.continue();
 });
 try{
  await page.goto(stage+'mis-reservas.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('via-mine-v2917'));
  assert.equal(await page.locator('body').getAttribute('data-mobile-os'),device);
  if(loggedIn){
   await page.locator('#mine-greeting').getByText('Hola, Ana',{exact:true}).waitFor();
   await page.locator('#mine-count-active').getByText('5',{exact:true}).waitFor();
   await page.locator('#mine-count-history').getByText('5',{exact:true}).waitFor();
   await page.waitForTimeout(400);
   const initial=await page.locator('#mine-list a.via-booking-card:visible').count();
   assert(initial>0&&initial<=5,'Visible cards must be paginated');
   assert(await page.locator('#mine-list a.via-booking-card').count()===5,'Five bookings in active tab');
   await verifyLayout(page,'active '+device+' '+width+'x'+height);
   if(initial<5){
    assert(await page.locator('.via-mine-pager').isVisible(),'Pager must be shown');
    const value=await page.locator('[data-page-count]').innerText();
    assert(value.includes('de 5'),value);
    await page.locator('.via-mine-pager button').last().click();
    await page.waitForTimeout(200);
    const valueNext=await page.locator('[data-page-count]').innerText();
    assert(valueNext!==value,'Next page did not work');
    await verifyLayout(page,'next '+device+' '+width+'x'+height);
   }
   await page.locator('#mine-tab-history').click();await page.waitForTimeout(200);
   assert.equal(await page.locator('#mine-count-history').innerText(),'5');
   assert(await page.locator('#mine-list a.via-booking-card:visible').count()>0);
   await verifyLayout(page,'history '+device+' '+width+'x'+height);
  }else{
   await page.locator('#mine-existing').waitFor({state:'visible'});
   await page.locator('#mine-existing').click();await page.waitForTimeout(150);
   assert(await page.locator('#mine-login-card').isVisible());
   assert(await page.locator('#mine-login-passkey').isVisible());
   assert(await page.locator('#mine-login-send').isVisible());
   if(device==='ios'){
    assert.equal(await page.locator('#mine-login-passkey').innerText(),'Usar biometría');
    assert((await page.locator('#mine-login-passkey').getAttribute('aria-label')).includes('Face ID'));
   }else{
    assert.equal(await page.locator('#mine-login-passkey').innerText(),'Entrar con huella');
   }
   await verifyLayout(page,'login '+device+' '+width+'x'+height);
  }
  if(device==='ios'&&width===390&&loggedIn)await page.screenshot({path:'mine-v2917-proof/ios-390.png'});
  if(device==='android'&&width===390&&loggedIn)await page.screenshot({path:'mine-v2917-proof/android-390.png'});
  assert.deepEqual(errors,[],'Page JS errors: '+errors.join('; '));
  assert(!calls.some(x=>/login\/start|auth\/start|\/api\/requests\//.test(x)),'No real operations expected');
  console.log('MINE_V2917_QA_PASS',engine===webkit?'webkit':'chromium',device,width,height,loggedIn?'account':'login');
  passed++;
 }finally{await ctx.close();await browser.close()}
}
async function verifyLayout(page,label){
 const result=await page.evaluate(()=>{
  const r=e=>e?.getBoundingClientRect();
  const list=document.getElementById('mine-list');
  const visible=[...list.querySelectorAll('a.via-booking-card')].filter(e=>getComputedStyle(e).display!=='none');
  const body=r(document.querySelector('.app-shell')),region=r(list);
  const rects=visible.map(r);
  return {w:innerWidth,h:innerHeight,documentWidth:document.documentElement.scrollWidth,
   documentHeight:document.documentElement.scrollHeight,
   appBottom:body.bottom,listBottom:region.bottom,
   cardBottoms:rects.map(x=>x.bottom),cardTops:rects.map(x=>x.top),
   pagerRect:r(document.querySelector('.via-mine-pager')),
   topRect:r(document.querySelector('.topbar'))};
 });
 assert(result.documentWidth<=result.w+1,label+' horizontal overflow '+JSON.stringify(result));
 assert(result.appBottom<=result.h+3,label+' app does not fit viewport '+JSON.stringify(result));
 assert(result.cardBottoms.every(v=>v<=result.listBottom+3),label+' booking clipped '+JSON.stringify(result));
 // The app-shell prevents page movement. The footer is intentionally hidden.
 const screen=await page.evaluate(()=>({scrollTop:document.documentElement.scrollTop,overflow:getComputedStyle(document.body).overflow}));
 assert(screen.overflow==='hidden',label+' page scroll not disabled');
}
for(const [engine,device,w,h,user] of [
 [chromium,'android',320,640,false],
 [chromium,'android',360,740,true],
 [chromium,'android',390,844,true],
 [chromium,'android',412,915,true],
 [webkit,'ios',375,667,false],
 [webkit,'ios',390,844,true],
 [webkit,'ios',430,932,true],
 ]){
 await runTest(engine,device,h,w,user);
}
console.log('VIA_MINE_V2917_QA_ALL_PASSED',passed);
