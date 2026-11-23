#!/usr/bin/env python3
"""Independent public GET-only V29.1.15 Worker, GPS/Map code, preserved booking assets."""
import json,hashlib,pathlib,runpy
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get']; cf=lib['cf']; active=lib['active_version']
EXPECTED='e7830749-95f0-4a0e-8781-0e2ae6a19466'
ROLLBACK='d3f863be-575c-40eb-902b-96818085bb66'
current=active()
assert current==EXPECTED,'Production worker is not V29.1.15: '+str(current)
versions={v.get('version_id') for d in cf('/deployments').get('deployments',[]) for v in d.get('versions',[])}
assert ROLLBACK in versions,'Rollback to V29.1.14 is unavailable'
source=json.loads(pathlib.Path('audit/live-v29114/manifest.json').read_text())['files']
URL='https://viatraslados.com/'
markers={
 'index.html':['content="29.1.15"','reference.js?v=32','map-point-picker.js?v=27','via-v29115-map-ui.css?v=1'],
 'reference.js':['V29.1.15','streetFound','Confirmá el punto','Número por confirmar'],
 'map-point-picker.js':['V29.1.15','SELECCIÓN PRECISA','reverseWatchdog','reverseSettled','Número por confirmar'],
 'via-v29115-map-ui.css':['v29.1.15','#via-gps-feedback','#home-date'],
 'mis-reservas.html':['mine-v29113-inicio.css?v=1','mine-v29112-cohesion.css?v=1']
}
tested={}
for path,terms in markers.items():
 b,h=GET(URL+path)
 for word in terms:assert word.encode() in b,'Missing verified asset '+path+': '+word
 if path=='map-point-picker.js': assert 'SELECCIÓN PRECISA · QA'.encode() not in b,'QA marker leaked'
 tested[path]=len(b)
preserved=['app.js','geo-v2/core.mjs','map-point-picker.css','address-autocomplete.js']
for path in preserved:
 b,h=GET(URL+path)
 assert hashlib.sha256(b).hexdigest()==source[path]['sha256'],'Original resource changed '+path
 tested[path]=len(b)
core={
 'store.js':'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 'descargas/via-traslados-conductor-v35.apk':'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
}
for path,sha in core.items():
 b,h=GET(URL+path)
 assert hashlib.sha256(b).hexdigest()==sha,'Protected core altered '+path
 tested[path]=len(b)
b,h=GET(URL+'passkeys.js')
assert len(b)>100,'Passkeys file unavailable'
tested['passkeys.js']=len(b)
print('VIA_V29115_INDEPENDENT_LIVE_READONLY_PASS '+json.dumps({
 'web_version':'29.1.15','active_web_worker':current,'safe_rollback_web_worker':ROLLBACK,
 'live_assets_verified':tested,'original_app_geo_store_map_styles_and_apk_unchanged':True,
 'production_data_writes':False
}),flush=True)
