#!/usr/bin/env python3
"""Build V29.1.7 visual-only preview from the actual live V29.1.6 Worker snapshot."""
import concurrent.futures,hashlib,json,pathlib,re,runpy,urllib.error,urllib.parse,sys,time,subprocess
s=runpy.run_path('scripts/via-v291-prepare.py')
get=s['http_get']; sha=s['digest']; clean=s['sanitize_html']
BASE='0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b'
ROOT=pathlib.Path('mine-v2917-build'); ASSETS=ROOT/'assets'
QA='via-traslados-mine-v2917-stage'
STAGE='https://'+QA+'.marcelof-gx.workers.dev'
LIVE='https://viatraslados.com'
KEEP={
 'store.js':'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 'geo-v2/core.mjs':'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1',
 'descargas/via-traslados-conductor-v35.apk':'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
}
def active():return s['active_version']()
def load(name):
 try:data,headers=get(LIVE+'/'+urllib.parse.quote(name,safe='/'))
 except urllib.error.HTTPError as e:
  if e.code==404:return name,None
  raise
 if name.endswith(('.css','.js','.mjs')):
  assert 'html' not in headers.get('Content-Type','').lower(),'Asset is HTML '+name
 if name.endswith('.html'):data=clean(data)
 return name,data
def replace_once(text,old,new):
 assert text.count(old)==1,('Missing or ambiguous anchor',old[:100],text.count(old))
 return text.replace(old,new,1)
def prepare():
 assert active()==BASE,'Worker changed: do not build'
 ROOT.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
 names=set(s['source_asset_list']())|set(s['EXTRAS'])|{
 'index.html','mis-reservas.html','reserva.html','sw.js','geo-v2/core.mjs',
 'descargas/via-traslados-conductor-v35.apk','mine-identity-v291.css'}
 pending=set(names);required=set();inventory={}
 while pending:
  batch=sorted(pending);pending.clear()
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   for name,data in pool.map(load,batch):
    if data is None:
     assert name not in required,'Missing required live resource '+name
     continue
    path=ASSETS/name;path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data);inventory[name]=sha(data)
    if name.endswith('.html'):
     for href in re.findall(r'(?:src|href)=["\x27]([^"\x27]+)',data.decode()):
      url=urllib.parse.urlparse(href)
      if url.netloc or url.scheme or not url.path:continue
      child=str(pathlib.PurePosixPath(name).parent/url.path.removeprefix('./').removeprefix('/'))
      if child.startswith('../') or not child.endswith(('.css','.js','.mjs','.svg','.webmanifest','.png')):continue
      required.add(child)
      if child not in inventory and child not in names:pending.add(child);names.add(child)
 assert len(inventory)>=40,'Incomplete live snapshot'
 for name,hash in KEEP.items():assert inventory.get(name)==hash,'Resource was changed '+name
 assert 'app.js' in inventory and 'passkeys.js' in inventory and 'mine-identity-v291.css' in inventory
 home=(ASSETS/'index.html').read_text()
 assert 'content="29.1.6"' in home and 'id="via-release-indicator"' in home,'Unknown home version'
 assert '>v29.1.6</small>' in home,'Unexpected footer'
 mine=(ASSETS/'mis-reservas.html').read_text()
 assert 'app.js?v=29.3' in mine and 'mine-identity-v291.css?v=2' in mine,'Unknown mine UI'
 mine=replace_once(mine,'</head>','<link rel="stylesheet" href="./mine-premium-v2917.css?v=1"></head>')
 mine=replace_once(mine,'</body>','<script src="./mine-premium-v2917.js?v=1"></script></body>')
 # Cache-bust only mine HTML references; keep passkeys.js, app.js and store.js bytes.
 (ASSETS/'mis-reservas.html').write_text(mine)
 (ASSETS/'mine-premium-v2917.css').write_bytes(pathlib.Path('scripts/via-mine-v2917.css').read_bytes())
 (ASSETS/'mine-premium-v2917.js').write_bytes(pathlib.Path('scripts/via-mine-v2917.js').read_bytes())
 home=replace_once(home,'content="29.1.6"','content="29.1.7"')
 home=replace_once(home,'>v29.1.6</small>','>v29.1.7</small>')
 (ASSETS/'index.html').write_text(home)
 (ROOT/'production-worker.mjs').write_text(s['get_live_worker_source']())
 (ROOT/'worker.qa.mjs').write_text("export default {async fetch(req,env){if(new URL(req.url).pathname.startsWith('/api/'))return new Response('QA; real bookings blocked',{status:503});return env.ASSETS.fetch(req)}};\n")
 # Stage has no DB or authentication. Production retains real active Worker logic.
 (ROOT/'wrangler.qa.jsonc').write_text(json.dumps({'name':QA,'main':'worker.qa.mjs',
  'compatibility_date':'2026-11-10','workers_dev':True,
  'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}},indent=2))
 (ROOT/'wrangler.prod.jsonc').write_text(json.dumps({'name':'via-traslados-web-prod',
  'main':'production-worker.mjs','compatibility_date':'2026-11-10',
  'workers_dev':True,'keep_vars':True,
  'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}},indent=2))
 changed=[name for name,d in inventory.items() if sha((ASSETS/name).read_bytes())!=d]
 assert sorted(changed)==['index.html','mis-reservas.html'],'Unexpected existing assets changed '+str(changed)
 (ROOT/'manifest.json').write_text(json.dumps({'baseline':BASE,'sha_before':inventory,
  'changes':changed,'added':['mine-premium-v2917.css','mine-premium-v2917.js']},indent=2))
 assert active()==BASE,'Production moved during build'
 print('VIA_MINE_V2917_PREPARED',len(inventory),'baseline',BASE,'modified',changed,flush=True)
def smoke(site):
 for name,marker in [('index.html',b'content="29.1.7"'),
 ('mis-reservas.html',b'mine-premium-v2917.js?v=1'),
 ('mine-premium-v2917.css','Vía Traslados V29.1.7'.encode()),
 ('mine-premium-v2917.js',b'Vía Traslados V29.1.7')]:
  data,_=get(site+'/'+name)
  assert marker in data,'Bad visual package '+site+' '+name
 for name in ('app.js','store.js','passkeys.js','config.js','geo-v2/core.mjs',
              'descargas/via-traslados-conductor-v35.apk'):
  raw,_=get(site+'/'+name)
  assert sha(raw)==sha((ASSETS/name).read_bytes()),'Existing resource changed '+name
 print('VIA_MINE_V2917_SMOKE_OK',site,flush=True)
def qa():
 for i in range(12):
  try:smoke(STAGE);return
  except Exception as e:
   print('STAGE_WAIT',i,str(e)[:120],flush=True);time.sleep(4)
 raise AssertionError('Stage failed; production untouched')
def release():
 assert active()==BASE,'Production Worker moved, do not deploy'
 manifest=json.loads((ROOT/'manifest.json').read_text())
 for name,expected in manifest['sha_before'].items():
  raw,_=get(LIVE+'/'+urllib.parse.quote(name,safe='/'))
  if name.endswith('.html'):raw=clean(raw)
  assert sha(raw)==expected,'Production changed: '+name
 deployed=False
 try:
  p=subprocess.run(['npx','--yes','wrangler@4.160.1','deploy','--config',str(ROOT/'wrangler.prod.jsonc'),'--keep-vars'],
   capture_output=True,text=True,timeout=290)
  if p.returncode:raise RuntimeError('Wrangler rejected deploy: '+p.stderr[-600:])
  deployed=True
  for i in range(15):
   try:
    smoke(LIVE)
    now=active()
    assert now!=BASE,'Old version remains'
    print('VIA_MINE_V2917_PRODUCTION_OK',now,flush=True);return
   except Exception as e:print('PRODUCTION_WAIT',i,str(e)[:120],flush=True);time.sleep(5)
  raise AssertionError('Postrelease smoke failed')
 except Exception:
  if deployed or active()!=BASE:
   s['cf']('/deployments',{'strategy':'percentage','versions':[{'percentage':100,'version_id':BASE}],
    'annotations':{'workers/message':'Rollback V29.1.7 visual test failed'}})
   assert active()==BASE,'Rollback not confirmed'
   print('VIA_MINE_V2917_ROLLBACK_OK',BASE,flush=True)
  raise
if __name__=='__main__':
 {'prepare':prepare,'qa':qa,'release':release}[sys.argv[1]]()
