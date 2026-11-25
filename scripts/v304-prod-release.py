#!/usr/bin/env python3
"""Build production candidate with approved UI and isolated public POI cache; no auth/API changes."""
import runpy,pathlib,subprocess,json,concurrent.futures,time,urllib.parse,re,urllib.request,os
M=runpy.run_path('scripts/v302-route-cache-qa.py')
P=M['P'];O=M['O'];baseline=lambda: (M['version'](M['WEB'])=='9e2dac8c-6d6f-4921-b425-99b6a71d525d' and M['version'](M['API'])==M['BASE_API']) or (_ for _ in ()).throw(AssertionError('Production changed'))
CANDIDATE='9e2dac8c-6d6f-4921-b425-99b6a71d525d'
PREVIEW='https://9e2dac8c-via-traslados-web-prod.marcelof-gx.workers.dev'
STAGE='via-traslados-web-prod'
URL='https://'+STAGE+'.marcelof-gx.workers.dev'
API='https://via-traslados-api.marcelof-gx.workers.dev'
OUT=pathlib.Path('v304-prod-release');ASSETS=OUT/'assets'
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
  assert j.get('success'),'POI D1 request failed'
  return j['result']
 name='via-poi-cache-prod'
 rows=[d for d in call('?name='+name) if d.get('name')==name]
 assert len(rows)<=1
 db=rows[0] if rows else call('',{'name':name})
 uid=db['uuid']
 assert uid!=P['D1'],'Do not use production D1'
 call('/'+uid+'/query',{'sql':'CREATE TABLE IF NOT EXISTS poi_search_cache(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 0 AND 8191),cache_key TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=6000),expires_at INTEGER NOT NULL)'})
 print('VIA_V304_PROD_CACHE_READY',flush=True)
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
 # Preserve the exact live API configuration.
 index=ASSETS/'index.html';s=index.read_text();assert 'v30.2' in s and s.count('</body>')==1
 index.write_text(s.replace('v30.2','v30.4.8'))
 # Visual-only hint; all underlying GPS handlers remain untouched.
 html=index.read_text()
 assert html.count('id="home-origin"')==1 and html.count('id="location-shortcut"')==1 and html.count('</body>')==1
 hint=pathlib.Path('addons/v304-location-hint.html').read_text()
 index.write_text(html.replace('</body>',hint+pathlib.Path('addons/v304-number-info.html').read_text()+pathlib.Path('addons/v304-search-distance.html').read_text()+'</body>'))
 # The candidate's exact live WEB bundle is the latest upload, not an old branch.
 source=O['get_live_worker_source']()
 assert all(x in source for x in ('VIA_POI_API','__viaLegacyWorker','extendPlaceSearch'))
 (OUT/'legacy.mjs').write_text(source)
 (OUT/'worker.mjs').write_text(pathlib.Path('addons/v304-prod-worker.mjs').read_text())
 (OUT/'v303-poi-expansion.mjs').write_text(pathlib.Path('addons/v304-poi-expansion.mjs').read_text())
 (OUT/'v304-poi-cache.mjs').write_text(pathlib.Path('addons/v304-poi-cache.mjs').read_text())
 subprocess.run(['node','scripts/v304-number-info-patch.mjs',str(ASSETS/'reference.js')],check=True)
 subprocess.run(['node','--check',str(ASSETS/'reference.js')],check=True)
 subprocess.run(['node','scripts/v304-autocomplete-patch.mjs',str(ASSETS/'address-autocomplete.js')],check=True)
 subprocess.run(['node','--check',str(ASSETS/'address-autocomplete.js')],check=True)
 for n in hashes:
  if n.endswith('.html'):
   p=ASSETS/n
   p.write_text(re.sub(r'reference\.js\?v=[^"\x27\s<>]+','reference.js?v=30.4.8',re.sub(r'address-autocomplete\.js\?v=[^"\x27\s<>]+','address-autocomplete.js?v=30.4.8',p.read_text())))
 sw=ASSETS/'sw.js';sw.write_text(sw.read_text().replace('via-traslados-v30.2-route-cache','via-traslados-v30.4.8-search-cache'))
 dbid=ensure_db()
 cfg={'name':STAGE,'main':'./worker.mjs','compatibility_date':'2026-11-10','keep_vars':True,'workers_dev':True,'vars':{'VIA_PLACES_ENABLED':'true'},'services':[{'binding':'VIA_POI_API','service':'via-traslados-api'}],'d1_databases':[{'binding':'POI_CACHE','database_name':'via-poi-cache-prod','database_id':dbid}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler.jsonc').write_text(json.dumps(cfg))
 changed=[n for n,h in hashes.items() if P['sha']((ASSETS/n).read_bytes())!=h]
 assert {'index.html','address-autocomplete.js','reference.js','sw.js'}.issubset(changed) and all(n in ('address-autocomplete.js','reference.js','sw.js') or n.endswith('.html') for n in changed),changed
 baseline()
 assert 'via-qa-auth-script' not in index.read_text() and 'SIN RESERVAS' not in index.read_text()
 assert P['sha'](config.read_bytes())==hashes['config.js']
 (OUT/'manifest.json').write_text(json.dumps({'base':CANDIDATE,'api':M['BASE_API'],'assets':list(hashes),'changed':changed,'cache_db':dbid},indent=2))
 print('VIA_V304_PROD_PACKAGE_READY '+json.dumps({'assets':len(hashes),'changed':changed}),flush=True)
H=runpy.run_path('scripts/v301-exact-repromotion.py')
def target():
 return (OUT/'candidate.txt').read_text().strip()
def verify_candidate():
 baseline()
 new=P['latest_uploaded_version'](STAGE);assert new!=CANDIDATE
 (OUT/'candidate.txt').write_text(new)
 old=H['binding_contract'](M['cf'](STAGE,'/versions/'+CANDIDATE));next=H['binding_contract'](M['cf'](STAGE,'/versions/'+new))
 cache=next.pop('POI_CACHE')
 assert cache.get('type')=='d1' and old==next,'Unexpected binding changes'
 a=M['cf'](STAGE,'/versions/'+CANDIDATE)['resources']['script_runtime']
 b=M['cf'](STAGE,'/versions/'+new)['resources']['script_runtime']
 assert all(a.get(k)==b.get(k) for k in ['compatibility_date','compatibility_flags'])
 print('VIA_V304_CANDIDATE '+new,flush=True)
def assets(base):
 manifest=json.loads((OUT/'manifest.json').read_text())
 def compare(n):
  for i in range(4):
   try:
    actual,h=P['get'](base+'/'+urllib.parse.quote(n,safe='/'))
    expected=(ASSETS/n).read_bytes()
    assert (H['html_tokens'](actual)==H['html_tokens'](expected) if n.endswith('.html') else actual==expected),'Asset mismatch '+n
    return
   except Exception:
    if i==3:raise
    time.sleep(2*(i+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(compare,manifest['assets']))
 print('VIA_V304_ASSETS_VERIFIED '+str(len(manifest['assets'])),flush=True)
def deploy(v):
 M['cf'](STAGE,'/deployments',{'strategy':'percentage','versions':[{'version_id':v,'percentage':100}],'annotations':{'workers/message':'V30.4.8 approved improvements or rollback'}})
 for i in range(14):
  if M['version'](STAGE)==v:return
  time.sleep(2)
 raise AssertionError('Deployment not confirmed')
def promote():
 baseline();deploy(target());print('VIA_V304_ACTIVE '+target(),flush=True)
def rollback():
 current=M['version'](STAGE)
 if current==CANDIDATE:return
 assert current==target(),'Unrelated deployment: no rollback'
 deploy(CANDIDATE)
 print('VIA_V304_ROLLBACK_OK',flush=True)
def final():
 assert M['version'](STAGE)==target() and M['version'](M['API'])==M['BASE_API']
 assets('https://viatraslados.com')
 print('VIA_V304_PRODUCTION_VERIFIED '+target(),flush=True)
if __name__=='__main__':
 import sys
 {'build':build,'candidate':verify_candidate,'preview':lambda:assets('https://'+target()[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'),'promote':promote,'rollback':rollback,'final':final}[sys.argv[1]]()

