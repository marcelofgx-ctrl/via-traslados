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
 // Si el usuario no usa el atajo, la búsqueda manual no requiere GPS.
 if(!navigator.geolocation){
  gpsMessage('Tu navegador no permite usar GPS. Escribí la dirección de origen.');
  return;
 }
 locating=true;
 gpsButton.disabled=true;
 gpsButton.setAttribute('aria-busy','true');
 gpsMessage('');
 const done=()=>{
  locating=false;
  gpsButton.disabled=false;
  gpsButton.removeAttribute('aria-busy');
 };
 const denied=()=>{
  done();
  gpsMessage('No pudimos usar tu ubicación. Podés escribir el origen manualmente sin dar permisos.');
 };
 try{
  navigator.geolocation.getCurrentPosition(async pos=>{
   try{
    const lat=pos.coords.latitude,lng=pos.coords.longitude;
    if(!(-36<=lat&&lat<=-30&&-59<=lng&&lng<=-52)){
     gpsMessage('La ubicación está fuera de Uruguay. Escribí tu dirección.');
     return;
    }
    window.ViaSearchLocation?.update(lat,lng);
    const fallback={label:'Ubicación GPS ('+lat.toFixed(5)+', '+lng.toFixed(5)+')',lat,lng,accuracy:'gps',city:'',department:''};
    try{
     const r=await fetch('/api/direcciones?mode=reverse&lat='+encodeURIComponent(lat)+'&lng='+encodeURIComponent(lng));
     if(!r.ok)throw Error('Dirección no disponible');
     const d=await r.json();
     const addr=d.results?.[0];
     window.ViaAddress?.set('home-origin',addr?{...addr,lat,lng,accuracy:'gps'}:fallback);
    }catch{
     window.ViaAddress?.set('home-origin',fallback);
    }
    gpsMessage('');
   }catch{
    gpsMessage('No pudimos interpretar tu ubicación. Escribí la dirección de origen.');
   }finally{done();}
  },denied,{enableHighAccuracy:true,timeout:12000,maximumAge:120000});
 }catch{denied();}
});
})();

(()=>{
 const shell=document.querySelector('.premium-shell'), main=document.querySelector('.premium-main');
 const home=document.querySelector('.reference-home'), tabs=document.querySelector('.reference-tabs');
 if(!shell||!main||!home||!tabs)return;
 const adjust=()=>{
  if(document.body.classList.contains('in-booking'))return;
  home.style.zoom='1';tabs.style.zoom='1';
  const usable=main.clientHeight;
  const needed=home.scrollHeight+tabs.offsetHeight;
  if(usable>0&&needed>usable+2){
   const fit=Math.max(.68,Math.min(1,(usable-4)/needed));
   home.style.zoom=String(fit);tabs.style.zoom=String(fit);
  }
 };
 window.addEventListener('resize',adjust,{passive:true});
 requestAnimationFrame(adjust);
 window.addEventListener('load',adjust,{once:true});
})();
