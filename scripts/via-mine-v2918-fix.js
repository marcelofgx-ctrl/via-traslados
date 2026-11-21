/* Vía Traslados v29.1.8: visual guest state only, no WebAuthn/API/session changes. */
(()=>{
'use strict';
const root=document.body;
if(root?.dataset.page!=='mine')return;
const welcome=document.getElementById('mine-welcome');
const login=document.getElementById('mine-login-card');
const signup=document.getElementById('mine-signup-card');
const input=document.getElementById('mine-login-phone');
const isGuest=()=>welcome?.classList.contains('hidden')===true;
function mode(){
 root.classList.toggle('mine-guest',isGuest());
 root.classList.toggle('mine-account',!isGuest());
}
function focusMode(){
 const active=document.activeElement;
 const field=active?.matches('#mine-login-phone,#mine-login-code,#mine-signup-card input')===true;
 root.classList.toggle('mine-input-focus',field&&isGuest());
 const viewport=window.visualViewport;
 if(field&&viewport&&viewport.height>220&&viewport.height<window.innerHeight-100){
  root.style.setProperty('--mine-vh',Math.round(viewport.height)+'px');
 }else if(!root.classList.contains('mine-keyboard-open')){
  root.style.removeProperty('--mine-vh');
 }
}
function update(){mode();focusMode()}
root.classList.add('via-mine-v2918');
if(welcome)new MutationObserver(update).observe(welcome,{attributes:true,attributeFilter:['class']});
for(const field of [input,document.getElementById('mine-login-code'),...signup?.querySelectorAll('input')||[]]){
 if(!field)continue;
 field.setAttribute('enterkeyhint','done');
 field.addEventListener('keydown',event=>{
  if(event.key==='Enter' && !event.isComposing){
   event.preventDefault();field.blur();
  }
 });
}
document.addEventListener('focusin',()=>requestAnimationFrame(focusMode));
document.addEventListener('focusout',()=>requestAnimationFrame(focusMode));
window.visualViewport?.addEventListener('resize',focusMode,{passive:true});
window.addEventListener('resize',focusMode,{passive:true});
window.addEventListener('via-customer-session',()=>requestAnimationFrame(update));
update();
})();