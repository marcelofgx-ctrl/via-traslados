#!/usr/bin/env python3
"""Read-only independent postrelease assertion: actual live V29.1.13 and no clipped Inicio rule."""
import json,runpy
l=runpy.run_path('scripts/via-v291-prepare.py')
GET=l['http_get'];cf=l['cf'];current=l['active_version']
NEW='2f2407d8-d665-47c6-9b14-edf7655b00a4'
OLD='1de806f9-a97c-4948-98ab-ccbc94f5e0e1'
actual=current()
deployments=cf('/deployments').get('deployments',[])
assert actual==NEW,'Live Worker is not V29.1.13: '+actual
assert any(v.get('version_id')==OLD for d in deployments for v in d.get('versions',[])),'V29.1.12 rollback not available'
url='https://viatraslados.com/'
markers={'':'content="29.1.13"','mis-reservas.html':'mine-v29113-inicio.css?v=1',
'mine-v29113-inicio.css':'width:max-content!important',
'mine-v29112-cohesion.css':'V29.1.12',
'mine-v29112-cohesion.js':'V29.1.12',
'mine-brand-v2919.svg':'emeraldLeft'}
sizes={}
for name,needle in markers.items():
 buf,h=GET(url+name)
 assert needle.encode() in buf,'Live UI mismatch: '+name
 sizes[name or 'index.html']=len(buf)
html,_=GET(url+'mis-reservas.html')
assert b'via-home-divider' in html and b'via-home-label' in html,'Inicio original control missing'
for name in ('store.js','app.js','passkeys.js','reserva.html','geo-v2/core.mjs',
             'descargas/via-traslados-conductor-v35.apk'):
 buf,h=GET(url+name)
 assert len(buf)>100,'Functional asset missing '+name
 sizes[name]=len(buf)
print('VIA_V29113_POSTPROD_INDEPENDENT_PASS '+json.dumps({'version':'29.1.13',
 'active_worker':actual,'rollback_worker':OLD,'served_assets':sizes,'api_d1_writes':False}),flush=True)
