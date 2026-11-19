// Portada QA — saludo individual solo tras validar la sesión vigente.
// Nunca se consulta si un número de celular ajeno está registrado.
(()=>{
 'use strict';
 const invite=document.getElementById('via-home-account-invite');
 const greeting=document.getElementById('via-home-user-greeting');
 const nameSlot=document.getElementById('via-home-user-name');
 if(!invite||!greeting||!nameSlot)return;
 let sequence=0;
 const clear=()=>{
  greeting.hidden=true;
  nameSlot.textContent='';
 };
 const showGuest=()=>{
  clear();
  invite.hidden=false;
 };
 async function update(){
  const my=++sequence;
  const store=window.ViaStore;
  // Evitar pintar una identidad guardada localmente mientras la sesión
  // aún no fue validada con el backend correspondiente.
  clear();
  invite.hidden=true;
  if(!store?.customer){showGuest();return}
  let before;
  try{before=store.customer()}catch{if(my===sequence)showGuest();return}
  if(!before?.sessionToken){if(my===sequence)showGuest();return}
  try{
   const verified=await store.resume();
   if(my!==sequence)return;
   const current=store.customer();
   if(!verified||!current?.sessionToken||current.sessionToken!==before.sessionToken){
    showGuest();
    return;
   }
   invite.hidden=true;
   const name=String(current.profile?.name||'').trim().split(/\s+/)[0].slice(0,32);
   if(name){
    nameSlot.textContent=name;
    greeting.hidden=false;
   } else clear();
  }catch{
   if(my===sequence)showGuest();
  }
 }
 window.addEventListener('via-customer-session',()=>{void update()});
 window.addEventListener('pageshow',()=>{void update()});
 window.addEventListener('focus',()=>{void update()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void update()});
 void update();
})();
