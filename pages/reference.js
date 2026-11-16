(()=>{'use strict';
const $=id=>document.getElementById(id);
const initialDate=new Date();initialDate.setDate(initialDate.getDate()+1);
if($('home-date')){$('home-date').value=initialDate.toLocaleDateString('en-CA');}
if($('home-time'))$('home-time').value='10:00';
$('menu-toggle')?.addEventListener('click',()=>{const menu=$('header-menu');const visible=menu.classList.toggle('hidden');$('menu-toggle').setAttribute('aria-expanded',String(!visible));});
const start=$('start-booking');start?.addEventListener('click',()=>{
const ids=[['home-origin','origin'],['home-destination','destination'],['home-date','date'],['home-time','time'],['home-passengers','passengers']];for(const [a,b] of ids){if($(a)&&$(b)&&$(a).value)$(b).value=$(a).value;if(window.ViaAddress&&(a.includes("origin")||a.includes("destination")))window.ViaAddress.copy(a,b);}
},{capture:true});
$('services-nav')?.addEventListener('click',e=>{e.preventDefault();start?.click()});
// El GPS es estrictamente opt-in: nunca pedir permisos al abrir la página ni
// bloquear la reserva si Android impide mostrar su diálogo de ubicación.
const gpsButton=$('location-shortcut');
let locating=false;
function gpsMessage(message){
 const box=document.querySelector('.reference-route-fields');
 if(!box)return;
 let note=$('via-gps-feedback');
 if(!note){
  note=document.createElement('p');
  note.id='via-gps-feedback';
  note.className='via-gps-feedback';
  note.setAttribute('role','status');
  note.setAttribute('aria-live','polite');
  box.insertAdjacentElement('afterend',note);
 }
 note.textContent=message;
 note.hidden=!message;
}
gpsButton?.addEventListener('click',()=>{
 if(locating)return;
 if(!navigator.geolocation){
  gpsMessage('Este dispositivo no permite obtener el GPS. Usá la búsqueda o el mapa.');
  return;
 }
 const input=$('home-origin'),previousValue=input?.value||'';
 let done=false;
 locating=true;gpsButton.disabled=true;gpsButton.setAttribute('aria-busy','true');
 gpsMessage('Buscando tu posición…');
 const finish=()=>{if(done)return;done=true;locating=false;gpsButton.disabled=false;gpsButton.removeAttribute('aria-busy')};
 try{
 navigator.geolocation.getCurrentPosition(async fix=>{
  const v2=window.ViaGeoV2;
  const pos=v2?.assessGpsFix?.(fix)||{
   valid:Number.isFinite(fix.coords.latitude)&&Number.isFinite(fix.coords.longitude),
   lat:fix.coords.latitude,lng:fix.coords.longitude,
   accuracyMeters:fix.coords.accuracy,quality:'approximate',ageMs:0
  };
  if(!pos.valid||!(pos.lat>=-36&&pos.lat<=-30&&pos.lng>=-59&&pos.lng<=-52)){
   gpsMessage('No pudimos obtener una ubicación válida. Elegí el punto en el mapa.');
   finish();return;
  }
  window.ViaSearchLocation?.update(pos.lat,pos.lng);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6500);
  let rows=[];
  try{
   const result=await fetch('/api/direcciones?mode=reverse&lat='+encodeURIComponent(pos.lat)+
    '&lng='+encodeURIComponent(pos.lng),{signal:controller.signal});
   if(result.ok)rows=(await result.json()).results||[];
  }catch{/* GPS válido sin domicilio confirmado */}
  finally{clearTimeout(timeout)}
  if(input&&input.value===previousValue){
   let decision;
   try{decision=v2?.buildPickupDisplay?.({
    point:{lat:pos.lat,lng:pos.lng,source:'gps',accuracyMeters:pos.accuracyMeters,
     timestamp:fix.timestamp||Date.now()},reverseCandidates:rows
   })}catch{}
   let label=decision?.title||'Punto GPS sin dirección postal confirmada';
   const info=decision?.nearbyReference;
   if(info)label+=[info.city,info.department].filter(Boolean).length?
     ', '+[info.city,info.department].filter(Boolean).join(', '):'';
   const chosen={label,lat:pos.lat,lng:pos.lng,accuracy:'gps',source:'gps',
    postalStatus:decision?.postalStatus||'unknown',
    city:info?.city||'',department:info?.department||'',
    gpsAccuracy:pos.accuracyMeters,timestamp:fix.timestamp||Date.now(),
    referenceDistance:info?.distanceMeters??null,
    numberIsApproximate:!!decision?.numberIsApproximate};
   window.ViaAddress?.set('home-origin',chosen);
   input.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:chosen}));
  }
  gpsMessage(pos.quality==='low'||pos.quality==='stale'?
   'El GPS tiene una precisión limitada (±'+Math.round(pos.accuracyMeters)+
   ' m). Abrí el mapa y ajustá el punto de recogida.':'');
  finish();
 },()=>{gpsMessage('No pudimos acceder al GPS. Podés buscar el origen o elegirlo en el mapa.');finish()},
 {enableHighAccuracy:true,timeout:12000,maximumAge:0});
 }catch{gpsMessage('GPS no disponible. Podés ingresar la dirección manualmente.');finish()}
});
})();

/* El diseño utiliza medidas CSS estables: nunca reescalar con JS al recibir GPS. */
