const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url='https://via-v30-oferta-visual-qa.marcelof-gx.workers.dev';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  fs.mkdirSync('v30-visual-shots',{recursive:true});
  for(const [w,h] of [[320,640],[360,740],[390,844],[412,915]]){
   const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   const calls=[];
   page.on('request',req=>calls.push(req.url()));
   await page.goto(url,{waitUntil:'networkidle',timeout:30000});
   await page.getByText('Tenés una oferta').waitFor();
   assert.equal(await page.getByRole('button',{name:/Aceptar oferta/}).count(),1);
   const dim=await page.evaluate(()=>({
    docWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
    docHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight,
    actionsVisible:(()=>{const r=document.querySelector('footer').getBoundingClientRect();return r.top>=0&&r.bottom<=window.innerHeight+1})(),
    priceVisible:(()=>{const r=document.querySelector('.price').getBoundingClientRect();return r.top>=0&&r.bottom<=window.innerHeight-60})()
   }));
   assert(dim.docWidth<=w+1,'Horizontal overflow at '+w+'x'+h+': '+JSON.stringify(dim));
   assert(dim.actionsVisible,'CTA inaccessible '+w+'x'+h);
   if(w>=360)assert(dim.priceVisible,'Price not above fold '+w+'x'+h);
   assert(calls.every(u=>new URL(u).host===new URL(url).host),
    'Preview made a cross-domain network request');
   await page.screenshot({path:'v30-visual-shots/oferta-'+w+'x'+h+'.png',fullPage:true});
   await page.getByRole('button',{name:/Aceptar oferta/}).click();
   await page.getByRole('dialog').waitFor();
   assert.match(await page.getByRole('dialog').innerText(),/no se envía|sin alterar reservas reales/);
   await page.getByRole('button',{name:'Entendido'}).click();
   results.push({viewport:w+'x'+h,...dim,networkRequests:calls.length});
   await page.close();
  }
  console.log('V30_VISUAL_BROWSER_OK '+JSON.stringify(results));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
