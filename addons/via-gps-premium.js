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