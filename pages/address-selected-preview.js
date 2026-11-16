/* Vía Traslados QA: etiqueta de dirección en dos líneas; el input conserva el valor completo. */
(()=>{'use strict';
const pretty=value=>{
 const s=String(value||'').trim().replace(/\s+/g,' ');
 if(!s)return '';
 const letters=s.replace(/[^a-záéíóúñü]/gi,'');
 return letters&&letters===letters.toLocaleUpperCase('es-UY')
  ?s.toLocaleLowerCase('es-UY').replace(/(^|[\s/.-])(\p{L})/gu,
   (_,pre,ch)=>pre+ch.toLocaleUpperCase('es-UY'))
  :s;
};
for(const id of ['home-origin','home-destination']){
 const input=document.getElementById(id);
 const host=input?.closest('.field-copy');
 if(!input||!host)continue;
 const preview=document.createElement('div');
 preview.className='via-selected-preview';preview.setAttribute('role','button');
 preview.setAttribute('tabindex','0');preview.hidden=true;
 const street=document.createElement('span');street.className='via-selected-street';
 const locality=document.createElement('small');locality.className='via-selected-locality';
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
  street.textContent=pretty(segments[0]||label);
  const cityInfo=segments.slice(1).map(pretty).join(' · ');
  const distance=Number(input.dataset.referenceDistance);
  const approximate=input.dataset.numberIsApproximate==='true';
  const hint=approximate?'Número orientativo'+(distance>0?' · '+Math.round(distance)+' m':''):'';
  locality.textContent=quality==='gps'
    ?([cityInfo,hint||'ubicación GPS'].filter(Boolean).join(' · ')||
      'Sin dirección postal confirmada · marcá el punto en el mapa')
    :quality==='map'
      ?([cityInfo,hint||'punto ajustado en el mapa'].filter(Boolean).join(' · '))
      :cityInfo||'Dirección seleccionada';
  input.title=label;
  preview.setAttribute('aria-label','Dirección: '+label+'. Tocar para editar');
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