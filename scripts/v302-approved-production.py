#!/usr/bin/env python3
"""Promote only the exact V30.2 WEB candidate tested in QA. No API or D1 changes."""
import runpy,json,pathlib,sys,time,concurrent.futures,urllib.parse,re,subprocess
M=runpy.run_path('scripts/v302-route-cache-qa.py')
H=runpy.run_path('scripts/v301-exact-repromotion.py')
P=M['P'];O=M['O'];cf=M['cf'];version=M['version']
WEB=M['WEB'];API=M['API'];BASE_WEB=M['BASE_WEB'];BASE_API=M['BASE_API']
TARGET='9e2dac8c-6d6f-4921-b425-99b6a71d525d'
PREVIEW='https://'+TARGET[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
PROD='https://viatraslados.com'
OUT=pathlib.Path('v302-release-check')
def get(base,n):
 for i in range(4):
  try:
   b,h=P['get'](base+'/'+urllib.parse.quote(n,safe='/'))
   if n.endswith('.html'):b=O['sanitize_html'](b)
   if n.endswith(('.js','.mjs','.css')):assert 'text/html' not in h.get('Content-Type','').lower()
   return b
  except Exception as e:
   if getattr(e,'code',0)==404 and n not in P['NEEDED']:return None
   if i==3:raise
   time.sleep(2*(i+1))
def equivalent(n,a,b):
 return H['html_tokens'](a)==H['html_tokens'](b) if n.endswith('.html') else a==b
def preflight():
 M['baseline']()
 old=cf(WEB,'/versions/'+BASE_WEB);new=cf(WEB,'/versions/'+TARGET)
 assert new.get('id')==TARGET
 assert H['binding_contract'](old)==H['binding_contract'](new),'WEB bindings differ'
 for k in ('compatibility_date','compatibility_flags'):
  assert (old.get('resources') or {}).get('script_runtime',{}).get(k)==(new.get('resources') or {}).get('script_runtime',{}).get(k),'WEB runtime changed'
 names=sorted(set(O['source_asset_list']())|set(O['EXTRAS'])|P['NEEDED']|{'sw.js','manifest.webmanifest'})
 OUT.mkdir(exist_ok=True);expected=OUT/'expected';expected.mkdir(exist_ok=True)
 def check(n):
  a=get(PROD,n);b=get(PREVIEW,n)
  if a is None and b is None:return None
  assert a is not None and b is not None,'Asset inventory mismatch '+n
  p=expected/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(a)
  return n
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: rows=[n for n in pool.map(check,names) if n]
 assert len(rows)==39 and P['NEEDED'].issubset(rows)
 subprocess.run(['node','scripts/v302-route-cache-patch.mjs',str(expected)],check=True)
 for n in rows:
  p=expected/n
  if n.endswith('.html'):
   s=p.read_text()
   if n=='index.html':assert 'v30.1' in s;s=s.replace('v30.1','v30.2')
   p.write_text(re.sub(r'((?:app|store)\.js)\?v=[^"\x27\s<>]+',r'\1?v=30.2',s))
  elif n=='sw.js':
   s=p.read_text();assert 'via-traslados-v30.1-poi' in s
   p.write_text(s.replace('via-traslados-v30.1-poi','via-traslados-v30.2-route-cache'))
 def compare(n):
  assert equivalent(n,(expected/n).read_bytes(),get(PREVIEW,n)),'Candidate mismatch '+n
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(compare,rows))
 (OUT/'manifest.json').write_text(json.dumps({'old_web':BASE_WEB,'new_web':TARGET,'api':BASE_API,'assets':rows,'qa_runs':[45491187546,45495627680],'d1_migrations':False},indent=2))
 M['baseline']()
 print('VIA_V302_PREFLIGHT_OK '+json.dumps({'assets':len(rows),'candidate':TARGET,'apiUnchanged':BASE_API}),flush=True)
def deploy(target):
 cf(WEB,'/deployments',{'strategy':'percentage','versions':[{'version_id':target,'percentage':100}],'annotations':{'workers/message':'V30.2 route cache promotion or rollback'}})
 for i in range(14):
  if version(WEB)==target:
   print('VIA_V302_WEB_ACTIVE '+target,flush=True);return
  time.sleep(2)
 raise AssertionError('WEB activation not confirmed')
def promote():
 M['baseline']();deploy(TARGET)
def rollback():
 current=version(WEB)
 if current==BASE_WEB:return
 assert current==TARGET,'Concurrent deployment: not rolling back unrelated version'
 deploy(BASE_WEB)
 assert version(WEB)==BASE_WEB
 print('VIA_V302_ROLLBACK_OK',flush=True)
def final():
 assert version(WEB)==TARGET and version(API)==BASE_API
 r=json.loads((OUT/'manifest.json').read_text())
 def check(n):
  assert equivalent(n,(OUT/'expected'/n).read_bytes(),get(PROD,n)),'Production asset mismatch '+n
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(check,r['assets']))
 assert version(WEB)==TARGET and version(API)==BASE_API
 print('VIA_V302_PRODUCTION_VERIFIED '+json.dumps({'web':TARGET,'api':BASE_API,'assets':len(r['assets']),'version':'30.2'}),flush=True)
if __name__=='__main__':{'verify':preflight,'promote':promote,'rollback':rollback,'final':final}[sys.argv[1]]()
