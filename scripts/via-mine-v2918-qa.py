#!/usr/bin/env python3
"""V29.1.8 QA visual correction over V29.1.6 live; no real API / email / D1."""
import runpy,pathlib,json,subprocess,time
s=runpy.run_path('scripts/via-mine-v2917-prepare.py')
ROOT=pathlib.Path('mine-v2917-build');ASSETS=ROOT/'assets'
NAME='via-traslados-mine-v2918-stage'
URL='https://'+NAME+'.marcelof-gx.workers.dev'
def exact(text,old,new):
 assert text.count(old)==1,(old,text.count(old))
 return text.replace(old,new,1)
def prepare():
 s['prepare']()
 home=(ASSETS/'index.html').read_text()
 home=exact(home,'content="29.1.7"','content="29.1.8"')
 home=exact(home,'>v29.1.7</small>','>v29.1.8</small>')
 (ASSETS/'index.html').write_text(home)
 mine=(ASSETS/'mis-reservas.html').read_text()
 mine=exact(mine,'</head>','<link rel="stylesheet" href="./mine-guest-v2918.css?v=1"></head>')
 mine=exact(mine,'</body>','<script src="./mine-guest-v2918.js?v=1"></script></body>')
 (ASSETS/'mis-reservas.html').write_text(mine)
 for target,source in [
  ('mine-guest-v2918.css','scripts/via-mine-v2918-fix.css'),
  ('mine-guest-v2918.js','scripts/via-mine-v2918-fix.js'),
  ('mine-brand-v2918.svg','scripts/via-mine-v2918-logo.svg')]:
  (ASSETS/target).write_bytes(pathlib.Path(source).read_bytes())
 (ROOT/'wrangler.v2918.qa.jsonc').write_text(json.dumps({
  'name':NAME,'main':'worker.qa.mjs','compatibility_date':'2026-11-10','workers_dev':True,
  'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}
 },indent=2))
 print('VIA_MINE_V2918_QA_PREPARED_NO_PROD_API_OR_D1')
def smoke():
 from urllib.request import urlopen,Request
 for name,marker in [('','content="29.1.8"'),('mis-reservas.html','mine-guest-v2918.css?v=1'),('mine-guest-v2918.css','Vía Traslados v29.1.8'),('mine-guest-v2918.js','Vía Traslados v29.1.8'),('mine-brand-v2918.svg','Vía Traslados')]:
  with urlopen(Request(URL+'/'+name,headers={'Cache-Control':'no-cache'}),timeout=20) as r:
   data=r.read().decode()
   assert marker in data,(name,marker)
 print('VIA_MINE_V2918_STAGE_OK',URL)
if __name__=='__main__':
 import sys
 action=sys.argv[1]
 if action=='smoke':
  for i in range(14):
   try:smoke();break
   except Exception as exc:
    print('STAGE_PROPAGATION_RETRY',i,type(exc).__name__,str(exc)[:80],flush=True)
    if i==13:raise
    time.sleep(3)
 else:prepare()
