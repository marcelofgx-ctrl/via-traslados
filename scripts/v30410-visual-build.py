import pathlib,runpy,json,re,concurrent.futures,urllib.parse,time,shutil
M=runpy.run_path('scripts/v302-route-cache-qa.py');P=M['P'];O=M['O']
BASE='b23d68ea-5aae-4827-b808-3c4c3504a959';API='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b'
OUT=pathlib.Path('v30410-visual');ASSETS=OUT/'assets'
def guard():
 assert M['version'](M['WEB'])==BASE and M['version'](M['API'])==API,'Production changed'
guard(); ASSETS.mkdir(parents=True,exist_ok=True)
url='https://'+BASE[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
names=sorted(set(O['source_asset_list']())|set(O['EXTRAS'])|P['NEEDED']|{'sw.js','manifest.webmanifest','via-v3049-state.js'})
def fetch(n):
 for i in range(4):
  try:
   b,h=P['get'](url+'/'+urllib.parse.quote(n,safe='/'))
   if n.endswith('.html'):b=O['sanitize_html'](b)
   if n.endswith(('.js','.mjs','.css')):assert 'text/html' not in h.get('Content-Type','')
   return n,b
  except Exception as e:
   if getattr(e,'code',0)==404 and n not in P['NEEDED'] and n!='via-v3049-state.js':return n,None
   if i==3:raise
   time.sleep(2*(i+1))
hashes={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for n,b in pool.map(fetch,names):
  if b is None:continue
  p=ASSETS/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);hashes[n]=P['sha'](b)
assert len(hashes)==40 and P['NEEDED'].issubset(hashes)
p=ASSETS/'index.html';s=p.read_text();assert s.count('</head>')==1 and s.count('</body>')==1 and 'via-visible-release' in s
p.write_text(s.replace('</head>','<script src="/via-visual-profile.js?v=30.4.10.7"></script></head>').replace('</body>','<link rel="stylesheet" href="/via-visual-compat.css?v=30.4.10.7"></body>').replace('>V30.4.9</span>','>V30.4.10.7 QA</span>').replace('aria-label="Versión 30.4.9"','aria-label="Versión 30.4.10.7 QA"'))
for n in ['via-visual-profile.js','via-visual-compat.css']:shutil.copyfile('addons/'+n,ASSETS/n)
# Exact active reference.js: only presentation hooks and explicit reverse lookup status.
p=ASSETS/'reference.js';s=p.read_text()
def replace_once(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
replace_once(" note.replaceChildren();\n if(!title&&!copy)", " note.replaceChildren();\n note.removeAttribute('data-via-wait');\n const waitStates={'Buscando tu ubicación':'gps','Mejorando precisión':'precision','Identificando dirección':'reverse'};\n const wait=waitStates[title];\n if(wait)note.setAttribute('data-via-wait',wait);\n if(title==='Buscando tu ubicación')copy='Obteniendo una posición precisa.';\n if(!title&&!copy)")
replace_once(" if(actions.length){\n  const row=", " if(wait){const rail=document.createElement('span');rail.className='via-wait-track';rail.setAttribute('aria-hidden','true');note.appendChild(rail)}\n if(actions.length){\n  const row=")
replace_once(" if(gpsButton){gpsButton.disabled=false;gpsButton.removeAttribute('aria-busy')}\n}", " if(gpsButton){gpsButton.disabled=false;gpsButton.removeAttribute('aria-busy')}\n const note=document.getElementById('via-gps-feedback');\n if(note?.hasAttribute('data-via-wait')){note.hidden=true;note.removeAttribute('data-via-wait')}\n}")
replace_once("   const controller=new AbortController();run.abort=controller;", "   gpsPanel('Identificando dirección','Buscando referencias cercanas.',[{label:'Elegir en el mapa',go:openGpsMap}]);\n   const controller=new AbortController();run.abort=controller;")
# One bounded automatic reverse retry, only for an empty/failed response.
# Keep permission flow, precision thresholds, chosen coordinates and ambiguity policy.
replace_once("""   const controller=new AbortController();run.abort=controller;
   const t=setTimeout(()=>controller.abort(),6500);let rows=[];
   try{
    const response=await fetch('/api/direcciones?mode=reverse&lat='+encodeURIComponent(pos.lat)+
     '&lng='+encodeURIComponent(pos.lng),{signal:controller.signal});
    if(response.ok)rows=(await response.json()).results||[]
   }catch{/* GPS válido no equivale a un domicilio postal confirmado. */}
   finally{clearTimeout(t)}
""","""   let rows=[];
   const current=()=>gpsRun===run&&gpsInput?.value===run.value;
   for(let attempt=0;attempt<2&&current();attempt++){
    if(attempt){
     gpsPanel('Identificando dirección','Verificando la referencia cercana.',[{label:'Elegir en el mapa',go:openGpsMap}]);
     await new Promise(resolve=>setTimeout(resolve,450));
     if(!current())break;
    }
    const controller=new AbortController();run.abort=controller;
    const t=setTimeout(()=>controller.abort(),attempt===0?6500:4500);
    try{
     const response=await fetch('/api/direcciones?mode=reverse&lat='+encodeURIComponent(pos.lat)+
      '&lng='+encodeURIComponent(pos.lng),{signal:controller.signal,cache:'no-store'});
     if(response.ok){
      const data=await response.json();
      if(Array.isArray(data.results))rows=data.results;
     }
    }catch{/* Keep GPS as a point, never assert a postal address from a failed lookup. */}
    finally{clearTimeout(t)}
    if(rows.length)break;
   }
""")
p.write_text(s)
changed=[n for n,h in hashes.items() if P['sha']((ASSETS/n).read_bytes())!=h]
assert set(changed)=={'index.html','reference.js'},changed
(OUT/'manifest.json').write_text(json.dumps({'base':BASE,'api':API,'source_assets':hashes,'changed':changed,'new':['via-visual-profile.js','via-visual-compat.css'],'qa_only':True},indent=2))
# Separate static preview, never routes requests to production or QA bookings.
preview=OUT/'preview';shutil.copytree(ASSETS,preview,dirs_exist_ok=True)
cfg=preview/'config.js';s=cfg.read_text();old='https://via-traslados-api.marcelof-gx.workers.dev';assert s.count(old)==1
cfg.write_text(s.replace(old,'https://via-traslados-v30410-visual-qa.marcelof-gx.workers.dev'))
sw=preview/'sw.js';s=sw.read_text();assert 'via-traslados-v30.4.9-session' in s
sw.write_text(s.replace('via-traslados-v30.4.9-session','via-traslados-v30.4.10.7-visual-qa'))
(OUT/'worker.mjs').write_text("export default {async fetch(r,env){const u=new URL(r.url);if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method))return Response.json({error:'Vista visual QA aislada; sin reservas'},{status:503});return env.ASSETS.fetch(r)}}")
(OUT/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-v30410-visual-qa','main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./preview','binding':'ASSETS','run_worker_first':True}}))
guard();print('VIA_VISUAL_CANDIDATE_READY 40 base assets; index and status-only reference hooks + visual layer; no production changes',flush=True)
