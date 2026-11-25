// Patch only autocomplete positioning + POI local cache, preserving all address selection logic.
import {readFile,writeFile} from 'node:fs/promises';
const path=process.argv[2];let s=await readFile(path,'utf8');
const start=s.indexOf('function position(input)'),end=s.indexOf('function line(',start);
if(start<0||end<start)throw Error('Autocomplete layout contract changed');
const patch=String.raw`let layoutFrame=0;
function viewport(){const v=window.visualViewport;return {top:v?.offsetTop||0,left:v?.offsetLeft||0,width:v?.width||window.innerWidth,height:v?.height||window.innerHeight}}
function position(input){
 const v=viewport(),r=input.getBoundingClientRect(),gap=12,edge=8;
 const keyboard=window.innerHeight-v.height>100||v.top>20;
 if(keyboard&&document.activeElement===input&&(r.bottom>v.top+v.height-16||r.top<v.top+16)){
  input.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
 }
 const box=(input.closest('.reference-field')||input).getBoundingClientRect(),view=viewport();
 const w=Math.min(Math.max(input.getBoundingClientRect().width,286),view.width-2*edge);
 const below=Math.max(0,view.top+view.height-edge-box.bottom-gap);
 const above=Math.max(0,box.top-view.top-edge-gap);
 const down=below>=Math.min(180,above)||below>=above;
 const h=Math.min(295,down?below:above);
 panel.style.width=Math.max(0,w)+'px';
 panel.style.left=Math.max(view.left+edge,Math.min(input.getBoundingClientRect().left,view.left+view.width-w-edge))+'px';
 panel.style.boxSizing='border-box';
 panel.style.maxHeight=h+'px';panel.style.bottom='auto';
 panel.style.visibility=h<36?'hidden':'visible';
 // Explicit top from measured panel height avoids WebKit bottom/viewport ambiguity.
 panel.style.top=(down?box.bottom+gap:Math.max(view.top+edge,box.top-gap-panel.offsetHeight))+'px';
}
function relayout(){if(layoutFrame)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;if(active&&!panel.classList.contains('hidden'))position(active)})}
window.visualViewport?.addEventListener('resize',relayout);
window.visualViewport?.addEventListener('scroll',relayout);
window.addEventListener('scroll',relayout,{passive:true});
document.addEventListener('scroll',relayout,{passive:true,capture:true});
document.addEventListener('focusin',e=>{if(fields.includes(e.target))relayout()});
const localPoiKey='via-poi-cache-v1';
async function fetchPlaces(endpoint,signal){
 const u=new URL(endpoint,location.origin),q=u.searchParams.get('q')||'';
 let key=null;
 if(q.length>=4&&!/\d/.test(q)&&!/^(calle|avenida|ruta|camino|rambla|av)\b/i.test(q)&&window.crypto?.subtle){
  try{
   const norm=q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
   const cell=['lat','lng'].map(k=>u.searchParams.has(k)?Number(u.searchParams.get(k)).toFixed(3):'').join(',');
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('poi-v1|'+norm+'|'+cell));
   key=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
   const rows=JSON.parse(localStorage.getItem(localPoiKey)||'{}'),hit=rows[key];
   if(hit&&hit.at<=Date.now()&&Date.now()-hit.at<86400000&&Array.isArray(hit.body?.results)&&hit.body.results.length)return hit.body;
  }catch{}
 }
 const res=await fetch(endpoint+'&mode=places',{signal});if(!res.ok)throw Error('POI HTTP '+res.status);
 const body=await res.json();
 if(key&&Array.isArray(body.results)&&body.results.length&&body.results.every(x=>x.kind==='place'&&x.source==='Geoapify Places')&&JSON.stringify(body).length<16000){
  try{const rows=JSON.parse(localStorage.getItem(localPoiKey)||'{}');rows[key]={at:Date.now(),body};
   const kept=Object.entries(rows).filter(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&v.at<=Date.now()&&Date.now()-v.at<86400000).sort((a,b)=>b[1].at-a[1].at).slice(0,32);
   localStorage.setItem(localPoiKey,JSON.stringify(Object.fromEntries(kept)));
  }catch{}
 }
 return body;
}
`;
const ranking=(await readFile(new URL('../addons/v304-search-ranking.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
s=s.slice(0,start)+ranking+patch+s.slice(end);
const once=(from,to)=>{if(s.split(from).length!==2)throw Error('Ranking contract: '+from.slice(0,95));s=s.replace(from,to)};
once("const point=window.ViaSearchLocation.get()||[document.getElementById('home-origin'),document.getElementById('origin')].map(e=>e?.dataset).find(d=>d?.lat&&d?.lng);",
"const point=viaPoint(window.ViaSearchLocation.get())||(input.id.includes('destination')?[document.getElementById('home-origin'),document.getElementById('origin')].map(e=>e?.dataset).filter(d=>d?.addressSelected==='true').map(viaPoint).find(Boolean):null);");
const orderStart=s.indexOf('const poiSlots=Math.min('),orderEnd=s.indexOf('const unique=new Map()',orderStart);
if(orderStart<0||orderEnd<orderStart)throw Error('Unknown ranking merge');
s=s.slice(0,orderStart)+"const results=viaRank(q,[...poiResults,...streetResults],point,looksLikeAddress||looksLikeStreetInput);\n  "+s.slice(orderEnd);
once("display(input,[...unique.values()].slice(0,12));","display(input,[...unique.values()].slice(0,12),point);");
once("function display(input,items){","function display(input,items,point){");
once("main.textContent=place.street;","main.textContent=place.name||place.street;");
const subStart=s.indexOf('sub.textContent=([place.city'),subEnd=s.indexOf("btn.addEventListener('pointerdown'",subStart);
if(subStart<0||subEnd<subStart)throw Error('Unknown suggestion rendering');
s=s.slice(0,subStart)+String.raw`const detail=[place.city,place.department].filter(Boolean).filter((v,i,a)=>i===0||viaFold(v)!==viaFold(a[i-1])).join(' · ')||'Uruguay';
 sub.textContent=detail+(place.kind==='place'?' · Lugar de interés':place.accuracy==='portal'?' · Número identificado':' · Verificá el número');
 if(place.kind==='place'&&place.name&&place.street&&place.street!==place.name){const addr=place.street.replace(/^[^·]+ · /,'');if(addr!==place.street)sub.textContent=addr+' · '+detail}
 const copy=document.createElement('span');copy.className='via-suggestion-copy';copy.append(main,sub);
 const pin=document.createElementNS('http://www.w3.org/2000/svg','svg');pin.setAttribute('viewBox','0 0 24 24');pin.setAttribute('class','via-suggestion-pin');pin.setAttribute('aria-hidden','true');
 pin.innerHTML='<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/>';
 btn.append(pin,copy);
 const km=viaKm(point,place),distance=viaDistanceLabel(km);
 if(distance){const badge=document.createElement('span');badge.className='via-suggestion-distance';badge.textContent=distance;badge.title='Distancia aproximada en línea recta';badge.setAttribute('aria-label',distance+' en línea recta');btn.append(badge)}
 `+s.slice(subEnd);

const old="fetch(endpoint+'&mode=places',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()})";
if(s.split(old).length!==2)throw Error('Unknown POI fetch contract');
s=s.replace(old,"fetchPlaces(endpoint,abort.signal)");
s=s.replace("window.addEventListener('resize',()=>active&&position(active));","window.addEventListener('resize',relayout);");
// Android Back can hide the keyboard without a blur; invalidate only pending suggestions, never selected data.
const anchor="const clear=()=>";
if(!s.includes(anchor))throw Error('Autocomplete clear contract changed');
const endClear=s.indexOf(';\n',s.indexOf(anchor))+1;
if(endClear<1)throw Error('Autocomplete clear anchor');
s=s.slice(0,endClear)+"\ndocument.addEventListener('via:keyboard-dismiss',()=>{++seq;clearTimeout(timer);abort?.abort();clear()});"+s.slice(endClear);
await writeFile(path,s);
