#!/usr/bin/env python3
"""Snapshot of currently deployed web to isolated QA. NEVER writes to production."""
import os,json,re,pathlib,hashlib,urllib.request,urllib.parse,urllib.error,subprocess,runpy,concurrent.futures
s=runpy.run_path('scripts/via-v291-prepare.py')
live='https://viatraslados.com';out=pathlib.Path('via-current-qa');assets=out/'assets';assets.mkdir(parents=True,exist_ok=True)
version=s['active_version']()
def fetch(path):
 req=urllib.request.Request(live+'/'+urllib.parse.quote(path,safe='/'),headers={'Cache-Control':'no-cache','User-Agent':'ViaQAReadOnlySnapshot/1.0'})
 with urllib.request.urlopen(req,timeout=40) as r:
  data=r.read();typ=r.headers.get('Content-Type','')
 if path.endswith(('.js','.mjs','.css','.svg')) and 'text/html' in typ:raise ValueError('HTML masquerading as '+path)
 if path.endswith('.html'):data=s['sanitize_html'](data)
 return data
names=set(s['source_asset_list']())|set(s['EXTRAS'])|{'index.html','mis-reservas.html','reserva.html','sw.js','geo-v2/core.mjs','descargas/via-traslados-conductor-v35.apk','mine-identity-v291.css','via-v291-home-account.js','via-v291-home-account.css'}
required=set();done={};missing=set()
for round in range(5):
 todo=sorted(names-set(done)-missing)
 if not todo:break
 def task(n):
  try:return n,fetch(n),None
  except urllib.error.HTTPError as e:
   if e.code==404:return n,None,'404'
   raise
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  for name,data,error in pool.map(task,todo):
   if error:missing.add(name);continue
   target=assets/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
   done[name]=hashlib.sha256(data).hexdigest()
   if name.endswith('.html'):
    for link in re.findall(r'(?:src|href)=[\"\x27]([^\"\x27]+)',data.decode('utf8')):
     u=urllib.parse.urlparse(link)
     if u.scheme or u.netloc or not u.path or u.path.startswith('#'):continue
     child=str(pathlib.PurePosixPath(name).parent/u.path.lstrip('/'))
     if child.startswith('../'):continue
     if child.endswith(('.js','.mjs','.css','.svg','.png','.webp','.webmanifest')):
      required.add(child);names.add(child)
assert not(required & missing),'Missing required assets '+str(required & missing)
assert len(done)>=40,'Incomplete snapshot: '+str(len(done))
for critical in ('index.html','mis-reservas.html','app.js','store.js','config.js','geo-v2/core.mjs','descargas/via-traslados-conductor-v35.apk'):
 assert critical in done,'Critical missing '+critical
assert s['active_version']()==version,'Production changed during snapshot'
(out/'production-manifest.json').write_text(json.dumps({'production_worker_version':version,'production_sha256':done,'missing_optional':sorted(missing),'source':'production-read-only'},indent=2))
# Isolate ALL QA API endpoints; never use production credentials or origin.
# QA must route ALL API requests to its own isolated origin, not to the production API.
# The QA worker explicitly allows public route-preview and geocoding only.
(assets/'config.js').write_text("window.VIA_CONFIG=Object.freeze({demo:false,apiUrl:location.origin,turnstileSiteKey:''});\n")
(assets/'via-qa-browser-diagnostics.js').write_bytes(pathlib.Path('scripts/via-qa-browser-diagnostics.js').read_bytes())
# QA-only: preserve exact map selections for routing; the production store.js stays unchanged.
qa_store=(assets/'store.js')
qa_store_original=qa_store.read_text()
old_route="""async function estimateRoute(origin,destination){
 if(isDemo())return null; // No inventar kilómetros en demostración.
 return request('/api/public/route-preview',{method:'POST',body:JSON.stringify({origin,destination})});
}"""
new_route="""async function estimateRoute(origin,destination){
 if(isDemo())return null; // No inventar kilómetros en demostración.
 // En QA, usar coordenadas seleccionadas y verificadas cuando existan.
 const endpoint=(key,label)=>{
  const point=window.ViaAddress?.get?.(key);
  const lat=Number(point?.lat??point?.latitude),lng=Number(point?.lng??point?.lon??point?.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52
    ? {lat,lng,address:label} : label;
 };
 return request('/api/public/route-preview',{method:'POST',body:JSON.stringify({
  origin:endpoint('origin',origin),destination:endpoint('destination',destination)
 })});
}"""
assert qa_store_original.count(old_route)==1,'QA route patch anchor not unique'
qa_store.write_text(qa_store_original.replace(old_route,new_route))

(assets/'sw.js').unlink(missing_ok=True) # avoid installing production service worker on QA
home=(assets/'index.html').read_text()
assert home.count('</footer>')==1
# Visible near top, not hidden in an off-screen footer. No changes to production HTML.
home=home.replace('</head>','<style id="via-qa-compat-style">#via-qa-version{position:fixed;top:calc(env(safe-area-inset-top,0px) + 118px);right:12px;z-index:99999;padding:3px 7px;border-radius:8px;background:rgba(17,72,64,.88);color:white;font:600 10px/1.3 system-ui,sans-serif;letter-spacing:.03em;pointer-events:none}html{max-width:100%;overflow-x:clip}body{max-width:100%;overflow-x:clip}html,body{min-height:100%;min-height:100dvh}input,textarea{scroll-margin-bottom:35dvh}@supports(height:100dvh){.via-qa-viewport{min-height:100dvh}}</style></head>',1)
home=home.replace('</body>','<script defer src="/via-qa-browser-diagnostics.js?v=2919"></script></body>',1)
home=home.replace('</body>','<span id="via-qa-version" aria-label="Versión de pruebas">QA v29.1.9 · '+version[:8]+'</span><script id="via-qa-browser-compat">(()=>{const ua=navigator.userAgent;const family=/Firefox\\/([\\d.]+)/.test(ua)?"Firefox":/SamsungBrowser\\/([\\d.]+)/.test(ua)?"Samsung Internet":/EdgA?\\/([\\d.]+)/.test(ua)?"Edge":/Chrome\\/([\\d.]+)/.test(ua)?"Chrome":"Otro";const match=ua.match(/(?:Firefox|SamsungBrowser|EdgA?|Chrome)\\/([\\d.]+)/);document.documentElement.dataset.viaBrowser=family.toLowerCase().replace(/\\s/g,"-");document.documentElement.dataset.viaBrowserVersion=match?.[1]||"desconocida";const update=()=>document.documentElement.style.setProperty("--via-visible-height",Math.round(window.visualViewport?.height||innerHeight)+"px");update();window.visualViewport?.addEventListener("resize",update,{passive:true});window.addEventListener("orientationchange",update,{passive:true});})();</script></body>',1)
(assets/'index.html').write_text(home)
# Explicitly refresh the QA-only patched store.js; old browser caches may retain the original file.
for qa_page in assets.rglob('*.html'):
 page=qa_page.read_text()
 updated=re.sub(r'(store[.]js)(?:[?][^\x22\x27]*)?(?=[\x22\x27])',r'\1?v=qa2919',page)
 if updated!=page:qa_page.write_text(updated)

# Restore the documented IDE Uruguay implementation in QA itself, never proxy production.
(out/'geo-directions.mjs').write_bytes(pathlib.Path('scripts/via-qa-directions-worker.mjs').read_bytes())
(out/'worker.mjs').write_text("import geo from './geo-directions.mjs';\nconst json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});\nconst valid=p=>p&&typeof p==='object'&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Number(p.lat)>=-36&&Number(p.lat)<=-30&&Number(p.lng)>=-59&&Number(p.lng)<=-52;\nasync function route(req){\n if(req.method!=='POST')return json({error:'Método no permitido'},405);\n try{\n  const raw=await req.text();if(raw.length>4096)return json({error:'Solicitud demasiado grande'},413);\n  const data=JSON.parse(raw);\n  if(!data||typeof data!=='object'||!Object.prototype.hasOwnProperty.call(data,'origin')||!Object.prototype.hasOwnProperty.call(data,'destination'))return json({error:'Se requieren origen y destino'},400);\n  const coord=p=>{\n   if(!p||typeof p!=='object')return null;\n   const lat=p.lat??p.latitude??p.latitud??p.coordinates?.lat??p.coords?.latitude;\n   const lng=p.lng??p.lon??p.longitude??p.longitud??p.coordinates?.lng??p.coords?.longitude;\n   const point={lat:Number(lat),lng:Number(lng)};\n   return lat!=null&&lng!=null&&valid(point)?point:null;\n  };\n  const resolve=async p=>{\n   const direct=coord(p);if(direct)return direct;\n   const q=(typeof p==='string'?p:p?.address??p?.label??p?.direccion??'').trim();\n   if(q.length<4)return null;\n   if(/^aeropuerto internacional de carrasco(?:\\b|,)/i.test(q))return {lat:-34.83696,lng:-56.01638};\n   const lookup=new URL('/api/direcciones',req.url);lookup.searchParams.set('mode','resolve');lookup.searchParams.set('q',q);\n   const response=await geo.fetch(new Request(lookup),{});\n   if(!response.ok)return null;\n   const payload=await response.json();return (payload.results||[]).map(coord).find(Boolean)||null;\n  };\n  const origin=await resolve(data.origin??data.from??data.origen??data.originAddress);\n  const destination=await resolve(data.destination??data.to??data.destino??data.destinationAddress);\n  if(!origin||!destination)return json({error:'No se pudieron resolver las coordenadas de origen o destino; verificá la dirección'},422);\n  data.origin=origin;data.destination=destination;\n  const a=data.origin,b=data.destination;\n  const url='https://router.project-osrm.org/route/v1/driving/'+Number(a.lng)+','+Number(a.lat)+';'+Number(b.lng)+','+Number(b.lat)+'?overview=false&steps=false';\n  const res=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});\n  if(!res.ok)return json({error:'Servicio de rutas QA temporalmente no disponible'},502);\n  const payload=await res.json();const item=payload?.routes?.[0];const meters=Number(item?.distance),seconds=Number(item?.duration);\n  if(payload.code!=='Ok'||!Number.isFinite(meters)||meters<100||!Number.isFinite(seconds)||seconds<=0)return json({error:'No se encontró una ruta vial válida'},422);\n  return json({distanceKm:Math.round(meters/100)/10,durationMinutes:Math.ceil(seconds/60),source:'OSRM QA',estimate:true,trafficIncluded:false,cached:false,attribution:'© OpenStreetMap contributors · OSRM (solo QA)',qaOnly:true});\n }catch(e){console.error('QA_ROUTE_FAILURE',String(e?.message||e));return json({error:'Ruta QA temporalmente no disponible'},502)}\n}\nexport default {async fetch(req,env){\n const path=new URL(req.url).pathname;\n if(path==='/api/direcciones')return geo.fetch(req,env);\n if(path==='/api/public/route-preview')return route(req);\n if(path.startsWith('/api/'))return json({error:'QA aislada: API privada y de escritura deshabilitada'},503);\n return env.ASSETS.fetch(req);\n}};\n")
(out/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-current-prod-qa','main':'worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}},indent=2))
print('READ_ONLY_PRODUCTION_SNAPSHOT_READY',len(done),version,flush=True)
