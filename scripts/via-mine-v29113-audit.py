#!/usr/bin/env python3
"""V29.1.13: read-only real Worker and CSS preflight. Do not touch API or D1."""
import json,runpy
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get'];cf=lib['cf'];current=lib['active_version']
BASE='1de806f9-a97c-4948-98ab-ccbc94f5e0e1'
OLD='f5d43ef0-1a28-4bce-a078-6fb364399e72'
actual=current()
ds=cf('/deployments').get('deployments',[])
known={v.get('version_id') for d in ds for v in d.get('versions',[])}
html,_=GET('https://viatraslados.com/mis-reservas.html')
index,_=GET('https://viatraslados.com/')
css,_=GET('https://viatraslados.com/mine-v29112-cohesion.css')
data={'active_worker':actual,'base':BASE,'previous_worker_available':OLD in known,
 'new_rollback_available':BASE in known,
 'home_v29112':b'content="29.1.12"' in index,
 'mine_v29112':b'mine-v29112-cohesion.css?v=1' in html and b'mine-v29112-cohesion.js?v=1' in html,
 'fixed_width_css':b'width:94px!important' in css,'app_api_d1_untouched':True}
print('VIA_V29113_BASE_AUDIT '+json.dumps(data),flush=True)
assert actual==BASE,'Unexpected active Worker; refuse to touch production'
assert data['home_v29112'] and data['mine_v29112'] and data['fixed_width_css'],'Actual UI differs from screenshot baseline'
assert data['new_rollback_available'],'Active Worker not available for rollback'
print('VIA_V29113_AUDIT_PASS',flush=True)
