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
 // Native Android Back is modeled by restoring visual height while focus is retained.
 assert.equal(await input.evaluate(e=>document.activeElement===e),true);
 await p.setViewportSize({width:390,height:844});
 await p.waitForFunction(()=>!document.body.classList.contains('via-address-editing')&&document.activeElement?.id!=='home-origin',undefined,{timeout:4000});
 assert.equal(await input.inputValue(),'Shopping');
 assert(await p.locator('.home-intro').isVisible());
 assert(await p.locator('.home-highlights').isVisible());
 // Reopen, choose a real suggestion, then dismiss keyboard. Selected coordinates must survive.
 await input.click();await p.setViewportSize({width:390,height:440});
 await input.fill('Nuevocentro');
 await p.waitForFunction(()=>[...document.querySelectorAll('#address-suggestions .address-choice')].some(e=>/nuevocentro/i.test(e.textContent)),undefined,{timeout:30000});
 await p.locator('#address-suggestions .address-choice').filter({hasText:/nuevocentro/i}).first().click();
 const selected=await p.evaluate(()=>({value:ViaAddress.get('home-origin'),selected:document.querySelector('#home-origin').dataset.addressSelected}));
 assert.equal(selected.selected,'true');assert(Number.isFinite(selected.value.lat)&&Number.isFinite(selected.value.lng));assert(/nuevocentro/i.test(selected.value.label));
 await p.setViewportSize({width:390,height:844});
 await p.waitForFunction(()=>!document.body.classList.contains('via-address-editing'),undefined,{timeout:4000});
 assert.deepEqual(await p.evaluate(()=>ViaAddress.get('home-origin')),selected.value);
 assert(await p.locator('.home-intro').isVisible());
 console.log('VIA_KEYBOARD_BACK_PASS '+JSON.stringify({os,restored:true,selectionPreserved:true}));
 console.log('VIA_HINT_KEYBOARD_PASS '+JSON.stringify({os,field:m,suggestions:bounds}));
 }finally{await b.close()}
}