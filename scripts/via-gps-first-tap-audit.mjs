import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root='https://viatraslados.com',base='https://b23d68ea-via-traslados-web-prod.marcelof-gx.workers.dev';
const lat=-34.83696,lng=-56.01638;
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
for(const scenario of ['first-empty','first-coarse','first-valid']){
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'});
 let calls=0;
 await c.addInitScript(({lat,lng,scenario})=>{
  let n=0;const fix=()=>({coords:{latitude:lat,longitude:lng,accuracy:scenario==='first-coarse'&&n===1?1800:12},timestamp:Date.now()});
  const g={getCurrentPosition(ok){n++;setTimeout(()=>ok(fix()),20)},watchPosition(ok){n++;setTimeout(()=>ok(fix()),20);return n},clearWatch(){}};
  Object.defineProperty(navigator,'geolocation',{value:g,configurable:true});
 },{lat,lng,scenario});
 await c.route('**/*',async r=>{
  const q=r.request(),u=new URL(q.url());
  if(u.pathname==='/api/direcciones'&&u.searchParams.get('mode')==='reverse'){
   calls++;
   const rows=scenario==='first-empty'&&calls===1?[]:[{street:'Avenida de las Américas 100',city:'Ciudad de la Costa',department:'Canelones',lat,lng,distanceMeters:8,source:'synthetic'}];
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:rows})});
  }
  if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(q.method())||u.origin!==root)return r.abort();
  const res=await fetch(base+u.pathname+u.search,{signal:AbortSignal.timeout(18000)});
  return r.fulfill({status:res.status,contentType:res.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await res.arrayBuffer())});
 });
 const p=await c.newPage();await p.goto(root+'/index.html',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>window.ViaAddress);
 const button=p.locator('#location-shortcut');
 const snap=async()=>p.evaluate(()=>({value:document.getElementById('home-origin').value,chosen:window.ViaAddress.get('home-origin'),feedback:document.getElementById('via-gps-feedback')?.textContent}));
 await button.click();await p.waitForFunction(()=>!document.getElementById('location-shortcut').disabled);const first=await snap();const count=calls;
 await button.click();await p.waitForFunction(()=>!document.getElementById('location-shortcut').disabled);const second=await snap();
 console.log('GPS_FIRST_TAP_REPRO '+JSON.stringify({scenario,first,second,firstReverseCalls:count,totalReverseCalls:calls}));
 assert(calls>0,'No reverse query intercepted');await c.close();
}
}finally{await b.close()}
