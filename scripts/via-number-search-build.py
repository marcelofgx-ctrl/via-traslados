import pathlib,json,hashlib,shutil,subprocess,re
src=pathlib.Path('v30410-visual/assets');out=pathlib.Path('number-search-qa');assets=out/'assets'
expected=json.loads(pathlib.Path('v30410-visual/exact-hashes.json').read_text())
assert len(expected)==44
for n,h in expected.items():assert hashlib.sha256((src/n).read_bytes()).hexdigest()==h,n
shutil.copytree(src,assets,dirs_exist_ok=True)
subprocess.run(['node','scripts/via-numbered-search-patch.mjs',str(assets/'address-autocomplete.js')],check=True)
subprocess.run(['node','--check',str(assets/'address-autocomplete.js')],check=True)
p=assets/'index.html';s=p.read_text();assert 'V30.4.10.20' in s
s=s.replace('30.4.10.20','30.4.10.21').replace('>V30.4.10.21</span>','>V30.4.10.21 QA</span>')
s=re.sub(r'address-autocomplete\.js\?v=[^"\x27\s<>]+','address-autocomplete.js?v=30.4.10.21',s)
p.write_text(s)
p=assets/'config.js';s=p.read_text();assert s.count('https://via-traslados-api.marcelof-gx.workers.dev')==1
p.write_text(s.replace('https://via-traslados-api.marcelof-gx.workers.dev','https://via-traslados-number-search-qa.marcelof-gx.workers.dev'))
p=assets/'sw.js';s=p.read_text();assert '30.4.10.20' in s;p.write_text(s.replace('30.4.10.20-prod','30.4.10.21-number-qa'))
changed=[n for n,h in expected.items() if hashlib.sha256((assets/n).read_bytes()).hexdigest()!=h]
assert set(changed)=={'address-autocomplete.js','index.html','config.js','sw.js'},changed
shutil.copyfile('addons/via-number-search-qa.mjs',out/'worker.mjs')
(out/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-number-search-qa','main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}))
print('VIA_NUMBER_SEARCH_QA_READY '+str(changed))
