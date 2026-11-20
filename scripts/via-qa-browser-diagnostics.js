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
const css=document.createElement('style');css.textContent='#via-qa-diagnostics{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 78px);right:8px;z-index:99990;font:12px/1.4 system-ui,sans-serif;color:#173f37;max-width:min(340px,calc(100vw - 16px))}#via-qa-diagnostics button{border:1px solid #b5d1c9;border-radius:9px;background:#f2f9f6;color:#173f37;padding:8px;font:600 12px system-ui,sans-serif;cursor:pointer}#via-qa-diag-toggle{float:right}#via-qa-diag-body{clear:both;background:#fff;border:1px solid #c5d8d1;border-radius:12px;padding:10px;box-shadow:0 6px 24px #0002;max-height:45dvh;overflow:auto}#via-qa-diag-results{white-space:pre-wrap;overflow-wrap:anywhere}.via-qa-diag-actions{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}#via-qa-diag-body[hidden]{display:none}';
document.head.append(css);document.body.append(box);
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
