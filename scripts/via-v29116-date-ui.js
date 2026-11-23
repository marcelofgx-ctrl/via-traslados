/* Vía Traslados v29.1.16 — presentation-only readable date overlay.
   Native input[type=date] remains the sole date value, interactive control,
   validation source and accessible calendar. No form, OTP, GPS, API or D1 writes. */
(()=>{
 'use strict';
 const input=document.getElementById('home-date');
 const host=input?.closest('.reference-option')?.querySelector('span');
 if(!input||!host||host.querySelector('#via-home-date-display'))return;
 const view=document.createElement('output');
 view.id='via-home-date-display';
 view.className='via-home-date-display';
 view.setAttribute('aria-hidden','true');
 input.insertAdjacentElement('afterend',view);
 function refresh(){
  // Read, never modify, the native input's ISO value.
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(input.value);
  view.textContent=match?match[3]+'/'+match[2]+'/'+match[1]:'Elegir fecha';
  view.dataset.iso=match?input.value:'';
 }
 input.addEventListener('input',refresh);
 input.addEventListener('change',refresh);
 // Browser back/forward restoration and page visibility changes have no
 // guaranteed input events. These are one-shot syncs, not background polling.
 window.addEventListener('pageshow',()=>queueMicrotask(refresh));
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')refresh();
 });
 refresh();
 requestAnimationFrame(refresh);
})();
