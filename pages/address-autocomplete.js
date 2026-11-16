/* Vía Traslados: sugerencias IDE Uruguay para origen y destino.
   La lista no altera el diseño aprobado: se dibuja como superposición. */
(()=>{'use strict';
const ids=['home-origin','home-destination','origin','destination'];
const fields=ids.map(id=>document.getElementById(id)).filter(Boolean);
let gps=null;window.ViaSearchLocation={update(lat,lng){if(Number.isFinite(Number(lat))&&Number.isFinite(Number(lng)))gps={lat:Number(lat),lng:Number(lng)}},get(){return gps}};
// Privacidad: no consultar permisos ni solicitar GPS al cargar la web. El atajo de ubicación es siempre opcional y se activa solo tras tocarlo.
if(!fields.length)return;
let active=null,seq=0,abort=null,timer=null;
const panel=document.createElement('div');panel.id='address-suggestions';panel.className='address-suggestions hidden';panel.setAttribute('role','listbox');document.body.appendChild(panel);
const clear=()=>{panel.replaceChildren();panel.classList.add('hidden');active=null};
// La localidad debe proceder de datos del proveedor o confirmación del usuario.
const correctLocality = place => place;

const setMeta=(input,place)=>{
 for(const key of ['lat','lng','accuracy','city','department','kind','source','postalStatus','gpsAccuracy','timestamp','referenceDistance','numberIsApproximate']){
  if(place&&place[key]!=null)input.dataset[key]=String(place[key]);else delete input.dataset[key];
 }
 input.dataset.addressSelected=place?'true':'false';
};
window.ViaAddress={
 set(id,place){const el=document.getElementById(id);if(!el)return;
  const fixed=correctLocality(place);
  el.value=fixed?.label||'';setMeta(el,fixed);
 },
 copy(from,to){const a=document.getElementById(from),b=document.getElementById(to);if(!a||!b)return;
  b.value=a.value;setMeta(b,a.dataset.addressSelected==='true'?a.dataset:null);
  b.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:window.ViaAddress.get(to)}));
 },
 get(id){const el=document.getElementById(id);if(!el)return null;
  return {label:el.value,lat:el.dataset.lat!==undefined?Number(el.dataset.lat):null,
   lng:el.dataset.lng!==undefined?Number(el.dataset.lng):null,
   accuracy:el.dataset.accuracy||'unconfirmed',
   source:el.dataset.source||'',postalStatus:el.dataset.postalStatus||'unknown',
   city:el.dataset.city||'',department:el.dataset.department||'',
   gpsAccuracy:el.dataset.gpsAccuracy!==undefined?Number(el.dataset.gpsAccuracy):null,
   timestamp:el.dataset.timestamp?Number(el.dataset.timestamp):null,
   referenceDistance:el.dataset.referenceDistance?Number(el.dataset.referenceDistance):null,
   numberIsApproximate:el.dataset.numberIsApproximate==='true'};
 }
};
function position(input){const r=input.getBoundingClientRect(),w=Math.min(Math.max(r.width,286),window.innerWidth-20);panel.style.width=w+'px';panel.style.left=Math.min(Math.max(10,r.left),window.innerWidth-w-10)+'px';const bottomSpace=window.innerHeight-r.bottom;const h=Math.min(295,Math.max(138,bottomSpace-12));panel.style.maxHeight=h+'px';panel.style.top=(r.bottom+3)+'px';if(bottomSpace<152){panel.style.top='auto';panel.style.bottom='10px';panel.style.maxHeight='min(34dvh,235px)'}else panel.style.bottom='auto'}
function line(message,css){const node=document.createElement('div');node.className='address-line '+(css||'');node.textContent=message;panel.appendChild(node)}
function display(input,items){if(active!==input)return;panel.replaceChildren();position(input);panel.classList.remove('hidden');if(!items.length){line('No encontramos coincidencias. Probá con calle, número y localidad.','address-empty');return}
 items.map(place=>correctLocality(place,input.value)).forEach(place=>{const btn=document.createElement('button');btn.type='button';btn.className='address-choice';btn.setAttribute('role','option');const main=document.createElement('strong'),sub=document.createElement('small');main.textContent=place.street;sub.textContent=([place.city,place.department].filter(Boolean).join(' · ')||'Uruguay')+(place.kind==='place'?' · Lugar de interés'+(Number.isFinite(place.distanceKm)?' · '+place.distanceKm+' km en línea recta':''):place.accuracy==='portal'?' · Número identificado (ubicación al seleccionar)':' · Verificá el número');btn.append(main,sub);btn.addEventListener('pointerdown',e=>e.preventDefault());btn.addEventListener('click',async()=>{const source=input;
  const written=source.value;const number=(written.split(',')[0].trim().match(/(?:^|\s)(\d{1,6}[a-z]?)$/i)||[])[1];
  let chosen=correctLocality(place,written);
  if(number&&chosen.kind!=='place'){const endNumber=(place.street.match(/(?:^|\s)(\d{1,6}[a-z]?)$/i)||[])[1];
   if(endNumber!==number){const street=place.street.replace(/\s+\d{1,6}[a-z]?$/i, '')+' '+number;
    chosen=correctLocality({...chosen,street,label:[street,chosen.city,chosen.department].filter(Boolean).join(', '),accuracy:'unconfirmed',lat:null,lng:null},written);
   }
  }
  // Una sugerencia no equivale a un portal certificado por IDE.
  if(chosen.kind!=='place'&&chosen.accuracy!=='portal')
   chosen={...chosen,lat:null,lng:null,accuracy:'unconfirmed',postalStatus:'unknown'};
  else chosen={...chosen,source:'address_search',
   postalStatus:chosen.accuracy==='portal'?'user_confirmed':'user_confirmed'};
  source.value=chosen.label;setMeta(source,chosen);clear();source.blur();/* resolver portal o calle de manera asíncrona */
  if(chosen.kind==='place'){source.dispatchEvent(new CustomEvent('via:address',{detail:chosen}));return;}
  try{const r=await fetch('/api/direcciones?mode=resolve&q='+encodeURIComponent(chosen.label));if(!r.ok)return;const d=await r.json();const best=(d.results||[])[0];if(best&&source.value===chosen.label&&best.accuracy==='portal'){
   // Si IDE no confirmó la puerta, mantener el texto sin geocodificar.
   const fixed={...best,source:'address_search',postalStatus:'user_confirmed'};setMeta(source,fixed);
   source.dispatchEvent(new CustomEvent('via:address',{detail:fixed}));
  }}catch{/* se conserva la calle escrita sin inventar el portal */}
 });panel.append(btn)})}
function search(input){const q=input.value.trim();clearTimeout(timer);if(abort)abort.abort();const mySeq=++seq;if(q.length<3){clear();return}active=input;position(input);panel.replaceChildren();line('Buscando direcciones…','address-loading');panel.classList.remove('hidden');timer=setTimeout(async()=>{
 abort=new AbortController();try{
  const point=window.ViaSearchLocation.get()||[document.getElementById('home-origin'),document.getElementById('origin')].map(e=>e?.dataset).find(d=>d?.lat&&d?.lng);
  const position=point?'&lat='+encodeURIComponent(point.lat)+'&lng='+encodeURIComponent(point.lng):'';
  const endpoint='/api/direcciones?q='+encodeURIComponent(q)+position;
  const isPlaceQuery=/\b(aeropuerto|shopping|hotel|hospital|sanatorio|terminal|estadio|universidad|costa urbana|centro comercial|plaza|teatro)\b/i.test(q);
  // Para calles, no bloquear resultados esperando una búsqueda adicional de lugares.
  const [streets,places]=await Promise.allSettled([
   fetch(endpoint+'&mode=suggest',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}),
   isPlaceQuery?fetch(endpoint+'&mode=places',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}):Promise.resolve({results:[]})
  ]);
  if(mySeq!==seq||active!==input)return;
  if(streets.status==='rejected'&&places.status==='rejected'){
   panel.replaceChildren();line('No se pudo consultar el buscador. Probá de nuevo o escribí la dirección manualmente.','address-empty');return;
  }
  const poiResults=places.status==='fulfilled'?places.value.results||[]:[];
  const streetResults=streets.status==='fulfilled'?streets.value.results||[]:[];
  const looksLikePlace=/\b(aeropuerto|shopping|hotel|hospital|terminal|estadio|universidad|centro comercial)\b/i.test(q);
  const looksLikeAddress=/\b\d{3,5}\b/.test(q)||/\b(calle|avenida|av\.?|ruta|camino|pasaje|bulevar|blvr\.?|esquina)\b/i.test(q);
  // Las consultas con calle o número deben priorizar direcciones; los POI, lugares.
  const results=(looksLikePlace&&!looksLikeAddress)?[...poiResults,...streetResults]:[...streetResults,...poiResults];
  const unique=new Map();for(const p of results){const key=(p.label||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(!unique.has(key))unique.set(key,p)}
  display(input,[...unique.values()].slice(0,12));
 }catch(e){if(mySeq!==seq||e.name==='AbortError')return;panel.replaceChildren();line('No se pudo buscar. Podés escribir la dirección manualmente.','address-empty')}
},410)}
// Corregir también direcciones prellenadas por el navegador al volver a Inicio.
function normalizeExistingAddress(input){
 const label=String(input.value||'');
 if(!label.includes(','))return;
 const [street,city,department]=label.split(',').map(part=>part.trim());
 const corrected=correctLocality({label,street,city,department},label);
 if(corrected.label!==label){
  input.value=corrected.label;
  if(input.dataset.addressSelected==='true')input.dataset.city=corrected.city;
 }
}
fields.forEach(normalizeExistingAddress);
window.addEventListener('pageshow',()=>fields.forEach(normalizeExistingAddress));
fields.forEach(input=>{input.setAttribute('autocomplete','off');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','address-suggestions');input.addEventListener('input',()=>{setMeta(input,null);search(input)});input.addEventListener('focus',()=>{if(input.value.trim().length>=3)search(input)});input.addEventListener('keydown',e=>{if(e.key==='Escape'){clear();return}if(e.key==='ArrowDown'&&!panel.classList.contains('hidden')){e.preventDefault();panel.querySelector('button')?.focus()}})});
document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target)&&!fields.includes(e.target))clear()});window.addEventListener('resize',()=>active&&position(active));
})();
