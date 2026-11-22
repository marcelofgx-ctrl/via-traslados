/* Pixel-geometry QA for the user's selected side-by-side screenshot reference.
 * Tested in Android Chrome and iOS WebKit, authenticated and guest/keyboard.
 * All customer API interactions are intercepted; no real bookings/OTP.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir} from 'node:fs/promises';
const PROD='https://viatraslados.com';
const STAGE=process.env.VIA_REFERENCE_QA||'https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const UA_ANDROID='Mozilla/5.0 (Linux; Android 16; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const UA_IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
await mkdir('via-v29112-visual-proof',{recursive:true});
const profile={name:'Ana de prueba',email:'ana@example.invalid',phone:'099000000'};
const session={sessionToken:'a'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+3600,profile};
const statuses=['confirmed','accepted','quoted','requested','en_route','requested','completed','cancelled','completed','cancelled'];
const entries=statuses.map((status,i)=>({
 id:'sample-only-'+i,
 origin:'Cerca de AVENIDA ITALIA 5781, Montevideo',
 destination:'Aeropuerto de Carrasco',
 date:'2026-11-'+String(18+i).padStart(2,'0'),
 time:'10:00',status,price:i===0?7000:850,
 route:{distanceKm:10.2},passengers:2
}));
let passed=0;
async function caseRun(os,width,height,loggedIn,keyboard=false){
 const engine=os==='ios'?webkit:chromium;
 const browser=await engine.launch(os==='ios'?{headless:true}:{channel:'chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width,height},screen:{width,height},
  isMobile:true,hasTouch:true,deviceScaleFactor:2,
  userAgent:os==='ios'?UA_IOS:UA_ANDROID,serviceWorkers:'block'});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(loggedIn)await page.addInitScript(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),session);
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  // The real passenger frontend calls a SEPARATE API Worker origin.
  // Fulfill synthetic customer API before blocking other external hosts,
  // exactly as the established V29.1.10 QA does.
  if(u.pathname==='/api/customer/me')return route.fulfill({status:200,json:{profile,passkeys:1,expiresAt:session.expiresAt}});
  if(u.pathname==='/api/customer/bookings')return route.fulfill({status:200,json:entries});
  if(u.pathname==='/api/customer/logout')return route.fulfill({status:200,json:{signedOut:true}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA only'}});
  if(u.origin!==STAGE)return route.abort();
  return route.continue();
 });
 try {
  await page.goto(STAGE+'/mis-reservas.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('via-mine-v29110'),null,{timeout:10000});
  if(loggedIn){
   await page.waitForTimeout(500);
   const debug=await page.evaluate(()=>({
    greeting:document.querySelector('#mine-greeting')?.textContent,
    welcomeHidden:document.getElementById('mine-welcome')?.classList.contains('hidden'),
    bodyClasses:document.body.className,
    list:document.querySelector('#mine-list')?.textContent?.slice(0,80)
   }));
   console.log('VIA_V29112_MOCK_SESSION_CHECK '+JSON.stringify(debug));
   await page.locator('#mine-greeting').getByText('¡Hola, Ana!',{exact:true}).waitFor();
   await page.locator('#mine-count-active').getByText('6',{exact:true}).waitFor();
   await page.locator('#mine-list a.via-booking-card').first().waitFor();
  }else{
   await page.locator('#mine-existing').click();
   await page.locator('#mine-login-phone').waitFor({state:'visible'});
   if(keyboard){await page.locator('#mine-login-phone').focus();await page.locator('#mine-login-phone').fill('094842756');}
  }
  await page.waitForTimeout(250);
  const info=await page.evaluate(()=>{
   const r=q=>{const el=document.querySelector(q),box=el?.getBoundingClientRect();
    return box?{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height}:null};
   const css=q=>getComputedStyle(document.querySelector(q));
   const title=css('.brand.brand-clean > span:last-child');
   const sub=css('.brand.brand-clean .brand-sub');
   const button=css('.top-link');
   const status=css('.status-card.via-mine-main');
   const account=window.document.body.classList.contains('mine-account');
   const arrow=document.querySelector('.via-booking-card__arrow');
   return {
    os:document.body.dataset.mobileOs,account,
    titleDisplay:title.display,titleDirection:title.flexDirection,titleHeight:r('.brand.brand-clean > span:last-child')?.height,
    subDisplay:sub.display,subRect:r('.brand.brand-clean .brand-sub'),
    brandRect:r('.brand.brand-clean'),
    logoRect:r('.brand-monogram'),
    inicioRect:r('.top-link'),inicioBackground:button.backgroundImage,
    inicioFont:button.fontSize,inicioText:document.querySelector('.top-link')?.textContent.trim(),
    panelBackground:status.backgroundImage,panelColor:status.backgroundColor,
    panelBorderTop:status.borderTopWidth,panelShadow:status.boxShadow,
    bodyOverflow:css('body').overflow,
    documentWidth:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight,
    headerRect:r('.topbar'),cardRect:r('.status-card.via-mine-main'),
    greetingRect:r('.via-mine-account'),tabsRect:r('.via-mine-tabs'),
    card1Rect:r('.via-booking-card'),pagerRect:r('.via-mine-pager'),
    arrowBackground:arrow?getComputedStyle(arrow).backgroundImage:null,
    arrowColor:arrow?getComputedStyle(arrow).color:null,
    phoneRect:r('#mine-login-phone'),passkeyRect:r('#mine-login-passkey'),emailRect:r('#mine-login-send'),
    fixedScroll:document.documentElement.scrollHeight>innerHeight+5
   }
  });
  assert.equal(info.os,os,'Wrong browser OS');
  assert(['flex','inline-flex'].includes(info.titleDisplay),'Reference wordmark flexbox missing'); // Flex items are blockified by CSS computed style.
  assert.equal(info.titleDirection,'row','Words are still stacked instead of horizontal');
  assert(info.titleHeight<33,'Wordmark appears multi-line '+JSON.stringify(info));
  assert(info.subRect.top+6>=info.brandRect.top,'Bad text vertical placement');
  assert(info.brandRect.right+3<=info.inicioRect.left,'Logo collides with Inicio '+JSON.stringify(info));
  assert(info.inicioRect.width>=63&&info.inicioRect.width<=99,'Inicio too large or tiny '+JSON.stringify(info));
  assert(info.inicioRect.right<=info.width+2,'Inicio out of bounds');
  assert(info.inicioBackground.includes('gradient'),'Inicio must retain subtle gradient');
  assert(info.inicioFont!=='26px','Inicio giant font');
  assert(!info.inicioText.includes('←'),'Old browser back arrow is still visible');
   assert.equal(await page.locator('.top-link .via-home-arrow svg').count(),1,'Premium home line icon missing');
   assert.equal(await page.locator('.top-link .via-home-divider').count(),1,'Thin icon/label divider missing');
  assert(info.documentWidth<=info.width+1,'Horizontal overflow');
  assert(info.bodyOverflow==='hidden','Page body must be non-scrollable');
  if(loggedIn){
   assert(info.account,'Mock account not validated');
   assert(info.panelBorderTop==='0px','White giant outer card border remains');
   assert(info.panelShadow==='none','Giant outer white card shadow remains');
   assert(info.panelBackground==='none'||info.panelBackground.startsWith('none'),'Giant white panel remains '+JSON.stringify(info.panelBackground));
   assert(info.arrowBackground.includes('gradient'),'Reservation arrows are still pale');
   assert(info.arrowColor==='rgb(255, 255, 255)','Reference arrows should be white on vivid green '+info.arrowColor);
   assert(info.card1Rect.top>=info.tabsRect.bottom,'Reservation overlaps tabs');
   assert(info.greetingRect.bottom<=info.tabsRect.top,'Greeting overlaps tabs');
   assert(info.card1Rect.bottom<=info.pagerRect.top+3,'Booking card over pagination');
    const cohesion=await page.evaluate(()=>{
     const rect=q=>document.querySelector(q)?.getBoundingClientRect();
     const visible=[...document.querySelectorAll('#mine-list a.via-booking-card')].filter(x=>getComputedStyle(x).display!=='none');
     const last=Math.max(...visible.map(x=>x.getBoundingClientRect().bottom));
     const pager=rect('.via-mine-pager');
     return {visible:visible.length,total:document.querySelectorAll('#mine-list a.via-booking-card').length,
      gap:pager.top-last,betweenTabs:rect('.via-booking-card').top-rect('.via-mine-tabs').bottom,
      greetingLeft:rect('.via-mine-account').left,tabsLeft:rect('.via-mine-tabs').left,
      cardLeft:rect('.via-booking-card').left,pagerBottom:pager.bottom,
      pageText:document.querySelector('[data-page-count]')?.textContent||''};
    });
    assert.equal(cohesion.total,6,'Active reservation count changed');
    assert(cohesion.visible>=1&&cohesion.visible<=5,'Adaptive reservation page size failed');
    assert(cohesion.pageText.includes('de 6'),'Real simulated count is not preserved '+JSON.stringify(cohesion));
    assert(cohesion.gap>=-2&&cohesion.gap<=17,'Pager still visually detached '+JSON.stringify(cohesion));
    assert(cohesion.betweenTabs>=0&&cohesion.betweenTabs<=17,'Tabs/cards separated '+JSON.stringify(cohesion));
    assert(Math.abs(cohesion.greetingLeft-cohesion.tabsLeft)<3,'Welcome/tabs alignment differs');
    assert(Math.abs(cohesion.cardLeft-cohesion.tabsLeft)<5,'Booking/tabs alignment differs');
    assert(cohesion.pagerBottom<=info.height+3,'Pager clipped behind bottom UI '+JSON.stringify(cohesion));
    if(cohesion.visible===2)assert(cohesion.pageText.startsWith('1–2 de 6'),'2-of-6 pagination wrong '+cohesion.pageText);
    console.log('VIA_V29112_COHESION_GEOMETRY '+JSON.stringify({os,width,height,...cohesion}));
   assert(await page.locator('.via-mine-pager').isVisible(),'Paged no-scroll controls missing');
   assert.equal(await page.locator('.via-mine-account__avatar').innerText(),'A','Use real initials, never fictitious photo');
   assert.equal(await page.locator('body button[aria-label="Notificaciones"]').count(),0,'Unimplemented bell should not exist');
  }else{
   assert(info.phoneRect.bottom<=info.height+2,'Phone input under keyboard');
   assert(info.passkeyRect.bottom<=info.height+2&&info.emailRect.bottom<=info.height+2,'Login buttons clipped behind keyboard');
  }
  const outfile='via-v29112-visual-proof/'+os+'-'+width+'x'+height+'-'+(loggedIn?'reservas':keyboard?'login-teclado':'login')+'.png';
  await page.screenshot({path:outfile,fullPage:false});
  // Verify the approved product surfaces against a real live V29.1.11 snapshot.
   if(loggedIn&&(width===390||width===375)){
    const base=await context.newPage();
    await base.addInitScript(s=>localStorage.setItem('via-customer-session-v1',JSON.stringify(s)),session);
    await base.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(u.pathname==='/api/customer/me')return route.fulfill({status:200,json:{profile,passkeys:1,expiresAt:session.expiresAt}});
     if(u.pathname==='/api/customer/bookings')return route.fulfill({status:200,json:entries});
     if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'QA only'}});
     if(u.origin!==PROD)return route.abort();return route.continue();
    });
    await base.goto(PROD+'/mis-reservas.html',{waitUntil:'domcontentloaded'});
    await base.locator('#mine-greeting').getByText('¡Hola, Ana!',{exact:true}).waitFor();
    await base.screenshot({path:'via-v29112-visual-proof/'+os+'-'+width+'x'+height+'-v29111-baseline.png',fullPage:false});
    const signature=async p=>p.evaluate(()=>({
     brand:getComputedStyle(document.querySelector('.brand-monogram')).backgroundImage,
     welcome:getComputedStyle(document.querySelector('.known-customer')).backgroundImage,
     card:getComputedStyle(document.querySelector('.via-booking-card')).backgroundImage,
     arrow:getComputedStyle(document.querySelector('.via-booking-card__arrow')).backgroundImage
    }));
    const before=await signature(base),after=await signature(page);
    assert.deepEqual(after,before,'Approved logo/greeting/reservation surface styles changed');
    await base.close()
   }
   if(loggedIn){
    const old=await page.locator('[data-page-count]').innerText();
    await page.locator('.via-mine-pager button').last().click();
    await page.waitForTimeout(200);
    const next=await page.locator('[data-page-count]').innerText();
    assert.notEqual(next,old,'Siguientes did not advance the page');
    assert(next.includes('de 6'),'Total count modified by pagination');
    await page.locator('#mine-tab-history').click();
    await page.locator('#mine-count-history').getByText('4',{exact:true}).waitFor();
    assert(await page.locator('#mine-list a.via-booking-card:visible').count()>0,'History not visible');
    await page.locator('#mine-tab-active').click();
    await page.locator('#mine-count-active').getByText('6',{exact:true}).waitFor();
   }
   if(loggedIn&&os==='android'&&width===390){
    await page.locator('#mine-logout').click();
    await page.waitForFunction(()=>!document.body.classList.contains('mine-account'));
    assert(!await page.evaluate(()=>localStorage.getItem('via-customer-session-v1')),'Logout left passenger token');
   }
   const inicioHref=await page.locator('.top-link').getAttribute('href');
   assert(inicioHref&&/index\.html|^\.\/?$|^\/$/.test(inicioHref),'Inicio target unexpected '+inicioHref);
   await page.locator('.top-link').click();
   await page.waitForURL(url=>/\/$|\/index\.html$/.test(url.pathname),{timeout:10000});
   assert.deepEqual(errors,[],'Client JavaScript errors '+errors.join('; '));
  console.log('VIA_V29112_REFERENCE_QA_PASS '+JSON.stringify({os,width,height,loggedIn,keyboard,
   wordmarkHeight:+info.titleHeight.toFixed(1),inicioWidth:+info.inicioRect.width.toFixed(1),
   noWhiteFrame:loggedIn?info.panelBackground:undefined,cardArrow:loggedIn?info.arrowColor:undefined}));
  passed++;
 }finally{await context.close();await browser.close();}
}
for(const row of [
 ['android',320,640,true],['android',360,740,true],['android',390,844,true],['android',360,680,true],
 ['android',412,915,true],['android',390,450,false,true],['android',360,445,false,true],
 ['ios',375,667,true],['ios',390,844,true],['ios',430,932,true],
 ['ios',390,470,false,true],['ios',375,490,false,true],
])await caseRun(...row);
console.log('VIA_V29112_REFERENCE_QA_ALL_PASSED '+passed);
