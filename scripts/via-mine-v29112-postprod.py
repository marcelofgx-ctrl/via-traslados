#!/usr/bin/env python3
"""Postrelease GET-only check of actual V29.1.12 Worker and its public web assets."""
import json,runpy
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get'];cf=lib['cf'];active=lib['active_version']
EXPECTED='1de806f9-a97c-4948-98ab-ccbc94f5e0e1'
ROLLBACK='f5d43ef0-1a28-4bce-a078-6fb364399e72'
v=active();ds=cf('/deployments').get('deployments',[])
assert v==EXPECTED,'V29.1.12 production version changed: '+v
assert any(x.get('version_id')==ROLLBACK for d in ds for x in d.get('versions',[])),'V29.1.11 rollback unavailable'
WEB='https://viatraslados.com/'
patterns={
 '':'content="29.1.12"',
 'mis-reservas.html':'mine-v29112-cohesion.css?v=1',
 'mine-v29112-cohesion.css':'V29.1.12',
 'mine-v29112-cohesion.js':'V29.1.12',
 'mine-v29111-fidelity.css':'V29.1.11',
 'mine-v29110-theme.js':'V29.1.10',
 'mine-brand-v2919.svg':'emeraldLeft'
}
seen={}
for name,fragment in patterns.items():
 buf,h=GET(WEB+name)
 assert fragment.encode() in buf,'Missing live marker '+name
 seen[name or 'index.html']=len(buf)
html,_=GET(WEB+'mis-reservas.html')
assert b'via-home-divider' in html and b'<svg viewBox="0 0 24 24"' in html,'Inicio refinement absent'
for name in ['app.js','store.js','passkeys.js','reserva.html','geo-v2/core.mjs','descargas/via-traslados-conductor-v35.apk']:
 buf,h=GET(WEB+name)
 assert len(buf)>100,'Existing functional asset absent '+name
 seen[name]=len(buf)
print('VIA_V29112_POSTPROD_READ_ONLY_VERIFIED '+json.dumps({
 'display_version':'29.1.12','active_version':v,'rollback_web_version':ROLLBACK,
 'live_assets_checked':seen,'api_d1_apk_modified':False
}),flush=True)
