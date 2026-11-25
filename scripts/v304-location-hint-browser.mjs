import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const b=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 const input=p.locator('#home-origin'),tip=p.locator('#via-location-hint');
 await p.waitForSelector('#via-location-hint-script',{state:'attached'});
 await input.click();await p.setViewportSize({width:390,height:440});
 await tip.waitFor({state:'visible',timeout:5000});await p.waitForTimeout(400);
 const measure=()=>p.evaluate(()=>{const v=window.visualViewport,el=document.activeElement,row=el.closest('.reference-field')?.getBoundingClientRect()||el.getBoundingClientRect(),b=document.querySelector('#location-shortcut').getBoundingClientRect(),t=document.querySelector('#via-location-hint').getBoundingClientRect();return {width:b.width,height:b.height,rowTop:row.top,rowBottom:row.bottom,tipTop:t.top,tipBottom:t.bottom,top:v?.offsetTop||0,bottom:(v?.offsetTop||0)+(v?.height||innerHeight)}});
 let m=await measure();assert(m.rowBottom<=m.bottom-16&&m.rowTop>=m.top&&m.tipTop>=m.top&&m.tipBottom<=m.bottom&&(m.tipBottom<m.rowTop||m.tipTop>m.rowBottom),JSON.stringify(m));assert(Math.abs(m.width-m.height)<1);
 await input.fill('Shopping');await tip.waitFor({state:'hidden'});
 await p.waitForFunction(()=>document.querySelectorAll('#address-suggestions .address-choice').length>0,undefined,{timeout:30000});
 await p.waitForTimeout(350);
 const bounds=await p.evaluate(()=>{const r=document.activeElement.closest('.reference-field').getBoundingClientRect(),s=document.querySelector('#address-suggestions').getBoundingClientRect(),v=window.visualViewport;return {rowTop:r.top,rowBottom:r.bottom,panelTop:s.top,panelBottom:s.bottom,top:v?.offsetTop||0,bottom:(v?.offsetTop||0)+(v?.height||innerHeight),visible:getComputedStyle(document.querySelector('#address-suggestions')).visibility}});
 assert(bounds.visible==='visible'&&bounds.panelBottom<=bounds.bottom+2&&bounds.panelTop>=bounds.top-2&&(bounds.panelBottom<=bounds.rowTop-8||bounds.panelTop>=bounds.rowBottom+8),JSON.stringify(bounds));
 await input.blur();await p.waitForTimeout(250);assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('via-address-editing')),false);
 console.log('VIA_HINT_KEYBOARD_PASS '+JSON.stringify({os,field:m,suggestions:bounds}));
 }finally{await b.close()}
}