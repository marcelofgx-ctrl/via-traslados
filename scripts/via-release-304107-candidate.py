import runpy,pathlib,json,hashlib,os,time,urllib.parse,concurrent.futures,sys
M=runpy.run_path('scripts/v302-route-cache-qa.py');P=M['P'];O=M['O'];H=runpy.run_path('scripts/v301-exact-repromotion.py')
WEB='via-traslados-web-prod';API='via-traslados-api';BASE='b23d68ea-5aae-4827-b808-3c4c3504a959';API_BASE='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b'
OUT=pathlib.Path('v30410-visual');ASSETS=OUT/'assets'
def baseline():
 assert M['version'](WEB)==BASE and M['version'](API)==API_BASE,'Production changed, stop'
def metadata(v):return M['cf'](WEB,'/versions/'+v)
def contract(v):return H['binding_contract'](metadata(v))
def hashes():
 manifest=json.loads((OUT/'manifest.json').read_text())
 assert manifest['base']==BASE and manifest['api']==API_BASE and len(manifest['source_assets'])==40
 expected=set(manifest['source_assets'])|set(manifest['new'])
 actual={str(p.relative_to(ASSETS)) for p in ASSETS.rglob('*') if p.is_file()}
 assert expected==actual,(expected-actual,actual-expected)
 for n,h in manifest['source_assets'].items():
  if n not in manifest['changed']:assert P['sha']((ASSETS/n).read_bytes())==h,'Unchanged asset differs '+n
 assert b'V30.4.10.7' in (ASSETS/'index.html').read_bytes()
 assert b'via-route-preview-cache-v1' in (ASSETS/'store.js').read_bytes()
 return {n:P['sha']((ASSETS/n).read_bytes()) for n in expected}
def prepare():
 baseline()
 latest=P['latest_uploaded_version'](WEB)
 assert latest in {BASE,'64457902-c17e-407e-a7a5-78e0aa9d28bb','64a68523-2e10-4067-9bfe-779f5a53dfed'},'Unknown uploaded worker; re-audit'
 assert contract(latest)==contract(BASE),'Known rejected candidate binding drift'
 assert all(metadata(latest)['resources']['script_runtime'].get(k)==metadata(BASE)['resources']['script_runtime'].get(k) for k in ['compatibility_date','compatibility_flags']),'Runtime changed'
 b=contract(BASE);v=metadata(BASE)['resources']['script_runtime']
 assert set(b)=={'ASSETS','VIA_POI_API','POI_CACHE','VIA_PLACES_ENABLED'},'Unexpected active bindings: '+','.join(sorted(b))
 assert b['VIA_POI_API'].get('service')==API
 assert b['VIA_PLACES_ENABLED'].get('text')=='true'
 cache_id=b['POI_CACHE'].get('id') or b['POI_CACHE'].get('database_id')
 assert cache_id and cache_id!='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
 assert b['POI_CACHE']['type']=='d1'
 source=O['get_live_worker_source']()
 assert all(x in source for x in ['expandedProxy','rankPlaces','POI_CACHE','VIA_POI_API'])
 (OUT/'prod-worker.mjs').write_text(source)
 cfg={'name':WEB,'main':'./prod-worker.mjs','compatibility_date':v['compatibility_date'],'compatibility_flags':v.get('compatibility_flags') or [],'workers_dev':True,'keep_vars':True,'vars':{'VIA_PLACES_ENABLED':'true'},'services':[{'binding':'VIA_POI_API','service':API}],'d1_databases':[{'binding':'POI_CACHE','database_name':'via-poi-cache-prod','database_id':cache_id}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler-prod.jsonc').write_text(json.dumps(cfg))
 (OUT/'exact-hashes.json').write_text(json.dumps(hashes(),sort_keys=True))
 baseline()
 print('VIA_30410_EXACT_PACKAGE_READY 42 assets; no production deployment',flush=True)
def verify():
 baseline()
 new=P['latest_uploaded_version'](WEB);assert new not in {BASE,'64457902-c17e-407e-a7a5-78e0aa9d28bb','64a68523-2e10-4067-9bfe-779f5a53dfed'}
 assert contract(BASE)==contract(new),'Binding contract changed'
 a=metadata(BASE)['resources']['script_runtime'];b=metadata(new)['resources']['script_runtime']
 assert all(a.get(k)==b.get(k) for k in ['compatibility_date','compatibility_flags'])
 url='https://'+new[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
 def check(n):
  for i in range(5):
   try:
    x,_=P['get'](url+'/'+urllib.parse.quote(n,safe='/'));y=(ASSETS/n).read_bytes()
    assert (H['html_tokens'](x)==H['html_tokens'](y) if n.endswith('.html') else x==y),'Preview differs '+n
    return
   except Exception:
    if i==4:raise
    time.sleep(2*(i+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check,hashes()))
 baseline()
 report={'version':'30.4.10.7','candidate':new,'preview':url,'rollback':BASE,'api':API_BASE,'assets':42,'activeProductionUnchanged':True}
 (OUT/'release-candidate.json').write_text(json.dumps(report,indent=2))
 print('VIA_30410_CANDIDATE_VERIFIED '+json.dumps(report),flush=True)
 if os.getenv('GITHUB_STEP_SUMMARY'):
  with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('## V30.4.10.7 candidate (not promoted)\n'+json.dumps(report,indent=2)+'\n')
if __name__=='__main__':{'prepare':prepare,'verify':verify}[sys.argv[1]]()
