import runpy,json,pathlib,concurrent.futures,time,urllib.parse,sys
M=runpy.run_path('scripts/v3049-final-candidate.py')
BASE=M['BASE']; API_BASE=M['API_BASE']; WEB=M['WEB']; API=M['API'];P=M['P'];H=M['H'];contract=M['contract'];metadata=M['metadata']
v=M['M']['version'];cf=M['M']['cf'];TARGET='b23d68ea-5aae-4827-b808-3c4c3504a959'
url='https://b23d68ea-via-traslados-web-prod.marcelof-gx.workers.dev'
out=pathlib.Path('v3049-maintenance')
def guard():
 r=json.loads((out/'release-candidate.json').read_text())
 assert r['candidate']==TARGET and r['rollback']==BASE and r['api']==API_BASE and r['assets']==40
 assert v(API)==API_BASE and v(WEB)==BASE,'Active versions changed'
 assert contract(BASE)==contract(TARGET),'Bindings differ'
 a=metadata(BASE)['resources']['script_runtime'];b=metadata(TARGET)['resources']['script_runtime']
 assert all(a.get(k)==b.get(k) for k in ['compatibility_date','compatibility_flags'])
def compare():
 expected=json.loads((out/'exact-hashes.json').read_text())
 assert len(expected)==40
 def check(n):
  for i in range(4):
   try:
    x,_=P['get']('https://viatraslados.com/'+urllib.parse.quote(n,safe='/'))
    y,_=P['get'](url+'/'+urllib.parse.quote(n,safe='/'))
    if n.endswith('.html'):
     assert H['html_tokens'](x)==H['html_tokens'](y),'HTML differs '+n
    else:assert P['sha'](x)==expected[n] and x==y,'Asset differs '+n
    return
   except Exception:
    if i==3:raise
    time.sleep(2*(i+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check,expected))
def activate(target,expected):
 assert v(WEB)==expected and v(API)==API_BASE,'Concurrent release'
 cf(WEB,'/deployments',{'strategy':'percentage','versions':[{'version_id':target,'percentage':100}],'annotations':{'workers/message':'V30.4.9 verified back navigation maintenance or exact rollback'}})
 for _ in range(14):
  if v(WEB)==target:return
  time.sleep(2)
 raise AssertionError('Traffic not confirmed')
def promote():
 guard();activate(TARGET,BASE);print('VIA_3049_PROMOTED '+TARGET,flush=True)
def final():
 assert v(WEB)==TARGET and v(API)==API_BASE
 compare()
 r={'version':'30.4.9','web':TARGET,'api':API_BASE,'rollback':BASE,'assets':40,'source':'1f5568653a0d0a2331a78eadee01bae00d6c77e7','qa_run':45743548096}
 (out/'production-confirmed.json').write_text(json.dumps(r,indent=2))
 print('VIA_3049_PRODUCTION_VERIFIED '+json.dumps(r),flush=True)
def rollback():
 if v(WEB)==BASE:print('VIA_3049_ROLLBACK unnecessary');return
 assert v(WEB)==TARGET,'Unrelated deployment; do not overwrite'
 activate(BASE,TARGET);print('VIA_3049_ROLLBACK_OK '+BASE,flush=True)
if __name__=='__main__':{'promote':promote,'final':final,'rollback':rollback}[sys.argv[1]]()
