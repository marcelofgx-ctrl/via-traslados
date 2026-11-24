#!/usr/bin/env python3
"""Re-promote exact previously uploaded and tested pair; no rebuild, no migrations."""
import runpy,json,pathlib,sys,time,concurrent.futures,urllib.parse
M=runpy.run_path('scripts/v301-approved-production.py')
P=M['P'];O=M['O'];cf=M['cf'];version=M['version'];binding_contract=M['binding_contract']
API=M['API'];WEB=M['WEB'];BASE_API=M['BASE_API'];BASE_WEB=M['BASE_WEB'];TARGET_API=M['TARGET']
TARGET_WEB='9c810bb1-88a1-42ee-95a9-5a94c921f2a2'
F=pathlib.Path('v30-poi-prod-build/manifest.json')
def manifest():
 r=json.loads(F.read_text())
 assert (r['base_web'],r['base_api'],r['target_api'])==(BASE_WEB,BASE_API,TARGET_API)
 assert set(r['changed_assets'])=={'address-autocomplete.js','index.html','sw.js'}
 assert len(r['source_assets'])==39 and r['d1_migrations'] is False
 return r
def hashes(after=False):
 r=manifest();expected=dict(r['source_assets'])
 if after:expected.update(r['new_assets'])
 def check(item):
  n,h=item
  for attempt in range(4):
   try:
    body,_=P['get'](P['WEB']+'/'+urllib.parse.quote(n,safe='/'))
    if n.endswith('.html'):body=O['sanitize_html'](body)
    assert M['sha'](body)==h,'Asset hash mismatch: '+n
    return
   except Exception as e:
    print('VIA_ASSET_CHECK_RETRY '+json.dumps({'asset':n,'attempt':attempt+1,'type':type(e).__name__}),flush=True)
    if attempt==3:raise
    time.sleep(2*(attempt+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(check,expected.items()))
 print('VIA_V301_HASH_CHECK '+json.dumps({'phase':'after' if after else 'before','assets':len(expected)}),flush=True)
def verify():
 assert version(API)==BASE_API and version(WEB)==BASE_WEB,'Production changed'
 a=cf(API,'/versions/'+BASE_API);b=cf(API,'/versions/'+TARGET_API)
 assert binding_contract(a)==binding_contract(b),'API bindings changed'
 for name,target in [(API,TARGET_API),(WEB,TARGET_WEB)]:
  v=cf(name,'/versions/'+target)
  assert v.get('id')==target,'Candidate version not found'
  assert any(x.get('version_id')==target for d in cf(name,'/deployments')['deployments'] for x in d['versions']),'Candidate was not previously deployed'
 hashes()
 print('VIA_V301_EXACT_CANDIDATES_VERIFIED',flush=True)
def promote(name,target,expected):
 assert version(name)==expected,'Concurrent deployment: '+name
 cf(name,'/deployments',{'strategy':'percentage','versions':[{'version_id':target,'percentage':100}],'annotations':{'workers/message':'V30.1 exact verified candidate repromotion'}})
 for _ in range(14):
  if version(name)==target:
   print('VIA_V301_ACTIVE '+name+' '+target,flush=True);return
  time.sleep(2)
 raise AssertionError('Version not active: '+name)
def final():
 assert version(API)==TARGET_API and version(WEB)==TARGET_WEB
 hashes(True)
 r=manifest();r.update(final_api=TARGET_API,final_web=TARGET_WEB)
 F.write_text(json.dumps(r,indent=2))
 print('VIA_V301_PRODUCTION_VERIFIED '+json.dumps({'web':TARGET_WEB,'api':TARGET_API,'assets':39,'version':'30.1'}),flush=True)
if __name__=='__main__':
 {'verify':verify,'api':lambda:promote(API,TARGET_API,BASE_API),'web':lambda:promote(WEB,TARGET_WEB,BASE_WEB),'final':final}[sys.argv[1]]()
