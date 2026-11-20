import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='ui-v2915-build/assets/';
const sha=data=>createHash('sha256').update(data).digest('hex');
const old={
 reference:'7e4841b60c7a9796673ed7ad41e54446cac3eded802bcb1cb37971cec61fd47b',
 autocomplete:'bf3b671b4693b088a82259c5cbb9ed860e7b6c4f108aa43cf50e2e563a7aaf17',
 preview:'bf0f7aa019eab8f42fe8dc5fe12a2c559f5871ff07266a4c8ea0dc1fb4f234e8',
 app:'73afe2490a64b9a1c1b6cf4ce61283c1f68184208cbe783a70126cecc3b21e69',
 store:'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 geo:'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1'
};
for(const [name,path] of [['reference','reference.js'],['autocomplete','address-autocomplete.js'],
 ['preview','address-selected-preview.js'],['app','app.js'],['store','store.js'],['geo','geo-v2/core.mjs']]){
 assert.equal(sha(await readFile(dir+path)),old[name],'Fuente productiva cambió: '+path);
}
let gps=await readFile(dir+'reference.js','utf8');
let auto=await readFile(dir+'address-autocomplete.js','utf8');
let html=await readFile(dir+'index.html','utf8');
function one(source,from,to,title){
 assert.equal(source.split(from).length,2,'Ancla distinta/duplicada '+title);
 return source.replace(from,to);
}
const oldPosition="function position(input){const r=input.getBoundingClientRect(),w=Math.min(Math.max(r.width,286),window.innerWidth-20);panel.style.width=w+'px';panel.style.left=Math.min(Math.max(10,r.left),window.innerWidth-w-10)+'px';const bottomSpace=window.innerHeight-r.bottom;const h=Math.min(295,Math.max(138,bottomSpace-12));panel.style.maxHeight=h+'px';panel.style.top=(r.bottom+3)+'px';if(bottomSpace<152){panel.style.top='auto';panel.style.bottom='10px';panel.style.maxHeight='min(34dvh,235px)'}else panel.style.bottom='auto'}";
const newPosition=[
"// Anclar el desplegable al área REAL visible, no al alto oculto por el teclado Android.",
"function position(input){",
" const r=input.getBoundingClientRect(),vv=window.visualViewport;",
" const top=vv?vv.offsetTop:0,left=vv?vv.offsetLeft:0;",
" const viewW=vv?vv.width:window.innerWidth,viewH=vv?vv.height:window.innerHeight;",
" const bottom=top+viewH,right=left+viewW,pad=8;",
" const w=Math.min(Math.max(r.width,250),Math.max(160,viewW-2*pad));",
" const x=Math.max(left+pad,Math.min(r.left,right-w-pad));",
" const below=Math.max(0,bottom-r.bottom-pad-4),above=Math.max(0,r.top-top-pad-4);",
" const placeBelow=below>=132||(below>=above&&below>=68);",
" const space=placeBelow?below:above;",
" const height=Math.max(45,Math.min(260,space-1));",
" const y=placeBelow?Math.max(top+pad,r.bottom+3):Math.max(top+pad,r.top-height-3);",
" panel.style.width=w+'px';panel.style.left=x+'px';",
" panel.style.top=y+'px';panel.style.bottom='auto';",
" panel.style.maxHeight=Math.max(42,Math.min(height,bottom-y-pad))+'px';",
" panel.dataset.placement=placeBelow?'below':'above';",
"}"
].join("\n");
auto=one(auto,oldPosition,newPosition,'autocomplete positioning');
// El panel debe seguir al teclado y al scroll dinámico de visualViewport.
const oldListeners="document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target)&&!fields.includes(e.target))clear()});window.addEventListener('resize',()=>active&&position(active));";
const newListeners=[
"document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target)&&!fields.includes(e.target))clear()});",
"const reposition=()=>{if(active&&!panel.classList.contains('hidden'))position(active)};",
"window.addEventListener('resize',reposition);",
"window.addEventListener('orientationchange',reposition);",
"window.addEventListener('scroll',reposition,{passive:true,capture:true});",
"window.visualViewport?.addEventListener('resize',reposition,{passive:true});",
"window.visualViewport?.addEventListener('scroll',reposition,{passive:true});",
"document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});"
].join("\n");
auto=one(auto,oldListeners,newListeners,'viewport events');

// No alterar watchPosition, permisos ni geocoder: solo política de duración conservadora.
gps=one(gps,"let gpsRun=null,gpsPermissionTicket=0,gpsApplying=false;",
"let gpsRun=null,gpsPermissionTicket=0,gpsApplying=false,gpsSuccessTimer=null;\n"+
"// Identificación orientativa: Samsung Internet también incluye Chrome en su user-agent.\n"+
"function gpsWaitPolicy(){\n"+
" const ua=navigator.userAgent||'';\n"+
" if(/SamsungBrowser\\//i.test(ua))return {engine:'samsung-internet',limit:7500};\n"+
" if(/(?:Chrome|CriOS)\\//i.test(ua)&&!/(?:EdgA|EdgiOS|OPR|Opera|FxiOS|Firefox|UCBrowser)\\//i.test(ua))\n"+
"  return {engine:'chrome-family',limit:18000};\n"+
" return {engine:'other-browser',limit:8000};\n"+
"}",'browser policy');
gps=one(gps," '#via-gps-feedback .via-gps-help{margin-top:8px;white-space:pre-line}';",
" '#via-gps-feedback .via-gps-help{margin-top:8px;white-space:pre-line}' +\n"+
" '#via-gps-feedback.via-gps-success{padding:7px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +\n"+
" '#via-gps-feedback.via-gps-success strong{margin:0;font-size:12px}' +\n"+
" '#via-gps-feedback.via-gps-success p{display:none}' +\n"+
" '#via-gps-feedback.via-gps-success .via-gps-actions{margin:0}';",
'compact success CSS');
gps=one(gps,"function gpsPanel(title,copy,actions=[],help=''){\n const host=",
"function gpsPanel(title,copy,actions=[],help=''){\n"+
" if(gpsSuccessTimer!==null){clearTimeout(gpsSuccessTimer);gpsSuccessTimer=null}\n"+
" const host=",'dismiss timer');
gps=one(gps," note.hidden=false;\n if(title){",
" note.hidden=false;note.classList.toggle('via-gps-success',title==='Ubicación obtenida');\n if(title){",
'success style');
gps=one(gps," if(help){const p=document.createElement('p');p.className='via-gps-help';p.textContent=help;note.appendChild(p)}\n}",
" if(help){const p=document.createElement('p');p.className='via-gps-help';p.textContent=help;note.appendChild(p)}\n"+
" if(title==='Ubicación obtenida')gpsSuccessTimer=setTimeout(()=>{\n"+
"  gpsSuccessTimer=null;if(!gpsRun){note.hidden=true;note.replaceChildren()}\n"+
" },3800);\n}",'auto dismiss');
gps=one(gps,"function watchForBestGpsFix(ok,bad){\n let id=null,timer=null,done=false,best=null,clearLate=false;",
"function watchForBestGpsFix(ok,bad){\n"+
" const policy=gpsWaitPolicy();\n"+
" let id=null,timer=null,done=false,best=null,clearLate=false;\n"+
" window.__viaGpsPolicy=policy.engine; // Diagnóstico no sensible, nunca coordenadas.",'watcher adaptive policy');
gps=one(gps," timer=setTimeout(()=>best?stop(ok,best):stop(bad,{code:3}),18000);",
" timer=setTimeout(()=>best?stop(ok,best):stop(bad,{code:3}),policy.limit);",
'adaptive wait');
gps=one(gps," const run={value:gpsInput?.value||'',cancel:null,abort:null};",
" const run={value:gpsInput?.value||'',previous:window.ViaAddress?.get('home-origin'),cancel:null,abort:null};",
'previous GPS snapshot');
const anchor="   const chosen={label,lat:pos.lat,lng:pos.lng,accuracy:'gps',source:'gps',";
const preserve=[
"   // Preservar un número GPS ORIENTATIVO previo solo si la misma calle",
"   // continúa comprobándose con coordenadas casi idénticas; nunca inventar otra puerta.",
"   let heldDoor=false;",
"   const previous=run.previous;",
"   const prevStreet=String(previous?.label||'').split(',')[0].trim();",
"   const nextStreet=String(label||'').split(',')[0].trim();",
"   const normalize=s=>s.toLocaleLowerCase('es-UY').normalize('NFD')",
"    .replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim();",
"   const oldDoor=prevStreet.match(/\\s(\\d{1,6}[a-z]?)$/i);",
"   const newDoor=nextStreet.match(/\\s\\d{1,6}[a-z]?$/i);",
"   const dy=(pos.lat-Number(previous?.lat))*111200;",
"   const dx=(pos.lng-Number(previous?.lng))*111200*Math.cos(pos.lat*Math.PI/180);",
"   const separation=Math.hypot(dy,dx);",
"   if(previous?.source==='gps'&&previous?.numberIsApproximate&&oldDoor&&!newDoor&&",
"      Number.isFinite(separation)&&separation<=40&&",
"      Number(pos.accuracyMeters)<=100&&Number(previous.gpsAccuracy)<=100&&",
"      normalize(prevStreet.replace(/\\s\\d{1,6}[a-z]?$/i,''))===normalize(nextStreet)){",
"    label=previous.label;heldDoor=true;",
"   }",
anchor
].join("\n");
gps=one(gps,anchor,preserve,'stable approximate door');
gps=one(gps,"referenceDistance:info?.distanceMeters??null,\n    numberIsApproximate:!!decision?.numberIsApproximate",
"referenceDistance:heldDoor?previous.referenceDistance:(info?.distanceMeters??null),\n    numberIsApproximate:heldDoor||!!decision?.numberIsApproximate",
'approx label metadata');
gps=one(gps,"gpsInput?.addEventListener('input',()=>{",
"document.getElementById('home-destination')?.addEventListener('focus',()=>{\n"+
" if(!gpsRun)gpsPanel('','');\n"+
"});\n"+
"gpsInput?.addEventListener('input',()=>{",
'dismiss status on destination focus');

for(const anchor of ['content="29.1.4"','reference.js?v=29','address-autocomplete.js?v=26','app.js?v=29.2','address-selected-preview.js?v=29'])
 assert.equal(html.split(anchor).length,2,'index version expected once: '+anchor);
html=html.replace('content="29.1.4"','content="29.1.5"')
 .replace('reference.js?v=29','reference.js?v=30')
 .replace('address-autocomplete.js?v=26','address-autocomplete.js?v=27');
assert(html.includes('app.js?v=29.2')&&html.includes('address-selected-preview.js?v=29'));
assert.equal(gps.split('function watchForBestGpsFix').length,2);
assert(auto.includes("window.visualViewport?.addEventListener('resize'"));
await writeFile(dir+'reference.js',gps);
await writeFile(dir+'address-autocomplete.js',auto);
await writeFile(dir+'index.html',html);
console.log('VIA_UI_V2915_PATCHED '+JSON.stringify({
 modified:['reference.js','address-autocomplete.js','index.html'],
 previous:{reference:old.reference,autocomplete:old.autocomplete},
 updated:{reference:sha(gps),autocomplete:sha(auto),html:sha(html)},
 unchanged:{app:old.app,preview:old.preview,store:old.store,geo:old.geo},
 adaptiveGps:true,visualViewport:true,numberApproximateOnly:true
}));
