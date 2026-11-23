/* Vía Traslados V29.1.15 — accurate address availability messaging, no GPS polling. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const initialDate=new Date();initialDate.setDate(initialDate.getDate()+1);
if($('home-date')){$('home-date').value=initialDate.toLocaleDateString('en-CA');}
if($('home-time'))$('home-time').value='10:00';
$('menu-toggle')?.addEventListener('click',()=>{const menu=$('header-menu');const visible=menu.classList.toggle('hidden');$('menu-toggle').setAttribute('aria-expanded',String(!visible));});
// A new trip is a clean draft; NEVER erase the authenticated passenger session.
let hadOpenedBooking=false;
function clearWizardDraft(){
 $('booking-form')?.reset();
 for(const id of ['origin','destination']){
  window.ViaAddress?.set(id,null);
  $(id)?.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:null}));
 }
}
function clearRestoredHomeDraft(){
 clearWizardDraft();
 for(const id of ['home-origin','home-destination']){
  window.ViaAddress?.set(id,null);
  $(id)?.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:null}));
 }
 const next=new Date();next.setDate(next.getDate()+1);
 if($('home-date'))$('home-date').value=next.toLocaleDateString('en-CA');
 if($('home-time'))$('home-time').value='10:00';
 if($('home-passengers'))$('home-passengers').selectedIndex=0;
}
window.addEventListener('pageshow',event=>{
 if(!event.persisted||!hadOpenedBooking)return;
 hadOpenedBooking=false;clearRestoredHomeDraft();
});
const start=$('start-booking');start?.addEventListener('click',()=>{
 hadOpenedBooking=true;
 // Always reset old wizard metadata, notes, validation, consent and route fields.
 // The intentional choices on the homepage remain intact and are copied below.
 clearWizardDraft();
 const ids=[['home-origin','origin'],['home-destination','destination'],
  ['home-date','date'],['home-time','time'],['home-passengers','passengers']];
 for(const [a,b] of ids){
  if(!$(a)||!$(b))continue;
  // Copy even an EMPTY home address: otherwise previous wizard address survives.
  if(window.ViaAddress&&(a.includes('origin')||a.includes('destination')))
   window.ViaAddress.copy(a,b);
  else if($(a).value)$(b).value=$(a).value;
 }
},{capture:true});
$('services-nav')?.addEventListener('click',e=>{e.preventDefault();start?.click()});
// V29.1.2 — GPS Android/Chrome: permiso explícito, reintento y lectura cancelable.
const gpsButton=$('location-shortcut'),gpsInput=$('home-origin');
let gpsRun=null,gpsPermissionTicket=0,gpsApplying=false,gpsSuccessTimer=null;
// Identificación orientativa: Samsung Internet también incluye Chrome en su user-agent.
function gpsWaitPolicy(){
 const ua=navigator.userAgent||'';
 if(/SamsungBrowser\//i.test(ua))return {engine:'samsung-internet',limit:7500};
 if(/(?:Chrome|CriOS)\//i.test(ua)&&!/(?:EdgA|EdgiOS|OPR|Opera|FxiOS|Firefox|UCBrowser)\//i.test(ua))
  return {engine:'chrome-family',limit:18000};
 return {engine:'other-browser',limit:8000};
}
const gpsStyle=document.createElement('style');
gpsStyle.textContent=
 '#via-gps-feedback{box-sizing:border-box;max-width:100%;margin:8px 0 0;padding:10px 12px;border:1px solid #c7ded6;border-radius:12px;background:#f5faf8;color:#173e38;font:400 12px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}' +
 '#via-gps-feedback[hidden]{display:none!important}' +
 '#via-gps-feedback strong{display:block;font-size:13px;margin-bottom:3px}' +
 '#via-gps-feedback p{margin:0}' +
 '#via-gps-feedback .via-gps-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
 '#via-gps-feedback button{appearance:none;min-height:34px;max-width:100%;padding:6px 10px;border:1px solid #b8d3cb;border-radius:9px;background:white;color:#165149;font:650 12px/1.3 system-ui,sans-serif;cursor:pointer}' +
 '#via-gps-feedback button.primary{background:#006b5f;border-color:#006b5f;color:white}' +
 '#via-gps-feedback .via-gps-help{margin-top:8px;white-space:pre-line}' +
 '#via-gps-feedback.via-gps-success{padding:7px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
 '#via-gps-feedback.via-gps-success strong{margin:0;font-size:12px}' +
 '#via-gps-feedback.via-gps-success p{display:none}' +
 '#via-gps-feedback.via-gps-success .via-gps-actions{margin:0}';
document.head.appendChild(gpsStyle);

function gpsPanel(title,copy,actions=[],help=''){
 if(gpsSuccessTimer!==null){clearTimeout(gpsSuccessTimer);gpsSuccessTimer=null}
 const host=document.querySelector('.reference-route-fields')||gpsInput?.closest('label');
 if(!host)return;
 let note=document.getElementById('via-gps-feedback');
 if(!note){note=document.createElement('section');note.id='via-gps-feedback';
  note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  host.insertAdjacentElement('afterend',note)}
 note.replaceChildren();
 if(!title&&!copy){note.hidden=true;return}
 note.hidden=false;note.classList.toggle('via-gps-success',title==='Ubicación obtenida');
 if(title){const b=document.createElement('strong');b.textContent=title;note.appendChild(b)}
 if(copy){const p=document.createElement('p');p.textContent=copy;note.appendChild(p)}
 if(actions.length){
  const row=document.createElement('div');row.className='via-gps-actions';
  for(const action of actions){
   const btn=document.createElement('button');btn.type='button';
   btn.textContent=action.label;btn.className=action.primary?'primary':'';
   btn.addEventListener('click',action.go);row.appendChild(btn)
  }
  note.appendChild(row)
 }
 if(help){const p=document.createElement('p');p.className='via-gps-help';p.textContent=help;note.appendChild(p)}
 if(title==='Ubicación obtenida')gpsSuccessTimer=setTimeout(()=>{
  gpsSuccessTimer=null;if(!gpsRun){note.hidden=true;note.replaceChildren()}
 },3800);
}
function cancelGps(){
 const run=gpsRun;gpsRun=null;
 try{run?.cancel?.()}catch{}
 try{run?.abort?.abort()}catch{}
 if(gpsButton){gpsButton.disabled=false;gpsButton.removeAttribute('aria-busy')}
}
function finishGps(run){if(gpsRun!==run)return false;cancelGps();return true}
function openGpsMap(){
 ++gpsPermissionTicket;cancelGps();
 const open=()=>{if(window.ViaMapPicker?.openFor){window.ViaMapPicker.openFor('home-origin');return true}return false};
 if(open())return;
 import('./map-point-picker.js?v=26').then(()=>{
  if(!open()){gpsInput?.focus();gpsPanel('Indicá el origen','Podés escribir tu dirección para continuar.')}
 }).catch(()=>{gpsInput?.focus();gpsPanel('Indicá el origen','Podés escribir tu dirección para continuar.')});
}
function blockedGps(showHelp=false){
 const help=showHelp?
  'En Chrome: tocá el icono junto a la dirección web → Permisos del sitio → Ubicación → Permitir.\nEn Android: Ajustes → Aplicaciones → Chrome → Permisos → Ubicación. Activá la ubicación del teléfono y, si está disponible, la ubicación precisa.':'';
 gpsPanel('La ubicación está bloqueada','Para utilizar el GPS, habilitá la ubicación de este sitio en Chrome.',
  [{label:showHelp?'Ocultar ayuda':'Cómo activar el permiso',go:()=>blockedGps(!showHelp),primary:true},
   {label:'Volver a intentar',go:startGps},{label:'Elegir en el mapa',go:openGpsMap}],help);
}
function gpsFailure(err){
 const code=Number(err?.code);
 if(code===1){blockedGps();return}
 if(code===2){gpsPanel('No hay señal de ubicación',
  'El teléfono no pudo determinar tu posición. Revisá si la ubicación de Android está activa.',
  [{label:'Reintentar GPS',go:startGps,primary:true},{label:'Elegir en el mapa',go:openGpsMap}]);return}
 if(code===3){gpsPanel('No logramos obtener tu ubicación',
  'Se agotó el tiempo de búsqueda. Podés reintentar o indicar dónde querés que te busquemos.',
  [{label:'Reintentar GPS',go:startGps,primary:true},{label:'Elegir en el mapa',go:openGpsMap}]);return}
 gpsPanel('GPS no disponible','Podés escribir el origen o elegir un punto en el mapa.',
  [{label:'Reintentar GPS',go:startGps,primary:true},{label:'Elegir en el mapa',go:openGpsMap}]);
}
// Refinamiento V29.1.1 conservado: máximo 18 segundos, mejor lectura, <=100m.
function watchForBestGpsFix(ok,bad){
 const policy=gpsWaitPolicy();
 let id=null,timer=null,done=false,best=null,clearLate=false;
 window.__viaGpsPolicy=policy.engine; // Diagnóstico no sensible, nunca coordenadas.
 const meters=fix=>Number(fix?.coords?.accuracy);
 const cleanup=()=>{if(timer!==null){clearTimeout(timer);timer=null}
  if(id!==null){try{navigator.geolocation.clearWatch(id)}catch{}}else clearLate=true};
 const stop=(fn,value)=>{if(done)return;done=true;cleanup();fn(value)};
 const onFix=fix=>{
  if(done)return;
  const lat=Number(fix?.coords?.latitude),lng=Number(fix?.coords?.longitude),m=meters(fix);
  const age=Date.now()-(fix?.timestamp||Date.now());
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(m)||
     m<0||m>100000||age>120000||age< -10000)return;
  if(!best||m<meters(best))best=fix;
  if(m<=100){stop(ok,best);return}
  gpsPanel('Mejorando precisión','Tu ubicación todavía es aproximada. Precisión aproximada: ±'+Math.round(meters(best))+' m.',
   [{label:'Elegir en el mapa',go:openGpsMap}]);
 };
 const onError=err=>{
  if(done)return;
  if(Number(err?.code)===1){stop(bad,err);return}
  if(!best&&(Number(err?.code)===2||Number(err?.code)===3))stop(bad,err);
 };
 timer=setTimeout(()=>best?stop(ok,best):stop(bad,{code:3}),policy.limit);
 try{
  id=navigator.geolocation.watchPosition(onFix,onError,
   {enableHighAccuracy:true,maximumAge:0,timeout:14000});
  if(clearLate){try{navigator.geolocation.clearWatch(id)}catch{}}
 }catch(err){stop(bad,err)}
 return ()=>{if(!done){done=true;cleanup()}};
}
function startGps(){
 if(gpsRun)return;
 if(!window.isSecureContext||!navigator.geolocation){
  gpsPanel('GPS no disponible','Este navegador no puede solicitar la ubicación. Usá la búsqueda o el mapa.',
   [{label:'Elegir en el mapa',go:openGpsMap,primary:true}]);return}
 ++gpsPermissionTicket;
 const run={value:gpsInput?.value||'',previous:window.ViaAddress?.get('home-origin'),cancel:null,abort:null};
 gpsRun=run;
 if(gpsButton){gpsButton.disabled=true;gpsButton.setAttribute('aria-busy','true')}
 gpsPanel('Buscando tu ubicación','Estamos intentando obtener una posición precisa.',
  [{label:'Elegir en el mapa',go:openGpsMap}]);
 run.cancel=watchForBestGpsFix(async fix=>{
  if(gpsRun!==run||gpsInput?.value!==run.value){finishGps(run);return}
  try{
   let geo=window.ViaGeoV2;
   if(!geo)try{geo=await import('./geo-v2/core.mjs?v=3');window.ViaGeoV2=geo}catch{}
   if(gpsRun!==run||gpsInput?.value!==run.value){finishGps(run);return}
   const pos=geo?.assessGpsFix?.(fix)||{
    valid:Number.isFinite(fix.coords.latitude)&&Number.isFinite(fix.coords.longitude),
    lat:fix.coords.latitude,lng:fix.coords.longitude,
    accuracyMeters:fix.coords.accuracy,quality:'approximate'};
   if(!pos.valid||!(pos.lat>=-36&&pos.lat<=-30&&pos.lng>=-59&&pos.lng<=-52)){
    finishGps(run);
    gpsPanel('Ubicación fuera de zona','No encontramos una ubicación válida en Uruguay.',
     [{label:'Elegir en el mapa',go:openGpsMap,primary:true}]);return}
   // No asumir un punto de recogida si la única lectura es demasiado imprecisa.
   // El navegador puede entregar una ubicación general de la ciudad con permiso concedido.
   const meters=Number(pos.accuracyMeters);
   if(!Number.isFinite(meters)||meters>250){
    finishGps(run);
    // Limpiar exclusivamente una selección GPS antigua demasiado imprecisa.
    // Nunca borrar un origen manual o confirmado mediante el mapa.
    if(gpsInput?.dataset?.source==='gps'&&Number(gpsInput.dataset.gpsAccuracy)>250&&gpsInput.value===run.value){
     window.ViaAddress?.set('home-origin',null);
     gpsInput.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:null}));
    }
    gpsPanel('Ubicación demasiado aproximada',
     Number.isFinite(meters)?
      'El teléfono solo consiguió una precisión de ±'+Math.round(meters)+' m. No usamos esa posición como punto de recogida.':
      'El teléfono no informó una precisión confiable. No usamos esa posición como punto de recogida.',
     [{label:'Reintentar GPS',go:startGps,primary:true},{label:'Elegir en el mapa',go:openGpsMap}],
     'Comprobá que Chrome tenga Ubicación precisa permitida y que Android tenga activada Mejorar precisión de ubicación.');
    return;
   }

   const controller=new AbortController();run.abort=controller;
   const t=setTimeout(()=>controller.abort(),6500);let rows=[];
   try{
    const response=await fetch('/api/direcciones?mode=reverse&lat='+encodeURIComponent(pos.lat)+
     '&lng='+encodeURIComponent(pos.lng),{signal:controller.signal});
    if(response.ok)rows=(await response.json()).results||[]
   }catch{/* GPS válido no equivale a un domicilio postal confirmado. */}
   finally{clearTimeout(t)}
   if(gpsRun!==run||gpsInput?.value!==run.value){finishGps(run);return}
   let decision=null;
   try{decision=geo?.buildPickupDisplay?.({
    point:{lat:pos.lat,lng:pos.lng,source:'gps',accuracyMeters:pos.accuracyMeters,
     timestamp:fix.timestamp||Date.now()},reverseCandidates:rows})}catch{}
   let label=decision?.title||'Punto GPS sin dirección postal confirmada';
   const info=decision?.nearbyReference;
   if(info&&[info.city,info.department].filter(Boolean).length)
    label+=', '+[info.city,info.department].filter(Boolean).join(', ');
   // Preservar un número GPS ORIENTATIVO previo solo si la misma calle
   // continúa comprobándose con coordenadas casi idénticas; nunca inventar otra puerta.
   let heldDoor=false;
   const previous=run.previous;
   const prevStreet=String(previous?.label||'').split(',')[0].trim();
   const nextStreet=String(label||'').split(',')[0].trim();
   const normalize=s=>s.toLocaleLowerCase('es-UY').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
   const oldDoor=prevStreet.match(/\s(\d{1,6}[a-z]?)$/i);
   const newDoor=nextStreet.match(/\s\d{1,6}[a-z]?$/i);
   const dy=(pos.lat-Number(previous?.lat))*111200;
   const dx=(pos.lng-Number(previous?.lng))*111200*Math.cos(pos.lat*Math.PI/180);
   const separation=Math.hypot(dy,dx);
   if(previous?.source==='gps'&&previous?.numberIsApproximate&&oldDoor&&!newDoor&&
      Date.now()-Number(previous?.timestamp||0)>=0&&Date.now()-Number(previous?.timestamp||0)<=120000&&
      Number.isFinite(separation)&&separation<=40&&
      Number(pos.accuracyMeters)<=100&&Number(previous.gpsAccuracy)<=100&&
      normalize(prevStreet.replace(/\s\d{1,6}[a-z]?$/i,''))===normalize(nextStreet)){
    label=previous.label;heldDoor=true;
   }
   // Single road identifiers (Ruta 8, Calle 9) are street names, not
   // evidence of a nearby house door, even though they end in digits.
   // Treat ambiguous names as unnumbered and request manual/map confirmation.
   const roadNameNumber=/^(?:ruta(?:\s+nacional)?|calle|camino|pasaje|avenida|av\.)\s+\d{1,3}[a-z]?$/i
    .test(String(info?.nearbyPortal||'').trim());
   const chosen={label,lat:pos.lat,lng:pos.lng,accuracy:'gps',source:'gps',
    postalStatus:decision?.postalStatus||'unknown',city:info?.city||'',
    department:info?.department||'',gpsAccuracy:pos.accuracyMeters,
    timestamp:fix.timestamp||Date.now(),referenceDistance:heldDoor?previous.referenceDistance:(info?.distanceMeters??null),
    numberIsApproximate:(heldDoor||!!decision?.numberIsApproximate)&&!roadNameNumber};
   gpsApplying=true;
   try{
    window.ViaSearchLocation?.update(pos.lat,pos.lng);
    window.ViaAddress?.set('home-origin',chosen);
    gpsInput?.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:chosen}))
   }finally{gpsApplying=false}
   finishGps(run);
   if(pos.quality==='low'||pos.quality==='stale'||pos.accuracyMeters>100)
    gpsPanel('Ubicación aproximada','Precisión aproximada: ±'+Math.round(pos.accuracyMeters)+
     ' m. Confirmá el punto de recogida en el mapa.',
     [{label:'Elegir en el mapa',go:openGpsMap,primary:true},
      {label:'Reintentar GPS',go:startGps}]);
   else {
    // Do not infer a house number from text: street names such as "Ruta 8"
    // end in a digit too. Trust the geo-v2 explicit nearby-portal flag only.
    const streetFound=decision?.postalStatus==='suggested'&&
     typeof info?.street==='string'&&!!info.street.trim();
    if(!streetFound)
     gpsPanel('Confirmá el punto','El GPS ubicó el punto, pero no identificó la calle. Marcá la entrada en el mapa o escribí tu dirección.',
      [{label:'Elegir en el mapa',go:openGpsMap,primary:true}]);
    else if(!chosen.numberIsApproximate)
     gpsPanel('Número por confirmar','Detectamos una calle cercana. Confirmá el número o ajustá el punto en el mapa.',
      [{label:'Elegir en el mapa',go:openGpsMap,primary:true}]);
    else
     gpsPanel('Número orientativo','Es un número cercano, no necesariamente tu puerta. Verificá el punto.',
      [{label:'Ajustar en el mapa',go:openGpsMap}]);
   }
  }catch(err){if(finishGps(run))gpsFailure(err)}
 },err=>{if(finishGps(run))gpsFailure(err)});
}
gpsButton?.addEventListener('click',async()=>{
 if(gpsRun)return;
 const ticket=++gpsPermissionTicket;
 if(!window.isSecureContext||!navigator.geolocation){startGps();return}
 let state=null;
 try{state=(await navigator.permissions?.query({name:'geolocation'}))?.state||null}catch{}
 if(ticket!==gpsPermissionTicket)return;
 if(state==='denied'){blockedGps();return}
 if(state==='prompt'){
  gpsPanel('Activá tu ubicación',
   'Usamos tu ubicación para encontrar el punto de recogida. Vos confirmás la dirección antes de solicitar el traslado.',
   [{label:'Permitir ubicación',go:startGps,primary:true},
    {label:'Elegir en el mapa',go:openGpsMap}]);return}
 startGps();
});
document.getElementById('home-destination')?.addEventListener('focus',()=>{
 if(!gpsRun)gpsPanel('','');
});
gpsInput?.addEventListener('input',()=>{
 ++gpsPermissionTicket;
 if(gpsRun){cancelGps();gpsPanel('Dirección manual','Conservamos la dirección que escribiste.')}
});
gpsInput?.addEventListener('via:address',()=>{
 if(gpsApplying)return;
 ++gpsPermissionTicket;
 if(gpsRun){cancelGps();gpsPanel('','')}
});
window.addEventListener('pagehide',()=>{++gpsPermissionTicket;cancelGps()});
window.addEventListener('hashchange',()=>{++gpsPermissionTicket;cancelGps()});
window.addEventListener('popstate',()=>{++gpsPermissionTicket;cancelGps()});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='hidden'){++gpsPermissionTicket;cancelGps()}
});

})();

/* El diseño utiliza medidas CSS estables: nunca reescalar con JS al recibir GPS. */
