/* Vía Traslados V29.1.15 · selector preciso en producción; coordenadas ≠ domicilio certificado.
   GPS opt-in, consulta IDE solo para etiquetas y teselas sin precarga. */
(()=>{'use strict';
const ids=['home-origin','home-destination','origin','destination'];
const centerDefault={lat:-34.837,lng:-56.019};
const valid=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52;
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const coordsFor=input=>{const lat=Number(input?.dataset?.lat),lng=Number(input?.dataset?.lng);return input?.dataset?.lat&&input?.dataset?.lng&&valid(lat,lng)?{lat,lng}:null};
const compact=(str,max=75)=>String(str||'').trim().slice(0,max);
let root,map,tileLayer,glMap=null,mapMode=null,tileFailures=0,inputTarget,previousFocus,heading,reference,coords,searchBox,results,warning;
let gpsGeneration=0,searchGeneration=0,reverseGeneration=0,searchController,reverseController,searchTimer,reverseTimer,reverseWatchdog=null,reverseSettled=false,moved=false,nearby='',selectedPostal=null,isOpen=false;
let lastGeoPoint=null,lastReference=null,lastMapDimensions=null,resizeFrame=0;
function overlay(){
 if(root)return;
 root=document.createElement('div');root.className='via-picker-backdrop';root.hidden=true;
 root.innerHTML='<section class="via-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="via-picker-title" aria-describedby="via-picker-help"><header class="via-picker-top"><div><span class="via-picker-eyebrow">SELECCIÓN PRECISA</span><h2 id="via-picker-title">Elegí el punto</h2></div><button type="button" class="via-picker-close" aria-label="Cerrar mapa">×</button></header><p class="via-picker-help" id="via-picker-help">Mové el mapa hasta ubicar la entrada donde esperás al conductor.</p><div class="via-picker-search-wrap"><label for="via-picker-query" class="sr-map-label">Buscar calle, número o lugar</label><span class="via-picker-search-icon" aria-hidden="true">⌕</span><input type="search" id="via-picker-query" autocomplete="off" placeholder="Buscar calle, número o lugar…" enterkeyhint="search" aria-controls="via-picker-results" aria-autocomplete="list"><button type="button" class="via-picker-clear" aria-label="Limpiar búsqueda" hidden>×</button><div id="via-picker-results" class="via-picker-results" role="listbox" hidden></div></div><div class="via-picker-map" id="via-picker-map" aria-label="Mapa para señalar el punto exacto"><div class="via-picker-pin" aria-hidden="true"><svg viewBox="0 0 44 56" width="44" height="56"><path d="M22 3C11 3 3 11 3 22c0 16 19 30 19 30s19-14 19-30C41 11 33 3 22 3z" fill="#007970" stroke="white" stroke-width="3"/><circle cx="22" cy="22" r="8" fill="white"/></svg></div><div class="via-picker-tile-warning" hidden><span>Hay sectores del mapa sin cargar.</span><button type="button" class="via-picker-retry">Reintentar</button></div></div><div class="via-picker-status" aria-live="polite"><strong class="via-picker-reference">Punto listo para confirmar</strong><small class="via-picker-coordinates"></small></div><footer class="via-picker-controls"><div class="via-picker-buttons"><button type="button" class="via-picker-recenter">◎ Cerca de mí</button><button type="button" class="via-picker-confirm">Confirmar punto</button></div><p>La dirección es una referencia. Guardamos la latitud y longitud del punto que marcaste.</p></footer></section>';
 document.body.appendChild(root);
 heading=root.querySelector('#via-picker-title');reference=root.querySelector('.via-picker-reference');
 coords=root.querySelector('.via-picker-coordinates');searchBox=root.querySelector('#via-picker-query');
 results=root.querySelector('#via-picker-results');warning=root.querySelector('.via-picker-tile-warning');
 root.querySelector('.via-picker-close').addEventListener('click',close);
 root.querySelector('.via-picker-confirm').addEventListener('click',confirm);
 root.querySelector('.via-picker-recenter').addEventListener('click',()=>locate(true));
 root.querySelector('.via-picker-retry').addEventListener('click',retryTiles);
 root.querySelector('.via-picker-clear').addEventListener('click',()=>{searchBox.value='';clearResults();searchBox.focus()});
 searchBox.addEventListener('input',search);
 searchBox.addEventListener('keydown',e=>{if(e.key==='Escape'&&results&&!results.hidden){e.stopPropagation();clearResults()}else if(e.key==='ArrowDown'&&!results.hidden){e.preventDefault();results.querySelector('button')?.focus()}});
 root.addEventListener('click',e=>{if(e.target===root)close();if(!e.target.closest('.via-picker-search-wrap'))clearResults()});
 document.addEventListener('keydown',e=>{
  if(!isOpen)return;
  if(e.key==='Escape'){e.preventDefault();close();return}
  if(e.key==='Tab'){const list=[...root.querySelectorAll('button:not([hidden]):not([disabled]),input:not([disabled])')].filter(el=>el.getClientRects().length);if(!list.length)return;let index=list.indexOf(document.activeElement);if(e.shiftKey&&index<=0){e.preventDefault();list[list.length-1].focus()}else if(!e.shiftKey&&index===list.length-1){e.preventDefault();list[0].focus()}}
 });
 window.addEventListener('resize',()=>{if(isOpen&&map)requestAnimationFrame(()=>map.invalidateSize({pan:false}))},{passive:true});
}
function clearResults(){
 if(!results)return;
 results.replaceChildren();results.hidden=true;root.querySelector('.via-picker-clear').hidden=!searchBox.value;
}
function mapInit(){
 if(map)return map;
 const node=root.querySelector('#via-picker-map');
 // Intentar mapas vectoriales primero; algunos navegadores integrados Android
 // deshabilitan WebGL y obligan a usar una vista raster de menor detalle.
 const vectorLoaded=!!(window.maplibregl&&typeof window.maplibregl.Map==='function');
 const vectorSupported=vectorLoaded&&(
   typeof window.maplibregl.supported!=='function'||window.maplibregl.supported());
 if(vectorSupported){
  let gl=null;
  try{
   gl=new window.maplibregl.Map({
    container:node,style:'https://tiles.openfreemap.org/styles/liberty',
    center:[centerDefault.lng,centerDefault.lat],zoom:13,maxZoom:19,
    attributionControl:false,dragRotate:false,touchPitch:false,
    pitchWithRotate:false,renderWorldCopies:false,fadeDuration:0
   });
   gl.addControl(new window.maplibregl.NavigationControl({showCompass:false}),'top-right');
   gl.addControl(new window.maplibregl.AttributionControl({compact:false}),'bottom-right');
   mapMode='vector';glMap=gl;
   map={
    getCenter:()=>({lat:gl.getCenter().lat,lng:gl.getCenter().lng}),
    getZoom:()=>gl.getZoom(),
    setView:([lat,lng],zoom)=>{gl.jumpTo({center:[lng,lat],zoom,bearing:0,pitch:0});return map},
    panTo:point=>gl.easeTo({center:[point.lng,point.lat],duration:250}),
    invalidateSize:()=>gl.resize()
   };
   gl.on('dragstart',()=>{moved=true;selectedPostal=null;++searchGeneration;searchController?.abort();clearResults()});
   // La chincheta se ajusta arrastrando. No animar el mapa al tocarlo accidentalmente.
   gl.on('moveend',onMove);
   gl.on('error',()=>{
    if(!isOpen)return;
    tileFailures++;
    if(tileFailures>=2)warning.hidden=false;
   });
   gl.on('load',()=>{
    if(isOpen){tileFailures=0;warning.hidden=true;requestAnimationFrame(()=>gl.resize())}
    // Mostrar números reales de OSM solo cuando el proveedor los incluya.
    try{
     const vector=Object.entries(gl.getStyle()?.sources||{}).find(([,src])=>src?.type==='vector');
     if(vector&&!gl.getLayer('via-housenumbers')){
      gl.addLayer({id:'via-housenumbers',type:'symbol',source:vector[0],
       'source-layer':'housenumber',minzoom:16.5,
       layout:{'text-field':['coalesce',['get','housenumber'],['get','addr:housenumber'],''],
        'text-size':12,'text-allow-overlap':false,'text-padding':3},
       paint:{'text-color':'#36554b','text-halo-color':'#ffffff','text-halo-width':1.5}});
     }
    }catch{/* La ausencia de numeración nunca debe impedir usar el mapa. */}
   });
   if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{
    if(!isOpen)return;
    const rect=node.getBoundingClientRect(),width=Math.round(rect.width),height=Math.round(rect.height);
    if(lastMapDimensions&&Math.abs(lastMapDimensions.width-width)<3&&
       Math.abs(lastMapDimensions.height-height)<3)return;
    lastMapDimensions={width,height};
    if(resizeFrame)cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;if(isOpen)gl.resize()});
   }).observe(node);
   return map;
  }catch(e){
   try{gl?.remove()}catch{}
   glMap=null;map=null;mapMode=null;
   // El fallback no exige WebGL; informamos la degradación al usuario.
  }
 }
 if(!window.L){
  reference.textContent='No se pudo cargar el mapa. Podés escribir la dirección manualmente.';
  return null;
 }
 mapMode='raster';
 const info=warning.querySelector('span');
 info.textContent=vectorLoaded?
   'Modo básico: este navegador no habilita el mapa vectorial. Si faltan calles, abrí la página en Chrome desde el menú ⋮.':
   'Modo básico: el mapa avanzado no pudo cargarse. Si faltan calles, abrí la página en Chrome desde el menú ⋮.';
 warning.hidden=false;
 map=L.map(node,{zoomControl:false,scrollWheelZoom:false,attributionControl:true,zoomSnap:0.5,zoomDelta:0.5,maxZoom:19,
  updateWhenIdle:true,preferCanvas:true}).setView([centerDefault.lat,centerDefault.lng],13);
 // Se requieren menos imágenes por pantalla en navegadores embebidos, sin
 // perder precisión en la chincheta ni modificar coordenadas.
 tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  tileSize:512,zoomOffset:-1,maxNativeZoom:18,maxZoom:19,keepBuffer:0,updateWhenIdle:true,
  attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
 }).addTo(map);
 tileLayer.on('tileerror',()=>{tileFailures++;warning.hidden=false});
 tileLayer.on('load',()=>{if(tileFailures>0)warning.hidden=false});
 L.control.zoom({position:'topright'}).addTo(map);
 map.on('dragstart',()=>{moved=true;selectedPostal=null;++searchGeneration;searchController?.abort();clearResults()});
 // No desplazar automáticamente el mapa con un toque; el ajuste se hace arrastrando.
 map.on('moveend',onMove);
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(isOpen)requestAnimationFrame(()=>map.invalidateSize({pan:false}))}).observe(node);
 return map;
}
// La cartografía vectorial usa exclusivamente los números de puerta del mapa.
 // No dibujamos portales IDE adicionales, porque pueden contradecir su numeración.
function retryTiles(){
 if(!map)return;
 warning.hidden=mapMode!=='raster';tileFailures=0;
 if(mapMode==='vector'&&glMap){
  // Reiniciar estilo vectorial solo a petición del usuario; conservar la chincheta.
  glMap.setStyle('https://tiles.openfreemap.org/styles/liberty');
  requestAnimationFrame(()=>glMap.resize());
 }else if(tileLayer){
  tileLayer.redraw();
  requestAnimationFrame(()=>map.invalidateSize({pan:false}));
 }
}
// Distancia real entre coordenadas: ignora los subpíxeles debidos a redimensionar.
function meters(a,b){
 if(!a||!b)return Infinity;
 const p=Math.PI/180,dlat=(a.lat-b.lat)*p,dlng=(a.lng-b.lng)*p;
 const h=Math.sin(dlat/2)**2+
  Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dlng/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function referenceFromResults(point,rows){
 const result=window.ViaGeoV2?.buildPickupDisplay?.({point,reverseCandidates:rows||[]});
 const ref=result?.nearbyReference;
 if(!ref||result.postalStatus!=='suggested')return null;
 const roadNumber=/^(?:ruta(?:\s+nacional)?|calle|camino|pasaje|avenida|av\.)\s+\d{1,3}[a-z]?$/i
  .test(String(ref.nearbyPortal||'').trim());
 const approximate=!!result.numberIsApproximate&&!roadNumber;
 const streetHeadline=roadNumber?'Cerca de '+ref.nearbyPortal:result.title;
 const short=[streetHeadline,ref.city,ref.department].filter(Boolean).join(', ');
 return {point:{lat:point.lat,lng:point.lng},label:short,
  headline:streetHeadline,city:ref.city||'',department:ref.department||'',
  distanceMeters:ref.distanceMeters,numberIsApproximate:approximate};
}
function showReference(result){
 if(result){
  const metersAway=Math.round(result.distanceMeters);
  reference.textContent=result.headline+' · '+(result.numberIsApproximate?
   'N.º orientativo':'Número por confirmar')+' · a unos '+metersAway+' m';
  nearby=result.label;
 }else{
  nearby='';
  reference.textContent='Punto marcado en el mapa · Dirección sin confirmar. Podés confirmar las coordenadas.';
 }
}
async function getReverse(point,signal){
 const url='/api/direcciones?mode=reverse&lat='+encodeURIComponent(point.lat)+
  '&lng='+encodeURIComponent(point.lng);
 const response=await fetch(url,{signal});
 if(!response.ok)throw Error('Servicio de direcciones no disponible');
 const data=await response.json();
 return {rows:data.results||[],choice:referenceFromResults(point,data.results||[])};
}
function onMove(){
 if(!map||!isOpen)return;
 const p=map.getCenter(),point={lat:p.lat,lng:p.lng};
 if(!valid(point.lat,point.lng)){
  reference.textContent='Elegí un punto dentro de Uruguay.';coords.textContent='';return
 }
 // Las llamadas repetidas de MapLibre durante resize / repintado NO son
 // desplazamientos del usuario ni justifican otra consulta de direcciones.
 if(meters(lastGeoPoint,point)<1.5)return;
 lastGeoPoint=point;lastReference=null;nearby='';reverseSettled=false;
 coords.textContent='Punto marcado: '+point.lat.toFixed(6)+', '+point.lng.toFixed(6);
 reference.textContent='Identificando la dirección cercana…';
 clearTimeout(reverseTimer);clearTimeout(reverseWatchdog);
 reverseController?.abort();const serial=++reverseGeneration;
 // Independent 6.2s UI deadline, even when the embedded browser ignores abort().
 // Never move the pin or replace confirmed coordinates if the geocoder stalls.
 reverseWatchdog=setTimeout(()=>{
  if(!isOpen||serial!==reverseGeneration||!map||meters(map.getCenter(),point)>2)return;
  reverseSettled=true;lastReference=null;nearby='';
  ++reverseGeneration;reverseController?.abort();clearTimeout(reverseTimer);
  reference.textContent='No pudimos identificar la calle. Podés confirmar el punto o completar la dirección.';
 },6200);
 reverseTimer=setTimeout(async()=>{
  const ctl=new AbortController();reverseController=ctl;
  const timeout=setTimeout(()=>ctl.abort(),5200);
  try{
   const data=await getReverse(point,ctl.signal);
   if(serial!==reverseGeneration||!isOpen||meters(map.getCenter(),point)>2)return;
   reverseSettled=true;clearTimeout(reverseWatchdog);
   lastReference=data.choice;
   showReference(data.choice);
  }catch(e){
   if(serial!==reverseGeneration||!isOpen)return;
   reverseSettled=true;clearTimeout(reverseWatchdog);
   showReference(null);
  }finally{clearTimeout(timeout)}
 },450);
}
function locate(force){
 if(!navigator.geolocation){reference.textContent='GPS no disponible. Podés elegir el punto moviendo el mapa.';return}
 const id=++gpsGeneration;const wasMoved=moved;
 reference.textContent='Buscando tu posición con permiso del teléfono…';
 navigator.geolocation.getCurrentPosition(position=>{
  if(!isOpen||id!==gpsGeneration)return;
  const lat=position.coords.latitude,lng=position.coords.longitude;
  if(!valid(lat,lng)){reference.textContent='La posición GPS está fuera de Uruguay.';return}
  window.ViaSearchLocation?.update(lat,lng);
  if(!force&&moved&&!wasMoved)return;
  map?.setView([lat,lng],Math.max(map.getZoom(),17),{animate:false});
  const metres=Number(position.coords.accuracy);
  if(Number.isFinite(metres)&&metres>50)coords.textContent='GPS aproximado (±'+Math.round(metres)+' m). Ajustá el punto si es necesario.';
 },()=>{if(isOpen&&id===gpsGeneration)reference.textContent='Sin GPS. Buscá o mové el mapa manualmente.'},
 {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function search(){
 clearTimeout(searchTimer);searchController?.abort();const serial=++searchGeneration;
 clearResults();const q=searchBox.value.trim();
 root.querySelector('.via-picker-clear').hidden=!q;
 if(q.length<3)return;
 results.hidden=false;addHint('Buscando calles y lugares…');
 searchTimer=setTimeout(async()=>{
  const ctl=new AbortController();searchController=ctl;const timeout=setTimeout(()=>ctl.abort(),7000);
  try{
   const p=map?.getCenter()||centerDefault;
   const base='/api/direcciones?q='+encodeURIComponent(q)+'&lat='+encodeURIComponent(p.lat)+'&lng='+encodeURIComponent(p.lng);
   const asPlace=/aeropuerto|shopping|hotel|sanatorio|hospital|terminal|estadio|parque|plaza|universidad|shopping/i.test(q);
   const [a,b]=await Promise.allSettled([
    fetch(base+'&mode=suggest',{signal:ctl.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}),
    asPlace?fetch(base+'&mode=places',{signal:ctl.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}):Promise.resolve({results:[]})
   ]);
   if(!isOpen||serial!==searchGeneration)return;
   const rows=[...(asPlace&&b.status==='fulfilled'?(b.value.results||[]):[]),...(a.status==='fulfilled'?(a.value.results||[]):[]),...(!asPlace&&b.status==='fulfilled'?(b.value.results||[]):[])];
   const unique=[];const seen=new Set();
   for(const item of rows){const key=normal(item.street)+'|'+normal(item.city)+'|'+normal(item.department);if(!seen.has(key)){seen.add(key);unique.push(item)}}
   results.replaceChildren();results.hidden=false;
   if(!unique.length){addHint('Sin coincidencias. Podés ubicar el punto moviendo el mapa.');return}
   unique.slice(0,8).forEach(item=>{
    const button=document.createElement('button');button.type='button';button.className='via-picker-result';button.setAttribute('role','option');
    const strong=document.createElement('strong');strong.textContent=item.street||item.label;
    const small=document.createElement('small');small.textContent=[item.city,item.department].filter(Boolean).join(' · ')+(item.kind==='place'?' · Lugar':'');
    button.append(strong,small);
    button.addEventListener('click',()=>selectSuggestion(item));
    results.appendChild(button);
   });
  }catch(e){if(isOpen&&serial===searchGeneration){results.replaceChildren();addHint('Sin conexión con el buscador. Usá el mapa manualmente.')}}finally{clearTimeout(timeout)}
 },340);
}
function addHint(message){const p=document.createElement('p');p.className='via-picker-hint';p.textContent=message;results.appendChild(p)}
async function selectSuggestion(item){
 clearTimeout(searchTimer);searchController?.abort();const selectionId=++searchGeneration;
 const hadMoved=moved;
 clearResults();
 searchBox.value=item.label||item.street||'';
 root.querySelector('.via-picker-clear').hidden=false;
 searchBox.blur();
 let point=valid(Number(item.lat),Number(item.lng))&&item.lat!=null&&item.lng!=null?item:null;
 if(!point){
  reference.textContent='Comprobando si existe un portal exacto…';
  const ctl=new AbortController();searchController=ctl;const timeout=setTimeout(()=>ctl.abort(),7000);
  try{
   const query=item.label||item.street||searchBox.value;
   const response=await fetch('/api/direcciones?mode=resolve&q='+encodeURIComponent(query),{signal:ctl.signal});
   if(response.ok){const payload=await response.json();point=(payload.results||[]).find(p=>p.accuracy==='portal'&&p.lat!=null&&p.lng!=null&&valid(Number(p.lat),Number(p.lng)))||null}
  }catch{}finally{clearTimeout(timeout)}
 }
 if(!isOpen||selectionId!==searchGeneration||hadMoved!==moved)return;
 if(point){
  selectedPostal=point.accuracy==='portal'?{label:point.label,lat:Number(point.lat),lng:Number(point.lng),
   city:point.city,department:point.department}:null;
  map?.setView([Number(point.lat),Number(point.lng)],18,{animate:false});
  reference.textContent=selectedPostal?'Dirección identificada. Ajustá si la entrada está en otro punto.':
   'Ajustá la chincheta hasta la entrada exacta.';
 }else{
  reference.textContent='No se ubicó ese número con precisión. Mové la chincheta manualmente.';
 }
}
function open(input,button){
 overlay();
 if(!input)return;
 inputTarget=input;previousFocus=button||document.activeElement;isOpen=true;moved=false;nearby='';selectedPostal=null;
 lastGeoPoint=null;lastReference=null;lastMapDimensions=null;reverseSettled=false;
 clearTimeout(reverseTimer);clearTimeout(reverseWatchdog);reverseController?.abort();++reverseGeneration;
 const meta=window.ViaAddress?.get?.(input.id);
 if(meta?.postalStatus==='user_confirmed'&&meta?.lat!=null&&meta?.lng!=null)
   selectedPostal={label:meta.label,lat:meta.lat,lng:meta.lng,city:meta.city,department:meta.department};
 heading.textContent=input.id.includes('origin')?'Elegí el origen en el mapa':'Elegí el destino en el mapa';
 root.hidden=false;document.body.classList.add('via-map-picker-open');
 searchBox.value='';clearResults();warning.hidden=mapMode!=='raster';tileFailures=0;
 const chosen=coordsFor(input),fromGps=window.ViaSearchLocation?.get();
 const position=chosen||(fromGps&&valid(Number(fromGps.lat),Number(fromGps.lng))?fromGps:null)||centerDefault;
 const m=mapInit();
 if(!m)return;
 // Leaflet necesita medir el contenedor ya visible, especialmente tras cambiar de orientación.
 requestAnimationFrame(()=>{
  if(!isOpen)return;
  m.invalidateSize({pan:false});
  m.setView([position.lat,position.lng],chosen?18:fromGps?17:13,{animate:false});
  requestAnimationFrame(()=>{m.invalidateSize({pan:false});onMove()});
 });
 if(!chosen&&!fromGps)locate(false); // GPS solo luego de pulsar explícitamente Mapa.
 root.querySelector('.via-picker-close').focus();
}
function close(){
 if(!isOpen)return;
 isOpen=false;root.hidden=true;document.body.classList.remove('via-map-picker-open');
 ++gpsGeneration;++searchGeneration;++reverseGeneration;
 clearTimeout(searchTimer);clearTimeout(reverseTimer);clearTimeout(reverseWatchdog);
 searchController?.abort();reverseController?.abort();clearResults();
 if(resizeFrame){cancelAnimationFrame(resizeFrame);resizeFrame=0}
 inputTarget=null;previousFocus?.focus?.();
}
async function confirm(){
 if(!map||!inputTarget)return;
 const p=map.getCenter(),point={lat:p.lat,lng:p.lng};
 if(!valid(point.lat,point.lng)){
  reference.textContent='Elegí un punto dentro de Uruguay.';return
 }
 const input=inputTarget,button=root.querySelector('.via-picker-confirm');
 if(button.disabled)return;
 button.disabled=true;button.textContent='Confirmando ubicación…';
 let match=lastReference&&meters(lastReference.point,point)<3?lastReference:null;
 const prior=window.ViaAddress?.get?.(input.id);
 try{
  // Esperar la dirección correspondiente a la chincheta FINAL. No conservar
  // una calle antigua después de desplazar el mapa.
  if(!match&&!reverseSettled&&!(selectedPostal&&!moved)){
   clearTimeout(reverseTimer);reverseController?.abort();++reverseGeneration;
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),4500);
   try{match=(await getReverse(point,controller.signal)).choice}
   catch{/* El punto geográfico sigue siendo válido sin calle. */}
   finally{clearTimeout(timeout)}
  }
  if(!isOpen||inputTarget!==input)return;
  const retained=selectedPostal&&!moved&&meters(selectedPostal,point)<5?selectedPostal:null;
  // Si el usuario solo entró a mirar, conservar la dirección que ya tenía,
  // siempre que no haya cambiado la ubicación.
  const keepExisting=!moved&&prior?.lat!=null&&prior?.lng!=null&&
   meters(prior,point)<5&&prior.label&&prior.postalStatus!=='unknown';
  const label=retained?.label||(
   keepExisting?prior.label:
   match?.label||'Punto confirmado en el mapa (sin dirección postal)');
  const selection={
   label:compact(label,140),lat:point.lat,lng:point.lng,
   accuracy:'map',source:'map',
   postalStatus:retained?'user_confirmed':keepExisting?prior.postalStatus:match?'suggested':'unknown',
   city:retained?.city||(!moved&&keepExisting?prior.city:match?.city)||'',
   department:retained?.department||(!moved&&keepExisting?prior.department:match?.department)||'',
   referenceDistance:match?.distanceMeters??null,
   numberIsApproximate:!!match?.numberIsApproximate,
   kind:'map'
  };
  if(window.ViaAddress?.set)window.ViaAddress.set(input.id,selection);
  else{input.value=selection.label;Object.assign(input.dataset,{lat:point.lat,lng:point.lng,
   accuracy:'map',postalStatus:selection.postalStatus,addressSelected:'true'})}
  input.title='Punto seleccionado: '+selection.label;
  input.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:selection}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  close();
 }finally{button.disabled=false;button.textContent='Confirmar punto'}
}
const icon='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2z"/><path d="M9 3v16M15 5v16"/><circle cx="12" cy="11" r="2.3" fill="currentColor" stroke="none"/></svg>';
ids.forEach(id=>{
 const input=document.getElementById(id),container=input?.closest('.reference-field,.route-field');
 if(!input||!container)return;
 const button=document.createElement('button');button.type='button';button.className='via-map-shortcut';
 button.setAttribute('aria-label','Elegir '+(id.includes('origin')?'origen':'destino')+' en el mapa');
 button.title='Elegir en el mapa';button.innerHTML=icon;
 button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open(input,button)});
 container.appendChild(button);
});
window.ViaMapPicker={openFor:id=>{const input=document.getElementById(id);if(input)open(input,null)}};
})();