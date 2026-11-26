import runpy,pathlib,json,concurrent.futures,urllib.parse,time,sys
m=runpy.run_path('scripts/via-resilience-api-build.py');P=m['P'];H=m['H'];R=m['M']
W='25a28e6e-73e0-4fcd-8c52-1489ede9f7e4';A='116ce6d7-6047-4a8e-8972-3e3c1bae7dcb';WEB=m['WEB'];API=m['API'];v=R['version']
out=pathlib.Path('home-return-prod');p=out/'manifest.json';r=json.loads(p.read_text())
assert r['rollback']==W and r['api']==A and r['version']=='30.4.10.26' and len(r['hashes'])==44
def contract(t):
 assert m['contract'](WEB,t)==m['contract'](WEB,W)
 assert all(m['meta'](WEB,t)['resources']['script_runtime'].get(k)==m['meta'](WEB,W)['resources']['script_runtime'].get(k) for k in ['compatibility_date','compatibility_flags'])
def guard():assert v(WEB)==W and v(API)==A
def compare(root,preview,local=False):
 def check(n):
  for i in range(4):
   try:
    x,_=P['get'](root+'/'+urllib.parse.quote(n,safe='/'))
    y=(out/'assets'/n).read_bytes() if local else P['get'](preview+'/'+urllib.parse.quote(n,safe='/'))[0]
    assert (H['html_tokens'](x)==H['html_tokens'](y) if n.endswith('.html') else x==y and P['sha'](x)==r['hashes'][n]),n
    return
   except Exception:
    if i==3:raise
    time.sleep(2*(i+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check,r['hashes']))
def verify():
 guard();t=P['latest_uploaded_version'](WEB);assert t!=W;contract(t)
 url='https://'+t[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
 compare(url,url,True);r.update(candidate=t,preview=url);p.write_text(json.dumps(r));guard()
 print('VIA_HOME_PROD_CANDIDATE '+json.dumps({'candidate':t,'preview':url}),flush=True)
def activate(t,old):
 assert v(WEB)==old and v(API)==A
 R['cf'](WEB,'/deployments',{'strategy':'percentage','versions':[{'version_id':t,'percentage':100}],'annotations':{'workers/message':'V30.4.10.26 verified home return or rollback'}})
 for _ in range(15):
  if v(WEB)==t:return
  time.sleep(2)
 raise AssertionError('Traffic not confirmed')
def promote():
 guard();t=r['candidate'];assert t!=W and P['latest_uploaded_version'](WEB)==t;contract(t);activate(t,W)
 print('VIA_HOME_PROD_ACTIVE '+t,flush=True)
def final():
 assert v(WEB)==r['candidate'] and v(API)==A
 compare('https://viatraslados.com',r['preview'])
 assert v(WEB)==r['candidate'] and v(API)==A
 print('VIA_HOME_PROD_VERIFIED '+json.dumps({'web':r['candidate'],'api':A,'assets':44,'rollback':W}),flush=True)
def rollback():
 assert v(API)==A and v(WEB) in {W,r['candidate']}
 if v(WEB)==r['candidate']:activate(W,r['candidate'])
 print('VIA_HOME_PROD_ROLLBACK_OK',flush=True)
if __name__=='__main__':{'verify':verify,'promote':promote,'final':final,'rollback':rollback}[sys.argv[1]]()
