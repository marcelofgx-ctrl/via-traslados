import runpy,json,sys,concurrent.futures,time,urllib.parse
M=runpy.run_path('scripts/v304-prod-release.py')
P=M['P'];H=M['H'];OUT=M['OUT'];target='d29d5304-db8d-48bb-a082-44b336454ed6'
preview='https://'+target[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
prod='https://viatraslados.com'
def preflight():
 M['baseline']()
 assert M['target']()==target
 manifest=json.loads((OUT/'manifest.json').read_text())
 assert manifest['base']==M['CANDIDATE'] and manifest['api']==M['M']['BASE_API'] and len(manifest['assets'])==39
 assert set(manifest['changed'])=={'index.html','reference.js','address-autocomplete.js','sw.js'}
 assert P['latest_uploaded_version'](M['STAGE'])==target,'Uploaded version changed'
 old=H['binding_contract'](M['M']['cf'](M['STAGE'],'/versions/'+M['CANDIDATE']))
 new=H['binding_contract'](M['M']['cf'](M['STAGE'],'/versions/'+target))
 cache=new.pop('POI_CACHE')
 assert cache.get('type')=='d1' and old==new
 print('VIA_V304_EXACT_CANDIDATE_CONFIRMED '+target,flush=True)
def final():
 assert M['M']['version'](M['STAGE'])==target and M['M']['version'](M['M']['API'])==M['M']['BASE_API']
 manifest=json.loads((OUT/'manifest.json').read_text())
 def get(base,n):return P['get'](base+'/'+urllib.parse.quote(n,safe='/'))[0]
 def compare(n):
  for i in range(4):
   try:
    a,b=get(preview,n),get(prod,n)
    assert (H['html_tokens'](a)==H['html_tokens'](b) if n.endswith('.html') else a==b),'Asset mismatch '+n
    return
   except Exception:
    if i==3:raise
    time.sleep(2*(i+1))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(compare,manifest['assets']))
 print('VIA_V304_PRODUCTION_VERIFIED '+target+' assets=39',flush=True)
if __name__=='__main__':
 {'verify':preflight,'promote':M['promote'],'rollback':M['rollback'],'final':final}[sys.argv[1]]()
