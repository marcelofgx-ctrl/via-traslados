// QA V29.1.9: verifies the approved header is present, visible, clickable and
// does not collide with controls on iOS/Android, including with keyboard open.
// All APIs are blocked in this isolated QA worker. Never sends OTP or real bookings.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';
const STAGE='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const UA_ANDROID='Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const UA_IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
await mkdir('mine-v2919-proof',{recursive:true});
let n=0;
function margin(a,b){return +(b-a).toFixed(2)}
async function check(os,w,h,focused){
 const engine=os==='ios'?webkit:chromium;
 const browser=await engine.launch(os==='ios'?{headless:true}:{headless:true,channel:'chrome',args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},
  isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',
  userAgent:os==='ios'?UA_IOS:UA_ANDROID});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==STAGE)return route.abort();
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'isolated QA'}});
  return route.continue();
 });
 try {
  await page.goto(STAGE+'/mis-reservas.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('via-mine-v2918'));
  await page.locator('#mine-login-card').waitFor({state:'visible'});
  await page.locator('#mine-login-phone').evaluate(el=>el.blur());
  if(focused){await page.locator('#mine-login-phone').focus();await page.locator('#mine-login-phone').fill('094842756');}
  await page.waitForTimeout(180);
  const results=await page.evaluate(()=>{
   const rectangle=selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null};
   const brand=document.querySelector('.brand.brand-clean'),logo=document.querySelector('.brand-monogram');
   const link=document.querySelector('.top-link'),body=document.body;
   const linkCSS=getComputedStyle(link),logoCSS=getComputedStyle(logo);
   const text=(brand?.textContent||'').trim(),linkText=(link?.textContent||'').trim();
   return {
    os:body.dataset.mobileOs,focus:body.classList.contains('mine-input-focus'),
    brandText:text,linkText,linkHref:link?.getAttribute('href')||'',linkLabel:link?.getAttribute('aria-label')||'',
    logoSource:logoCSS.backgroundImage,logoSize:rectangle('.brand-monogram'),
    buttonStyle:{borderRadius:linkCSS.borderRadius,bg:linkCSS.backgroundImage,color:linkCSS.color},
    brand:rectangle('.brand.brand-clean'),link:rectangle('.top-link'),
    header:rectangle('.topbar'),card:rectangle('.status-card.via-mine-main'),
    phone:rectangle('#mine-login-phone'),passkey:rectangle('#mine-login-passkey'),email:rectangle('#mine-login-send'),
    scrollWidth:document.documentElement.scrollWidth,innerWidth,innerHeight,
    bodyOverflow:getComputedStyle(body).overflow,
   };
  });
  assert.equal(results.os,os);
  assert.equal(results.linkText,'→Inicio','Header text/arrow changed');
  assert(results.brandText.toLowerCase().includes('vía')&&results.brandText.toLowerCase().includes('traslados'));
  assert(results.linkLabel==='Volver al inicio'&&results.linkHref==='./index.html');
  assert(results.logoSource.includes('mine-brand-v2919.svg'),'Old V mark remained in header');
  assert(results.buttonStyle.bg.includes('gradient'),'Inicio must use approved premium gradient');
  assert(parseFloat(results.buttonStyle.borderRadius)>30,'Inicio must be pill shaped');
  assert(results.link.width>=75&&results.link.height>=32,'Inicio button too small');
  assert(results.logoSize.width>=34,'Corporate V mark too small');
  assert(results.brand.right+2<=results.link.left,'Brand collides with Inicio '+JSON.stringify(results));
  assert(results.link.right<=results.innerWidth+1,'Inicio cropped '+JSON.stringify(results));
  assert(results.scrollWidth<=results.innerWidth+1,'Horizontal page scroll '+JSON.stringify(results));
  assert(results.bodyOverflow==='hidden','Body should remain no-scroll');
  assert(results.phone.bottom<=results.innerHeight+1,'Phone input hidden by keyboard');
  assert(results.passkey.bottom<=results.innerHeight+1&&results.email.bottom<=results.innerHeight+1,
   'Login actions clipped by keyboard '+JSON.stringify(results));
  assert(results.passkey.bottom<=results.card.bottom+2&&results.email.bottom<=results.card.bottom+2,
   'Login actions clipped by card '+JSON.stringify(results));
  if(focused)assert(results.focus,'Keyboard focus mode was not activated');
  if(w===390){
   const path='mine-v2919-proof/'+os+'-'+(focused?'keyboard':'standard')+'.png';
   await page.screenshot({path,fullPage:false});
  }
  assert.deepEqual(errors,[],'Browser JS errors');
  console.log('VIA_V2919_BRAND_UI_PASS',os,w,h,focused?'keyboard':'normal',
   JSON.stringify({logo:results.logoSize.width,button:results.link.width,clearance:margin(results.brand.right,results.link.left)}));
  n++;
 } finally {await ctx.close();await browser.close();}
}
for(const [os,w,h,focused] of [
 ['android',390,820,false],['android',390,430,true],
 ['android',320,640,false],['android',360,455,true],
 ['ios',390,844,false],['ios',390,460,true],
 ['ios',375,667,false],['ios',430,932,false]
])await check(os,w,h,focused);
console.log('VIA_MINE_V2919_BRAND_QA_ALL_PASSED',n);
