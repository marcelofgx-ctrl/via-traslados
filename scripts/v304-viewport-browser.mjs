import {chromium,webkit} from 'playwright';import assert from 'node:assert/strict';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [name,engine] of [['Android',chromium],['iOS',webkit]]){
 const b=await engine.launch({headless:true,...(name==='Android'?{args:['--no-sandbox']}:{})});
 try{
  const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  const input=p.locator('#home-origin');await input.fill('Shopping');
  await p.waitForFunction(()=>document.querySelectorAll('#address-suggestions .address-choice').length>0,{},{timeout:30000});
  // Resized mobile viewport emulates keyboard-constrained height; not physical keyboard.
  await p.setViewportSize({width:390,height:440});
  await p.evaluate(()=>{const v=window.visualViewport;window.scrollBy(0,Math.max(0,document.querySelector('#home-origin').getBoundingClientRect().bottom-(v?.height||innerHeight)+32));});
  await p.waitForTimeout(500);
  const m=await p.evaluate(()=>{const r=document.querySelector('#home-origin').getBoundingClientRect(),s=document.querySelector('#address-suggestions').getBoundingClientRect(),v=window.visualViewport;return {inputTop:r.top,inputBottom:r.bottom,panelTop:s.top,panelBottom:s.bottom,top:v?.offsetTop||0,bottom:(v?.offsetTop||0)+(v?.height||innerHeight),visible:getComputedStyle(document.querySelector('#address-suggestions')).visibility}});
  console.log('VIA_V304_VIEWPORT '+JSON.stringify({name,...m}));
  assert(m.visible==='visible'&&m.panelBottom<=m.bottom+2&&m.panelTop>=m.top-2&&(m.panelBottom<=m.inputTop-8||m.panelTop>=m.inputBottom+8),'Suggestions overlap input or viewport');
 }finally{await b.close()}
}
