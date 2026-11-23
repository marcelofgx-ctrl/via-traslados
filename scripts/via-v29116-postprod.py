#!/usr/bin/env python3
"""Independent GET-only postrelease proof of V29.1.16, source hashes and rollback."""
import json,hashlib,pathlib,runpy
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get'];cf=lib['cf'];active=lib['active_version']
CURRENT='f46757df-8ff2-4653-bec3-e15b8394a99a'
BASE='e7830749-95f0-4a0e-8781-0e2ae6a19466'
actual=active()
assert actual==CURRENT,'Active web Worker differs from V29.1.16 '+str(actual)
assert BASE in {x.get('version_id') for d in cf('/deployments').get('deployments',[]) for x in d.get('versions',[])},'Safe V29.1.15 rollback unavailable'
snapshot=json.loads(pathlib.Path('audit/live-v29115/manifest.json').read_text())['files']
ORIGIN='https://viatraslados.com/'
markers={
 'index.html':['content="29.1.16"','map-point-picker.js?v=28','via-v29116-date-ui.js?v=1','via-v29116-visual.css?v=1'],
 'map-point-picker.js':['V29.1.16','via-reference-street','via-reference-detail','reverseWatchdog','reverseSettled'],
 'via-v29116-date-ui.js':['V29.1.16','via-home-date-display','pageshow'],
 'via-v29116-visual.css':['V29.1.16','via-reference-detail','via-home-date-display'],
 'mis-reservas.html':['mine-v29113-inicio.css?v=1','mine-v29112-cohesion.css?v=1']
}
seen={}
for path,terms in markers.items():
 content,h=GET(ORIGIN+path)
 for term in terms:assert term.encode() in content,'Missing verified source: '+path+' '+term
 seen[path]=len(content)
for name in ('app.js','reference.js','map-point-picker.css','geo-v2/core.mjs',
             'address-autocomplete.js','via-v29115-map-ui.css'):
 content,h=GET(ORIGIN+name)
 assert hashlib.sha256(content).hexdigest()==snapshot[name]['sha256'],'Protected functional resource changed '+name
 seen[name]=len(content)
core={
 'store.js':'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 'descargas/via-traslados-conductor-v35.apk':'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
}
for name,expected in core.items():
 content,h=GET(ORIGIN+name)
 assert hashlib.sha256(content).hexdigest()==expected,'Unapproved core modification '+name
 seen[name]=len(content)
x,h=GET(ORIGIN+'passkeys.js')
assert len(x)>100,'Passkeys front end resource unavailable'
seen['passkeys.js']=len(x)
print('VIA_V29116_POSTPROD_INDEPENDENT_READONLY_PASS '+json.dumps({
 'display_version':'29.1.16','effective_web_worker':actual,'rollback_web_worker':BASE,
 'protected_app_reference_geo_store_apk_identical':True,
 'assets_verified':seen,'api_or_d1_writes':False
}),flush=True)
