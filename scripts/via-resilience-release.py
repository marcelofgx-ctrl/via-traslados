import runpy,pathlib,json,os,sys,time,urllib.request,concurrent.futures,urllib.parse
m=runpy.run_path('scripts/via-resilience-api-build.py');M=m['M'];P=m['P'];H=m['H'];A=m['A'];W=m['W'];API=m['API'];WEB=m['WEB']
out=pathlib.Path('via-resilience');a=json.loads((out/'candidate.json').read_text());w=json.loads((out/'web-candidate.json').read_text())
AT='116ce6d7-6047-4a8e-8972-3e3c1bae7dcb';WT='bc01e900-1f45-494d-9dc6-83f8d881eed8'
assert a['candidate']==AT and a['active']==A and a['web']==W
assert w['candidate']==WT and w['web']==W and w['api']==A and len(w['hashes'])==44
assert set(w['changed'])=={'index.html','address-autocomplete.js','sw.js'}
version=M['version'];cf=M['cf']
def activate(name,target,expected):
 assert version(name)==expected,'Concurrent deployment '+name
 cf(name,'/deployments',{'strategy':'percentage','versions':[{'version_id':target,'percentage':100}],'annotations':{'workers/message':'Geography resilience V30.4.10.23 exact validated candidate or rollback'}})
 for _ in range(15):
  if version(name)==target:return
  time.sleep(2)
 raise AssertionError('Traffic not confirmed')
def preflight():
 assert version(API)==A and version(WEB)==W
 assert P['latest_uploaded_version'](API)==AT and P['latest_uploaded_version'](WEB)==WT
 for n,base,target in [(API,A,AT),(WEB,W,WT)]:
  assert m['contract'](n,base)==m['contract'](n,target)
  assert all(m['meta'](n,base)['resources']['script_runtime'].get(k)==m['meta'](n,target)['resources']['script_runtime'].get(k) for k in ['compatibility_date','compatibility_flags'])
 b=m['contract'](WEB,W)['POI_CACHE'];uid=b.get('id') or b.get('database_id')
 assert uid==w['cache_db'] and uid!='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
 root='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database/'+uid
 def call(path='',data=None):
  req=urllib.request.Request(root+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},method='POST' if data is not None else 'GET')
  with urllib.request.urlopen(req,timeout=25) as r:j=json.load(r)
  assert j.get('success'),'Geographic D1 request failed'
  return j['result']
 db=call();assert db['name']=='via-poi-cache-prod','Not geographic production cache'
 for name in ['qa/address-search-cache.sql','qa/reverse-reference-cache.sql']:
  sql=pathlib.Path(name).read_text().strip()
  assert sql.upper().startswith('CREATE TABLE IF NOT EXISTS')
  call('/query',{'sql':sql})
 assert version(API)==A and version(WEB)==W
 print('VIA_GEO_CACHE_SCHEMA_ADDITIVE geographic D1 only',flush=True)
def api():
 preflight();activate(API,AT,A);assert version(WEB)==W
 print('VIA_RESILIENCE_API_ACTIVE '+AT,flush=True)
def web():
 assert version(API)==AT and version(WEB)==W
 activate(WEB,WT,W)
 print('VIA_RESILIENCE_WEB_ACTIVE '+WT,flush=True)
def final():
 assert version(API)==AT and version(WEB)==WT
 def check(n):
  for i in range(4):
   try:
    x,_=P['get']('https://viatraslados.com/'+urllib.parse.quote(n,safe='/'));y,_=P['get'](w['preview']+'/'+urllib.parse.quote(n,safe='/'))
    assert (H['html_tokens'](x)==H['html_tokens'](y) if n.endswith('.html') else x==y and P['sha'](x)==w['hashes'][n]),n
    return
   except Exception:
    if i==3:raise
    time.sleep(2*(i+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check,w['hashes']))
 assert version(API)==AT and version(WEB)==WT
 print('VIA_RESILIENCE_PRODUCTION_VERIFIED '+json.dumps({'web':WT,'api':AT,'assets':44,'rollback_web':W,'rollback_api':A}),flush=True)
def rollback():
 # Never overwrite a deployment unrelated to this release.
 assert version(WEB) in {W,WT} and version(API) in {A,AT},'Concurrent release; manual review'
 if version(WEB)==WT:activate(WEB,W,WT)
 if version(API)==AT:activate(API,A,AT)
 assert version(WEB)==W and version(API)==A
 print('VIA_RESILIENCE_ROLLBACK_OK',flush=True)
if __name__=='__main__':{'api':api,'web':web,'final':final,'rollback':rollback}[sys.argv[1]]()
