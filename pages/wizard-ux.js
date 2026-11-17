/* Vía Traslados — revisión móvil del traslado, sin alterar la reserva ni la geocodificación. */
(()=>{'use strict';
 const form=document.getElementById('booking-form');
 const wizard=document.getElementById('solicitar');
 if(!form||!wizard)return;
 const entries=[];
 function displayAddress(address){
   const text=String(address||'').replace(/\s+/g,' ').trim()
     .replace(/^(?:Cerca de|Punto en mapa cerca de)\s+/i,'');
   const letters=text.replace(/[^\p{L}]/gu,'');
   if(letters.length<4||letters!==letters.toLocaleUpperCase('es-UY'))return text;
   return text.toLocaleLowerCase('es-UY').replace(/(^|[\s,])(\p{L})/gu,
     (full,prefix,letter)=>prefix+letter.toLocaleUpperCase('es-UY'));
 }
 for(const id of ['origin','destination']){
   const input=document.getElementById(id),summary=document.getElementById(id+'-readout');
   if(!input||!summary)continue;
   const parent=input.closest('.route-field'),value=summary.querySelector('.route-readout-text');
   if(!parent||!value)continue;
   let editMode=false;
   const render=()=>{
     if(editMode&&document.activeElement===input)return;
     editMode=false;
     const content=input.value.trim();
     const available=content.length>0;
     parent.classList.toggle('has-address',available);
     summary.classList.toggle('hidden',!available);
     if(available){
       value.textContent=displayAddress(content);
       const approx=/^(?:Cerca de|Punto en mapa cerca de)\s+/i.test(content);
       parent.classList.toggle('has-approximate-door',approx);
       summary.setAttribute('aria-label',(id==='origin'?'Origen':'Destino')+': '+displayAddress(content)+(approx?'. Número orientativo':'')+'. Tocar para editar');
     }
   };
   summary.addEventListener('click',()=>{
     editMode=true;
     parent.classList.remove('has-address');
     summary.classList.add('hidden');
     input.focus();
     const length=input.value.length;
     try{input.setSelectionRange(length,length)}catch{}
   });
   input.addEventListener('input',()=>{
     editMode=true;
     parent.classList.remove('has-address');
     summary.classList.add('hidden');
   });
   input.addEventListener('blur',()=>setTimeout(render,90));
   input.addEventListener('via:address',()=>setTimeout(render,0));
   entries.push(render);
 }
 function syncAll(){for(const fn of entries)fn()}
 document.getElementById('start-booking')?.addEventListener('click',()=>{
   requestAnimationFrame(()=>{syncAll();setTimeout(syncAll,70)});
 });
 document.getElementById('wizard-back')?.addEventListener('click',()=>{
   requestAnimationFrame(syncAll);
 });
 document.getElementById('to-contact')?.addEventListener('click',syncAll);
 const notes=document.getElementById('notes');
 const disclosure=document.getElementById('trip-notes');
 notes?.addEventListener('input',()=>{if(notes.value.trim())disclosure.open=true});
 syncAll();
})();
