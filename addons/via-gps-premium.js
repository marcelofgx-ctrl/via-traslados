/* Presentation only. The existing GPS handler, permissions and requests are untouched. */
(()=>{'use strict';
 function init(){
  const button=document.getElementById('location-shortcut'),input=document.getElementById('home-origin'),host=button?.closest('.reference-booking');
  if(!button||!input||!host)return;
  button.setAttribute('aria-label','Mi ubicación');button.setAttribute('title','Mi ubicación');
  let success=false,successTimer=null;
  const clearSuccess=()=>{success=false;clearTimeout(successTimer);successTimer=null};
  const permissionTitles=new Set(['Activá tu ubicación']);
  const warningTitles=new Set(['Confirmá el punto','Número por confirmar','Ubicación aproximada','Ubicación demasiado aproximada','Ubicación fuera de zona','La ubicación está bloqueada','No hay señal de ubicación','No logramos obtener tu ubicación','GPS no disponible','Indicá el origen']);
  const copy={
   'Activá tu ubicación':'Localizamos tu punto de recogida. Vos confirmás la dirección.',
   'Confirmá el punto':'Ubicamos el punto GPS. Elegí la entrada en el mapa o escribí tu dirección.',
   'Número por confirmar':'Encontramos una calle cercana. Confirmá el número o ajustá el punto.',
   'Buscando tu ubicación':'Obteniendo una posición precisa.',
   'Identificando dirección':'Buscando una referencia cercana.'
  };
  function sync(){
   const panel=document.getElementById('via-gps-feedback'),visible=panel&&!panel.hidden;
   const title=visible?panel.querySelector('strong')?.textContent?.trim():'';
   const busy=button.getAttribute('aria-busy')==='true'||button.disabled;
   let state='idle';
   if(busy)state=panel?.dataset.viaWait||'gps';
   else if(visible&&permissionTitles.has(title))state='permission';
   else if(visible&&warningTitles.has(title))state='confirm';
   else if(success)state='success';
   button.dataset.viaGpsState=state;
   host.dataset.viaGpsPanel=visible?'open':'closed';
   if(panel){
    panel.dataset.viaGpsPresentation=state;
    if(visible&&copy[title]){
     const p=panel.querySelector('p:not(.via-gps-help)');
     if(p&&p.textContent!==copy[title])p.textContent=copy[title];
    }
   }
  }
  input.addEventListener('input',()=>{clearSuccess();sync()});
  input.addEventListener('via:address',e=>{
   clearSuccess();
   const d=e.detail;
   if(d?.source==='gps'&&d.postalStatus==='suggested'&&d.numberIsApproximate===true&&Number(d.gpsAccuracy)<=100){
    success=true;successTimer=setTimeout(()=>{success=false;sync()},2200);
   }
   sync();
  });
  // Observe real state only; no click handler, no location requests, no storage.
  new MutationObserver(sync).observe(host,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-busy','disabled','hidden','data-via-wait']});
  sync();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
/* Overlay enhancement; no address requests, sorting, metadata or selection writes. */
(()=>{'use strict';
 function initSearch(){
  const panel=document.getElementById('address-suggestions');
  const fields=['home-origin','home-destination'].map(id=>document.getElementById(id)).filter(Boolean);
  if(!panel||!fields.length)return;
  let active=null,frame=0,touchStart=null,hideTimer=0,editGeneration=0,pendingEdit=0;
  const touchDevice=()=>navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;
  const cancelHide=()=>{clearTimeout(hideTimer);hideTimer=0};
  function layout(){
   frame=0;
   if(!active||panel.classList.contains('hidden'))return;
   const field=active.closest('.reference-field');if(!field)return;
   const r=field.getBoundingClientRect(),v=window.visualViewport;
   const left=v?.offsetLeft||0,top=v?.offsetTop||0,w=v?.width||innerWidth,h=v?.height||innerHeight;
   const width=Math.min(r.width,w-16),x=Math.max(left+8,Math.min(r.left,left+w-width-8));
   if(width<=0)return;
   if(panel.dataset.viaResultsReady==='true'){
    const below=Math.max(0,top+h-r.bottom-8),above=Math.max(0,r.top-top-8);
    const useAbove=below<132&&above>below;
    const available=Math.max(42,Math.min(360,useAbove?above:below));
    panel.style.setProperty('--via-suggest-left',x+'px');
    panel.style.setProperty('--via-suggest-width',width+'px');
    panel.style.setProperty('--via-suggest-height',available+'px');
    const actual=Math.min(available,panel.scrollHeight+2);
    panel.style.setProperty('--via-suggest-top',Math.max(top+4,useAbove?r.top-4-actual:r.bottom+4)+'px');
    panel.dataset.viaCompact='true';return;
   }
   const originalTop=parseFloat(panel.style.top);
   const y=Number.isFinite(originalTop)?originalTop:r.bottom;
   const available=panel.dataset.placement==='above'?Math.max(42,Math.min(r.top-top-12,parseFloat(panel.style.maxHeight)||260)):Math.max(42,top+h-y-8);
   panel.style.setProperty('--via-suggest-left',x+'px');
   panel.style.setProperty('--via-suggest-width',width+'px');
   panel.style.setProperty('--via-suggest-height',Math.min(320,available)+'px');
   panel.dataset.viaCompact='true';
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(layout)}
  fields.forEach(el=>{
   el.addEventListener('focus',()=>{cancelHide();pendingEdit=0;active=el;delete panel.dataset.viaResultsReady;schedule()});
   el.addEventListener('input',()=>{cancelHide();active=el;pendingEdit=++editGeneration;delete panel.dataset.viaResultsReady;schedule()});
  });
  ['origin','destination'].forEach(id=>document.getElementById(id)?.addEventListener('focus',()=>{cancelHide();pendingEdit=0;active=null;delete panel.dataset.viaCompact;delete panel.dataset.viaResultsReady}));
  function onResults(){
   schedule();cancelHide();
   if(panel.classList.contains('hidden')||!panel.querySelector('.address-choice')){
    delete panel.dataset.viaResultsReady;return;
   }
   if(!active||!pendingEdit||!touchDevice()||document.activeElement!==active)return;
   const input=active,generation=pendingEdit,value=input.value;
   // Only after actual selectable results and a brief typing pause.
   hideTimer=setTimeout(()=>{
    hideTimer=0;
    if(active!==input||pendingEdit!==generation||input.value!==value||
       document.activeElement!==input||panel.classList.contains('hidden')||
       !panel.querySelector('.address-choice'))return;
    pendingEdit=0;
    panel.dataset.viaResultsReady='true';
    input.blur();schedule();
    // Android/iOS keyboard closes asynchronously; visualViewport also triggers layout.
    setTimeout(schedule,250);
   },420);
  }
  new MutationObserver(onResults).observe(panel,{attributes:true,attributeFilter:['class'],childList:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('scroll',schedule,{passive:true,capture:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  panel.addEventListener('touchstart',e=>{touchStart=e.touches.length===1?e.touches[0].clientY:null},{passive:true});
  panel.addEventListener('touchmove',e=>{
   if(touchStart===null||!active||document.activeElement!==active||e.touches.length!==1)return;
   if(Math.abs(e.touches[0].clientY-touchStart)>14&&panel.scrollHeight>panel.clientHeight+2){touchStart=null;active.blur();schedule()}
  },{passive:true});
  for(const event of ['touchend','touchcancel'])panel.addEventListener(event,()=>{touchStart=null},{passive:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initSearch,{once:true});else initSearch();
})();
