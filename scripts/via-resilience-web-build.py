import runpy,pathlib,json,re,subprocess,sys,shutil,hashlib
M=runpy.run_path('scripts/via-resilience-api-build.py');P=M['P'];H=M['H'];R=M['M'];A=M['A'];W=M['W'];API=M['API'];WEB=M['WEB']
OUT=pathlib.Path('via-resilience');src=pathlib.Path('v30410-visual/assets');assets=OUT/'assets'
def build():
 assert R['version'](WEB)==W and R['version'](API)==A
 assert P['latest_uploaded_version'](WEB)==W,'Unknown web source'
 expected=json.loads(pathlib.Path('v30410-visual/exact-hashes.json').read_text());assert len(expected)==44
 for n,h in expected.items():assert hashlib.sha256((src/n).read_bytes()).hexdigest()==h,n
 shutil.copytree(src,assets,dirs_exist_ok=True)
 subprocess.run(['node','scripts/via-resilience-frontend-patch.mjs',str(assets/'address-autocomplete.js')],check=True)
 p=assets/'index.html';s=p.read_text();assert s.count('>V30.4.10.20</span>')==1
 s=s.replace('30.4.10.20','30.4.10.23');s=re.sub(r'address-autocomplete\.js\?v=[^"\x27\s<>]+','address-autocomplete.js?v=30.4.10.23',s);p.write_text(s)
 p=assets/'sw.js';s=p.read_text();assert '30.4.10.20-prod' in s;p.write_text(s.replace('30.4.10.20-prod','30.4.10.23-prod'))
 changed=[n for n,h in expected.items() if hashlib.sha256((assets/n).read_bytes()).hexdigest()!=h]
 assert set(changed)=={'address-autocomplete.js','index.html','sw.js'},changed
 source=R['O']['get_live_worker_source']();assert all(x in source for x in ('expandedProxy','rankPlaces','POI_CACHE','VIA_POI_API'))
 # Keep exact legacy bundle and add an outer dispatch, no replacement of route/POI.
 source=M['split'](source,'__viaAddressOriginal')
 source+='\nimport {addressRace} from "./via-address-race.mjs";\nexport default {...__viaAddressOriginal,async fetch(request,env,ctx){return addressRace(request,env,__viaAddressOriginal,ctx)}};\n'
 (OUT/'web.mjs').write_text(source)
 for n in ['via-address-race.mjs','via-forward-api.mjs','via-reverse-bridge.mjs','via-reverse-cache.mjs']:shutil.copyfile('addons/'+n,OUT/n)
 subprocess.run(['node','--check',str(OUT/'web.mjs')],check=True)
 b=M['contract'](WEB,W);rt=M['meta'](WEB,W)['resources']['script_runtime']
 assert set(b)=={'ASSETS','VIA_POI_API','POI_CACHE','VIA_PLACES_ENABLED'}
 uid=b['POI_CACHE'].get('id') or b['POI_CACHE'].get('database_id');assert uid and uid!='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
 cfg={'name':WEB,'main':'./web.mjs','compatibility_date':rt['compatibility_date'],'compatibility_flags':rt.get('compatibility_flags') or [],'workers_dev':True,'keep_vars':True,'vars':{'VIA_PLACES_ENABLED':'true'},'services':[{'binding':'VIA_POI_API','service':API}],'d1_databases':[{'binding':'POI_CACHE','database_name':'via-poi-cache-prod','database_id':uid}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler-web.jsonc').write_text(json.dumps(cfg))
 (OUT/'web-baseline.json').write_text(json.dumps({'web':W,'api':A,'cache_db':uid,'hashes':{n:hashlib.sha256((assets/n).read_bytes()).hexdigest() for n in expected},'changed':changed}))
 print('VIA_RESILIENCE_WEB_READY '+str(changed)+'; no traffic')
if __name__=='__main__':build()
