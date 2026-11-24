#!/usr/bin/env python3
import json,runpy,pathlib,concurrent.futures,time,re,subprocess,sys,urllib.parse
M=runpy.run_path('scripts/v301-approved-production.py')
P=M['P'];O=M['O'];cf=M['cf'];version=M['version']
WEB=M['WEB'];API=M['API'];BASE_WEB='9c810bb1-88a1-42ee-95a9-5a94c921f2a2';BASE_API='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b'
OUT=pathlib.Path('v302-route-cache');ASSETS=OUT/'assets'
def baseline():
 assert version(WEB)==BASE_WEB and version(API)==BASE_API,'Production changed'
def fetch(name):
 for i in range(4):
  try:return P['fetch_asset'](name)
  except Exception:
   if i==3:raise
   time.sleep(2*(i+1))
def build():
 baseline()
 assert P['latest_uploaded_version'](WEB)==BASE_WEB,'Active WEB source ambiguous'
 OUT.mkdir(exist_ok=True);ASSETS.mkdir(exist_ok=True)
 names=sorted(set(O['source_asset_list']())|set(O['EXTRAS'])|P['NEEDED']|{'sw.js','manifest.webmanifest'})
 hashes={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for n,b in pool.map(fetch,names):
   if b is None:continue
   p=ASSETS/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);hashes[n]=P['sha'](b)
 assert len(hashes)==39 and P['NEEDED'].issubset(hashes)
 subprocess.run(['node','scripts/v302-route-cache-patch.mjs',str(ASSETS)],check=True)
 for n in hashes:
  if not n.endswith('.html'):continue
  p=ASSETS/n;s=p.read_text()
  if n=='index.html':
   assert 'v30.1' in s;s=s.replace('v30.1','v30.2')
  s=re.sub(r'((?:app|store)\.js)\?v=[^"\x27\s<>]+',r'\1?v=30.2',s)
  p.write_text(s)
 sw=ASSETS/'sw.js';s=sw.read_text();assert 'via-traslados-v30.1-poi' in s
 sw.write_text(s.replace('via-traslados-v30.1-poi','via-traslados-v30.2-route-cache'))
 for n in ['app.js','store.js','sw.js']:subprocess.run(['node','--check',str(ASSETS/n)],check=True)
 source=O['get_live_worker_source']();assert 'VIA_POI_API' in source and 'viaPoi' in source
 (OUT/'worker.mjs').write_text(source)
 cfg={'name':WEB,'main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'keep_vars':True,'vars':{'VIA_PLACES_ENABLED':'true'},'services':[{'binding':'VIA_POI_API','service':API}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler.jsonc').write_text(json.dumps(cfg))
 changed=[n for n,h in hashes.items() if P['sha']((ASSETS/n).read_bytes())!=h]
 assert {'app.js','store.js','index.html','sw.js'}.issubset(changed)
 assert all(n in ('app.js','store.js','sw.js') or n.endswith('.html') for n in changed)
 (OUT/'manifest.json').write_text(json.dumps({'base_web':BASE_WEB,'base_api':BASE_API,'source_assets':hashes,'changed_assets':changed},indent=2))
 baseline()
 print('VIA_V302_PACKAGE '+json.dumps({'assets':len(hashes),'changed':changed,'apiUnchanged':BASE_API}),flush=True)
def candidate():
 baseline();v=P['latest_uploaded_version'](WEB);assert v!=BASE_WEB
 (OUT/'candidate.txt').write_text(v)
 print('VIA_V302_QA_VERSION '+v+' https://'+v[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev',flush=True)
if __name__=='__main__':{'build':build,'candidate':candidate}[sys.argv[1]]()
