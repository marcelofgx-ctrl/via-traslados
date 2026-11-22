/* Vía Traslados V29.1.10. Pure presentation.
   Derives an initial ONLY from the name already shown in the authenticated UI.
   Does not read session storage or fetch profile data and never invents photographs. */
(()=>{
 'use strict';
 if(document.body?.dataset.page!=='mine')return;
 const root=document.body;
 const greeting=document.getElementById('mine-greeting');
 const avatar=document.querySelector('.via-mine-account__avatar');
 const welcome=document.getElementById('mine-welcome');
 if(!greeting||!avatar||!welcome)return;
 let scheduled=false;
 function update(){
  scheduled=false;
  const raw=(greeting.textContent||'').trim();
  const name=raw.replace(/^[¡!¿\s]*/,'').replace(/^hola\s*,?\s*/i,'').replace(/[!¡.,\s]+$/g,'').trim();
  if(!raw||!/^hola\b/i.test(raw.replace(/^[¡!¿\s]*/,''))||!name||welcome.classList.contains('hidden')){
   if(avatar.textContent!=='✓')avatar.textContent='✓';
   return;
  }
  const parts=name.split(/\s+/).filter(Boolean);
  const initial=(parts.length>1?parts[0][0]+parts[parts.length-1][0]:parts[0][0]).toLocaleUpperCase('es-UY');
  if(avatar.textContent!==initial)avatar.textContent=initial;
  // Preserve the real name, only add greeting punctuation in presentation.
  const wanted='¡Hola, '+name+'!';
  if(raw!==wanted)greeting.textContent=wanted;
 }
 function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(update);
 }
 new MutationObserver(schedule).observe(greeting,{childList:true,characterData:true,subtree:true});
 new MutationObserver(schedule).observe(welcome,{attributes:true,attributeFilter:['class']});
 root.classList.add('via-mine-v29110');
 schedule();
})();