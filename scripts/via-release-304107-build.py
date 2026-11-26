import runpy,pathlib,json
# Rebuild from the immutable active source; QA-only files are never deployed.
m=runpy.run_path('scripts/v30410-visual-build.py')
out=m['OUT'];assets=m['ASSETS'];P=m['P']
manifest=json.loads((out/'manifest.json').read_text())
p=assets/'index.html';s=p.read_text();assert 'V30.4.10.7 QA' in s
p.write_text(s.replace('V30.4.10.7 QA','V30.4.10.7').replace('Versión 30.4.10.7 QA','Versión 30.4.10.7'))
p=assets/'sw.js';s=p.read_text();assert 'via-traslados-v30.4.9-session' in s
p.write_text(s.replace('via-traslados-v30.4.9-session','via-traslados-v30.4.10.7-visual'))
# QA experiment remains an explicit comparison; production always uses approved finish.
p=assets/'via-visual-profile.js';s=p.read_text();needle="new URLSearchParams(location.search).get('acabado')==='original'?'reference':'premium'";assert needle in s
p.write_text(s.replace(needle,"'premium'"))
manifest['changed']=['index.html','reference.js','sw.js'];manifest['qa_only']=False
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
assert all(P['sha']((assets/n).read_bytes())==h for n,h in manifest['source_assets'].items() if n not in manifest['changed'])
assert b'via-traslados-api.marcelof-gx.workers.dev' in (assets/'config.js').read_bytes()
assert b'visual-qa.marcelof-gx' not in (assets/'config.js').read_bytes()
m['guard']()
print('VIA_PROD_GRAPHICS_ONLY 37 existing assets unchanged; index, GPS reference and cache key changed; two visual assets added')
