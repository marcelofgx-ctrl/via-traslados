// Página de inicio QA: la invitación depende sólo de sesión verificada.
// Nunca consulta si un teléfono de terceros está registrado.
(()=>{
 'use strict';
 const panel=document.getElementById('via-home-account-invite');
 if(!panel)return;
 let sequence=0;
 async function update(){
  const my=++sequence;
  const store=window.ViaStore;
  if(!store?.customer){panel.hidden=false;return}
  let account;
  try{account=store.customer()}catch{panel.hidden=false;return}
  if(!account?.sessionToken){panel.hidden=false;return}
  // No mostrar "Crear cuenta" mientras se comprueba la sesión existente.
  panel.hidden=true;
  try{
   const verified=await store.resume();
   if(my!==sequence)return;
   const current=store.customer();
   panel.hidden=!(verified&&current?.sessionToken===account.sessionToken);
  }catch{
   if(my===sequence)panel.hidden=false;
  }
 }
 window.addEventListener('via-customer-session',()=>{void update()});
 window.addEventListener('pageshow',()=>{void update()});
 window.addEventListener('focus',()=>{void update()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void update()});
 void update();
})();
