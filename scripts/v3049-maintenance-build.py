import runpy, pathlib, concurrent.futures, urllib.parse, json, subprocess, re, time
M=runpy.run_path('scripts/v302-route-cache-qa.py'); P=M['P']; O=M['O']
BASE='d29d5304-db8d-48bb-a082-44b336454ed6'; API='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b'
URL='https://'+BASE[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
OUT=pathlib.Path('v3049-maintenance'); ASSETS=OUT/'assets'
def baseline():
 assert M['version'](M['WEB'])==BASE and M['version'](M['API'])==API,'Production changed'
def fetch(n):
 for i in range(4):
  try:
   b,h=P['get'](URL+'/'+urllib.parse.quote(n,safe='/'))
   if n.endswith('.html'):b=O['sanitize_html'](b)
   if n.endswith(('.js','.mjs','.css')):assert 'text/html' not in h.get('Content-Type','')
   return n,b
  except Exception as e:
   if getattr(e,'code',0)==404 and n not in P['NEEDED']:return n,None
   if i==3:raise
   time.sleep(2*(i+1))
baseline(); ASSETS.mkdir(parents=True,exist_ok=True)
names=sorted(set(O['source_asset_list']())|set(O['EXTRAS'])|P['NEEDED']|{'sw.js','manifest.webmanifest'})
hashes={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for n,b in pool.map(fetch,names):
  if b is None:continue
  p=ASSETS/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);hashes[n]=P['sha'](b)
assert len(hashes)==39 and P['NEEDED'].issubset(hashes)
subprocess.run(['node','scripts/v3049-maintenance-patch.mjs',str(ASSETS)],check=True)
for n in hashes:
 if n.endswith('.html'):
  p=ASSETS/n;s=p.read_text()
  s=re.sub(r'((?:app|store)\.js)\?v=[^"\x27\s<>]+',r'\1?v=30.4.9',s)
  if n=='index.html':s=s.replace('v30.4.8','v30.4.9')
  p.write_text(s)
sw=ASSETS/'sw.js';s=sw.read_text();assert 'via-traslados-v30.4.8-search-cache' in s
sw.write_text(s.replace('via-traslados-v30.4.8-search-cache','via-traslados-v30.4.9-session'))
for n in ['app.js','store.js','sw.js','via-v3049-state.js']:subprocess.run(['node','--check',str(ASSETS/n)],check=True)
changed=[n for n,h in hashes.items() if P['sha']((ASSETS/n).read_bytes())!=h]
assert {'index.html','app.js','store.js','sw.js'}.issubset(changed)
assert all(n in ('app.js','store.js','sw.js') or n.endswith('.html') for n in changed),changed
assert all(P['sha']((ASSETS/n).read_bytes())==hashes[n] for n in ['config.js','address-autocomplete.js','reference.js','geo-v2/core.mjs','passkeys.js','map-point-picker.js'])
baseline()
(OUT/'manifest.json').write_text(json.dumps({'baseline':BASE,'api':API,'source_assets':hashes,'changed_assets':changed,'new_asset':'via-v3049-state.js','prod_unchanged':True},indent=2))
print('VIA_3049_CANDIDATE '+json.dumps({'assets':len(hashes),'changed':changed,'new':1}),flush=True)
# Create a separate static UI preview; no API, D1, service binding, or production authentication.
import shutil
preview=OUT/'preview';shutil.copytree(ASSETS,preview,dirs_exist_ok=True)
cfg=preview/'config.js';s=cfg.read_text();url='https://via-traslados-api.marcelof-gx.workers.dev';assert s.count(url)==1
cfg.write_text(s.replace(url,'https://via-traslados-v3049-maintenance-qa.marcelof-gx.workers.dev'))
p=preview/'index.html';s=p.read_text().replace('>V30.4.9</span>','>V30.4.9 QA · vista aislada</span>');p.write_text(s)
(OUT/'worker.mjs').write_text("export default {async fetch(r,env){const u=new URL(r.url);if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method))return Response.json({error:'Vista QA aislada; no procesa reservas'},{status:503});return env.ASSETS.fetch(r)}}")
(OUT/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-v3049-maintenance-qa','main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./preview','binding':'ASSETS','run_worker_first':True}}))
