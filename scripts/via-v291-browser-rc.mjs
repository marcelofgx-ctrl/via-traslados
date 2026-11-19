import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {chromium} from 'playwright-core';
const root=await realpath('via-v291-rc-build/assets');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 const target=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!target.startsWith(root+'/')){res.writeHead(403);res.end();return}
 try{
  const content=await readFile(target);
  res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(content);
 }catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
function profile(which){return {name:which==='a'?'Ana Prueba':'Bruno Prueba',phone:which==='a'?'099000091':'099000092',email:which+'@fake.invalid'}}
const token=which=>(which==='a'?'a':'b').repeat(64);
async function use(page,who){
 await page.evaluate(({who,profile,token})=>{
  window.ViaStore.saveCustomer({sessionToken:token,expiresAt:Math.floor(Date.now()/1000)+3600,profile});
 },{who,profile:profile(who),token:token(who)});
}
function fakeAPI(page){
 return page.route('**/api/customer/**',route=>{
  const req=route.request();
  const auth=req.headers()['authorization']||'';
  const who=auth.includes(token('b'))?'b':'a';
  const path=new URL(req.url()).pathname;
  const json=path==='/api/customer/me'?{profile:profile(who),passkeys:0}:
    path==='/api/customer/bookings'?[]:{signedOut:true};
  return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','content-type':'application/json'},body:JSON.stringify(json)});
 });
}
try{
 for(const width of [320,360,390,412]){
  const context=await browser.newContext({viewport:{width,height:800},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await fakeAPI(page);
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#via-home-account-invite').waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('#via-home-user-greeting').isVisible(),false,'No debería saludar sin sesión');
  assert.equal(await page.locator('a.reference-reservations').count(),1);
  assert.equal(await page.locator('#via-maestro-qa-access').count(),0,'Herramientas QA filtradas');
  await use(page,'a');
  await page.waitForFunction(()=>document.getElementById('via-home-user-name')?.textContent==='Ana',null,{timeout:12000});
  assert.equal(await page.locator('#via-home-account-invite').isVisible(),false);
  await use(page,'b');
  await page.waitForFunction(()=>document.getElementById('via-home-user-name')?.textContent==='Bruno',null,{timeout:12000});
  await page.locator('a.reference-reservations').click();
  await page.waitForURL(/mis-reservas/,{waitUntil:'domcontentloaded'});
  await page.locator('#mine-welcome').waitFor({state:'visible',timeout:12000});
  assert.match(await page.locator('#mine-greeting').textContent(),/Bruno/);
  assert.equal(await page.locator('#mine-login-card').isVisible(),false);
  await page.locator('#mine-logout').click();
  await page.locator('#mine-welcome').waitFor({state:'hidden',timeout:12000});
  assert.equal(await page.locator('#mine-entry-hero').isVisible(),true);
  assert.equal(await page.locator('#mine-login-card').isVisible(),false);
  assert.equal(await page.locator('#mine-signup-card').isVisible(),false);
  await page.locator('#mine-new').click();
  assert.equal(await page.locator('#mine-signup-card').isVisible(),true);
  assert.equal(await page.locator('#mine-login-card').isVisible(),false);
  assert.equal((await page.locator('#mine-login-phone').inputValue()),'');
  await page.goto(base+'/mis-reservas.html?accion=registro',{waitUntil:'domcontentloaded'});
  await page.locator('#mine-signup-card').waitFor({state:'visible',timeout:10000});
  assert.equal(await page.locator('#mine-login-card').isVisible(),false);
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#via-home-account-invite').waitFor({state:'visible',timeout:10000});
  const dimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert(dimensions.scroll<=dimensions.client+2,'Scroll horizontal '+width+': '+JSON.stringify(dimensions));
  assert.equal(errors.length,0,'JS errors '+errors.join('; '));
  console.log('VIA_V291_BROWSER_RC_OK '+JSON.stringify({width,guest:true,ana:true,bruno:true,logout:true,signup:true,scroll:false}));
  await context.close();
 }
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
