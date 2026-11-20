import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,readFile} from 'node:fs/promises';
const base=process.env.MINE_TEST_URL||'https://via-traslados-mine-access-qa.marcelof-gx.workers.dev/';
const local=process.env.MINE_LOCAL_ASSETS;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,channel:process.env.CHROME_BIN?undefined:'chrome',headless:true,args:['--no-sandbox']});
const account=(letter,name)=>({sessionToken:letter.repeat(64),expiresAt:Math.floor(Date.now()/1000)+86400,profile:{name,email:letter+'@example.invalid',phone:'099000000'}});
let passed=0;
await mkdir('mine-v2916-proof',{recursive:true});
async function setup(width=390,session=null,mode='valid'){
 const ctx=await browser.newContext({viewport:{width,height:850},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 let release;
 const barrier=new Promise(r=>{release=r});
 if(session)await page.addInitScript(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),session);
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push(u.pathname);
  if(u.pathname==='/api/customer/me'){
   if(mode==='delayed')await barrier;
   if(mode==='401')return route.fulfill({status:401,json:{error:'Sesión vencida'}});
   if(mode==='offline')return route.abort();
   const token=route.request().headers().authorization?.slice(7)||'';
   const live=token===account('b','Beatriz').sessionToken?account('b','Beatriz'):account('a','Ana');
   return route.fulfill({status:200,json:{ok:true,profile:live.profile,passkeys:1}});
  }
  if(u.pathname==='/api/customer/bookings')return route.fulfill({status:200,json:[]});
  if(u.pathname==='/api/customer/logout')return route.fulfill({status:200,json:{ok:true}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA sin operaciones reales'}});
  if(local&&u.origin===new URL(base).origin){
   const name=u.pathname.replace(/^\//,'')||'index.html';
   try{return route.fulfill({status:200,body:await readFile(local+'/'+name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html'})}
   catch{return route.fulfill({status:404,body:''})}
  }
  if(u.origin!==new URL(base).origin)return route.abort();
  return route.continue();
 });
 await page.goto(base+'mis-reservas.html',{waitUntil:'domcontentloaded'});
 return {ctx,page,errors,requests,release};
}
const visible=async(p,id)=>p.locator('#'+id).isVisible();
async function noGuestWelcome(page){assert.equal(await visible(page,'mine-welcome'),false,'No mostrar Sesión segura a invitados');}
async function noOverflow(page){const v=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(v.scroll<=v.width+1,JSON.stringify(v));}
try{
 for(const width of [320,360,390,412]){
  const {ctx,page,errors}=await setup(width);
  await page.locator('#mine-existing').waitFor({state:'visible'});
  await noGuestWelcome(page);await noOverflow(page);
  assert.equal(await page.locator('#mine-existing').innerText(),'Ingresar');
  assert.equal(await page.locator('#mine-new').innerText(),'Crear cuenta');
  const style=await page.locator('#mine-existing').evaluate(e=>({height:e.getBoundingClientRect().height,radius:getComputedStyle(e).borderRadius}));
  assert(style.height>=50&&parseInt(style.radius)>=10,'Estilos de acceso cargados');
  await page.locator('#mine-new').click();
  assert(await visible(page,'mine-signup-card'));assert.equal(await visible(page,'mine-login-card'),false);await noGuestWelcome(page);
  await page.locator('#mine-existing').click();
  assert(await visible(page,'mine-login-card'));assert.equal(await visible(page,'mine-signup-card'),false);await noOverflow(page);
  assert.deepEqual(errors,[]);
  if(width===390)await page.screenshot({path:'mine-v2916-proof/ingresar-390.png',fullPage:true});
  await ctx.close();console.log('MINE_PASS guest/login/signup '+width);passed++;
 }
 for(const mode of ['valid','401','offline','delayed']){
  const {ctx,page,errors,requests,release}=await setup(390,account('a','Nombre guardado'),mode);
  if(mode==='delayed'){
   await page.locator('#mine-session-status').waitFor({state:'visible'});
   await noGuestWelcome(page);
   assert(!(await page.locator('body').innerText()).includes('Nombre guardado'));
   assert(!requests.includes('/api/customer/bookings'),'No consultar reservas antes de validar');
   release();
  }
  if(mode==='401'||mode==='offline'){
   await page.locator('#mine-existing').waitFor({state:'visible'});await noGuestWelcome(page);
   assert(!(await page.locator('body').innerText()).includes('Nombre guardado'));
  }else{
   await page.locator('#mine-greeting').getByText('Hola, Ana',{exact:true}).waitFor();
   assert.equal(await visible(page,'mine-identity-choice'),false);
   assert.equal(await visible(page,'mine-login-card'),false);
   assert.equal(await visible(page,'mine-signup-card'),false);
   await page.locator('#mine-logout').click();
   await page.locator('#mine-existing').waitFor({state:'visible'});await noGuestWelcome(page);
   assert(!(await page.locator('body').innerText()).includes('Hola, Ana'));
  }
  assert.deepEqual(errors,[]);await ctx.close();console.log('MINE_PASS identity '+mode);passed++;
 }
 // Una respuesta demorada de A no puede volver a mostrarla tras cambiar a B.
 {
  const {ctx,page,release}=await setup(390,account('a','Ana'),'delayed');
  await page.locator('#mine-session-status').waitFor({state:'visible'});
  const other=await ctx.newPage();await other.goto(base+'mis-reservas.html');
  await other.evaluate(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),account('b','Beatriz'));
  release();
  await page.locator('#mine-greeting').getByText('Hola, Beatriz',{exact:true}).waitFor();
  assert(!(await page.locator('body').innerText()).includes('Hola, Ana'));await noOverflow(page);
  await page.screenshot({path:'mine-v2916-proof/cuenta-verificada-390.png',fullPage:true});
  await ctx.close();console.log('MINE_PASS cross-tab account race');passed++;
 }
 console.log('MINE_ALL_PASSED '+passed);
}finally{await browser.close()}
