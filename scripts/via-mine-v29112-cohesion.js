/* Vía Traslados V29.1.12: visually attach the existing pager to the last
   visible card. The V29.1.7 controller still owns page size, counts and clicks.
   No network calls, no storage, no authentication or booking mutations. */
(()=>{
 'use strict';
 if(document.body?.dataset.page!=='mine')return;
 function start(){
  const list=document.getElementById('mine-list');
  const pager=document.querySelector('.via-mine-pager');
  if(!list||!pager)return;
  let pending=false,shift=0;
  function measure(){
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
    pager.style.setProperty('--via-v12-pager-y',(-shift)+'px')
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
