import runpy,pathlib,hashlib,json,shutil,urllib.request,re
m=runpy.run_path('scripts/via-geo-integral-build.py')
stage=pathlib.Path('v30410-visual/geo-integral');assets=stage/'assets'
old='https://via-traslados-geo-integral-qa.marcelof-gx.workers.dev'
new='https://via-traslados-search-density-qa.marcelof-gx.workers.dev'
# Verify all critical functional assets against the physically approved live .10 QA.
critical=['reference.js','geo-v2/core.mjs','address-autocomplete.js','map-point-picker.js','app.js','store.js','via-v3049-state.js','via-visual-compat.css','via-visual-profile.js']
hashes={}
for name in critical:
 p=assets/name
 remote,_=m['m']['P']['get'](old+'/'+name)
 assert p.read_bytes()==remote,'Active QA source mismatch '+name
 hashes[name]=hashlib.sha256(remote).hexdigest()
assert 'address-suggestions' in (assets/'address-autocomplete.js').read_text() and 'address-choice' in (assets/'address-autocomplete.js').read_text()
assert 'id="home-destination"' in (assets/'index.html').read_text()
before={str(p.relative_to(assets)):hashlib.sha256(p.read_bytes()).hexdigest() for p in assets.rglob('*') if p.is_file()}
p=assets/'index.html';s=p.read_text();assert 'V30.4.10.10 QA' in s and s.count('</body>')==1
s=s.replace('30.4.10.10','30.4.10.19')
s=s.replace('</body>','<link rel="stylesheet" href="/via-gps-premium.css?v=30.4.10.19"><script src="/via-gps-premium.js?v=30.4.10.19" defer></script></body>')
assert s.count('placeholder="¿Dónde te buscamos?"')==1
s=s.replace('placeholder="¿Dónde te buscamos?"','placeholder="¿Dónde te recogemos?"')
# Retain the full visible attribution, move it below the booking card.
credit=re.search(r'<small id="via-geography-credit"[^>]*>.*?</small>',s,flags=re.S)
assert credit,'Missing provider credit'
credit_html=credit.group(0)
s=s[:credit.start()]+s[credit.end():]
# Use the unique home section boundary, not a fragile link class or wrapper.
wizard=re.search(r'<section\b[^>]*\bid=["\x27]solicitar["\x27][^>]*>',s)
assert wizard,'Missing wizard boundary'
home_end=s.rfind('</section>',0,wizard.start())
assert home_end>0 and 'reference-reservations' in s[:home_end],'Missing home section end'
s=s[:home_end]+credit_html+'\n'+s[home_end:]
assert s.count('id="via-geography-credit"')==1
assert s.count('class="reference-route-fields"')==1 and s.count('class="route-dash"')==1
p.write_text(s)
p=assets/'config.js';s=p.read_text();assert old in s;p.write_text(s.replace(old,new))
p=assets/'sw.js';s=p.read_text();assert '30.4.10.10' in s;p.write_text(s.replace('30.4.10.10','30.4.10.19'))
for name in ['via-gps-premium.css','via-gps-premium.js']:shutil.copyfile('addons/'+name,assets/name)
changed=sorted(n for n,h in before.items() if hashlib.sha256((assets/n).read_bytes()).hexdigest()!=h)
assert changed==['config.js','index.html','sw.js'],changed
cfg=json.loads((stage/'wrangler.jsonc').read_text());assert cfg['name']=='via-traslados-geo-integral-qa';cfg['name']='via-traslados-search-density-qa'
(stage/'wrangler-premium.jsonc').write_text(json.dumps(cfg))
assert len(list(p for p in assets.rglob('*') if p.is_file()))==44
manifest={'version':'30.4.10.19 QA','rollback':'https://via-traslados-search-refined-qa.marcelof-gx.workers.dev','functionalBaseline':old,'qa':new,'unchangedFunctionalHashes':hashes,'changedExisting':changed,'newAssets':['via-gps-premium.css','via-gps-premium.js'],'workerUnchanged':True,'sameGeographicQaD1':True,'productionUnchanged':True}
(stage/'gps-premium-manifest.json').write_text(json.dumps(manifest,indent=2))
# Compare the .11 presentation baseline as well; preserve exact core and wait styling.
for name in critical:
 remote,_=m['m']['P']['get']('https://via-traslados-search-refined-qa.marcelof-gx.workers.dev/'+name)
 assert hashlib.sha256(remote).hexdigest()==hashes[name],'Previous premium source mismatch '+name
remote,_=m['m']['P']['get']('https://via-traslados-search-refined-qa.marcelof-gx.workers.dev/via-gps-premium.js')
assert (assets/'via-gps-premium.js').read_bytes()==remote,'Presentation JS changed unexpectedly'
print('VIA_GPS_PREMIUM_BUILD '+json.dumps(manifest),flush=True)
