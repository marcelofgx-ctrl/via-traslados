import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='https://via-traslados-v304-search-stage.marcelof-gx.workers.dev';
for(const [os,engine] of [['Android',chromium],['iOS',webkit]]){
 const b=await engine.launch({headless:true,...(os==='Android'?{args:['--no-sandbox']}:{})});
 try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const p=await ctx.newPage();let routes=0;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/public/route-preview')routes++});
 await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>window.ViaAddress&&window.ViaSearchLocation);
 await p.evaluate(()=>ViaSearchLocation.update(-34.85,-56.02));
 const input=p.locator('#home-destination');await input.fill('Costa urbana');
 const list=p.locator('#address-suggestions .address-choice');
 await p.waitForFunction(()=>document.querySelector('#address-suggestions .via-suggestion-distance'),undefined,{timeout:35000});
 const rows=await list.allTextContents();
 assert(/costa urbana/i.test(rows[0]||''),JSON.stringify(rows));
 assert.match(await list.first().locator('.via-suggestion-distance').innerText(),/^≈ /);
 assert.equal(routes,0);
 await input.fill('Mcdonalds');
 await p.waitForFunction(()=>/mcdonald/i.test(document.querySelector('#address-suggestions .address-choice')?.textContent||'')&&document.querySelectorAll('#address-suggestions .via-suggestion-distance').length>=2,undefined,{timeout:35000});
 const distances=await p.locator('#address-suggestions .via-suggestion-distance').allTextContents();
 const km=s=>Number(s.replace('≈ ','').replace(',','.').split(' ')[0])*(s.endsWith(' km')?1:.001);
 // Same brand branches should be distance ordered. Rounding may produce ties.
 for(let i=1;i<distances.length;i++)assert(km(distances[i-1])<=km(distances[i])+0.001,JSON.stringify(distances));
 assert.equal(routes,0);
 console.log('VIA_SEARCH_DISTANCE_PASS '+JSON.stringify({os,first:rows[0],distances,routeCalls:routes}));
 }finally{await b.close()}
}
