import runpy,pathlib,json,shutil,hashlib,concurrent.futures,urllib.parse
m=runpy.run_path('scripts/via-gps-premium-build.py')
out=pathlib.Path('v30410-visual');src=out/'assets';qa=out/'geo-integral'/'assets'
P=m['m']['m']['P'];H=runpy.run_path('scripts/v301-exact-repromotion.py')
manifest=json.loads((out/'manifest.json').read_text())
live='https://via-traslados-search-space-qa.marcelof-gx.workers.dev'
# Verify the exact tested .20 bundle before reusing its visual/interaction layer.
names=sorted(str(p.relative_to(qa)) for p in qa.rglob('*') if p.is_file())
assert len(names)==44
def check(name):
 body,_=P['get'](live+'/'+urllib.parse.quote(name,safe='/'))
 expected=(qa/name).read_bytes()
 assert (H['html_tokens'](body)==H['html_tokens'](expected) if name.endswith('.html') else body==expected),'Approved QA asset mismatch '+name
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(check,names))
# Keep production config and the original production Worker; no QA proxy,
# D1 migration, backup API release, diagnostic copy or QA auth in production.
config=(src/'config.js').read_bytes()
assert b'https://via-traslados-api.marcelof-gx.workers.dev' in config
assert P['sha'](config)==manifest['source_assets']['config.js']
reference=(src/'reference.js').read_text()
assert reference.count('attempt===0?6500:4500')==1
reference=reference.replace('attempt===0?6500:4500','7900')
assert 'reverseDiag' not in reference and 'for(let attempt=0;attempt<2&&current();attempt++)' in reference
# Prove the approved reference code differs only by QA diagnostics.
qref=(qa/'reference.js').read_text()
expected=reference.replace('let rows=[];\n   const current=',"let rows=[];let reverseDiag='';\n   const current=")
expected=expected.replace('if(response.ok){\n      const data=await response.json();','reverseDiag="HTTP "+response.status+" · IDE "+(response.headers.get("X-Via-Reverse-IDE")||"—")+" · respaldo "+(response.headers.get("X-Via-Reverse-Backup")||"—")+" · D1 "+(response.headers.get("X-Via-Reverse-Cache")||"MISS");\n     if(response.ok){\n      const data=await response.json();')
expected=expected.replace('catch{/* Keep GPS as a point, never assert a postal address from a failed lookup. */}',"catch(e){reverseDiag='Consulta '+(e?.name||'fallida')}")
old="[{label:'Elegir en el mapa',go:openGpsMap,primary:true}]);\n    else if(!chosen.numberIsApproximate)"
new="[{label:'Elegir en el mapa',go:openGpsMap,primary:true}], 'QA: '+(reverseDiag||'sin respuesta')+' · '+rows.length+' referencias · precisión ±'+Math.round(pos.accuracyMeters)+' m');\n    else if(!chosen.numberIsApproximate)"
assert expected.count(old)==1
assert expected.replace(old,new)==qref,'Unexpected functional difference in approved reference'
shutil.copytree(qa,src,dirs_exist_ok=True)
(src/'config.js').write_bytes(config)
(src/'reference.js').write_text(reference)
p=src/'index.html';s=p.read_text();assert s.count('>V30.4.10.20 QA</span>')==1
s=s.replace('30.4.10.20 QA','30.4.10.20')
assert 'via-qa-auth-script' not in s
p.write_text(s)
p=src/'sw.js';s=p.read_text();assert 'via-traslados-v30.4.10.20-geo-integral-qa' in s
p.write_text(s.replace('via-traslados-v30.4.10.20-geo-integral-qa','via-traslados-v30.4.10.20-prod'))
manifest['changed']=['index.html','reference.js','sw.js']
manifest['new']=['via-visual-compat.css','via-visual-profile.js','via-gps-premium.css','via-gps-premium.js']
manifest['qa_only']=False
assert all(P['sha']((src/n).read_bytes())==h for n,h in manifest['source_assets'].items() if n not in manifest['changed'])
for n in manifest['new']:assert (src/n).read_bytes()==(qa/n).read_bytes()
assert len([p for p in src.rglob('*') if p.is_file()])==44
for n in ['config.js','index.html','reference.js','sw.js','via-gps-premium.js']:
 s=(src/n).read_text()
 assert 'via-traslados-search-space-qa.marcelof-gx.workers.dev' not in s and 'via-traslados-geo-integral-qa.marcelof-gx.workers.dev' not in s,n
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('VIA_3041020_PRODUCTION_PACKAGE_READY 44 assets, exact approved visual layer, original production config, no QA proxy or diagnostics',flush=True)
