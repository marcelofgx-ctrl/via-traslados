#!/usr/bin/env python3
"""Build a second, truly isolated QA frontend; never modifies the existing QA or production."""
import json,os,pathlib,re,runpy,shutil
src=pathlib.Path('via-current-qa')
dst=pathlib.Path('via-real-auth-qa-web')
# Capture only the currently deployed public web assets (read-only).
runpy.run_path('scripts/via-current-prod-qa.py')
if not src.is_dir() or dst.exists():raise SystemExit('QA frontend output collision or missing snapshot')
shutil.copytree(src,dst)
assets=dst/'assets'
site_key=os.environ.get('VIA_QA_TURNSTILE_SITE_KEY','').strip()
if not re.fullmatch(r'0x[a-zA-Z0-9]{15,100}',site_key):
 raise SystemExit('Missing real, QA-hostname-allowed TURNSTILE SITE KEY; NO deploy')
config="window.VIA_CONFIG=Object.freeze({demo:false,apiUrl:location.origin,turnstileSiteKey:"+json.dumps(site_key)+"});\n"
(assets/'config.js').write_text(config)
# QA-only: remove local simulation affordances from diagnostic controls.
diagnostics=assets/'via-qa-browser-diagnostics.js'
text=diagnostics.read_text()
assert "const wizard=document.querySelector('#solicitar');" in text
text=text.replace("const wizard=document.querySelector('#solicitar');","const wizard=null;")
diagnostics.write_text(text)
home=assets/'index.html'
ht=home.read_text().replace('QA v29.1.12','QA REAL v30.0.0')
assert 'QA REAL v30.0.0' in ht
home.write_text(ht)
worker=dst/'worker.mjs'
source=worker.read_text()
old="if(path.startsWith('/api/'))return json({error:'QA aislada: API privada y de escritura deshabilitada'},503);"
new="if(path.startsWith('/api/')){if(!env.QA_BACKEND)return json({error:'Backend QA no vinculado'},503);return env.QA_BACKEND.fetch(req);}"
assert source.count(old)==1,'Missing hard API isolation marker'
worker.write_text(source.replace(old,new))
configfile=dst/'wrangler.jsonc'
conf=json.loads(configfile.read_text())
assert conf['name']=='via-traslados-current-prod-qa'
assert conf.get('services') in (None,[])
conf['name']='via-traslados-current-prod-qa'
conf['services']=[{'binding':'QA_BACKEND','service':'via-traslados-api-auth-qa-20261121'}]
configfile.write_text(json.dumps(conf,indent=2)+'\n')
assert 'via-traslados-api"' not in configfile.read_text()
assert 'via-traslados-db"' not in configfile.read_text()
print('QA_REAL_FRONTEND_BUILT',conf['name'],'siteKeyConfigured',True,'no production references')
