import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const dir=process.argv[2];
const read=n=>readFileSync(dir+'/'+n,'utf8'),write=(n,s)=>writeFileSync(dir+'/'+n,s);
function once(s,from,to){assert.equal(s.split(from).length,2,'Unexpected source anchor: '+from.slice(0,90));return s.replace(from,()=>to)}
let app=read('app.js');
// Preserve button markup, icons and original text. Reset even when label omitted.
app=once(app,"if(!button.dataset.originalText)button.dataset.originalText=button.textContent;\n  button.disabled=busy;button.setAttribute('aria-busy',busy?'true':'false');\n  if(label)button.textContent=busy?label:button.dataset.originalText;",
"if(!button.dataset.originalMarkup)button.dataset.originalMarkup=button.innerHTML;\n  button.disabled=busy;button.setAttribute('aria-busy',busy?'true':'false');\n  if(busy&&label)button.textContent=label;\n  if(!busy)button.innerHTML=button.dataset.originalMarkup;");
// Only latest attempt can restore/navigate; a back/start invalidates the previous attempt.
app=once(app,"$('start-booking').addEventListener('click',()=>{","let viaContactAttempt=0;\n $('start-booking').addEventListener('click',()=>{\n  ++viaContactAttempt;onBusy('to-contact',false);");
app=once(app,"$('wizard-back').addEventListener('click',()=>{","$('wizard-back').addEventListener('click',()=>{\n   ++viaContactAttempt;onBusy('to-contact',false);");
app=once(app,"const epoch=++identityEpoch,before=current()?.sessionToken||null;\n   onBusy('to-contact',true,'Comprobando tu sesión…');","const epoch=++identityEpoch,before=current()?.sessionToken||null,attempt=++viaContactAttempt;\n   onBusy('to-contact',true,'Comprobando tu sesión…');");
// A 401/403 can clear the token during resume; allow identity step in that case, but never validate a different account.
app=once(app,"if(epoch!==identityEpoch||current()?.sessionToken!==before)return;\n     if(verified){","if(epoch!==identityEpoch||attempt!==viaContactAttempt)return;\n     const after=current()?.sessionToken||null;\n     if(after&&after!==before)return;\n     if(verified&&after===before){");
app=once(app,"}finally{onBusy('to-contact',false)}","}finally{if(attempt===viaContactAttempt)onBusy('to-contact',false)}");
write('app.js',app);
let store=read('store.js');
store=once(store,"const live=await request('/api/customer/me',{headers:{Authorization:'Bearer '+token}});","const controller=new AbortController();\n  const timer=setTimeout(()=>controller.abort(),8000);\n  let live;\n  try{live=await request('/api/customer/me',{headers:{Authorization:'Bearer '+token},signal:controller.signal});}\n  finally{clearTimeout(timer);}");
write('store.js',store);
let html=read('index.html');
// Add a discrete badge to home only, not a fixed overlay.
assert.equal((html.match(/class="home-intro(?: [^"]*)?"/g)||[]).length,1,'Home intro missing');
const label='<span id="via-visible-release" aria-label="Versión 30.4.9" style="display:block;font-size:10px;font-weight:600;line-height:1.1;opacity:.75;text-align:center;margin-top:4px">V30.4.9</span>';
const intro=/<([a-z]+)([^>]*class="home-intro(?: [^"]*)?"[^>]*)>/i;
const m=html.match(intro);assert(m);
html=html.replace(intro,(_,tag,attrs)=>'<'+tag+attrs+'>'+label);
html=once(html,'</body>', '<style id="via-v3049-empty-approx">.via-v3049-empty-origin .via-selected-accuracy{display:none!important}</style><script id="via-v3049-empty-approx-script" src="/via-v3049-state.js?v=30.4.9"></script></body>');
write('index.html',html);
write('via-v3049-state.js',String.raw`(()=>{'use strict';
 // Only affects the approximate marker's visibility; never changes map coordinates or lookup state.
 function sync(){
  for(const id of ['home-origin','origin']){
   const input=document.getElementById(id);if(!input)continue;
   const field=input.closest('.reference-field')||input.closest('.selected-field')||input.parentElement;
   if(!field)continue;
   const value=String(input.value||'').trim();
   field.classList.toggle('via-v3049-empty-origin',!value);
   // Some wizard markup uses a separate label. Hide only markers in the nearest origin-only wrapper.
   if(!value){for(const el of field.querySelectorAll('.via-selected-accuracy'))el.setAttribute('data-via-empty','1')}
   else{for(const el of field.querySelectorAll('.via-selected-accuracy[data-via-empty]'))el.removeAttribute('data-via-empty')}
  }
 }
 document.addEventListener('input',sync,true);document.addEventListener('change',sync,true);
 document.addEventListener('via:address',sync,true);
 document.addEventListener('click',()=>queueMicrotask(sync),true);
 window.addEventListener('pageshow',sync);
 const observer=new MutationObserver(sync);
 observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','value']});
 sync();
})();`);
