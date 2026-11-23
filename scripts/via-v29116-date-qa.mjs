/* Vía Traslados V29.1.16: mobile date display fully readable.
 * Native date remains accessible, interactive and the sole source of truth.
 * All APIs/D1 are blocked in QA. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';
const QA='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const OUT='via-v29116-date-proof';
await mkdir(OUT,{recursive:true});
const UA={
 android:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
 ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
};
let pass=0;
for(const [os,w,h] of [['android',320,640],['android',360,740],['android',390,844],['android',412,915],
                      ['ios',320,640],['ios',375,667],['ios',390,844],['ios',430,932]]){
 const browser=await (os==='ios'?webkit:chromium).launch(os==='ios'?{headless:true}:{channel:'chrome',headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:w,height:h},screen:{width:w,height:h},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:UA[os],locale:'es-UY'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin===QA&&u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA isolated'}});
  if(u.origin===QA)return route.continue();
  return route.abort();
 });
 try{
  await page.goto(QA+'/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#via-home-date-display').waitFor({state:'visible',timeout:14000});
  assert((await page.locator('#via-release-indicator').innerText()).includes('29.1.16'),'Wrong QA version');
  const input=page.locator('#home-date');
  assert.equal(await input.getAttribute('type'),'date','Native date picker removed');
  await input.fill('2026-12-19');
  await page.waitForFunction(()=>document.querySelector('#via-home-date-display')?.textContent==='19/12/2026');
  const m=await page.evaluate(()=>{
   const out=document.querySelector('#via-home-date-display'),input=document.querySelector('#home-date');
   const label=out.closest('.reference-option'),style=getComputedStyle(out),box=out.getBoundingClientRect();
   const c=document.createElement('canvas'),ctx=c.getContext('2d');ctx.font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
   const textWidth=ctx.measureText(out.textContent).width;
   const native=input.getBoundingClientRect();
   const hit=document.elementFromPoint(native.left+native.width/2,native.top+native.height/2);
   return {date:out.textContent,iso:input.value,dataIso:out.dataset.iso,textWidth,
    displayWidth:box.width,displayRight:box.right,cardRight:label.getBoundingClientRect().right,
    font:style.font,nativeType:input.type,nativeClickable:hit===input||input.contains(hit),
    nativeValid:input.checkValidity(),horizontalOverflow:document.documentElement.scrollWidth-innerWidth,
    inputOpacity:getComputedStyle(input).opacity};
  });
  assert(m.date==='19/12/2026'&&m.iso==='2026-12-19'&&m.dataIso===m.iso,
    'Date display and native input mismatch '+JSON.stringify(m));
  assert(m.textWidth<=m.displayWidth+1.2,'Date display cropped at '+os+' '+w+' '+JSON.stringify(m));
  assert(m.displayRight<=m.cardRight+1,'Date display exceeds card '+JSON.stringify(m));
  assert(m.nativeClickable,'Native date input not directly clickable '+JSON.stringify(m));
  assert(m.nativeValid,'Native date value invalid '+JSON.stringify(m));
  assert(m.horizontalOverflow<=2,'Horizontal scroll after date fix '+JSON.stringify(m));
  await page.screenshot({path:OUT+'/'+os+'-'+w+'x'+h+'-full-year.png',fullPage:false});
  await input.evaluate(el=>el.value='2027-01-20');
  await page.evaluate(()=>{
   const e=new Event('pageshow');Object.defineProperty(e,'persisted',{value:true});
   dispatchEvent(e);
  });
  await page.waitForFunction(()=>document.querySelector('#via-home-date-display')?.textContent==='20/01/2027');
  assert.equal(await input.inputValue(),'2027-01-20','Date overlay mutated native ISO');
  assert.deepEqual(errors,[],'Browser JS errors '+errors.join(';'));
  console.log('VIA_V29116_FULL_DATE_PASS '+JSON.stringify({os,w,h,...m}));
  pass++;
 }finally{await ctx.close();await browser.close()}
}
console.log('VIA_V29116_FULL_DATE_QA_ALL_PASS '+pass);
