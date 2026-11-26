import runpy,pathlib,json,concurrent.futures,urllib.parse,re,subprocess
M=runpy.run_path('scripts/via-resilience-api-build.py');P=M['P'];H=M['H'];R=M['M']
W='25a28e6e-73e0-4fcd-8c52-1489ede9f7e4';A='116ce6d7-6047-4a8e-8972-3e3c1bae7dcb'
out=pathlib.Path('home-return-prod');assets=out/'assets'
r=json.loads(pathlib.Path('via-resilience/web-candidate.json').read_text());assert r['candidate']==W and len(r['hashes'])==44
def guard():assert R['version'](M['WEB'])==W and R['version'](M['API'])==A
guard()
def copy(n):
 b,_=P['get']('https://viatraslados.com/'+urllib.parse.quote(n,safe='/'))
 if n.endswith('.html'):
  y,_=P['get'](r['preview']+'/'+urllib.parse.quote(n,safe='/'))
  assert H['html_tokens'](b)==H['html_tokens'](y),n
  b=R['O']['sanitize_html'](b)
 else:assert P['sha'](b)==r['hashes'][n],n
 p=assets/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(copy,r['hashes']))
p=assets/'app.js';s=p.read_text()
old="hero.scrollIntoView({block:'start',behavior:'smooth'});"
assert s.count(old)==1,'Active return anchor differs'
new="""// Home is a single viewport. Do not align the hero below the header.
   if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
   const resetHomePosition=()=>{
    if(document.body.classList.contains('in-booking')||hero.classList.contains('hidden'))return;
    window.scrollTo({top:0,left:0,behavior:'instant'});
    if(document.scrollingElement)document.scrollingElement.scrollTop=0;
   };
   resetHomePosition();
   requestAnimationFrame(()=>{resetHomePosition();requestAnimationFrame(resetHomePosition)});"""
p.write_text(s.replace(old,new));subprocess.run(['node','--check',str(p)],check=True)
p=assets/'index.html';s=p.read_text();assert 'V30.4.10.24' in s
s=s.replace('30.4.10.24','30.4.10.26')
s=re.sub(r'app\.js\?v=[^"\x27\s<>]+','app.js?v=30.4.10.26',s);p.write_text(s)
p=assets/'sw.js';s=p.read_text();assert '30.4.10.24' in s;p.write_text(s.replace('30.4.10.24-prod','30.4.10.26-prod'))

assert P['latest_uploaded_version'](M['WEB'])==W,'Unknown worker source'
qa='https://via-traslados-home-return-geo-qa.marcelof-gx.workers.dev'
b,_=P['get'](qa+'/app.js');assert b==(assets/'app.js').read_bytes(),'Approved QA app differs'
changed={n for n,h in r['hashes'].items() if not n.endswith('.html') and P['sha']((assets/n).read_bytes())!=h}
assert changed=={'app.js','sw.js'},changed
source=R['O']['get_live_worker_source']()
assert 'via-address-v2|' in source and 'address_search_cache' in source
(out/'web.mjs').write_text(source)
subprocess.run(['node','--check',str(out/'web.mjs')],check=True)
b=M['contract'](M['WEB'],W);rt=M['meta'](M['WEB'],W)['resources']['script_runtime']
uid=b['POI_CACHE'].get('id') or b['POI_CACHE'].get('database_id');assert uid==r['cache_db']
cfg={'name':M['WEB'],'main':'./web.mjs','compatibility_date':rt['compatibility_date'],'compatibility_flags':rt.get('compatibility_flags') or [],'workers_dev':True,'keep_vars':True,'vars':{'VIA_PLACES_ENABLED':'true'},'services':[{'binding':'VIA_POI_API','service':M['API']}],'d1_databases':[{'binding':'POI_CACHE','database_name':'via-poi-cache-prod','database_id':uid}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
(out/'wrangler.jsonc').write_text(json.dumps(cfg))
r.update(version='30.4.10.26',rollback=W,api=A,hashes={n:P['sha']((assets/n).read_bytes()) for n in r['hashes']})
(out/'manifest.json').write_text(json.dumps(r))
guard();print('VIA_HOME_PROD_PACKAGE_READY exact QA app.js, preserved geographic worker and API',flush=True)
