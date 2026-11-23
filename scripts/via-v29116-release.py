#!/usr/bin/env python3
"""Vía Traslados V29.1.16 — presentation-only native date readability and two-line map reference.
Build and release from CURRENT live web Worker V29.1.15, never source-only GitHub.
Only index version/cache-bust and two-line map label change; adds isolated date UI script and CSS.
Existing Worker, API, D1, geocoding, OTP, passkeys, signed APK and booking logic preserved.
"""
import concurrent.futures,hashlib,json,os,pathlib,re,runpy,subprocess,sys,time,urllib.error,urllib.parse,urllib.request
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get'];digest=lib['digest'];clean=lib['sanitize_html']
live_version=lib['active_version'];get_worker=lib['get_live_worker_source']
source_files=lib['source_asset_list']
WEB='https://viatraslados.com'
STAGE='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev'
BASE='e7830749-95f0-4a0e-8781-0e2ae6a19466'
VERSION='29.1.16'
OUT=pathlib.Path('mine-v29116-build');ASSETS=OUT/'assets'
ADDED={'via-v29116-visual.css':'scripts/via-v29116-visual.css',
       'via-v29116-date-ui.js':'scripts/via-v29116-date-ui.js'}
ORIGINAL_REQUIRED={
 'index.html','mis-reservas.html','app.js','store.js','passkeys.js',
 'config.js','geo-v2/core.mjs','reserva.html',
 'mine-premium-v2917.css','mine-premium-v2917.js',
 'mine-guest-v2918.css','mine-guest-v2918.js','mine-brand-v2918.svg',
 'mine-brand-v2919.css','mine-brand-v2919.svg',
 'mine-v29110-theme.css','mine-v29110-theme.js','mine-contours-v29110.svg',
  'mine-v29111-fidelity.css','mine-v29112-cohesion.css','mine-v29112-cohesion.js',
  'mine-v29113-inicio.css','reference.js','address-autocomplete.js','map-point-picker.js',
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
 assert live_version()==BASE,'Expected V29.1.15 production web not active; stop release'
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
 # Visual-only release contract: EXACT production assets and unchanged geocoding
 # and booking files. Any unexpected dependency drift requires separate review.
 audit=json.loads(pathlib.Path('audit/live-v29115/manifest.json').read_text())['files']
 for name in ('map-point-picker.js','reference.js','app.js','map-point-picker.css',
              'geo-v2/core.mjs','via-v29115-map-ui.css','address-autocomplete.js'):
  assert inventory[name]==audit[name]['sha256'],'Functional/UI baseline drift '+name
 html=(ASSETS/'index.html').read_text()
 assert 'content="29.1.15"' in html and '>v29.1.15</small>' in html,'Unexpected homepage version'
 assert 'map-point-picker.js?v=27' in html and 'via-v29115-map-ui.css?v=1' in html,'Old assets changed'
 html=exact(html,'content="29.1.15"','content="'+VERSION+'"')
 html=exact(html,'>v29.1.15</small>','>v'+VERSION+'</small>')
 html=exact(html,'map-point-picker.js?v=27','map-point-picker.js?v=28')
 html=exact(html,'</head>',
  '<link rel="stylesheet" href="./via-v29116-visual.css?v=1"></head>')
 html=exact(html,'</body>','<script src="./via-v29116-date-ui.js?v=1" defer></script></body>')
 (ASSETS/'index.html').write_text(html)
 mine=(ASSETS/'mis-reservas.html').read_text()
 assert 'mine-v29113-inicio.css?v=1' in mine,'Approved Mis reservas changed'
 prior=pathlib.Path('audit/live-v29115/map-point-picker.js').read_text()
 old=("  reference.textContent=result.headline+' · '+(result.numberIsApproximate?\n"
      "   'N.º orientativo':'Número por confirmar')+' · a unos '+metersAway+' m';")
 new=("  // Presentation-only: keep the precise location and reverse-geocode result\n"
      "  // untouched; split its existing human-readable label into two stable rows.\n"
      "  const streetLine=document.createElement('span');\n"
      "  streetLine.className='via-reference-street';\n"
      "  streetLine.textContent=result.headline;\n"
      "  const detailLine=document.createElement('small');\n"
      "  detailLine.className='via-reference-detail';\n"
      "  detailLine.textContent=(result.numberIsApproximate?\n"
      "   'N.º orientativo':'Número por confirmar')+' · A unos '+metersAway+' m';\n"
      "  reference.replaceChildren(streetLine,detailLine);")
 assert prior.count(old)==1,'Map presentation-only source guard not unique'
 expected="/* Vía Traslados V29.1.16 — visual-only map reference typography; reverse lookup unchanged. */\n"+prior.replace(old,new)
 candidate=pathlib.Path('scripts/via-v29116-map-point-picker.js').read_text()
 assert candidate==expected,'Map motor differs beyond approved presentation-only change'
 (ASSETS/'map-point-picker.js').write_text(candidate)
 for name,source in ADDED.items():
  file=pathlib.Path(source);assert file.is_file()
  target=ASSETS/name;target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(file.read_bytes())
 changed=sorted(name for name,h in inventory.items() if digest((ASSETS/name).read_bytes())!=h)
 assert changed==['index.html','map-point-picker.js'],'Unexpected existing changes '+repr(changed)
 assert (ASSETS/'app.js').read_bytes()==GET(WEB+'/app.js')[0],'Booking/auth script changed'
 assert digest((ASSETS/'reference.js').read_bytes())==audit['reference.js']['sha256'],'GPS source changed'
 assert digest((ASSETS/'geo-v2/core.mjs').read_bytes())==audit['geo-v2/core.mjs']['sha256'],'Geocoder changed'
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
 print('VIA_V29116_BUILD_SAFE '+json.dumps({'base':BASE,'inventory':len(inventory),'existing_changed':changed,'new_assets':len(ADDED)}),flush=True)
def smoke(url):
 for name,marker in [
  ('index.html','content="29.1.16"'),
  ('index.html','map-point-picker.js?v=28'),
  ('index.html','via-v29116-visual.css?v=1'),
  ('index.html','via-v29116-date-ui.js?v=1'),
  ('map-point-picker.js','V29.1.16'),
  ('map-point-picker.js','via-reference-street'),
  ('map-point-picker.js','via-reference-detail'),
  ('via-v29116-date-ui.js','via-home-date-display'),
  ('via-v29116-visual.css','via-reference-detail'),
  ('via-v29116-visual.css','via-home-date-display'),
  ('reference.js','V29.1.15'),
  ('via-v29115-map-ui.css','v29.1.15'),
  ('mis-reservas.html','mine-v29113-inicio.css?v=1')]:
  body,_=GET(url+'/'+name)
  assert marker.encode() in body,'Missing public asset '+name+' '+marker
 for p in ('store.js','passkeys.js','config.js','reserva.html','geo-v2/core.mjs',
           'descargas/via-traslados-conductor-v35.apk'):
  buf,_=GET(url+'/'+p)
  expected=(ASSETS/p).read_bytes()
  if p.endswith('.html'):
   # Verified read-only 22 Nov: production reserva.html has 15 newlines
   # before </body>; re-packaged stage has 16. No tags/scripts differ.
   # Normalize ONLY a run of newline bytes immediately before </body>.
   # Continue requiring exact equality of the rest of the HTML.
   buf=re.sub(rb'\n{2,}(?=</body>)',b'\n',clean(buf))
   expected=re.sub(rb'\n{2,}(?=</body>)',b'\n',expected)
  assert digest(buf)==digest(expected),'Functionality-bearing asset changed '+p
 print('VIA_V29116_SMOKE_OK '+url,flush=True)
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
  'annotations':{'workers/message':'V29.1.16 visual-only checks failed. Roll back WEB to V29.1.15; no API/D1 rollback.'}})
 for i in range(15):
  if live_version()==BASE:
   print('VIA_V29116_ROLLBACK_VERIFIED '+BASE,flush=True);return
  time.sleep(3)
 raise AssertionError('Rollback could not be verified')
def release():
 version()
 m=json.loads((OUT/'manifest.json').read_text())
 assert m['source_version']==BASE and m['display_version']==VERSION
 assert any(v.get('version_id')==BASE for d in cf('/deployments').get('deployments',[]) for v in d.get('versions',[])),'V29.1.15 rollback unavailable'
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
    print('VIA_V29116_DEPLOYED_VERIFYING_CORE '+deployed,flush=True)
    check=subprocess.run(['node','tests/prod-core-invariants.mjs'],capture_output=True,text=True,timeout=120)
    assert check.returncode==0,'Production services smoke check failed '+check.stdout[-500:]+' '+check.stderr[-500:]
    print('VIA_V29116_PRODUCTION_VERIFIED '+deployed,flush=True);return
   except Exception as e:
    print('VIA_V29116_PROD_RETRY',i,str(e)[:110],flush=True);time.sleep(3)
  raise AssertionError('Production postchecks failed')
 except Exception:
  if attempted and live_version()!=BASE:rollback()
  raise
if __name__=='__main__':
 {'prepare':prepare,'qa':qa,'release':release}[sys.argv[1]]()
