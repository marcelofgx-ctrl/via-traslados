import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const remote=process.argv[2]==='preview',root='https://viatraslados.com',stage='https://via-traslados-v30410-visual-qa.marcelof-gx.workers.dev',lat=-34.83696,lng=-56.01638;
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
 try{for(const reducedMotion of ['no-preference','reduce']){
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion});
 await c.addInitScript(({lat,lng})=>{
  const pending=new Map();let seq=0;
  const g={watchPosition(ok){const id=++seq;const ts=[setTimeout(()=>ok({coords:{latitude:lat,longitude:lng,accuracy:350},timestamp:Date.now()}),900),setTimeout(()=>ok({coords:{latitude:lat,longitude:lng,accuracy:12},timestamp:Date.now()}),2200)];pending.set(id,ts);return id},clearWatch(id){for(const t of pending.get(id)||[])clearTimeout(t);pending.delete(id)}};
  Object.defineProperty(navigator,'geolocation',{value:g,configurable:true});
  if(navigator.permissions)Object.defineProperty(navigator.permissions,'query',{value:async()=>({state:'granted'}),configurable:true});
 },{lat,lng});
 let reverseCalls=0;
 await c.route('**/*',async r=>{
  const q=r.request(),u=new URL(q.url()),p=u.pathname;
  if(p==='/api/direcciones'&&u.searchParams.get('mode')==='reverse'){reverseCalls++;await new Promise(x=>setTimeout(x,1100));return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:[{street:'Avenida de las Américas 100',city:'Ciudad de la Costa',department:'Canelones',lat,lng,distanceMeters:8,source:'synthetic'}]})}).catch(()=>{});}
  if(p.startsWith('/api/')||!['GET','HEAD'].includes(q.method()))return r.abort();
  if(remote&&u.origin===stage)return r.continue();
  if(!remote&&u.origin===root){const n=p.slice(1)||'index.html';if(!/^[\w./-]+$/.test(n)||n.includes('..'))return r.abort();try{const body=readFileSync('v30410-visual/assets/'+n),ext=n.split('.').pop(),type={html:'text/html',js:'application/javascript',mjs:'application/javascript',css:'text/css',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',woff2:'font/woff2',webmanifest:'application/manifest+json'}[ext]||'application/octet-stream';return r.fulfill({status:200,contentType:type,body})}catch{return r.abort()}}
  return r.abort();
 });
 const p=await c.newPage();await p.goto((remote?stage:root)+'/index.html',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.ViaAddress&&document.querySelector('#location-shortcut'));
 const button=p.locator('#location-shortcut'),note=p.locator('#via-gps-feedback');
 await button.click();
 if(await p.getByRole('button',{name:'Permitir ubicación',exact:true}).count())await p.getByRole('button',{name:'Permitir ubicación',exact:true}).click();
 for(const state of ['gps','precision','reverse']){
  await p.waitForFunction(s=>document.querySelector('#via-gps-feedback')?.dataset.viaWait===s,state,{timeout:12000});
  const rail=note.locator('.via-wait-track');assert(await rail.isVisible());assert.equal(await rail.getAttribute('aria-hidden'),'true');
  const info=await rail.evaluate(e=>({h:e.getBoundingClientRect().height,animation:getComputedStyle(e,'::after').animationName}));
  assert.equal(info.h,4);assert.equal(info.animation,reducedMotion==='reduce'?'none':'via-wait-satin');
  assert.equal(await button.getAttribute('aria-busy'),'true');
  if(state==='precision')assert.match(await note.innerText(),/350/);
  if(reducedMotion==='no-preference')await p.screenshot({path:'v30410-visual/evidence/'+(remote?'remote':'local')+'-wait-'+name+'-'+state+'.png',animations:'allow'});
 }
 await p.waitForFunction(()=>!document.getElementById('location-shortcut').disabled,{timeout:12000});
 assert.equal(reverseCalls,1);assert.equal(await note.locator('.via-wait-track').count(),0);
 assert.match(await p.locator('#home-origin').inputValue(),/Américas/);
 // Cancel by editing manually: no stale indicator or overwrite.
 await button.click();await p.waitForFunction(()=>document.querySelector('#via-gps-feedback')?.dataset.viaWait==='gps');
 await p.locator('#home-origin').fill('Dirección manual de prueba');
 await p.waitForFunction(()=>!document.getElementById('location-shortcut').disabled);
 assert.equal(await note.locator('.via-wait-track:visible').count(),0);
 assert.equal(await p.locator('#home-origin').inputValue(),'Dirección manual de prueba');
 console.log('VIA_WAIT_PASS '+JSON.stringify({name,reducedMotion,remote,states:['gps','precision','reverse'],cancel:true,synthetic:true}));
 await c.close();
 }}finally{await b.close()}
}
