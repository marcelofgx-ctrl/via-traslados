// V29.1.8 QA: keyboard-open controls must remain accessible; page never scrolls.
// Synthetic CAPTCHA and account API mocks; never send emails or create reservations.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';
const stage=process.env.VIA_V2918_QA||'https://via-traslados-mine-v2918-stage.marcelof-gx.workers.dev';
await mkdir('mine-v2918-proof',{recursive:true});
let total=0;
const ios='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const android='Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
async function validate(browserName,w,h,typing){
 const engine=browserName==='ios'?webkit:chromium;
 const browser=await engine.launch(browserName==='ios'?{headless:true}:{headless:true,channel:'chrome',args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},
  isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:browserName==='ios'?ios:android,serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==stage)return route.abort();
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA no real API'}});
  return route.continue();
 });
 try{
  await page.goto(stage+'/mis-reservas.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('via-mine-v2918'));
  await page.locator('#mine-existing').click();
  await page.locator('#mine-login-card').waitFor({state:'visible'});
  await page.evaluate(()=>{
   // Simulate the real Turnstile 300x65 card when external services are blocked in QA.
   const captcha=document.getElementById('mine-turnstile');
   captcha.classList.remove('hidden');captcha.style.height='71px';
   const el=document.createElement('div');
   el.style.cssText='height:68px;width:min(300px,100%);border:1px solid #ddd;background:#f5f6f6;';
   el.textContent='Verificación de seguridad (simulada, sin clave ni correos)';
   el.style.fontSize='10px';captcha.append(el);
  });
  if(!typing){
   // The existing 'Ingresar' click intentionally autofocuses the input;
   // dismiss that focus to validate the keyboard-closed variant independently.
   await page.locator('#mine-login-phone').evaluate(e=>e.blur());
   await page.waitForTimeout(110);
  }
  if(typing){
   await page.locator('#mine-login-phone').focus();
   await page.locator('#mine-login-phone').fill('094842756');
   assert(await page.locator('body').evaluate(e=>e.classList.contains('mine-input-focus')),'Focus mode missing');
  }
  await page.waitForTimeout(200);
  const out=await page.evaluate(()=>{
   const rect=id=>{const r=document.querySelector(id)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}:null};
   const card=document.querySelector('.status-card.via-mine-main');
   const login=document.querySelector('#mine-login-card');
   return {
    width:innerWidth,height:innerHeight,
    documentWidth:document.documentElement.scrollWidth,
    documentHeight:document.documentElement.scrollHeight,
    bodyOverflow:getComputedStyle(document.body).overflow,
    guest:document.body.classList.contains('mine-guest'),
    keyboard:document.body.classList.contains('mine-input-focus'),
    card:rect('.status-card.via-mine-main'),
    input:rect('#mine-login-phone'),
    actions:rect('.mine-login-actions'),
    passkey:rect('#mine-login-passkey'),
    email:rect('#mine-login-send'),
    captcha:rect('#mine-turnstile'),
    loginScroll:login.scrollHeight>login.clientHeight+3,
    cardScroll:card.scrollHeight>card.clientHeight+3,
    loginOverflow:getComputedStyle(login).overflowY,
    cardOverflow:getComputedStyle(card).overflowY,
   };
  });
  assert(out.guest,'Guest mode not detected '+JSON.stringify(out));
  assert(out.documentWidth<=out.width+1,'Horizontal overflow '+JSON.stringify(out));
  assert(out.bodyOverflow==='hidden','Page must not scroll '+JSON.stringify(out));
  assert(out.input.top>=0&&out.input.bottom<=out.height+1,'Input hidden '+JSON.stringify(out));
  assert(out.passkey.bottom<=out.height+2&&out.email.bottom<=out.height+2,
    'Authentication buttons under keyboard / clipped '+JSON.stringify(out));
  assert(out.passkey.bottom<=out.card.bottom+2&&out.email.bottom<=out.card.bottom+2,
    'Authentication buttons clipped by inner container '+JSON.stringify(out));
  if(!typing&&h>=750){
   assert(out.card.height<620,'Large blank white login container is still present '+JSON.stringify(out));
   assert(!out.cardScroll,'Login should be naturally sized on normal viewport '+JSON.stringify(out));
   assert(out.captcha.bottom<=out.actions.top+4,'Captcha reordered unnecessarily');
  }
  if(typing){
   assert(out.keyboard,'Expected keyboard focus state');
   assert(out.actions.bottom<out.captcha.bottom+2,'Actions are hidden below captcha');
   await page.locator('#mine-login-phone').press('Enter');
   await page.waitForTimeout(120);
   assert(!(await page.locator('body').evaluate(e=>e.classList.contains('mine-input-focus'))),
    'Enter/Done did not leave focused mode');
  }
  if(w===390&&h>=750&&!typing)await page.screenshot({path:'mine-v2918-proof/'+browserName+'-guest-390.png',fullPage:false});
  if(w===390&&typing)await page.screenshot({path:'mine-v2918-proof/'+browserName+'-keyboard-390.png',fullPage:false});
  assert.deepEqual(errors,[],'JS errors: '+errors.join('; '));
  console.log('VIA_V2918_GUEST_QA_PASS',browserName,w,h,typing?'focus':'normal',JSON.stringify({cardH:out.card.height,passkeyY:out.passkey.bottom,emailY:out.email.bottom,cardScroll:out.cardScroll}));
  total++;
 }finally{await ctx.close();await browser.close()}
}
for(const [browserName,w,h,typing] of [
 ['android',390,790,false],['android',390,420,true],['android',360,450,true],
 ['android',320,640,false],['ios',390,790,false],['ios',390,450,true],
 ['ios',375,490,true],['ios',430,850,false],
])await validate(browserName,w,h,typing);
console.log('VIA_V2918_KEYBOARD_QA_ALL_PASSED '+total);
