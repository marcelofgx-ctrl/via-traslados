import runpy,pathlib,json,shutil,urllib.request,os,re
m=runpy.run_path('scripts/via-release-304107-build.py')
out=pathlib.Path('v30410-visual');src=out/'assets';stage=out/'geo-integral';assets=stage/'assets'
shutil.copytree(src,assets,dirs_exist_ok=True)
host='https://via-traslados-geo-integral-qa.marcelof-gx.workers.dev'
p=assets/'config.js';s=p.read_text();old='https://via-traslados-api.marcelof-gx.workers.dev';assert s.count(old)==1;p.write_text(s.replace(old,host))
p=assets/'index.html';s=p.read_text();assert '>V30.4.10.8</span>' in s
credit='<small id="via-geography-credit" style="display:inline-block;font-size:10px;font-weight:500;line-height:1.35;margin-left:7px;color:#315c53"><a style="color:inherit" href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> · <a style="color:inherit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a style="color:inherit" href="https://openaddresses.io/" target="_blank" rel="noopener">OpenAddresses</a> · <a style="color:inherit" href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a></small>'
s=s.replace('30.4.10.8','30.4.10.10').replace('>V30.4.10.10</span>','>V30.4.10.10 QA</span>'+credit).replace('aria-label="Versión 30.4.10.10"','aria-label="Versión 30.4.10.10 QA"')
p.write_text(s)
# Match browser timeout to the server deadline, including D1 lookup and network overhead.
p=assets/'reference.js';s=p.read_text()
assert s.count('attempt===0?6500:4500')==1
s=s.replace('attempt===0?6500:4500','7900')
# QA-only diagnostics are displayed locally, no coordinates, no logging to a server.
s=s.replace('let rows=[];\n   const current=',"let rows=[];let reverseDiag='';\n   const current=")
s=s.replace('if(response.ok){\n      const data=await response.json();','reverseDiag="HTTP "+response.status+" · IDE "+(response.headers.get("X-Via-Reverse-IDE")||"—")+" · respaldo "+(response.headers.get("X-Via-Reverse-Backup")||"—")+" · D1 "+(response.headers.get("X-Via-Reverse-Cache")||"MISS");\n     if(response.ok){\n      const data=await response.json();')
s=s.replace('catch{/* Keep GPS as a point, never assert a postal address from a failed lookup. */}',"catch(e){reverseDiag='Consulta '+(e?.name||'fallida')}")
old="[{label:'Elegir en el mapa',go:openGpsMap,primary:true}]);\n    else if(!chosen.numberIsApproximate)"
new="[{label:'Elegir en el mapa',go:openGpsMap,primary:true}], 'QA: '+(reverseDiag||'sin respuesta')+' · '+rows.length+' referencias · precisión ±'+Math.round(pos.accuracyMeters)+' m');\n    else if(!chosen.numberIsApproximate)"
assert s.count(old)==1;s=s.replace(old,new);p.write_text(s)
p=assets/'sw.js';s=p.read_text();assert 'via-traslados-v30.4.10.8-visual' in s;p.write_text(s.replace('via-traslados-v30.4.10.8-visual','via-traslados-v30.4.10.10-geo-integral-qa'))
for n in ['via-reverse-bridge.mjs','via-reverse-cache.mjs','via-geo-integral-qa.mjs']:shutil.copyfile('addons/'+n,stage/n)
url='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database?name=via-poi-cache-qa'
req=urllib.request.Request(url,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']})
with urllib.request.urlopen(req,timeout=20) as r:data=json.load(r)
db=[d for d in data['result'] if d['name']=='via-poi-cache-qa'];assert len(db)==1
id=db[0]['uuid'];assert id!='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
cfg={'name':'via-traslados-geo-integral-qa','main':'./via-geo-integral-qa.mjs','compatibility_date':'2026-11-10','workers_dev':True,'d1_databases':[{'binding':'POI_CACHE','database_name':'via-poi-cache-qa','database_id':id}],'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':True}}
(stage/'wrangler.jsonc').write_text(json.dumps(cfg))
assert len(list(p for p in assets.rglob('*') if p.is_file()))==42
assert 'via-wait-satin' in (assets/'via-visual-compat.css').read_text()
assert 'for(let attempt=0;attempt<2&&current();attempt++)' in (assets/'reference.js').read_text()
print('VIA_GEO_INTEGRAL_READY 42 assets; approved graphics; isolated QA geographic D1; no reservation writes')
