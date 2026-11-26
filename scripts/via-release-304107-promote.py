import runpy,json,pathlib,concurrent.futures,time,urllib.parse,sys
M=runpy.run_path('scripts/via-release-304107-candidate.py')
BASE=M['BASE']; API_BASE=M['API_BASE']; WEB=M['WEB']; API=M['API'];P=M['P'];H=M['H'];contract=M['contract'];metadata=M['metadata']
v=M['M']['version'];cf=M['M']['cf'];out=pathlib.Path('v30410-visual')
r=json.loads((out/'release-candidate.json').read_text());TARGET=r['candidate'];url=r['preview']
assert r['rollback']==BASE and r['api']==API_BASE and r['assets']==42
def activate(target,expected):
 assert v(WEB)==expected and v(API)==API_BASE,'Concurrent release'
 cf(WEB,'/deployments',{'strategy':'percentage','versions':[{'version_id':target,'percentage':100}],'annotations':{'workers/message':'V30.4.10.8 approved graphics and GPS retry release or rollback'}})
 for _ in range(14):
  if v(WEB)==target:return
  time.sleep(2)
 raise AssertionError('Traffic not confirmed')
def promote():
 assert contract(BASE)==contract(TARGET)
 assert all(metadata(BASE)['resources']['script_runtime'].get(k)==metadata(TARGET)['resources']['script_runtime'].get(k) for k in ['compatibility_date','compatibility_flags'])
 activate(TARGET,BASE);print('VIA_VISUAL_PROMOTED '+TARGET,flush=True)
def final():
 assert v(WEB)==TARGET and v(API)==API_BASE
 expected=json.loads((out/'exact-hashes.json').read_text());assert len(expected)==42
 def check(n):
  for i in range(4):
   try:
    x,_=P['get']('https://viatraslados.com/'+urllib.parse.quote(n,safe='/'))
    y,_=P['get'](url+'/'+urllib.parse.quote(n,safe='/'))
    if n.endswith('.html'):assert H['html_tokens'](x)==H['html_tokens'](y),'HTML differs '+n
    else:assert P['sha'](x)==expected[n] and x==y,'Asset differs '+n
    return
   except Exception:
    if i==3:raise
    time.sleep(2*(i+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check,expected))
 assert v(WEB)==TARGET and v(API)==API_BASE
 r.update({'activeProductionUnchanged':False,'web':TARGET,'qa_run':45797042463,'productionVerified':True})
 (out/'production-confirmed.json').write_text(json.dumps(r,indent=2))
 print('VIA_VISUAL_PRODUCTION_VERIFIED '+json.dumps(r),flush=True)
def rollback():
 if v(WEB)==BASE:print('VIA_VISUAL_ROLLBACK unnecessary');return
 assert v(WEB)==TARGET,'Unrelated deployment; do not overwrite'
 activate(BASE,TARGET);print('VIA_VISUAL_ROLLBACK_OK '+BASE,flush=True)
if __name__=='__main__':{'promote':promote,'final':final,'rollback':rollback}[sys.argv[1]]()
