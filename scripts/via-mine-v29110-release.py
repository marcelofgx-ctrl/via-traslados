#!/usr/bin/env python3
"""Vía Traslados V29.1.10 — selected premium Mis reservas reference.
Build and release from CURRENT live web Worker V29.1.9, never source-only GitHub.
Only HTML version/meta + mine visual stylesheet/controller. Existing workers and
API, D1, OTP, passkeys, signed APK and booking logic preserved byte-for-byte.
"""
import concurrent.futures,hashlib,json,os,pathlib,re,runpy,subprocess,sys,time,urllib.error,urllib.parse,urllib.request
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get'];digest=lib['digest'];clean=lib['sanitize_html']
live_version=lib['active_version'];get_worker=lib['get_live_worker_source']
source_files=lib['source_asset_list']
WEB='https://viatraslados.com'
STAGE='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev'
BASE='f35ac851-6f1b-403c-b2c7-f7c437693e0f'
VERSION='29.1.10'
OUT=pathlib.Path('mine-v29110-build');ASSETS=OUT/'assets'
ADDED={
 'mine-v29110-theme.css':'scripts/via-mine-v29110-theme.css',
 'mine-v29110-theme.js':'scripts/via-mine-v29110-theme.js',
 'mine-contours-v29110.svg':'scripts/via-mine-v29110-topo.svg'
}
ORIGINAL_REQUIRED={
 'index.html','mis-reservas.html','app.js','store.js','passkeys.js',
 'config.js','geo-v2/core.mjs','reserva.html',
 'mine-premium-v2917.css','mine-premium-v2917.js',
 'mine-guest-v2918.css','mine-guest-v2918.js','mine-brand-v2918.svg',
 'mine-brand-v2919.css','mine-brand-v2919.svg',
 'descargas/via-traslados-conductor-v35.apk'
}
KEEP={
 'store.js':'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 'geo-v2/core.mjs':'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1',
 'descargas/via-traslados-conductor-v35.apk':'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
}
def exact(s,old,new):
 assert s.count(old)==1,('Expected unique original markup',old[:120],s.count(old))
 return s.replace(old,new,1)
def version():
 assert live_version()==BASE,'Expected V29.1.9 production web not active; stop release'
def get(name):
 try:buf,headers=GET(WEB+'/'+urllib.parse.quote(name,safe='/'))
 except urllib.error.HTTPError as e:
  if e.code==404:return name,None
  raise
 if name.endswith(('.js','.mjs','.css','.svg')):assert 'text/html' not in headers.get('Content-Type','').lower(),'HTML instead of resource '+name
 if name.endswith('.html'):buf=clean(buf)
 return name,buf
def prepare():
 version()
 OUT.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
 names=set(source_files())|set(lib['EXTRAS'])|ORIGINAL_REQUIRED|{'sw.js','reserva.html'}
 pending=set(names);required=set(ORIGINAL_REQUIRED);inventory={}
 while pending:
  batch=sorted(pending);pending.clear()
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   for name,buf in pool.map(get,batch):
    if buf is None:
     assert name not in required,'Missing live resource '+name
     continue
    file=ASSETS/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(buf)
    inventory[name]=digest(buf)
    if name.endswith('.html'):
     for href in re.findall(r'(?:src|href)=["\x27]([^"\x27]+)',buf.decode('utf8')):
      u=urllib.parse.urlparse(href)
      if u.netloc or u.scheme or not u.path:continue
      child=str(pathlib.PurePosixPath(name).parent/u.path.removeprefix('./').removeprefix('/'))
      if child.startswith('../') or not child.endswith(('.js','.css','.svg','.mjs','.png','.webmanifest')):continue
      if child not in names:
       names.add(child);pending.add(child)
 assert len(inventory)>=43,'Production inventory insufficient'
 for p in ORIGINAL_REQUIRED:assert p in inventory,'Missing essential '+p
 for p,h in KEEP.items():assert inventory[p]==h,'Unexpected resource hash '+p
 html=(ASSETS/'index.html').read_text()
 assert 'content="29.1.9"' in html and '>v29.1.9</small>' in html,'Unexpected home snapshot'
 html=exact(html,'content="29.1.9"','content="'+VERSION+'"')
 html=exact(html,'>v29.1.9</small>','>v'+VERSION+'</small>')
 (ASSETS/'index.html').write_text(html)
 mine=(ASSETS/'mis-reservas.html').read_text()
 assert 'mine-brand-v2919.css?v=1' in mine and 'mine-guest-v2918.css?v=1' in mine,'Unexpected mine snapshot'
 assert 'mine-premium-v2917.js?v=1' in mine,'Missing original pagination'
 assert 'via-home-arrow' in mine and 'mine-login-passkey' in mine,'Missing visual header or real passkey control'
 assert 'mine-v29110-theme.css' not in mine,'V29.1.10 already deployed'
 mine=exact(mine,'<span class="via-home-arrow" aria-hidden="true">→</span>', '<span class="via-home-arrow" aria-hidden="true">←</span>')
 mine=exact(mine,'</head>','<link rel="stylesheet" href="./mine-v29110-theme.css?v=1"></head>')
 mine=exact(mine,'</body>','<script src="./mine-v29110-theme.js?v=1"></script></body>')
 (ASSETS/'mis-reservas.html').write_text(mine)
 for name,source in ADDED.items():
  src=pathlib.Path(source);assert src.is_file()
  (ASSETS/name).write_bytes(src.read_bytes())
 changed=sorted(name for name,h in inventory.items() if digest((ASSETS/name).read_bytes())!=h)
 assert changed==['index.html','mis-reservas.html'],'Only homepage version and mine markup may change '+repr(changed)
 for p,h in KEEP.items():assert digest((ASSETS/p).read_bytes())==h,p+' changed'
 (OUT/'production-worker.mjs').write_text(get_worker())
 (OUT/'worker.qa.mjs').write_text("export default {async fetch(request,env){if(new URL(request.url).pathname.startsWith('/api/'))return new Response('QA: API disabled',{status:503});return env.ASSETS.fetch(request)}};\n")
 for isprod in (False,True):
  name='via-traslados-web-prod' if isprod else 'via-traslados-mine-v2917-stage'
  spec={'name':name,'main':'production-worker.mjs' if isprod else 'worker.qa.mjs',
   'compatibility_date':'2026-11-10','workers_dev':True,
   'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
  if isprod:spec['keep_vars']=True
  (OUT/('wrangler.prod.jsonc' if isprod else 'wrangler.qa.jsonc')).write_text(json.dumps(spec,indent=2))
 manifest={
  'display_version':VERSION,'source_version':BASE,'source_asset_hashes':inventory,
  'changed_existing':changed,'new_assets':list(ADDED),'rollback_web_version':BASE,
  'api_d1_passkeys_reservations_modified':False}
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
 version()
 print('VIA_V29110_BUILD_SAFE '+json.dumps({'base':BASE,'inventory':len(inventory),'existing_changed':changed,'new_assets':len(ADDED)}),flush=True)
def smoke(url):
 for name,marker in [
  ('','content="29.1.10"'),
  ('mis-reservas.html','mine-v29110-theme.css?v=1'),
  ('mis-reservas.html','mine-v29110-theme.js?v=1'),
  ('mine-v29110-theme.css','V29.1.10'),
  ('mine-v29110-theme.js','V29.1.10'),
  ('mine-contours-v29110.svg','#C9F3E1'),
  ('mine-brand-v2919.svg','emeraldLeft')]:
  buf,_=GET(url+'/'+name)
  assert marker in buf.decode('utf8','replace'),'Mismatch at '+url+'/'+name
 for p in ('app.js','store.js','passkeys.js','config.js','reserva.html','geo-v2/core.mjs',
           'descargas/via-traslados-conductor-v35.apk'):
  buf,_=GET(url+'/'+p)
  # Cloudflare may inject a first-party analytics script into HTML responses.
  # Compare normalized HTML exactly, never weaken JS/Geo/OTP/APK hashes.
  if p.endswith('.html'):buf=clean(buf)
  assert digest(buf)==digest((ASSETS/p).read_bytes()),'Functionality-bearing asset changed '+p
 print('VIA_V29110_SMOKE_OK '+url,flush=True)
def qa():
 for i in range(12):
  try:smoke(STAGE);return
  except Exception as e:
   print('STAGE_VERIFY_RETRY',i,str(e)[:100],flush=True)
   if i==11:raise
   time.sleep(3)
def cf(path,body=None):
 headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'}
 url='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/workers/scripts/via-traslados-web-prod'+path
 raw=json.dumps(body).encode() if body is not None else None
 req=urllib.request.Request(url,data=raw,method='POST' if raw is not None else 'GET',headers=headers)
 with urllib.request.urlopen(req,timeout=30) as r:data=json.load(r)
 assert data.get('success') is True,'Cloudflare rejected '+path
 return data.get('result',{})
def rollback():
 assert any(v.get('version_id')==BASE for d in cf('/deployments').get('deployments',[]) for v in d.get('versions',[])),'Rollback version absent'
 cf('/deployments',{'strategy':'percentage','versions':[{'percentage':100,'version_id':BASE}],
  'annotations':{'workers/message':'V29.1.10 visual release check failed. Roll back to V29.1.9.'}})
 for i in range(15):
  if live_version()==BASE:
   print('VIA_V29110_ROLLBACK_VERIFIED '+BASE,flush=True);return
  time.sleep(3)
 raise AssertionError('Rollback could not be verified')
def release():
 version()
 m=json.loads((OUT/'manifest.json').read_text())
 assert m['source_version']==BASE and m['display_version']==VERSION
 qa()
 # Byte-for-byte preflight of everything captured from actual live production.
 for name,h in m['source_asset_hashes'].items():
  buf,_=GET(WEB+'/'+urllib.parse.quote(name,safe='/'))
  if name.endswith('.html'):buf=clean(buf)
  assert digest(buf)==h,'Production changed since snapshot; abort '+name
 version()
 attempted=False
 try:
  attempted=True
  p=subprocess.run(['npx','--yes','wrangler@4.160.1','deploy','--config',str(OUT/'wrangler.prod.jsonc'),'--keep-vars'],
   capture_output=True,text=True,timeout=260)
  if p.returncode:raise AssertionError('Production deployment refused '+p.stderr[-700:])
  for i in range(15):
   try:
    smoke(WEB)
    deployed=live_version()
    assert deployed!=BASE,'Old web Worker still active'
    print('VIA_V29110_PRODUCTION_VERIFIED '+deployed,flush=True);return
   except Exception as e:
    print('VIA_V29110_PROD_RETRY',i,str(e)[:110],flush=True);time.sleep(3)
  raise AssertionError('Production postchecks failed')
 except Exception:
  if attempted and live_version()!=BASE:rollback()
  raise
if __name__=='__main__':
 {'prepare':prepare,'qa':qa,'release':release}[sys.argv[1]]()
