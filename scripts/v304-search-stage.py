#!/usr/bin/env python3
"""Expose V30.2 on isolated QA, with only public routing and geocoding available."""
import runpy,pathlib,subprocess,json,concurrent.futures,time,urllib.parse,re,urllib.request,os
M=runpy.run_path('scripts/v302-route-cache-qa.py')
P=M['P'];O=M['O'];baseline=lambda: (M['version'](M['WEB'])=='9e2dac8c-6d6f-4921-b425-99b6a71d525d' and M['version'](M['API'])==M['BASE_API']) or (_ for _ in ()).throw(AssertionError('Production changed'))
CANDIDATE='9e2dac8c-6d6f-4921-b425-99b6a71d525d'
PREVIEW='https://9e2dac8c-via-traslados-web-prod.marcelof-gx.workers.dev'
STAGE='via-traslados-v304-search-stage'
URL='https://'+STAGE+'.marcelof-gx.workers.dev'
API='https://via-traslados-api.marcelof-gx.workers.dev'
OUT=pathlib.Path('v304-search-stage');ASSETS=OUT/'assets'
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
def ensure_db():
 root='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database'
 def call(suffix='',body=None):
  req=urllib.request.Request(root+suffix,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},method='POST' if body is not None else 'GET')
  with urllib.request.urlopen(req,timeout=25) as r:j=json.load(r)
  assert j.get('success'),'QA D1 request failed'
  return j['result']
 name='via-poi-cache-qa'
 rows=[d for d in call('?name='+name) if d.get('name')==name]
 assert len(rows)<=1
 db=rows[0] if rows else call('',{'name':name})
 uid=db['uuid']
 assert uid!=P['D1'],'Do not use production D1'
 call('/'+uid+'/query',{'sql':'CREATE TABLE IF NOT EXISTS poi_search_cache(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 0 AND 8191),cache_key TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=6000),expires_at INTEGER NOT NULL)'})
 print('VIA_V304_QA_D1_READY',flush=True)
 return uid
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
 index.write_text(s.replace('v30.2','v30.4').replace('</body>','<aside role="status" style="position:fixed;z-index:2147483647;bottom:0;left:0;right:0;background:#263f3b;color:white;padding:8px;text-align:center;font:600 12px sans-serif">V30.4 QA · CACHÉ Y TECLADO · SIN RESERVAS</aside></body>'))
 # Visual-only hint; all underlying GPS handlers remain untouched.
 html=index.read_text()
 assert html.count('id="home-origin"')==1 and html.count('id="location-shortcut"')==1 and html.count('</body>')==1
 hint=pathlib.Path('addons/v304-location-hint.html').read_text()
 index.write_text(html.replace('v30.4','v30.4.7').replace('V30.4 QA','V30.4.7 QA').replace('</body>',hint+pathlib.Path('addons/v304-number-info.html').read_text()+pathlib.Path('addons/v304-auth-isolation.html').read_text()+'</body>'))
 # The candidate's exact live WEB bundle is the latest upload, not an old branch.
 source=O['get_live_worker_source']()
 assert all(x in source for x in ('VIA_POI_API','__viaLegacyWorker','extendPlaceSearch'))
 (OUT/'legacy.mjs').write_text(source)
 (OUT/'worker.mjs').write_text(pathlib.Path('addons/v304-search-stage-worker.mjs').read_text())
 (OUT/'v303-poi-expansion.mjs').write_text(pathlib.Path('addons/v304-poi-expansion.mjs').read_text())
 (OUT/'v304-poi-cache.mjs').write_text(pathlib.Path('addons/v304-poi-cache.mjs').read_text())
 subprocess.run(['node','scripts/v304-number-info-patch.mjs',str(ASSETS/'reference.js')],check=True)
 subprocess.run(['node','--check',str(ASSETS/'reference.js')],check=True)
 subprocess.run(['node','scripts/v304-autocomplete-patch.mjs',str(ASSETS/'address-autocomplete.js')],check=True)
 subprocess.run(['node','--check',str(ASSETS/'address-autocomplete.js')],check=True)
 for n in hashes:
  if n.endswith('.html'):
   p=ASSETS/n
   p.write_text(re.sub(r'reference\.js\?v=[^"\x27\s<>]+','reference.js?v=30.4.7',re.sub(r'address-autocomplete\.js\?v=[^"\x27\s<>]+','address-autocomplete.js?v=30.4.7',p.read_text())))
 sw=ASSETS/'sw.js';sw.write_text(sw.read_text().replace('via-traslados-v30.2-route-cache','via-traslados-v30.4.7-search-cache'))
 dbid=ensure_db()
 cfg={'name':STAGE,'main':'./worker.mjs','compatibility_date':'2026-11-10','compatibility_flags':['global_fetch_strictly_public'],'workers_dev':True,'vars':{'VIA_PLACES_ENABLED':'true'},'d1_databases':[{'binding':'POI_CACHE','database_name':'via-poi-cache-qa','database_id':dbid}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler.jsonc').write_text(json.dumps(cfg))
 changed=[n for n,h in hashes.items() if P['sha']((ASSETS/n).read_bytes())!=h]
 assert {'config.js','index.html','address-autocomplete.js','sw.js'}.issubset(changed) and all(n in ('config.js','address-autocomplete.js','reference.js','sw.js') or n.endswith('.html') for n in changed),changed
 baseline()
 print('VIA_V304_STAGE_READY '+URL,flush=True)
if __name__=='__main__':build()
