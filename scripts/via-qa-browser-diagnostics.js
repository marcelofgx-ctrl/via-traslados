/* QA-only, on-device diagnostic. Never transmits location or private data. */
(()=>{
'use strict';
const ua=navigator.userAgent;
const match=ua.match(/(Firefox|SamsungBrowser|EdgA?|Chrome)\/([\d.]+)/);
const browser=match?({SamsungBrowser:'Samsung Internet',EdgA:'Edge',Edg:'Edge'}[match[1]]||match[1])+' '+match[2]:'Otro';
const state={browser,permission:'sin consultar',gps:'sin probar',search:'sin probar',viewport:'',apiFailures:0};
const clean=x=>String(x).slice(0,180);
const box=document.createElement('section');box.id='via-qa-diagnostics';box.setAttribute('aria-label','Diagnóstico de QA');
box.innerHTML='<button id="via-qa-diag-toggle" type="button" aria-expanded="false">Diagnóstico QA</button><div id="via-qa-diag-body" hidden><div id="via-qa-diag-results" aria-live="polite"></div><div class="via-qa-diag-actions"><button type="button" id="via-qa-diag-gps">Probar GPS</button><button type="button" id="via-qa-diag-search">Probar buscador</button><button type="button" id="via-qa-diag-copy">Copiar resultado</button></div><small>No se guardan ni muestran coordenadas ni datos personales.</small></div>';
const css=document.createElement('style');
css.textContent=`
.via-qa-controls{display:flex;align-items:center;justify-content:flex-end;gap:7px;width:100%;box-sizing:border-box;max-width:100%;min-height:29px;padding:0 4px;font:11px/1.2 system-ui,sans-serif;position:relative;z-index:12}
.home-intro .via-qa-controls{margin:5px 0 -6px}
#solicitar>.via-qa-controls{margin:-8px 0 12px;padding:0 1px}
#via-qa-version{position:static!important;inset:auto!important;transform:none!important;display:inline-block;max-width:58vw;font:600 10px/1.25 system-ui,sans-serif;white-space:nowrap;pointer-events:none;border-radius:7px;padding:3px 6px;background:rgba(17,72,64,.86);color:#fff;z-index:auto!important}
#via-qa-diagnostics{position:relative;inset:auto;z-index:15;flex:none;font:11px/1.35 system-ui,sans-serif;color:#173f37;max-width:min(340px,calc(100vw - 20px))}
#via-qa-diagnostics button{border:1px solid #b5d1c9;border-radius:8px;background:#f2f9f6;color:#173f37;padding:5px 7px;font:600 10px/1.2 system-ui,sans-serif;cursor:pointer;white-space:nowrap}
#via-qa-diag-body{position:absolute;top:calc(100% + 5px);right:0;z-index:20;width:min(340px,calc(100vw - 24px));box-sizing:border-box;background:#fff;border:1px solid #c5d8d1;border-radius:12px;padding:10px;box-shadow:0 6px 24px #0002;max-height:45dvh;overflow:auto}
#via-qa-diag-results{white-space:pre-wrap;overflow-wrap:anywhere}.via-qa-diag-actions{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}
#via-qa-diag-body[hidden]{display:none}
#via-qa-identity-notice{display:none;align-items:flex-start;gap:9px;justify-content:space-between;flex-wrap:wrap;margin:0 0 12px;padding:9px 11px;border:1px solid #d1dfd8;border-radius:11px;background:#f3f8f5;color:#365951;font:500 12px/1.45 system-ui,sans-serif}
body.in-identity #via-qa-identity-notice{display:flex}
#via-qa-identity-notice a{color:#066b60;text-decoration:underline;text-underline-offset:3px;font-weight:700;white-space:nowrap}
`;
document.head.append(css);
const controls=document.createElement('div');controls.className='via-qa-controls';controls.id='via-qa-controls';
const version=document.getElementById('via-qa-version');if(version)controls.appendChild(version);
controls.appendChild(box);
function placeControls(){
 const parent=document.body.classList.contains('in-booking')?document.querySelector('#solicitar'):document.querySelector('.home-intro');
 if(!parent){if(!controls.isConnected)document.body.append(controls);return}
 if(parent.id==='solicitar'){
  const top=parent.querySelector('.wizard-top');
  if(top&&controls.previousElementSibling!==top)top.insertAdjacentElement('afterend',controls);
 }else if(controls.parentElement!==parent)parent.append(controls);
}
placeControls();
new MutationObserver(placeControls).observe(document.body,{attributes:true,attributeFilter:['class']});
// Identity is intentionally not connected to production. An opt-in local simulator
// helps exercise the passenger wizard without sending OTPs or creating real bookings.
const wizard=document.querySelector('#solicitar');
if(wizard){
 const active=window.VIA_CONFIG?.demo===true;
 const notice=document.createElement('aside');notice.id='via-qa-identity-notice';
 const message=document.createElement('span');
 message.textContent=active
  ? 'SIMULACIÓN QA · Para el código de prueba usá 123456. No se envían correos ni se crean reservas reales.'
  : 'QA técnica · La verificación real está deshabilitada para proteger producción.';
 const link=document.createElement('a');
 link.href=active?'?qa_sim=0':'?qa_sim=1';
 link.textContent=active?'Salir del simulador':'Probar simulador local';
 notice.append(message,link);
 wizard.querySelector('form')?.insertAdjacentElement('beforebegin',notice);
}


const result=box.querySelector('#via-qa-diag-results');
function update(){state.viewport=Math.round(window.visualViewport?.width||innerWidth)+'×'+Math.round(window.visualViewport?.height||innerHeight)+' / doc '+document.documentElement.scrollHeight;result.textContent=Object.entries(state).map(([k,v])=>k+': '+clean(v)).join('\n')}
update();window.visualViewport?.addEventListener('resize',update,{passive:true});window.addEventListener('resize',update,{passive:true});
box.querySelector('#via-qa-diag-toggle').onclick=()=>{const b=box.querySelector('#via-qa-diag-body');b.hidden=!b.hidden;box.querySelector('#via-qa-diag-toggle').setAttribute('aria-expanded',String(!b.hidden));update()};
async function permission(){try{if(!navigator.permissions?.query)return 'API no disponible';const p=await navigator.permissions.query({name:'geolocation'});return p.state}catch(e){return 'no disponible ('+clean(e.name)+')'}}
permission().then(p=>{state.permission=p;update()});
box.querySelector('#via-qa-diag-gps').onclick=async()=>{
 state.gps='consultando permiso…';update();state.permission=await permission();
 if(!navigator.geolocation){state.gps='API GPS no disponible';update();return}
 const started=performance.now();
 navigator.geolocation.getCurrentPosition(
 p=>{state.gps='OK ('+Math.round(performance.now()-started)+' ms, precisión '+Math.round(p.coords.accuracy)+' m; coordenadas ocultas)';update()},
 e=>{state.gps='Error '+e.code+' ('+clean(e.message)+', '+Math.round(performance.now()-started)+' ms)';update()},
 {enableHighAccuracy:true,timeout:18000,maximumAge:0}
 );
};
box.querySelector('#via-qa-diag-search').onclick=async()=>{
 state.search='consultando…';update();
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
 try{
 const t=performance.now();const r=await fetch('/api/direcciones?q=aeropuerto',{signal:controller.signal,headers:{Accept:'application/json'},cache:'no-store'});
 const body=await r.text();let type='';try{const json=JSON.parse(body);type=Array.isArray(json)?'array':Object.keys(json).slice(0,5).join(',')}catch{type='no JSON'}
 state.search='HTTP '+r.status+' ('+Math.round(performance.now()-t)+' ms; '+type+')';
 }catch(e){state.search='Error '+clean(e.name)+' '+clean(e.message)}finally{clearTimeout(timer);update()}
};
box.querySelector('#via-qa-diag-copy').onclick=()=>{
 const report='Vía QA diagnóstico\n'+Object.entries(state).map(([k,v])=>k+': '+v).join('\n');
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(report).then(()=>{state.copiado='sí';update()}).catch(()=>{state.copiado='no disponible';update()});
 else{state.copiado='no disponible';update()}
};
const originalFetch=window.fetch;window.fetch=function(input,init){const url=typeof input==='string'?input:input?.url||'';return originalFetch.apply(this,arguments).then(response=>{try{const p=new URL(url,location.href).pathname;if(p.startsWith('/api/')&&!response.ok){state.apiFailures++;state.ultimaAPI=p+' HTTP '+response.status;update()}}catch{}return response},error=>{try{const p=new URL(url,location.href).pathname;if(p.startsWith('/api/')){state.apiFailures++;state.ultimaAPI=p+' '+clean(error.name);update()}}catch{}throw error})};
})();
