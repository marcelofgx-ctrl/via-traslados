#!/usr/bin/env python3
"""Vía Traslados v29.1.9 - approved premium header and safe guest login. Web assets only.
Proven v29.1.6 Worker as immutable source, v29.1.8 correction QA, v29.1.9 exact header.
Commands: prepare, qa, release. Never changes D1, API Worker, bookings or passkeys.
"""
import runpy,pathlib,json,urllib.parse,time,subprocess,os,sys
v18=runpy.run_path('scripts/via-mine-v2918-qa.py')
base=runpy.run_path('scripts/via-mine-v2917-prepare.py')
ROOT=pathlib.Path('mine-v2917-build')
ASSETS=ROOT/'assets'
LIVE='https://viatraslados.com'
STAGE='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev'
BASE='0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b'
VERSION='29.1.9'
def change(text,old,new):
 assert text.count(old)==1,('Unexpected HTML source anchor',old,text.count(old))
 return text.replace(old,new,1)
def prepare():
 assert base['active']()==BASE,'Production web version changed; do not build'
 v18['prepare']()
 home=(ASSETS/'index.html').read_text()
 home=change(home,'content="29.1.8"','content="'+VERSION+'"')
 home=change(home,'>v29.1.8</small>','>v'+VERSION+'</small>')
 (ASSETS/'index.html').write_text(home)
 mine=(ASSETS/'mis-reservas.html').read_text()
 mine=change(mine,'<a class="top-link" href="./index.html">← Inicio</a>',
  '<a class="top-link" href="./index.html" aria-label="Volver al inicio"><span class="via-home-arrow" aria-hidden="true">→</span><span class="via-home-label">Inicio</span></a>')
 mine=change(mine,'</head>',
  '<link rel="stylesheet" href="./mine-brand-v2919.css?v=1"></head>')
 (ASSETS/'mis-reservas.html').write_text(mine)
 for target,source in [
  ('mine-brand-v2919.svg','scripts/via-mine-v2919-brand.svg'),
  ('mine-brand-v2919.css','scripts/via-mine-v2919-brand.css')]:
  (ASSETS/target).write_bytes(pathlib.Path(source).read_bytes())
 manifest=json.loads((ROOT/'manifest.json').read_text())
 original=manifest['sha_before']
 changed=[name for name in original if base['sha']((ASSETS/name).read_bytes())!=original[name]]
 assert sorted(changed)==['index.html','mis-reservas.html'],'Unexpected original file changed: '+repr(changed)
 for immutable in ('app.js','store.js','passkeys.js','config.js','geo-v2/core.mjs','reserva.html',
                   'descargas/via-traslados-conductor-v35.apk'):
  assert base['sha']((ASSETS/immutable).read_bytes())==original[immutable],immutable+' changed'
 manifest['version']=VERSION
 manifest['parent_cloudflare_version']=BASE
 manifest['changes']=changed
 manifest['added']=[
  'mine-premium-v2917.css','mine-premium-v2917.js',
  'mine-guest-v2918.css','mine-guest-v2918.js','mine-brand-v2918.svg',
  'mine-brand-v2919.css','mine-brand-v2919.svg'
 ]
 (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
 assert base['active']()==BASE,'Web changed during build'
 print('VIA_MINE_V2919_PREPARED '+json.dumps({'source':'v29.1.6','changed':changed,'immutable_assets':len(original)}),flush=True)
def smoke(url):
 for name,mark in [
  ('','content="29.1.9"'),('mis-reservas.html','mine-brand-v2919.css?v=1'),
  ('mis-reservas.html','class="via-home-arrow"'),
  ('mine-brand-v2919.css','folded emerald V mark'),
  ('mine-brand-v2919.svg','Vía Traslados'),
  ('mine-guest-v2918.css','Vía Traslados v29.1.8'),
  ('mine-premium-v2917.js','Vía Traslados V29.1.7')]:
  raw,_=base['get'](url+'/'+name)
  assert mark in raw.decode('utf-8','replace'),'Missing/incorrect asset '+url+' '+name
 for name in ('app.js','store.js','passkeys.js','config.js','geo-v2/core.mjs',
              'descargas/via-traslados-conductor-v35.apk'):
  raw,_=base['get'](url+'/'+name)
  assert base['sha'](raw)==base['sha']((ASSETS/name).read_bytes()),'Immutable asset mismatch '+name
 print('VIA_MINE_V2919_SMOKE_OK '+url,flush=True)
def qa():
 for i in range(12):
  try:smoke(STAGE);return
  except Exception as e:
   print('QA_PROPAGATION_RETRY',i,str(e)[:115],flush=True)
   if i==11:raise
   time.sleep(3)
def api(path,payload=None):
 import urllib.request
 account=os.environ['CLOUDFLARE_ACCOUNT_ID']
 token=os.environ['CLOUDFLARE_API_TOKEN']
 url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/via-traslados-web-prod'+path
 d=json.dumps(payload).encode() if payload is not None else None
 req=urllib.request.Request(url,data=d,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},
  method='POST' if d else 'GET')
 with urllib.request.urlopen(req,timeout=25) as r:
  result=json.load(r)
 assert result.get('success') is True,(path,result.get('errors'))
 return result.get('result',{})
def deploy_rollback():
 print('VIA_MINE_V2919_TRIGGER_ROLLBACK',flush=True)
 api('/deployments',{'strategy':'percentage','versions':[{'percentage':100,'version_id':BASE}],
  'annotations':{'workers/message':'V29.1.9 premium header validation failed, rollback to V29.1.6'}})
 for i in range(12):
  if base['active']()==BASE:
   print('VIA_MINE_V2919_ROLLBACK_VERIFIED',BASE,flush=True)
   return
  time.sleep(2)
 raise AssertionError('Rollback could not be verified')
def release():
 assert base['active']()==BASE,'Unexpected current Worker version: release blocked'
 m=json.loads((ROOT/'manifest.json').read_text())
 assert m['version']==VERSION and m['parent_cloudflare_version']==BASE
 qa()
 for name,expected in m['sha_before'].items():
  raw,_=base['get'](LIVE+'/'+urllib.parse.quote(name,safe='/'))
  if name.endswith('.html'):raw=base['clean'](raw)
  assert base['sha'](raw)==expected,'Production asset changed since snapshot: '+name
 assert base['active']()==BASE,'Web moved during preflight'
 # Restrict deployment to existing web Worker, preserve its source and variables;
 # workflow never invokes D1 or API migrations, and never sends credentials or email.
 command=['npx','--yes','wrangler@4.160.1','deploy','--config',str(ROOT/'wrangler.prod.jsonc'),'--keep-vars']
 attempted=False
 try:
  attempted=True
  p=subprocess.run(command,capture_output=True,text=True,timeout=275)
  if p.returncode:raise RuntimeError('Wrangler rejected deployment: '+p.stderr[-800:])
  for i in range(15):
   try:
    smoke(LIVE)
    now=base['active']()
    assert now!=BASE,'Old version remains'
    print('VIA_MINE_V2919_PRODUCTION_OK '+now,flush=True)
    return
   except Exception as e:
    print('PRODUCTION_POSTCHECK_RETRY',i,str(e)[:135],flush=True)
    time.sleep(3)
  raise AssertionError('Deployment postchecks not confirmed')
 except Exception:
  if attempted and base['active']()!=BASE:deploy_rollback()
  raise
if __name__=='__main__':
 {'prepare':prepare,'qa':qa,'release':release}[sys.argv[1]]()
