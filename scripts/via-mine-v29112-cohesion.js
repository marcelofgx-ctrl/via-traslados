/* Vía Traslados V29.1.12: visually attach the existing pager to the last
   visible card. The V29.1.7 controller still owns page size, counts and clicks.
   No network calls, no storage, no authentication or booking mutations. */
(()=>{
 'use strict';
 if(document.body?.dataset.page!=='mine')return;
 document.body.dataset.viaMineV12Boot='loaded';
 function start(){
  document.body.dataset.viaMineV12Boot='starting';
  const list=document.getElementById('mine-list');
  const pager=document.querySelector('.via-mine-pager');
  // WebKit may execute deferred files before the existing V29.1.7 pager
  // controller has inserted its nav: attach once, on the real DOM event.
  if(!list||!pager){
   document.body.dataset.viaMineV12Boot='waiting';
   const ready=new MutationObserver(()=>{
    if(document.getElementById('mine-list')&&document.querySelector('.via-mine-pager')){
     ready.disconnect();start()
    }
   });
   ready.observe(document.body,{childList:true,subtree:true});
   return
  }
  document.body.dataset.viaMineV12Boot='ready';
  let pending=false,shift=0;
  function measure(){
   document.body.dataset.viaMineV12Boot='measured';
   pending=false;
   if(pager.hidden||getComputedStyle(pager).display==='none'){
    shift=0;pager.style.removeProperty('--via-v12-pager-y');return
   }
   const visible=[...list.querySelectorAll('a.via-booking-card')]
    .filter(el=>getComputedStyle(el).display!=='none');
   if(!visible.length){shift=0;pager.style.removeProperty('--via-v12-pager-y');return}
   const last=Math.max(...visible.map(el=>el.getBoundingClientRect().bottom));
   const naturalPagerTop=pager.getBoundingClientRect().top+shift;
   const nextShift=Math.max(0,Math.round(naturalPagerTop-last-9));
   if(nextShift!==shift){
    shift=nextShift;
    pager.style.setProperty('--via-v12-pager-y',(-shift)+'px');
    document.body.dataset.viaMineV12Boot='shift-'+shift
   }
  }
  function schedule(){
   if(pending)return;
   pending=true;requestAnimationFrame(()=>requestAnimationFrame(measure))
  }
  new MutationObserver(schedule).observe(list,{
   childList:true,subtree:true,attributes:true,attributeFilter:['style']
  });
  new MutationObserver(schedule).observe(pager,{
   attributes:true,attributeFilter:['hidden'],childList:true,
   characterData:true,subtree:true
  });
  if(typeof ResizeObserver==='function'){
   const observer=new ResizeObserver(schedule);
   observer.observe(list);
   observer.observe(document.querySelector('.app-shell')||document.body)
  }
  document.getElementById('mine-tabs')?.addEventListener('click',schedule);
  window.addEventListener('via-customer-session',schedule);
  window.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  document.addEventListener('visibilitychange',schedule);
  schedule()
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start()
})();
