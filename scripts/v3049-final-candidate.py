import runpy,pathlib,json,hashlib,os,time,urllib.parse,concurrent.futures,sys
M=runpy.run_path('scripts/v302-route-cache-qa.py');P=M['P'];O=M['O'];H=runpy.run_path('scripts/v301-exact-repromotion.py')
WEB='via-traslados-web-prod';API='via-traslados-api';BASE='d29d5304-db8d-48bb-a082-44b336454ed6';API_BASE='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b'
OUT=pathlib.Path('v3049-maintenance');ASSETS=OUT/'assets'
def baseline():
 assert M['version'](WEB)==BASE and M['version'](API)==API_BASE,'Production changed, stop'
def metadata(v):return M['cf'](WEB,'/versions/'+v)
def contract(v):return H['binding_contract'](metadata(v))
def hashes():
 manifest=json.loads((OUT/'manifest.json').read_text())
 assert manifest['baseline']==BASE and manifest['api']==API_BASE and len(manifest['source_assets'])==39
 expected=set(manifest['source_assets'])|{manifest['new_asset']}
 actual={str(p.relative_to(ASSETS)) for p in ASSETS.rglob('*') if p.is_file()}
 assert expected==actual,(expected-actual,actual-expected)
 for n,h in manifest['source_assets'].items():
  if n not in manifest['changed_assets']:assert P['sha']((ASSETS/n).read_bytes())==h,'Unchanged asset differs '+n
 assert b'V30.4.9' in (ASSETS/'index.html').read_bytes()
 assert b'via-route-preview-cache-v1' in (ASSETS/'store.js').read_bytes()
 return {n:P['sha']((ASSETS/n).read_bytes()) for n in expected}
def prepare():
 baseline()
 assert P['latest_uploaded_version'](WEB)==BASE,'Latest uploaded worker differs from active; re-audit'
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
 print('VIA_3049_EXACT_PACKAGE_READY 40 assets; no production deployment',flush=True)
def verify():
 baseline()
 new=P['latest_uploaded_version'](WEB);assert new!=BASE
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
 report={'version':'30.4.9','candidate':new,'preview':url,'rollback':BASE,'api':API_BASE,'assets':40,'activeProductionUnchanged':True}
 (OUT/'release-candidate.json').write_text(json.dumps(report,indent=2))
 print('VIA_3049_CANDIDATE_VERIFIED '+json.dumps(report),flush=True)
 if os.getenv('GITHUB_STEP_SUMMARY'):
  with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('## V30.4.9 candidate (not promoted)\n'+json.dumps(report,indent=2)+'\n')
if __name__=='__main__':{'prepare':prepare,'verify':verify}[sys.argv[1]]()
