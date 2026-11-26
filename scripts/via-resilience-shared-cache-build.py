import runpy,pathlib,json,re,subprocess,concurrent.futures,urllib.parse
m=runpy.run_path('scripts/via-resilience-api-build.py');P=m['P'];R=m['M'];H=m['H'];A=m['A'];W=m['W'];API=m['API'];WEB=m['WEB']
old='bc01e900-1f45-494d-9dc6-83f8d881eed8';at='116ce6d7-6047-4a8e-8972-3e3c1bae7dcb'
out=pathlib.Path('via-resilience');assets=out/'assets';assets.mkdir(exist_ok=True)
def prepare():
 m['guard']();assert P['latest_uploaded_version'](WEB)==old and P['latest_uploaded_version'](API)==at
 assert m['contract'](WEB,old)==m['contract'](WEB,W)
 r=json.loads((out/'web-candidate.json').read_text());assert r['candidate']==old and len(r['hashes'])==44
 def copy(n):
  b,_=P['get'](r['preview']+'/'+urllib.parse.quote(n,safe='/'))
  if n.endswith('.html'):b=R['O']['sanitize_html'](b)
  else:assert P['sha'](b)==r['hashes'][n],n
  p=assets/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(copy,r['hashes']))
 for name in ['index.html','sw.js']:
  p=assets/name;s=p.read_text();assert '30.4.10.23' in s;p.write_text(s.replace('30.4.10.23','30.4.10.24'))
 source=R['O']['get_live_worker_source']()
 assert source.count('via-address-v1|')==1 and 'address_search_cache' in source
 # Wrangler re-bundles without minifying; identify only the unique hash input.
 pat=r'(["\x27])via-address-v1\|\1\s*\+\s*([A-Za-z_$][\w$]*\([^)]*\))\s*\+\s*(["\x27])\|\3\s*\+\s*[A-Za-z_$][\w$]*\s*\+\s*(["\x27])\|\4'
 source,n=re.subn(pat,lambda x:'"via-address-v2|" + '+x.group(2)+' + "|"',source)
 assert n==1,'Cache key expression changed; no deployment'
 (out/'web.mjs').write_text(source);subprocess.run(['node','--check',str(out/'web.mjs')],check=True)
 b=m['contract'](WEB,W);rt=m['meta'](WEB,W)['resources']['script_runtime']
 uid=b['POI_CACHE'].get('id') or b['POI_CACHE'].get('database_id');assert uid==r['cache_db']
 cfg={'name':WEB,'main':'./web.mjs','compatibility_date':rt['compatibility_date'],'compatibility_flags':rt.get('compatibility_flags') or [],'workers_dev':True,'keep_vars':True,'vars':{'VIA_PLACES_ENABLED':'true'},'services':[{'binding':'VIA_POI_API','service':API}],'d1_databases':[{'binding':'POI_CACHE','database_name':'via-poi-cache-prod','database_id':uid}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (out/'wrangler-web.jsonc').write_text(json.dumps(cfg))
 r['hashes']={n:P['sha']((assets/n).read_bytes()) for n in r['hashes']};r['version']='30.4.10.24';(out/'web-candidate.json').write_text(json.dumps(r))
 m['guard']();print('VIA_SHARED_PORTAL_CACHE_READY')
def verify():
 m['guard']();v=P['latest_uploaded_version'](WEB);assert v not in {W,old}
 assert m['contract'](WEB,v)==m['contract'](WEB,W)
 r=json.loads((out/'web-candidate.json').read_text());url='https://'+v[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
 def check(n):
  b,_=P['get'](url+'/'+urllib.parse.quote(n,safe='/'));y=(assets/n).read_bytes()
  assert (H['html_tokens'](b)==H['html_tokens'](y) if n.endswith('.html') else b==y),n
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check,r['hashes']))
 r.update(candidate=v,preview=url);(out/'web-candidate.json').write_text(json.dumps(r));print('VIA_SHARED_PORTAL_CANDIDATE '+v+' '+url)
if __name__=='__main__':{'prepare':prepare,'verify':verify}[__import__('sys').argv[1]]()
