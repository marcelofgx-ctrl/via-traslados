#!/usr/bin/env python3
"""Expose V30.2 on isolated QA, with only public routing and geocoding available."""
import runpy,pathlib,subprocess,json,concurrent.futures,time,urllib.parse,re
M=runpy.run_path('scripts/v302-route-cache-qa.py')
P=M['P'];O=M['O'];baseline=lambda: (M['version'](M['WEB'])=='9e2dac8c-6d6f-4921-b425-99b6a71d525d' and M['version'](M['API'])==M['BASE_API']) or (_ for _ in ()).throw(AssertionError('Production changed'))
CANDIDATE='9e2dac8c-6d6f-4921-b425-99b6a71d525d'
PREVIEW='https://9e2dac8c-via-traslados-web-prod.marcelof-gx.workers.dev'
STAGE='via-traslados-v303-search-stage'
URL='https://'+STAGE+'.marcelof-gx.workers.dev'
API='https://via-traslados-api.marcelof-gx.workers.dev'
OUT=pathlib.Path('v303-search-stage');ASSETS=OUT/'assets'
def fetch(n):
 for i in range(4):
  try:
   b,h=P['get'](PREVIEW+'/'+urllib.parse.quote(n,safe='/'))
   if n.endswith('.html'):b=O['sanitize_html'](b)
   if n.endswith(('.js','.mjs','.css')):assert 'text/html' not in h.get('Content-Type','')
   return n,b
  except Exception as e:
   if getattr(e,'code',0)==404 and n not in P['NEEDED']:return n,None
   if i==3:raise
   time.sleep(2*(i+1))
def build():
 baseline()
 assert P['latest_uploaded_version']('via-traslados-web-prod')==CANDIDATE,'QA source changed'
 OUT.mkdir(exist_ok=True);ASSETS.mkdir(exist_ok=True)
 names=sorted(set(O['source_asset_list']())|set(O['EXTRAS'])|P['NEEDED']|{'sw.js','manifest.webmanifest'})
 hashes={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for n,b in pool.map(fetch,names):
   if b is None:continue
   p=ASSETS/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);hashes[n]=P['sha'](b)
 assert len(hashes)==39 and P['NEEDED'].issubset(hashes)
 assert 'via-route-preview-cache-v1' in (ASSETS/'store.js').read_text()
 assert 'scheduleRoute' in (ASSETS/'app.js').read_text()
 config=ASSETS/'config.js';s=config.read_text();assert s.count(API)==1
 config.write_text(s.replace(API,URL))
 index=ASSETS/'index.html';s=index.read_text();assert 'v30.2' in s and s.count('</body>')==1
 index.write_text(s.replace('v30.2','v30.3').replace('</body>','<aside role="status" style="position:fixed;z-index:2147483647;bottom:0;left:0;right:0;background:#263f3b;color:white;padding:8px;text-align:center;font:600 12px sans-serif">V30.3 QA · BUSCADOR · SIN RESERVAS</aside></body>'))
 # The candidate's exact live WEB bundle is the latest upload, not an old branch.
 source=O['get_live_worker_source']()
 assert all(x in source for x in ('VIA_POI_API','__viaLegacyWorker','extendPlaceSearch'))
 (OUT/'legacy.mjs').write_text(source)
 (OUT/'worker.mjs').write_text(pathlib.Path('addons/v303-search-stage-worker.mjs').read_text())
 (OUT/'v303-poi-expansion.mjs').write_text(pathlib.Path('addons/v303-poi-expansion.mjs').read_text())
 cfg={'name':STAGE,'main':'./worker.mjs','compatibility_date':'2026-11-10','compatibility_flags':['global_fetch_strictly_public'],'workers_dev':True,'vars':{'VIA_PLACES_ENABLED':'true'},'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler.jsonc').write_text(json.dumps(cfg))
 changed=[n for n,h in hashes.items() if P['sha']((ASSETS/n).read_bytes())!=h]
 assert set(changed)=={'config.js','index.html'},changed
 baseline()
 print('VIA_V303_STAGE_READY '+URL,flush=True)
if __name__=='__main__':build()
