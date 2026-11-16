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
  gpsMessage('No hay acceso al GPS. Podés escribir la dirección o elegirla en el mapa.');
  return;
 }
 const input=$('home-origin');
 const original=input?.value||'';
 let completed=false;
 locating=true;gpsButton.disabled=true;
 gpsButton.setAttribute('aria-busy','true');
 gpsButton.setAttribute('aria-label','Buscando dirección cercana');
 // No cambiar el campo mientras se resuelve: evita el salto de toda la portada.
 const done=()=>{if(completed)return;completed=true;locating=false;gpsButton.disabled=false;
  gpsButton.removeAttribute('aria-busy');gpsButton.setAttribute('aria-label','Utilizar mi ubicación')};
 const valid=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52;
 try{
 navigator.geolocation.getCurrentPosition(async position=>{
  const {latitude:lat,longitude:lng,accuracy}=position.coords;
  if(!valid(lat,lng)){done();gpsMessage('La ubicación está fuera de Uruguay.');return}
  window.ViaSearchLocation?.update(lat,lng);
  let postal=null;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5200);
  try{
   const url='/api/direcciones?mode=reverse&lat='+encodeURIComponent(lat)+'&lng='+encodeURIComponent(lng);
   const response=await fetch(url,{signal:controller.signal});
   if(response.ok){
    const payload=await response.json();
    postal=(payload.results||[]).filter(r=>r.street&&
      Number.isFinite(Number(r.distanceMeters))&&r.distanceMeters<=100)
      .sort((a,b)=>a.distanceMeters-b.distanceMeters)[0]||null;
   }
  }catch{/* La posición GPS sigue disponible, aunque IDE no responda. */}
  finally{clearTimeout(timeout)}
  // Nunca modificar una dirección que el usuario ya escribió o eligió mientras esperaba.
  if(input&&input.value===original){
   const stripDoor=s=>String(s||'').trim().replace(/\s+(?:N[°ºo]?\s*)?\d{1,6}\s*$/i,'').trim();
   const roadway=postal?stripDoor(postal.street):'';
   const municipality=postal?.department||'';
   const label=roadway?'Cerca de '+roadway+(municipality?', '+municipality:''):
     'Punto GPS sin dirección postal confirmada';
   const picked={label,lat,lng,accuracy:'gps',city:'',department:municipality};
   window.ViaAddress?.set('home-origin',picked);
   input.dataset.gpsAccuracy=Number.isFinite(Number(accuracy))?String(Math.round(accuracy)):'';
   input.dataset.nearby=roadway;
   input.dataset.referenceDistance=postal?String(postal.distanceMeters):'';
   input.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:picked}));
  }
  done();
  if(Number.isFinite(Number(accuracy))&&accuracy>80)
   gpsMessage('La ubicación GPS es aproximada (±'+Math.round(accuracy)+' m). Ajustá la entrada en el mapa.');
  else gpsMessage('');
 },()=>{done();gpsMessage('No pudimos obtener el GPS. Podés ingresar la dirección manualmente.');},
 {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
 }catch{done();gpsMessage('GPS no disponible. Podés ingresar la dirección manualmente.')}
});
})();

/* El diseño utiliza medidas CSS estables: nunca reescalar con JS al recibir GPS. */
