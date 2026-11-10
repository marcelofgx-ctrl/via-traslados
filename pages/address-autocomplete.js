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
/* Corrección puntual de la localidad para el portal confirmado por el usuario.
   No cambiamos coordenadas del proveedor ni suponemos otras puertas o calles. */
function correctLocality(place,query=''){
 if(!place||place.kind==='place')return place;
 const plain=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-UY').replace(/[^a-z0-9]+/g,' ').trim();
 const street=plain(place.street||String(place.label||'').split(',')[0]);
 const requested=plain(query);
 const typedNumbers=requested.match(/\b\d{3,5}\b/g)||[];
 if(typedNumbers.length&&!typedNumbers.includes('1711'))return place;
 if(!/^(?:avenida |av )?roque saenz pena(?: 1711)?$/.test(street))return place;
 if(!/\b1711\b/.test(street+' '+requested))return place;
 if(place.department&&plain(place.department)!=='canelones')return place;
 const previousCity=plain(place.city);
 const oldLabel=String(place.label||'');
 if(previousCity!=='lagomar'&&!/(?:^|,)\s*lagomar\s*(?:,|$)/i.test(oldLabel))return place;
 const label=/(?:^|,)\s*lagomar\s*(?=,|$)/i.test(oldLabel)?
  oldLabel.replace(/\blagomar\b/ig,'Shangrilá'):
  [place.street,'Shangrilá',place.department||'Canelones'].filter(Boolean).join(', ');
 return {...place,city:'Shangrilá',label};
}

const setMeta=(input,place)=>{
 for(const key of ['lat','lng','accuracy','city','department','kind']){
  if(place&&place[key]!=null)input.dataset[key]=String(place[key]);else delete input.dataset[key];
 }
 input.dataset.addressSelected=place?'true':'false';
};
window.ViaAddress={set(id,place){const el=document.getElementById(id);if(!el)return;const fixed=correctLocality(place,el.value);el.value=fixed.label||'';setMeta(el,fixed)},copy(from,to){const a=document.getElementById(from),b=document.getElementById(to);if(!a||!b)return;b.value=a.value;setMeta(b,a.dataset.addressSelected==='true'?a.dataset:null)},get(id){const el=document.getElementById(id);if(!el)return null;return {label:el.value,lat:el.dataset.lat?Number(el.dataset.lat):null,lng:el.dataset.lng?Number(el.dataset.lng):null,accuracy:el.dataset.accuracy||'unconfirmed',city:el.dataset.city||'',department:el.dataset.department||''}}};
function position(input){const r=input.getBoundingClientRect(),w=Math.min(Math.max(r.width,286),window.innerWidth-20);panel.style.width=w+'px';panel.style.left=Math.min(Math.max(10,r.left),window.innerWidth-w-10)+'px';const bottomSpace=window.innerHeight-r.bottom;const h=Math.min(295,Math.max(138,bottomSpace-12));panel.style.maxHeight=h+'px';panel.style.top=(r.bottom+3)+'px';if(bottomSpace<152){panel.style.top='auto';panel.style.bottom='10px';panel.style.maxHeight='min(34dvh,235px)'}else panel.style.bottom='auto'}
function line(message,css){const node=document.createElement('div');node.className='address-line '+(css||'');node.textContent=message;panel.appendChild(node)}
function display(input,items){if(active!==input)return;panel.replaceChildren();position(input);panel.classList.remove('hidden');if(!items.length){line('No encontramos coincidencias. Probá con calle, número y localidad.','address-empty');return}
 items.map(place=>correctLocality(place,input.value)).forEach(place=>{const btn=document.createElement('button');btn.type='button';btn.className='address-choice';btn.setAttribute('role','option');const main=document.createElement('strong'),sub=document.createElement('small');main.textContent=place.street;sub.textContent=([place.city,place.department].filter(Boolean).join(' · ')||'Uruguay')+(place.kind==='place'?' · Lugar de interés'+(Number.isFinite(place.distanceKm)?' · '+place.distanceKm+' km en línea recta':''):place.accuracy==='portal'?' · Puerta identificada':' · Verificá el número');btn.append(main,sub);btn.addEventListener('pointerdown',e=>e.preventDefault());btn.addEventListener('click',async()=>{const source=input;
  const written=source.value;const number=(written.match(/\b[1-9]\d{2,4}\b/g)||[]).pop();
  let chosen=correctLocality(place,written);
  if(number&&chosen.kind!=='place'){const endNumber=(place.street.match(/\b[1-9]\d{2,4}\b$/)||[])[0];
   if(endNumber!==number){const street=place.street.replace(/\s+[1-9]\d{2,4}$/, '')+' '+number;
    chosen=correctLocality({...chosen,street,label:[street,chosen.city,chosen.department].filter(Boolean).join(', '),accuracy:'street',lat:null,lng:null},written);
   }
  }
  source.value=chosen.label;setMeta(source,chosen);clear();source.blur();/* resolver portal o calle de manera asíncrona */
  if(chosen.kind==='place'){source.dispatchEvent(new CustomEvent('via:address',{detail:chosen}));return;}
  try{const r=await fetch('/api/direcciones?mode=resolve&q='+encodeURIComponent(chosen.label));if(!r.ok)return;const d=await r.json();const best=(d.results||[])[0];if(best&&source.value===chosen.label){const fixed=correctLocality(best,chosen.label);setMeta(source,fixed);source.dispatchEvent(new CustomEvent('via:address',{detail:fixed}))}}catch{/* se conserva la calle seleccionada */}
 });panel.append(btn)})}
function search(input){const q=input.value.trim();clearTimeout(timer);if(abort)abort.abort();const mySeq=++seq;if(q.length<3){clear();return}active=input;position(input);panel.replaceChildren();line('Buscando direcciones y lugares…','address-loading');panel.classList.remove('hidden');timer=setTimeout(async()=>{
 abort=new AbortController();try{
  const point=window.ViaSearchLocation.get()||[document.getElementById('home-origin'),document.getElementById('origin')].map(e=>e?.dataset).find(d=>d?.lat&&d?.lng);
  const position=point?'&lat='+encodeURIComponent(point.lat)+'&lng='+encodeURIComponent(point.lng):'';
  const endpoint='/api/direcciones?q='+encodeURIComponent(q)+position;
  const [streets,places]=await Promise.allSettled([fetch(endpoint+'&mode=suggest',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}),fetch(endpoint+'&mode=places',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()})]);
  if(mySeq!==seq||active!==input)return;
  const results=[...(places.status==='fulfilled'?places.value.results||[]:[]),...(streets.status==='fulfilled'?streets.value.results||[]:[])];
  const unique=new Map();for(const p of results){const key=(p.label||'').toLocaleLowerCase('es');if(!unique.has(key))unique.set(key,p)}
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
