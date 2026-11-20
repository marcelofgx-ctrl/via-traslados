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
# Keep original production config bytes; QA worker intercepts local /api/* and allows only public geocoding GET.
(assets/'via-qa-browser-diagnostics.js').write_bytes(pathlib.Path('scripts/via-qa-browser-diagnostics.js').read_bytes())
(assets/'sw.js').unlink(missing_ok=True) # avoid installing production service worker on QA
home=(assets/'index.html').read_text()
assert home.count('</footer>')==1
# Visible near top, not hidden in an off-screen footer. No changes to production HTML.
home=home.replace('</head>','<style id="via-qa-compat-style">#via-qa-version{position:fixed;top:calc(env(safe-area-inset-top,0px) + 118px);right:12px;z-index:99999;padding:3px 7px;border-radius:8px;background:rgba(17,72,64,.88);color:white;font:600 10px/1.3 system-ui,sans-serif;letter-spacing:.03em;pointer-events:none}html{max-width:100%;overflow-x:clip}body{max-width:100%;overflow-x:clip}html,body{min-height:100%;min-height:100dvh}input,textarea{scroll-margin-bottom:35dvh}@supports(height:100dvh){.via-qa-viewport{min-height:100dvh}}</style></head>',1)
home=home.replace('</body>','<script defer src="/via-qa-browser-diagnostics.js?v=2918"></script></body>',1)
home=home.replace('</body>','<span id="via-qa-version" aria-label="Versión de pruebas">QA v29.1.8 · '+version[:8]+'</span><script id="via-qa-browser-compat">(()=>{const ua=navigator.userAgent;const family=/Firefox\\/([\\d.]+)/.test(ua)?"Firefox":/SamsungBrowser\\/([\\d.]+)/.test(ua)?"Samsung Internet":/EdgA?\\/([\\d.]+)/.test(ua)?"Edge":/Chrome\\/([\\d.]+)/.test(ua)?"Chrome":"Otro";const match=ua.match(/(?:Firefox|SamsungBrowser|EdgA?|Chrome)\\/([\\d.]+)/);document.documentElement.dataset.viaBrowser=family.toLowerCase().replace(/\\s/g,"-");document.documentElement.dataset.viaBrowserVersion=match?.[1]||"desconocida";const update=()=>document.documentElement.style.setProperty("--via-visible-height",Math.round(window.visualViewport?.height||innerHeight)+"px");update();window.visualViewport?.addEventListener("resize",update,{passive:true});window.addEventListener("orientationchange",update,{passive:true});})();</script></body>',1)
(assets/'index.html').write_text(home)
# Restore the documented IDE Uruguay implementation in QA itself, never proxy production.
(out/'geo-directions.mjs').write_bytes(pathlib.Path('scripts/via-qa-directions-worker.mjs').read_bytes())
(out/'worker.mjs').write_text("""import geo from './geo-directions.mjs';
export default {async fetch(req,env){const u=new URL(req.url);if(u.pathname==='/api/direcciones'){if(req.method!=='GET')return new Response('Method Not Allowed',{status:405});return geo.fetch(req,env)}if(u.pathname.startsWith('/api/'))return new Response(JSON.stringify({error:'QA aislada: API privada y de escritura deshabilitada'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});return env.ASSETS.fetch(req)}};
""")
(out/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-current-prod-qa','main':'worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}},indent=2))
print('READ_ONLY_PRODUCTION_SNAPSHOT_READY',len(done),version,flush=True)
