#!/usr/bin/env python3
"""V30.1: promote exact QA-tested API version and package current production WEB."""
import json,os,pathlib,runpy,subprocess,re,concurrent.futures,urllib.request,urllib.parse,time,sys
P=runpy.run_path('scripts/v30-poi-prod-package.py')
O=runpy.run_path('scripts/via-v291-prepare.py')
BASE_WEB=P['BASE_WEB']; BASE_API=P['BASE_API']
TARGET='a50f7a32-974b-42e1-89e4-095af4e6aebd'
API='via-traslados-api'; WEB='via-traslados-web-prod'
OUT=P['OUT']; ASSETS=P['ASSETS']; sha=P['sha']
ROOT='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/workers/scripts/'
def cf(name,suffix,body=None):
 req=urllib.request.Request(ROOT+name+suffix,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json','Accept':'application/json'},method='POST' if body is not None else 'GET')
 with urllib.request.urlopen(req,timeout=25) as r:v=json.load(r)
 assert v.get('success') is True,'Cloudflare rejected '+name+suffix
 return v['result']
def version(name):return P['worker_version'](name)
def baseline():
 assert version(API)==BASE_API and version(WEB)==BASE_WEB,'Production changed, abort'
 assert P['latest_uploaded_version'](WEB)==BASE_WEB,'WEB source ambiguous'
def binding_contract(v):
 bindings=(v.get('resources') or {}).get('bindings')
 assert isinstance(bindings,list) and bindings,'Version bindings metadata unavailable'
 return {b['name']:{k:val for k,val in b.items() if k not in ('name','value','secret','secret_text','text') or (k=='text' and b.get('type')=='plain_text')} for b in bindings if b.get('name')}
def verify_candidate():
 baseline()
 old=cf(API,'/versions/'+BASE_API);new=cf(API,'/versions/'+TARGET)
 oldb=binding_contract(old);newb=binding_contract(new)
 assert oldb==newb,'API candidate binding contract differs from active; do not promote'
 assert newb.get('VIA_GEOAPIFY_API_KEY',{}).get('type')=='secret_text','Geoapify binding missing'
 assert newb.get('DB',{}).get('type')=='d1','D1 binding missing'
 for k in ('compatibility_date','compatibility_flags'):
  a=(old.get('resources') or {}).get('script_runtime',{}).get(k)
  b=(new.get('resources') or {}).get('script_runtime',{}).get(k)
  assert a==b,'API runtime differs: '+k
 print('VIA_API_CANDIDATE_CONTRACT_OK '+json.dumps({'active':BASE_API,'candidate':TARGET,'bindings':len(newb),'secretValuesLogged':False}),flush=True)
def build():
 verify_candidate()
 OUT.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
 names=sorted(set(O['source_asset_list']())|set(O['EXTRAS'])|P['NEEDED']|{'sw.js','manifest.webmanifest'})
 hashes={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for name,body in pool.map(P['fetch_asset'],names):
   if body is None:continue
   path=ASSETS/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body);hashes[name]=sha(body)
 assert len(hashes)>=39 and P['NEEDED'].issubset(hashes),'Incomplete asset inventory'
 auto=ASSETS/'address-autocomplete.js';dst=OUT/'autocomplete-new.js'
 subprocess.run(['node','scripts/v30-poi-frontend-patch.mjs',str(auto),str(dst)],check=True,timeout=30)
 auto.write_bytes(dst.read_bytes())
 index=ASSETS/'index.html';s=index.read_text()
 assert 'v30.0' in s,'Visible production version missing'
 index.write_text(s.replace('v30.0','v30.1').replace('content="30.0"','content="30.1"'))
 for name in hashes:
  if not name.endswith('.html'):continue
  p=ASSETS/name;source=p.read_text()
  changed=re.sub(r'address-autocomplete\.js\?v=[0-9.]+','address-autocomplete.js?v=30.1',source)
  if changed!=source:p.write_text(changed)
 sw=ASSETS/'sw.js';s=sw.read_text()
 assert len(re.findall(r"const VERSION\s*=\s*['\"]via-traslados-[^'\"]+['\"]",s))==1,'Unknown SW cache contract'
 s=re.sub(r"const VERSION\s*=\s*['\"]via-traslados-[^'\"]+['\"]","const VERSION='via-traslados-v30.1-poi'",s,count=1)
 sw.write_text(s)
 assert 'address-autocomplete.js?v=30.1' in index.read_text() and 'v30.1' in index.read_text()
 source=OUT/'web-live.mjs';source.write_text(O['get_live_worker_source']())
 subprocess.run(['node','scripts/v30-geoapify-integration.mjs',str(source),str(OUT/'web-poi.mjs')],check=True,timeout=30)
 for p in [OUT/'web-poi.mjs',auto,sw]:subprocess.run(['node','--check',str(p)],check=True,timeout=30)
 cfg={'name':WEB,'main':'./web-poi.mjs','compatibility_date':'2026-11-10','workers_dev':True,'keep_vars':True,'vars':{'VIA_PLACES_ENABLED':'true'},'services':[{'binding':'VIA_POI_API','service':API}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler.web.jsonc').write_text(json.dumps(cfg,indent=2))
 changed=sorted(n for n,h in hashes.items() if sha((ASSETS/n).read_bytes())!=h)
 assert {'index.html','address-autocomplete.js','sw.js'}.issubset(changed)
 assert all(n in ('index.html','address-autocomplete.js','sw.js') or n.endswith('.html') for n in changed),changed
 assert all(hashes[n]==sha((ASSETS/n).read_bytes()) for n in ['app.js','store.js','config.js','reference.js','geo-v2/core.mjs','passkeys.js','map-point-picker.js','descargas/via-traslados-conductor-v35.apk'])
 report={'base_web':BASE_WEB,'base_api':BASE_API,'target_api':TARGET,'source_assets':hashes,'changed_assets':changed,'new_assets':{n:sha((ASSETS/n).read_bytes()) for n in changed},'d1_migrations':False,'qa_evidence':'45463130530','user_approved':True}
 (OUT/'manifest.json').write_text(json.dumps(report,indent=2))
 source.unlink()
 baseline()
 print('VIA_V301_WEB_PACKAGE_READY '+json.dumps({'assets':len(hashes),'changed':changed,'version':'30.1','targetAPI':TARGET}),flush=True)
def promote():
 verify_candidate()
 cf(API,'/deployments',{'strategy':'percentage','versions':[{'version_id':TARGET,'percentage':100}],'annotations':{'workers/message':'V30.1 promote exact QA-validated Geoapify Autocomplete API'}})
 for _ in range(12):
  if version(API)==TARGET:
   print('VIA_V301_API_ACTIVE '+TARGET,flush=True);return
  time.sleep(2)
 raise AssertionError('API promotion not confirmed')
def final():
 assert version(API)==TARGET and version(WEB)!=BASE_WEB,'Release version not active'
 r=json.loads((OUT/'manifest.json').read_text());r['final_web']=version(WEB);r['final_api']=version(API)
 for n,h in r['source_assets'].items():
  if n in r['changed_assets']:continue
  body,_=P['get'](P['WEB']+'/'+urllib.parse.quote(n,safe='/'))
  if n.endswith('.html'):body=O['sanitize_html'](body)
  assert sha(body)==h,'Unchanged asset mismatch: '+n
 (OUT/'manifest.json').write_text(json.dumps(r,indent=2))
 print('VIA_V301_PRODUCTION_VERIFIED '+json.dumps({'web':r['final_web'],'api':r['final_api'],'version':'30.1','preservedAssets':len(r['source_assets'])-len(r['changed_assets'])}),flush=True)
if __name__=='__main__':
 {'build':build,'promote':promote,'final':final}[sys.argv[1]]()
