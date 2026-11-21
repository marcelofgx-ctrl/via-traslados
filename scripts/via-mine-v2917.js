/* Vía Traslados V29.1.7 — Mine-only presentation layer.
   No changes to WebAuthn, API requests, customer identity, bookings or Store. */
(()=>{
 'use strict';
 if(document.body?.dataset.page!=='mine')return;
 const root=document.body,doc=document;
 const list=doc.getElementById('mine-list');
 const tabs=doc.getElementById('mine-tabs');
 const more=doc.getElementById('mine-more');
 if(!list||!tabs)return;
 const ua=navigator.userAgent||'';
 const iOS=/iPad|iPhone|iPod/i.test(ua)||
  (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const android=!iOS&&/Android/i.test(ua);
 root.dataset.mobileOs=iOS?'ios':android?'android':'other';
 // Browser/platform chooses the actual platform authenticator; do not guess
 // whether this iPhone has Face ID or Touch ID. WebAuthn stays untouched.
 const biometric=doc.getElementById('mine-login-passkey');
 if(iOS&&biometric){
  biometric.textContent='Usar biometría';
  biometric.setAttribute('aria-label','Ingresar con Face ID o Touch ID, según el dispositivo');
 }
 const pager=doc.createElement('nav');
 pager.className='via-mine-pager';pager.hidden=true;
 pager.setAttribute('aria-label','Páginas de reservas');
 const back=doc.createElement('button');back.type='button';back.textContent='‹ Anteriores';
 const count=doc.createElement('span');count.dataset.pageCount='';count.setAttribute('aria-live','polite');
 const next=doc.createElement('button');next.type='button';next.textContent='Siguientes ›';
 pager.append(back,count,next);
 list.insertAdjacentElement('afterend',pager);
 let page=0,pageSize=1,renderPending=false,rendering=false,lastTab='',lastSignature='';
 const isHidden=e=>!e||e.hidden||e.classList.contains('hidden');
 const cards=()=>Array.from(list.children).filter(el=>el.matches('a.via-booking-card'));
 function fit(items){
  if(!items.length)return 1;
  // CSS cards already have a compact, bounded height (full data remains in
  // aria-label and title). Measure real rendered card height before hiding.
  const heights=items.slice(0,5).map(el=>Math.ceil(el.getBoundingClientRect().height||115));
  const maxHeight=Math.max(105,...heights),gap=7;
  const room=Math.max(0,list.clientHeight);
  return Math.max(1,Math.min(5,Math.floor((room+gap)/(maxHeight+gap))));
 }
 function expandAll(){
  // Existing client-side "Ver más" reveals more rows from S.mine().
  // Never fetch or mutate reservations; just reveal already-loaded DOM.
  let clicks=0;
  while(more&&!isHidden(more)&&clicks++<22)more.click();
 }
 function render(){
  renderPending=false;
  if(rendering)return;
  rendering=true;
  try{
   if(isHidden(tabs)||isHidden(doc.getElementById('mine-welcome'))){
    pager.hidden=true;lastSignature='';page=0;return;
   }
   expandAll();
   const items=cards();
   if(!items.length){pager.hidden=true;page=0;lastSignature='';return}
   const active=doc.getElementById('mine-tab-active')?.classList.contains('is-active')?'active':'history';
   const signature=active+'|'+items.map(el=>el.getAttribute('href')||'').join('|');
   if(active!==lastTab||signature!==lastSignature){page=0;lastTab=active;lastSignature=signature}
   // Always measure all cards at natural height, including hidden pages.
   for(const el of items){el.style.display='';el.removeAttribute('aria-hidden')}
   pager.hidden=items.length<2;
   pageSize=fit(items);
   pager.hidden=items.length<=pageSize;
   // Pager occupies some room; recalculate after taking it into account.
   if(!pager.hidden)pageSize=fit(items);
   const maxPage=Math.max(0,Math.ceil(items.length/pageSize)-1);
   page=Math.min(page,maxPage);
   for(const [index,el] of items.entries()){
    const visible=index>=page*pageSize&&index<(page+1)*pageSize;
    el.style.display=visible?'':'none';
    if(!visible)el.setAttribute('aria-hidden','true');
   }
   pager.hidden=maxPage===0;
   back.disabled=page===0;next.disabled=page>=maxPage;
   const start=page*pageSize+1,end=Math.min(items.length,(page+1)*pageSize);
   count.textContent=start+'–'+end+' de '+items.length;
  }finally{rendering=false}
 }
 function schedule(){
  if(renderPending)return;renderPending=true;
  requestAnimationFrame(render);
 }
 back.addEventListener('click',()=>{if(page>0){page--;lastSignature=lastSignature; /* preserve page */ renderPage()}});
 next.addEventListener('click',()=>{page++;renderPage()});
 function renderPage(){
  // Do not reset the page when only navigating; the DOM signature is stable.
  schedule();
 }
 const observer=new MutationObserver(schedule);
 observer.observe(list,{childList:true,subtree:false});
 for(const button of tabs.querySelectorAll('button')){
  button.addEventListener('click',()=>{page=0;lastTab='';schedule()});
 }
 window.addEventListener('via-customer-session',()=>{page=0;lastTab='';schedule()});
 window.addEventListener('storage',event=>{
  if(event.key===null||event.key==='via-customer-session-v1'){
   page=0;lastTab='';schedule()
  }
 });
 if(typeof ResizeObserver!=='undefined'){
  new ResizeObserver(schedule).observe(list);
 }
 const viewport=window.visualViewport;
 const initialHeight=Math.max(window.innerHeight,viewport?.height||0);
 function view(){
  const height=viewport?.height||window.innerHeight;
  const input=doc.activeElement?.matches('input,textarea')||false;
  const keyboard=!!input&&height<initialHeight*0.83;
  root.classList.toggle('mine-keyboard-open',keyboard);
  if(keyboard)root.style.setProperty('--mine-vh',Math.round(height)+'px');
  else root.style.removeProperty('--mine-vh');
  schedule();
 }
 viewport?.addEventListener('resize',view);
 window.addEventListener('resize',view);
 doc.addEventListener('focusin',view);
 doc.addEventListener('focusout',()=>requestAnimationFrame(view));
 root.classList.add('via-mine-v2917');
 view();schedule();
})();