import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const b=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();
 await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForSelector('#via-location-hint-script',{state:'attached'});
 const input=p.locator('#home-origin'),tip=p.locator('#via-location-hint');
 await input.scrollIntoViewIfNeeded();await input.click();
 await tip.waitFor({state:'visible'});
 const m=await p.evaluate(()=>{const b=document.querySelector('#location-shortcut').getBoundingClientRect(),t=document.querySelector('#via-location-hint').getBoundingClientRect(),i=document.querySelector('#home-origin').getBoundingClientRect();return {width:b.width,height:b.height,tipBottom:t.bottom,inputTop:i.top,tipLeft:t.left,tipRight:t.right,viewport:innerWidth}});
 assert(Math.abs(m.width-m.height)<1&&m.width>=44&&m.tipBottom<m.inputTop&&m.tipLeft>=0&&m.tipRight<=m.viewport+1,JSON.stringify(m));
 await input.fill('P');await tip.waitFor({state:'hidden'});
 await input.fill('');await input.blur();await input.click();assert.equal(await tip.isVisible(),false);
 const p2=await ctx.newPage();await p2.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await p2.locator('#home-origin').click();await p2.locator('#via-location-hint').waitFor({state:'visible'});await p2.locator('#via-location-hint').waitFor({state:'hidden',timeout:6000});
 console.log('VIA_HINT_PASS '+JSON.stringify({os,...m}));
 }finally{await b.close()}
}