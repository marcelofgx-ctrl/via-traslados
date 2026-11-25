#!/usr/bin/env python3
"""Patch only publicPreview in the exact active API, keep all other functions intact."""
import json,os,pathlib,runpy,re,sys,time,hashlib,urllib.request
M=runpy.run_path('scripts/v301-approved-production.py')
P=M['P'];cf=M['cf'];version=M['version'];contract=M['binding_contract']
API=M['API'];WEB=M['WEB']
BASE='a50f7a32-974b-42e1-89e4-095af4e6aebd';WEB_BASE='9c810bb1-88a1-42ee-95a9-5a94c921f2a2'
OUT=pathlib.Path('v301-route-fix')
def baseline():
 assert version(API)==BASE and version(WEB)==WEB_BASE,'Production changed'
def build():
 baseline()
 assert P['latest_uploaded_version'](API)==BASE,'Source must be exact active API'
 s=P['api_source']()
 start=s.index('async function publicPreview(')
 end=s.index('\n__name(publicPreview, "publicPreview");',start)
 before=s[start:end]
 guard=re.compile(r'if\s*\(\s*!\s*await\s+\w+\(\s*\w+,\s*["\x27]preview-ip:["\x27]\s*\+\s*\w+,\s*8,\s*3600\s*\)\s*\)\s*return\s+\w+\(\s*\{[^{}]*\}\s*,\s*429\s*\);')
 cache=re.compile(r'if\s*\(\s*cached\s*\)\s*return\s+\w+\(\s*\w+\(\s*cached,\s*true\s*\)\s*\);')
 gs=list(guard.finditer(before));cs=list(cache.finditer(before))
 assert len(gs)==len(cs)==1 and gs[0].start()<cs[0].start(),'Actual live rate/cache contract differs'
 g=gs[0].group();c=cs[0].group()
 replacement=re.sub(r',\s*8,\s*3600',', 30, 3600',g)
 assert replacement!=g
 after=before.replace(g,'',1).replace(c,c+'\n  '+replacement,1)
 assert 'free-budget' in after and '250' in after and '86400' in after
 assert after.index('preview-ip:')>after.index('FROM route_preview_cache')
 new=s[:start]+after+s[end:]
 assert 'viaPoiHandle' in new and '/api/health' in new and '/api/public/route-preview' in new
 OUT.mkdir(exist_ok=True)
 (OUT/'worker.mjs').write_text(new)
 # Existing API runtime, service bindings and secrets must be identical after upload.
 cfg={'name':API,'main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'keep_vars':True,'d1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':P['D1']}]}
 (OUT/'wrangler.jsonc').write_text(json.dumps(cfg))
 baseline()
 print('VIA_ROUTE_FIX_BUILT '+json.dumps({'source':BASE,'changedFunction':'publicPreview','oldMissLimit':8,'newMissLimit':30,'dailyLimit':250,'cacheFirst':True}),flush=True)
def target():
 return (OUT/'candidate.txt').read_text().strip()
def candidate():
 baseline()
 v=P['latest_uploaded_version'](API)
 assert v!=BASE
 old=cf(API,'/versions/'+BASE);new=cf(API,'/versions/'+v)
 assert contract(old)==contract(new),'Candidate bindings differ'
 for k in ('compatibility_date','compatibility_flags'):
  assert (old.get('resources') or {}).get('script_runtime',{}).get(k)==(new.get('resources') or {}).get('script_runtime',{}).get(k),'Runtime changed'
 (OUT/'candidate.txt').write_text(v)
 print('VIA_ROUTE_FIX_CANDIDATE '+v,flush=True)
def set_version(v):
 cf(API,'/deployments',{'strategy':'percentage','versions':[{'version_id':v,'percentage':100}],'annotations':{'workers/message':'V30.1 route cache-first hotfix'}})
 for i in range(12):
  if version(API)==v:
   print('VIA_ROUTE_API_ACTIVE '+v,flush=True);return
  time.sleep(2)
 raise AssertionError('API deployment not confirmed')
def promote():
 baseline();set_version(target())
def rollback():
 if version(API)==BASE:return
 assert version(API)==target(),'Unexpected concurrent deploy; refusing rollback'
 set_version(BASE)
def final():
 assert version(API)==target() and version(WEB)==WEB_BASE
 print('VIA_ROUTE_FIX_PRODUCTION_VERIFIED '+json.dumps({'api':target(),'webUnchanged':WEB_BASE,'d1Migration':False}),flush=True)
if __name__=='__main__':
 {'build':build,'candidate':candidate,'promote':promote,'rollback':rollback,'final':final}[sys.argv[1]]()
