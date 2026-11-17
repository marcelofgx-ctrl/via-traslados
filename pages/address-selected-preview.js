/* Vía Traslados QA: etiqueta de dirección en dos líneas; el input conserva el valor completo. */
(()=>{'use strict';
const titleCase=s=>s.toLocaleLowerCase('es-UY')
 .replace(/(^|[\s/.-])(\p{L})/gu,(_,pre,ch)=>pre+ch.toLocaleUpperCase('es-UY'))
 .replace(/\b(De|Del|La|Las|Los|Y|En)\b/gu,word=>word.toLocaleLowerCase('es-UY'));
const pretty=value=>{
 const s=String(value||'').trim().replace(/\s+/g,' ');
 if(!s)return '';
 const prefix=s.match(/^(Cerca de|Punto en mapa cerca de)\s+(.+)$/i);
 if(prefix){
  const letters=prefix[2].replace(/[^a-záéíóúñü]/gi,'');
  if(letters&&letters===letters.toLocaleUpperCase('es-UY'))
   return (prefix[1].toLocaleLowerCase('es-UY').replace(/^\p{L}/u,x=>x.toLocaleUpperCase('es-UY'))+
    ' '+titleCase(prefix[2]));
 }
 const letters=s.replace(/[^a-záéíóúñü]/gi,'');
 return letters&&letters===letters.toLocaleUpperCase('es-UY')?titleCase(s):s;
};
// Evita dejar el número de puerta colgando solo en otra línea.
const withDoorTogether=s=>s.replace(/(\p{L})\s+(\d{1,6}[A-Za-z]?)$/u,'$1\u00a0$2');
for(const id of ['home-origin','home-destination']){
 const input=document.getElementById(id);
 const host=input?.closest('.field-copy');
 if(!input||!host)continue;
 const preview=document.createElement('div');
 preview.className='via-selected-preview';preview.setAttribute('role','button');
 preview.setAttribute('tabindex','0');preview.hidden=true;
 const street=document.createElement('span');street.className='via-selected-street';
 const locality=document.createElement('small');locality.className='via-selected-locality';
 const place=document.createElement('span');place.className='via-selected-place';
 const hint=document.createElement('span');hint.className='via-selected-accuracy';hint.hidden=true;
 locality.append(place,hint);
 preview.append(street,locality);host.appendChild(preview);
 const hide=()=>{
  preview.hidden=true;input.classList.remove('via-previewed-input');input.removeAttribute('tabindex');
 };
 const edit=()=>{
  hide();input.focus();
  try{input.setSelectionRange(input.value.length,input.value.length)}catch{}
 };
 preview.addEventListener('click',edit);
 preview.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();edit()}
 });
 function render(){
  if(document.activeElement===input)return;
  const quality=input.dataset.accuracy||'';
  const selected=input.dataset.addressSelected==='true'&&
   ['map','gps','portal','poi','intersection'].includes(quality);
  const label=String(input.value||'').trim();
  if(!selected||!label){hide();return}
  const segments=label.split(',').map(x=>x.trim()).filter(Boolean);
  street.textContent=withDoorTogether(pretty(segments[0]||label));
  const cityInfo=segments.slice(1).map(pretty).join(' · ');
  const distance=Number(input.dataset.referenceDistance);
  const approximate=input.dataset.numberIsApproximate==='true';
  place.textContent=cityInfo||(quality==='map'?'Punto ajustado en el mapa':
    quality==='gps'?'Referencia de ubicación GPS':'Dirección seleccionada');
  hint.textContent=approximate?'n.º aprox.':'';
  hint.hidden=!approximate;
  const fullInfo=approximate?' Número de puerta orientativo'+
    (distance>0?', a unos '+Math.round(distance)+' metros.':'.'):'';
  input.title=label+fullInfo;
  preview.setAttribute('aria-label','Dirección: '+label+'. '+place.textContent+'.'+fullInfo+' Tocar para editar');
  preview.hidden=false;input.classList.add('via-previewed-input');
  input.setAttribute('tabindex','-1');
 }
 input.addEventListener('via:address',()=>requestAnimationFrame(render));
 input.addEventListener('input',hide);
 input.addEventListener('focus',hide);
 input.addEventListener('blur',()=>setTimeout(render,100));
 window.addEventListener('pageshow',render);
 render();
}
})();