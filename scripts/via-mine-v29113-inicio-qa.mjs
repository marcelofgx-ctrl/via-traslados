/* Vía Traslados V29.1.13: true text-clipping regression for Inicio on mobile.
 * Uses real Stage HTML and live v29.1.12 baseline. All customer API calls mocked.
 * NO real customer, OTP, booking or database writes. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';
const STAGE='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const PROD='https://viatraslados.com';
const OUT='via-v29113-inicio-proof';
const UA={
 android:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
 ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
};
const profile={name:'Ana de prueba',phone:'099000000',email:'ana@example.invalid'};
const session={sessionToken:'a'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+7200,profile};
const statuses=['confirmed','accepted','quoted','requested','en_route','requested','completed','cancelled','completed','cancelled'];
const entries=statuses.map((status,i)=>({id:'qa-visual-only-'+i,
 origin:'Cerca de AVENIDA ITALIA 5781, Montevideo',
 destination:'Aeropuerto de Carrasco',
 date:'2026-11-'+String(18+i).padStart(2,'0'),time:'10:00',
 status,price:i===0?7000:850,route:{distanceKm:10.2},passengers:2}));
await mkdir(OUT,{recursive:true});
function routeMock(origin){
 return async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/customer/me')return route.fulfill({status:200,json:{profile,passkeys:1,expiresAt:session.expiresAt}});
  if(u.pathname==='/api/customer/bookings')return route.fulfill({status:200,json:entries});
  if(u.pathname==='/api/customer/logout')return route.fulfill({status:200,json:{signedOut:true}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Visual QA only'}});
  if(u.origin!==origin)return route.abort();
  return route.continue();
 };
}
async function measure(page){
 return page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const button=document.querySelector('.top-link'),label=button.querySelector('.via-home-label');
  const range=document.createRange();range.selectNodeContents(label);
  const text=rect(range);const btn=rect(button);
  const brand=rect(document.querySelector('.brand.brand-clean'));
  const cs=getComputedStyle(button),ls=getComputedStyle(label);
  return {button:btn,text,brand,txt:label.textContent.trim(),href:button.getAttribute('href'),
   width:innerWidth,height:innerHeight,clientWidth:button.clientWidth,
   scrollWidth:button.scrollWidth,overflow:cs.overflowX,font:ls.fontSize,
   bodyOverflow:getComputedStyle(document.body).overflow,
   documentWidth:document.documentElement.scrollWidth,
   documentHeight:document.documentElement.scrollHeight,
   appBottom:document.querySelector('.app-shell').getBoundingClientRect().bottom,
   icon:!!button.querySelector('.via-home-arrow svg'),divider:!!button.querySelector('.via-home-divider'),
   noWhiteFrame:getComputedStyle(document.querySelector('.status-card.via-mine-main')).boxShadow==='none',
   tabVisible:!!document.querySelector('.via-mine-tabs'),account:document.body.classList.contains('mine-account')
  };
 });
}
function verify(info,where){
 assert.equal(info.txt,'Inicio',where+' visible text changed');
 assert(info.href&&/index\.html|^\.\/?$|^\/$/.test(info.href),where+' incorrect target '+info.href);
 assert(info.icon&&info.divider,where+' missing icon or divider');
 assert(info.brand.right+3<=info.button.left,where+' brand and Inicio collide '+JSON.stringify(info));
 assert(info.button.right<=info.width+1,where+' Inicio outside screen '+JSON.stringify(info));
 assert(info.text.left>=info.button.left+2,where+' leading glyph clipped '+JSON.stringify(info));
 assert(info.text.right<=info.button.right-2,where+' trailing glyph clipped '+JSON.stringify(info));
 assert(info.scrollWidth<=info.clientWidth+1,where+' button content scroll overflows '+JSON.stringify(info));
 assert(info.documentWidth<=info.width+1,where+' horizontal document scroll '+JSON.stringify(info));
 assert.equal(info.bodyOverflow,'hidden',where+' page gained scroll');
 assert(info.appBottom<=info.height+3,where+' app-shell clipped by browser');
 assert(info.noWhiteFrame,where+' white frame regression');
}
let passed=0;
async function run(os,w,h,loggedIn,largeText=false){
 const engine=os==='ios'?webkit:chromium;
 const browser=await engine.launch(os==='android'?{channel:'chrome',headless:true,args:['--no-sandbox']}:{headless:true});
 const context=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},deviceScaleFactor:2,
  isMobile:true,hasTouch:true,userAgent:UA[os],serviceWorkers:'block'});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(loggedIn)await page.addInitScript(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),session);
 await page.route('**/*',routeMock(STAGE));
 try{
  await page.goto(STAGE+'/mis-reservas.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('via-mine-v29110'));
  if(loggedIn){
   await page.locator('#mine-greeting').getByText('¡Hola, Ana!',{exact:true}).waitFor();
   await page.locator('#mine-count-active').getByText('6',{exact:true}).waitFor();
   await page.locator('#mine-list a.via-booking-card').first().waitFor();
   await page.waitForTimeout(220);
  }else{
   await page.locator('#mine-existing').click();
   await page.locator('#mine-login-phone').waitFor({state:'visible'});
  }
  if(largeText)await page.locator('.top-link .via-home-label').evaluate(el=>el.style.setProperty('font-size','18px','important'));
  const info=await measure(page);verify(info,os+' '+w+'x'+h+(largeText?' enlarged':''));
  if(loggedIn){
   assert(info.account,'Account panel not loaded');
   const count=await page.locator('#mine-list a.via-booking-card').count();
   assert.equal(count,6,'Real simulated booking list count changed');
   const shown=await page.locator('#mine-list a.via-booking-card:visible').count();
   assert(shown>=1&&shown<=5,'Original pagination did not adapt');
   assert((await page.locator('[data-page-count]').innerText()).includes('de 6'),'Page count changed');
   const before=await page.locator('[data-page-count]').innerText();
   await page.locator('.via-mine-pager button').last().click();
   await page.waitForTimeout(130);
   assert.notEqual(await page.locator('[data-page-count]').innerText(),before,'Next pagination broken');
   await page.locator('#mine-tab-history').click();
   await page.locator('#mine-count-history').getByText('4',{exact:true}).waitFor();
   if((w===390&&os==='android')||(w===375&&os==='ios')){
    const base=await context.newPage();
    await base.addInitScript(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),session);
    await base.route('**/*',routeMock(PROD));
    await base.goto(PROD+'/mis-reservas.html',{waitUntil:'domcontentloaded'});
    await base.locator('#mine-greeting').getByText('¡Hola, Ana!',{exact:true}).waitFor();
    await base.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-before-v29112.png',fullPage:false});
    const backgrounds=async p=>p.evaluate(()=>{
      const bg=q=>getComputedStyle(document.querySelector(q)).backgroundImage.replaceAll(location.origin,'');
      return {logo:bg('.brand-monogram'),welcome:bg('.known-customer'),cards:bg('.via-booking-card'),arrow:bg('.via-booking-card__arrow')}
    });
    await page.locator('#mine-tab-active').click();
    await page.waitForTimeout(130);
    const [a,b]=await Promise.all([backgrounds(base),backgrounds(page)]);
    assert.deepEqual(b,a,'Other approved visual surfaces changed');
    await base.close();
   }
  }
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-'+(loggedIn?'reservas':'guest')+(largeText?'-large-text':'')+'.png',fullPage:false});
  await page.locator('.top-link').click();
  await page.waitForURL(u=>u.pathname==='/'||u.pathname==='/index.html',{timeout:10000});
  assert.deepEqual(errors,[],'JavaScript page errors '+errors.join('; '));
  console.log('VIA_V29113_INICIO_VISIBLE_QA_PASS '+JSON.stringify({os,w,h,loggedIn,largeText,
   buttonWidth:+info.button.width.toFixed(2),textRight:+info.text.right.toFixed(2),
   innerRight:+info.button.right.toFixed(2),scrollWidth:info.scrollWidth,clientWidth:info.clientWidth}));
  passed++;
 }finally{await context.close();await browser.close();}
}
for(const t of [
 ['android',320,640,true],['android',360,740,true],['android',390,844,true],
 ['android',412,915,true],['android',360,680,true],
 ['ios',375,667,true],['ios',390,844,true],['ios',430,932,true],
 ['android',320,640,true,true],['ios',375,667,true,true],
 ['android',360,450,false],['ios',375,490,false]
])await run(...t);
console.log('VIA_V29113_ALL_MOBILE_CASES_PASSED '+passed);
