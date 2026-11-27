import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root='https://viatraslados.com';
const baseline='https://a27c6223-via-traslados-web-prod.marcelof-gx.workers.dev';
const local=new Map([['/app.js','application/javascript'],['/reserva.html','text/html'],['/via-driver-confirmation.js','application/javascript'],['/via-driver-confirmation.css','text/css']]);
const profile={name:'Pasajero QA',phone:'099000000',email:'qa@example.invalid'};
const token='a'.repeat(64);
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=480;c.height=360;const g=c.getContext('2d');g.fillStyle='#aecfc5';g.fillRect(0,0,480,360);g.fillStyle='#16443c';g.fillRect(40,50,400,210);return c.toDataURL('image/jpeg',.7).split(',')[1]});
 const booking={id:'VIA-QA-TEST',status:'confirmed',origin:'Origen QA',destination:'Destino QA',date:'2027-01-01',time:'10:00',passengers:1,bags:1,price:1000,route:{distanceKm:10,durationMinutes:15},driverProfile:{name:'Conductor QA',plate:'ABC1234',make:'Marca QA',model:'Modelo QA',color:'Blanco',reviewed:true,photos:{driver:jpeg,front:jpeg,rear:jpeg}}};
 let status='confirmed',reads=0,writes=0;
 await context.addInitScript(({token,profile})=>localStorage.setItem('via-customer-session-v1',JSON.stringify({sessionToken:token,expiresAt:Math.floor(Date.now()/1000)+3600,profile,passkeys:1})),{token,profile});
 await context.route('**/*',async r=>{
  const req=r.request(),u=new URL(req.url()),p=u.pathname,method=req.method();
  if(method==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':root,'access-control-allow-headers':'authorization,content-type,x-booking-token','access-control-allow-methods':'GET,OPTIONS'}});
  if(!['GET','HEAD'].includes(method)){writes++;return r.abort()}
  if(p==='/api/requests/VIA-QA-TEST'){reads++;return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':root},body:JSON.stringify({...booking,status,driverProfile:status==='confirmed'?booking.driverProfile:null})})}
  if(p==='/api/customer/me')return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':root},body:JSON.stringify({profile,passkeys:1})});
  if(p.startsWith('/api/')||u.origin!==root)return r.abort();
  if(local.has(p)){
   const headers={'content-type':local.get(p)};
   if(p==='/reserva.html'){
    const original=await fetch(baseline+p,{signal:AbortSignal.timeout(15000)});
    const csp=original.headers.get('content-security-policy');if(csp)headers['content-security-policy']=csp;
   }
   return r.fulfill({status:200,headers,body:readFileSync('v36-web-qa'+p)});
  }
  const res=await fetch(baseline+p+u.search,{signal:AbortSignal.timeout(15000)});
  return r.fulfill({status:res.status,contentType:res.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await res.arrayBuffer())});
 });
 await page.goto(root+'/reserva.html?id=VIA-QA-TEST',{waitUntil:'domcontentloaded'});
 const card=page.locator('.via-driver-profile');
 await card.waitFor({timeout:18000});
 assert.match(await card.innerText(),/Conductor QA/);assert.match(await card.innerText(),/ABC 1234/);
 await page.waitForFunction(()=>[...document.querySelectorAll('.via-driver-profile img')].length===3&&[...document.querySelectorAll('.via-driver-profile img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:10000});
 status='cancelled';await page.locator('#refresh-status').click();await card.waitFor({state:'detached',timeout:12000});
 assert(reads>=2);assert.equal(writes,0);console.log('VIA_V36_WEB_CONFIRMATION_PASS '+name);
 await context.close();
 }finally{await browser.close()}
}
