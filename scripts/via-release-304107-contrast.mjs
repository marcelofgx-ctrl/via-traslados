import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const mode=process.argv[2],root='https://viatraslados.com';
const url=mode==='prod'?root:JSON.parse(readFileSync('v30410-visual/release-candidate.json','utf8')).preview;
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
 try{for(const scheme of ['light','dark']){
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2.8125,colorScheme:scheme,serviceWorkers:'block'});
 await c.route('**/*',async r=>{const q=r.request(),u=new URL(q.url());if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(q.method()))return r.abort();if(u.origin===root){if(mode==='prod')return r.continue();const res=await fetch(url+u.pathname+u.search,{signal:AbortSignal.timeout(20000)});return r.fulfill({status:res.status,contentType:res.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await res.arrayBuffer())})}if(/^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname))return r.continue();return r.abort()});
 const p=await c.newPage();await p.goto(root+'/index.html',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.ViaAddress&&document.documentElement.dataset.viaFinish==='premium');
 await p.waitForFunction(()=>getComputedStyle(document.getElementById('start-booking')).backgroundImage.includes('25, 118, 107'));
 const m=await p.evaluate(()=>{
 const selectors=['.reference-field strong','.reference-option strong','.highlight span','.reference-reservations','.reference-tabs a.selected','#start-booking'];
 const arr=selectors.map(s=>{const e=document.querySelector(s);if(!e)return null;let a=e;while(a&&getComputedStyle(a).backgroundImage==='none')a=a.parentElement;const st=getComputedStyle(e),bg=a?getComputedStyle(a).backgroundImage:'none';return {s,color:st.color,bg,visible:e.getBoundingClientRect().width>0}});
 return {version:document.getElementById('via-visible-release')?.textContent.trim(),width:innerWidth,scroll:document.documentElement.scrollWidth,items:arr};
 });
 assert.equal(m.version,'V30.4.10.7');assert(m.scroll<=m.width);assert(m.items.every(x=>x&&x.visible));console.log('VIA_VISUAL_CONTRAST_DIAGNOSTIC '+JSON.stringify({name,scheme,mode,...m}));
 // Contrast against opaque representative gradient stops (conservative: every listed stop).
 const rgb=s=>{const x=s.match(/rgba?\(([^)]+)\)/);return x?x[1].split(/,\s*/).map(Number):null};
 const lum=a=>a.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 for(const item of m.items){const fg=rgb(item.color);const stops=[...item.bg.matchAll(/rgba?\([^)]*\)/g)].map(x=>rgb(x[0])).filter(x=>x&&((x[3]??1)>=.65));assert(fg&&stops.length,'Unmeasured contrast '+item.s);const candidates=item.s==='#start-booking'?stops.flatMap(x=>[x,x.slice(0,3).map(c=>c*.90+255*.10)]):stops;const min=Math.min(...candidates.map(x=>{const a=lum(fg),b=lum(x);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}));console.log('VIA_CONTRAST_RATIO '+JSON.stringify({name,scheme,mode,element:item.s,minimum:Number(min.toFixed(2))}));assert(min>=4.5,'Potential text contrast below 4.5:1 '+scheme+' '+item.s+' '+min.toFixed(2))}
 await p.screenshot({path:'v30410-visual/evidence/'+mode+'-'+name+'-'+scheme+'.png',animations:'disabled'});await c.close();
 }}finally{await b.close()}
}
