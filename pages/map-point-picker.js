/* Vía Traslados QA: selección de punto de recogida por mapa, GPS opt-in */
(()=>{'use strict';
const ids=['home-origin','home-destination','origin','destination'];
const fallback={lat:-34.837,lng:-56.019};
const valid=(la,lo)=>Number.isFinite(la)&&Number.isFinite(lo)&&la>=-36&&la<=-30&&lo>=-59&&lo<=-52;
let overlay,map,target,trigger,heading,status,coordinates,nearby='',gpsSeq=0,reverseSeq=0,reverseAbort,reverseTimer,moved=false;
const coordsFor=input=>{const la=parseFloat(input.dataset.lat),lo=parseFloat(input.dataset.lng);return valid(la,lo)?{lat:la,lng:lo}:null};
function makeOverlay(){
 if(overlay)return;
 overlay=document.createElement('div');overlay.className='via-picker-backdrop';overlay.hidden=true;
 overlay.innerHTML='<section class="via-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="via-picker-title"><header class="via-picker-top"><div><span class="via-picker-eyebrow">SELECCIÓN EN EL MAPA · QA</span><h2 id="via-picker-title">Elegí un punto</h2></div><button type="button" class="via-picker-close" aria-label="Cerrar mapa">×</button></header><p class="via-picker-help">Mové el mapa para colocar la chincheta en la entrada exacta.</p><div class="via-picker-map" id="via-picker-map"><div class="via-picker-pin" aria-hidden="true"><svg width="44" height="56" viewBox="0 0 44 56"><path d="M22 3C11 3 3 11 3 22c0 16 19 30 19 30s19-14 19-30C41 11 33 3 22 3z" fill="#007970" stroke="white" stroke-width="3"/><circle cx="22" cy="22" r="8" fill="white"/></svg></div></div><div class="via-picker-status" aria-live="polite"><strong class="via-nearby">Punto marcado</strong><small class="via-coordinates"></small></div><footer class="via-picker-controls"><div class="via-picker-buttons"><button type="button" class="via-picker-recenter">◎ Cerca de mí</button><button type="button" class="via-picker-confirm">Confirmar punto</button></div><p>El nombre de la calle puede ser aproximado. Se guardará la posición exacta que elijas.</p></footer></section>';
 document.body.appendChild(overlay);
 heading=overlay.querySelector('#via-picker-title');status=overlay.querySelector('.via-nearby');coordinates=overlay.querySelector('.via-coordinates');
 overlay.querySelector('.via-picker-close').addEventListener('click',close);
 overlay.querySelector('.via-picker-confirm').addEventListener('click',confirm);
 overlay.querySelector('.via-picker-recenter').addEventListener('click',()=>locate(true));
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 document.addEventListener('keydown',e=>{if(!overlay.hidden&&e.key==='Escape'){e.preventDefault();close()}});
}
function setupMap(){
 if(map)return map;
 if(!window.L){status.textContent='No se pudo cargar el mapa. Podés ingresar la dirección manualmente.';return null}
 const node=overlay.querySelector('#via-picker-map');
 map=L.map(node,{zoomControl:false,attributionControl:true,scrollWheelZoom:false}).setView([fallback.lat,fallback.lng],13);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
 L.control.zoom({position:'topright'}).addTo(map);
 map.on('dragstart',()=>{moved=true});
 map.on('click',e=>{moved=true;map.panTo(e.latlng)});
 map.on('moveend',onMove);
 return map;
}
function onMove(){
 if(!map||overlay.hidden)return;
 const p=map.getCenter();
 if(!valid(p.lat,p.lng)){status.textContent='Elegí un punto dentro de Uruguay';coordinates.textContent='';return}
 coordinates.textContent='Punto: '+p.lat.toFixed(5)+', '+p.lng.toFixed(5);
 status.textContent='Buscando la calle más cercana…';nearby='';
 clearTimeout(reverseTimer);reverseAbort?.abort();const id=++reverseSeq;
 reverseTimer=setTimeout(async()=>{
  const ctl=new AbortController();reverseAbort=ctl;
  try{
   const url='/api/direcciones?mode=reverse&lat='+encodeURIComponent(p.lat)+'&lng='+encodeURIComponent(p.lng);
   const resp=await fetch(url,{signal:ctl.signal});if(!resp.ok)throw Error('No disponible');
   const data=await resp.json();if(id!==reverseSeq||overlay.hidden)return;
   const place=(data.results||[]).find(r=>r.street&&r.city);
   nearby=place?[place.street,place.city].join(', '):'';
   status.textContent=nearby?'Calle cercana: '+nearby:'No encontramos una calle cercana. Se conservará el punto.';
  }catch(e){if(id!==reverseSeq||overlay.hidden||e.name==='AbortError')return;status.textContent='Sin calle cercana disponible. Se conservará el punto.'}
 },450);
}
function locate(force){
 if(!navigator.geolocation){status.textContent='GPS no disponible. Mové el mapa manualmente.';return}
 const id=++gpsSeq,wasMoved=moved;
 status.textContent='Consultando el GPS con tu permiso…';
 navigator.geolocation.getCurrentPosition(pos=>{
  if(id!==gpsSeq||overlay.hidden)return;
  const {latitude:lat,longitude:lng}=pos.coords;
  if(!valid(lat,lng)){status.textContent='Ubicación fuera de Uruguay. Mové el mapa.';return}
  window.ViaSearchLocation?.update(lat,lng);
  if(!force&&moved&&!wasMoved)return;
  map?.setView([lat,lng],Math.max(map.getZoom(),17));
 },()=>{if(id===gpsSeq&&!overlay.hidden)status.textContent='Sin GPS. Podés mover el mapa para elegir el lugar.'},
 {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function open(input,button){
 makeOverlay();target=input;trigger=button;moved=false;nearby='';
 heading.textContent=input.id.includes('origin')?'Elegí el origen en el mapa':'Elegí el destino en el mapa';
 overlay.hidden=false;document.body.classList.add('via-map-picker-open');
 const m=setupMap();if(!m)return;
 const selected=coordsFor(input);
 const loc=window.ViaSearchLocation?.get();
 const nearbyGps=loc&&valid(Number(loc.lat),Number(loc.lng))?loc:null;
 const center=selected||nearbyGps||fallback;
 m.setView([center.lat,center.lng],selected?17:nearbyGps?16:13,{animate:false});
 requestAnimationFrame(()=>{m.invalidateSize();onMove()});
 if(!selected&&!nearbyGps)locate(false);
 overlay.querySelector('.via-picker-close').focus();
}
function close(){
 if(!overlay||overlay.hidden)return;
 overlay.hidden=true;document.body.classList.remove('via-map-picker-open');
 ++gpsSeq;++reverseSeq;clearTimeout(reverseTimer);reverseAbort?.abort();
 target=null;trigger?.focus();
}
function confirm(){
 if(!map||!target)return;
 const p=map.getCenter();
 if(!valid(p.lat,p.lng)){status.textContent='Elegí un punto dentro de Uruguay.';return}
 const geo=p.lat.toFixed(5)+', '+p.lng.toFixed(5);
 const result={label:nearby?'Punto en mapa, cerca de '+nearby+' ('+geo+')':'Punto elegido en mapa ('+geo+')',
  lat:p.lat,lng:p.lng,accuracy:'map',city:'',department:'',kind:'map'};
 const input=target;
 if(window.ViaAddress?.set)window.ViaAddress.set(input.id,result);
 else{input.value=result.label;input.dataset.lat=p.lat;input.dataset.lng=p.lng;input.dataset.accuracy='map'}
 input.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:result}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
 close();
}
const icon='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2z"/><path d="M9 3v16M15 5v16"/><circle cx="12" cy="11" r="2.3" fill="currentColor" stroke="none"/></svg>';
ids.forEach(id=>{
 const input=document.getElementById(id),container=input?.closest('.reference-field,.route-field');
 if(!input||!container)return;
 const button=document.createElement('button');button.type='button';button.className='via-map-shortcut';
 button.setAttribute('aria-label','Elegir '+(id.includes('origin')?'origen':'destino')+' en mapa');button.title='Elegir en mapa';
 button.innerHTML=icon;button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open(input,button)});
 container.appendChild(button);
});
window.ViaMapPicker={openFor:id=>{const input=document.getElementById(id);if(input)open(input,null)}};
})();