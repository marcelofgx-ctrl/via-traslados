#!/usr/bin/env python3
"""Vía Traslados V30 MVP: reconstruct live V29.1.16 Worker, patch ONLY
passenger app.js/store.js and home version; preserve ALL other assets.
QA first, production only behind explicit V30 API Worker and smoke verification."""
import concurrent.futures,hashlib,json,os,pathlib,re,runpy,subprocess,sys,time
import urllib.error,urllib.parse,urllib.request
old=runpy.run_path('scripts/via-v291-prepare.py')
GET=old['http_get'];hashit=old['digest'];clean=old['sanitize_html']
source_files=old['source_asset_list'];get_worker=old['get_live_worker_source']
version=old['active_version'];get_extra=old['EXTRAS']
WEB='https://viatraslados.com';STAGE='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev'
BASE='f46757df-8ff2-4653-bec3-e15b8394a99a';VERSION='30.0'
OUT=pathlib.Path('v30-mvp-web-build');ASSETS=OUT/'assets'
CORE={
 'geo-v2/core.mjs':'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1',
 'descargas/via-traslados-conductor-v35.apk':'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
}
NEEDED={'index.html','mis-reservas.html','app.js','store.js','reference.js',
 'map-point-picker.js','passkeys.js','config.js','geo-v2/core.mjs',
 'reserva.html','via-v29116-date-ui.js','via-v29116-visual.css',
 'descargas/via-traslados-conductor-v35.apk'}
def assert_version():
 assert version()==BASE,'Web Worker changed since V30 baseline; stop'
def exact(src,a,b):
 assert src.count(a)==1,'Unexpected version asset '+a
 return src.replace(a,b,1)
def load(name):
 try:buf,head=GET(WEB+'/'+urllib.parse.quote(name,safe='/'))
 except urllib.error.HTTPError as e:
  if e.code==404:return name,None
  raise
 if name.endswith(('.js','.mjs','.svg','.css')):
  assert 'text/html' not in head.get('Content-Type','').lower(),'HTML instead of script '+name
 if name.endswith('.html'):buf=clean(buf)
 return name,buf
def prepare():
 assert_version()
 OUT.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
 names=set(source_files())|set(get_extra)|NEEDED|{'sw.js','manifest.webmanifest','icon.svg'}
 pending=set(names);hashes={}
 while pending:
  batch=sorted(pending);pending.clear()
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   for name,buf in pool.map(load,batch):
    if buf is None:
     assert name not in NEEDED,'Required public file missing '+name
     continue
    dest=ASSETS/name;dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(buf);hashes[name]=hashit(buf)
    if name.endswith('.html'):
     for link in re.findall(r'(?:src|href)=["\x27]([^"\x27]+)',buf.decode('utf8')):
      u=urllib.parse.urlparse(link)
      if u.netloc or u.scheme or not u.path:continue
      child=str(pathlib.PurePosixPath(name).parent/u.path.removeprefix('./').removeprefix('/'))
      if child.startswith('../') or not child.endswith(('.js','.css','.svg','.png','.mjs','.webmanifest')):continue
      if child not in names:names.add(child);pending.add(child)
 assert len(hashes)>=45,'Incomplete production capture'
 for p in NEEDED:assert p in hashes,'Required file absent '+p
 for p,sha in CORE.items():assert hashes[p]==sha,'Protected source altered '+p
 for src,baseline in [('app.js','audit/v30-baseline-app.js'),('store.js','audit/v30-baseline-store.js')]:
  assert (ASSETS/src).read_bytes()==pathlib.Path(baseline).read_bytes(),'Passenger baseline changed '+src
 html=(ASSETS/'index.html').read_text()
 assert 'content="29.1.16"' in html and '>v29.1.16</small>' in html,'Wrong deployed baseline'
 html=exact(html,'content="29.1.16"','content="30.0"')
 html=exact(html,'>v29.1.16</small>','>v30.0</small>')
 html=exact(html,'store.js?v=19.1','store.js?v=30.0')
 html=exact(html,'app.js?v=29.14','app.js?v=30.0')
 (ASSETS/'index.html').write_text(html)
 assert 'mine-v29113-inicio.css?v=1' in (ASSETS/'mis-reservas.html').read_text(),'Approved reservations layout missing'
 for path,src in [('app.js','scripts/v30-web-app.js'),('store.js','scripts/v30-web-store.js')]:
  body=pathlib.Path(src).read_bytes()
  assert b'V30' in body[:120],'Only approved V30 JS may replace '+path
  (ASSETS/path).write_bytes(body)
 changed=sorted(p for p,h in hashes.items() if hashit((ASSETS/p).read_bytes())!=h)
 assert changed==['app.js','index.html','store.js'],'Unexpected web file modifications '+str(changed)
 for p in ('reference.js','map-point-picker.js','passkeys.js','geo-v2/core.mjs'):
  assert hashit((ASSETS/p).read_bytes())==hashes[p],p+' not protected'
 (OUT/'production-worker.mjs').write_text(get_worker())
 (OUT/'qa-worker.mjs').write_text(
  "export default {async fetch(request,env){if(new URL(request.url).pathname.startsWith('/api/'))return new Response('QA isolated',{status:503});return env.ASSETS.fetch(request)}};\n")
 for prod in (False,True):
  spec={'name':'via-traslados-web-prod' if prod else 'via-traslados-mine-v2917-stage',
   'main':'production-worker.mjs' if prod else 'qa-worker.mjs',
   'compatibility_date':'2026-11-10','workers_dev':True,
   'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
  if prod:spec['keep_vars']=True
  (OUT/('wrangler.prod.jsonc' if prod else 'wrangler.qa.jsonc')).write_text(json.dumps(spec,indent=2))
 (OUT/'manifest.json').write_text(json.dumps({
  'release':'30.0','source_web_worker':BASE,'source_asset_hashes':hashes,
  'changed_existing':changed,'new_assets':[],
  'rollback_web_worker':BASE,'d1_or_api_changed':False},indent=2))
 assert_version()
 print('VIA_V30_WEB_BUILD_SAFE '+json.dumps({'source':BASE,'assets':len(hashes),'changes':changed}),flush=True)
def smoke(url):
 for path,marker in [('index.html','content="30.0"'),('index.html','store.js?v=30.0'),
  ('index.html','app.js?v=30.0'),('app.js','V30'),('app.js','p.originLocation,p.destinationLocation'),
  ('store.js','V30'),('store.js','originLocation,destinationLocation'),
  ('mis-reservas.html','mine-v29113-inicio.css?v=1'),
  ('map-point-picker.js','via-reference-street'),
  ('via-v29116-date-ui.js','via-home-date-display')]:
  r,_=GET(url+'/'+path);assert marker.encode() in r,'V30 web smoke marker missing '+path+' '+marker
 for path in ('geo-v2/core.mjs','passkeys.js','reference.js',
              'descargas/via-traslados-conductor-v35.apk'):
  actual,_=GET(url+'/'+path)
  assert hashit(actual)==hashit((ASSETS/path).read_bytes()),'Protected web file changed '+path
 print('VIA_V30_WEB_SMOKE_OK '+url,flush=True)
def qa():
 for i in range(12):
  try:smoke(STAGE);return
  except Exception as e:
   if i==11:raise
   print('V30_QA_SMOKE_RETRY '+str(e)[:120],flush=True);time.sleep(3)
def cf(name,path,body=None):
 root='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/workers/scripts/'+name+path
 headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'}
 content=json.dumps(body).encode() if body is not None else None
 req=urllib.request.Request(root,data=content,method='POST' if content is not None else 'GET',headers=headers)
 with urllib.request.urlopen(req,timeout=30) as r:j=json.load(r)
 assert j.get('success') is True,'Cloudflare rejected '+name+path
 return j.get('result',{})
def rollback():
 assert any(v.get('version_id')==BASE for d in cf('via-traslados-web-prod','/deployments').get('deployments',[]) for v in d.get('versions',[])),'Web rollback missing'
 cf('via-traslados-web-prod','/deployments',{
  'strategy':'percentage','versions':[{'percentage':100,'version_id':BASE}],
  'annotations':{'workers/message':'V30 web smoke failed; restore V29.1.16 without touching API or D1.'}})
 for i in range(14):
  if version()==BASE:print('VIA_V30_WEB_ROLLBACK_PASS '+BASE,flush=True);return
  time.sleep(3)
 raise AssertionError('Web rollback not confirmed')
def api_version():
 d=cf('via-traslados-api','/deployments')['deployments'][0]['versions']
 assert len(d)==1 and d[0]['percentage']==100,'API Worker traffic split'
 return d[0]['version_id']
def release():
 assert_version();qa()
 expected_api=pathlib.Path('release/VIA_V30_API_ACTIVE').read_text().strip()
 assert re.fullmatch(r'[0-9a-f-]{36}',expected_api) and expected_api==api_version(),'Verified V30 API Worker is not active'
 manifest=json.loads((OUT/'manifest.json').read_text())
 for p,h in manifest['source_asset_hashes'].items():
  b,_=GET(WEB+'/'+urllib.parse.quote(p,safe='/'))
  if p.endswith('.html'):b=clean(b)
  assert hashit(b)==h,'Live web changed after QA '+p
 assert_version()
 changed=False
 try:
  p=subprocess.run(['npx','--yes','wrangler@4.160.1','deploy','--config',str(OUT/'wrangler.prod.jsonc'),'--keep-vars'],
   capture_output=True,text=True,timeout=260)
  if p.returncode:raise AssertionError('Web deployment error '+p.stderr[-800:])
  changed=True
  for i in range(14):
   try:
    smoke(WEB)
    assert version()!=BASE,'Old web Worker still active'
    assert api_version()==expected_api,'API Worker changed after web deploy'
    ok=subprocess.run(['node','tests/prod-core-invariants.mjs'],capture_output=True,text=True,timeout=100)
    assert ok.returncode==0,'Core smoke failed '+ok.stderr[-400:]
    print('VIA_V30_WEB_PRODUCTION_VERIFIED '+version(),flush=True);return
   except Exception as e:
    print('VIA_V30_WEB_VERIFY_RETRY '+str(e)[:100],flush=True);time.sleep(3)
  raise AssertionError('Web production verification failed')
 except Exception:
  if changed and version()!=BASE:rollback()
  raise
if __name__=='__main__':
 mode=sys.argv[1] if len(sys.argv)>1 else 'prepare'
 {'prepare':prepare,'qa':qa,'release':release}[mode]()
