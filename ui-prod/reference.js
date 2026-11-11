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
$('location-shortcut')?.addEventListener('click',()=>{
if(!navigator.geolocation){alert('Tu navegador no admite geolocalización. Podés escribir el origen manualmente.');return}
navigator.geolocation.getCurrentPosition(async pos=>{const lat=pos.coords.latitude,lng=pos.coords.longitude;
  if(!(-36<=lat&&lat<=-30&&-59<=lng&&lng<=-52)){alert('La ubicación está fuera de Uruguay. Ingresá una dirección manualmente.');return}
  window.ViaSearchLocation?.update(lat,lng);
  const fallback={label:`Ubicación GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`,lat,lng,accuracy:'gps',city:'',department:''};
  try{const r=await fetch(`/api/direcciones?mode=reverse&lat=${lat}&lng=${lng}`);if(!r.ok)throw Error('Sin dirección');const d=await r.json();const addr=d.results?.[0];window.ViaAddress?.set('home-origin',addr?{...addr,lat,lng,accuracy:'gps'}:fallback);}
  catch{window.ViaAddress?.set('home-origin',fallback)}
 },()=>{alert('No fue posible obtener tu ubicación. Ingresá el origen manualmente.');},{enableHighAccuracy:true,timeout:12000,maximumAge:120000});
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
