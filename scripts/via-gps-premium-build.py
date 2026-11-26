import runpy,pathlib,hashlib,json,shutil,urllib.request,re
m=runpy.run_path('scripts/via-geo-integral-build.py')
stage=pathlib.Path('v30410-visual/geo-integral');assets=stage/'assets'
old='https://via-traslados-geo-integral-qa.marcelof-gx.workers.dev'
new='https://via-traslados-gps-premium-qa.marcelof-gx.workers.dev'
# Verify all critical functional assets against the physically approved live .10 QA.
critical=['reference.js','geo-v2/core.mjs','address-autocomplete.js','map-point-picker.js','app.js','store.js','via-v3049-state.js','via-visual-compat.css','via-visual-profile.js']
hashes={}
for name in critical:
 p=assets/name
 req=urllib.request.Request(old+'/'+name,headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=20) as r:remote=r.read()
 assert p.read_bytes()==remote,'Active QA source mismatch '+name
 hashes[name]=hashlib.sha256(remote).hexdigest()
before={str(p.relative_to(assets)):hashlib.sha256(p.read_bytes()).hexdigest() for p in assets.rglob('*') if p.is_file()}
p=assets/'index.html';s=p.read_text();assert 'V30.4.10.10 QA' in s and s.count('</body>')==1
s=s.replace('30.4.10.10','30.4.10.11')
s=s.replace('</body>','<link rel="stylesheet" href="/via-gps-premium.css?v=30.4.10.11"><script src="/via-gps-premium.js?v=30.4.10.11" defer></script></body>')
p.write_text(s)
p=assets/'config.js';s=p.read_text();assert old in s;p.write_text(s.replace(old,new))
p=assets/'sw.js';s=p.read_text();assert '30.4.10.10' in s;p.write_text(s.replace('30.4.10.10','30.4.10.11'))
for name in ['via-gps-premium.css','via-gps-premium.js']:shutil.copyfile('addons/'+name,assets/name)
changed=sorted(n for n,h in before.items() if hashlib.sha256((assets/n).read_bytes()).hexdigest()!=h)
assert changed==['config.js','index.html','sw.js'],changed
cfg=json.loads((stage/'wrangler.jsonc').read_text());assert cfg['name']=='via-traslados-geo-integral-qa';cfg['name']='via-traslados-gps-premium-qa'
(stage/'wrangler-premium.jsonc').write_text(json.dumps(cfg))
assert len(list(p for p in assets.rglob('*') if p.is_file()))==44
manifest={'version':'30.4.10.11 QA','rollback':old,'qa':new,'unchangedFunctionalHashes':hashes,'changedExisting':changed,'newAssets':['via-gps-premium.css','via-gps-premium.js'],'workerUnchanged':True,'sameGeographicQaD1':True,'productionUnchanged':True}
(stage/'gps-premium-manifest.json').write_text(json.dumps(manifest,indent=2))
print('VIA_GPS_PREMIUM_BUILD '+json.dumps(manifest),flush=True)
