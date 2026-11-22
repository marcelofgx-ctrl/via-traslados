#!/usr/bin/env python3
"""GET-only production audit before any V29.1.12 modification. No D1/API writes."""
import json,os,runpy
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get'];cf=lib['cf'];active=lib['active_version']
EXPECTED='f5d43ef0-1a28-4bce-a078-6fb364399e72'
ROLLBACK='ca5d72af-db3e-43ab-8476-727e44271e50'
v=active()
dep=cf('/deployments')['deployments']
known={row['version_id'] for d in dep for row in d.get('versions',[])}
page,_=GET('https://viatraslados.com/mis-reservas.html')
home,_=GET('https://viatraslados.com/')
css,_=GET('https://viatraslados.com/mine-v29111-fidelity.css')
page=lib['sanitize_html'](page)
info={'active_version':v,'expected_version':EXPECTED,'rollback_version':ROLLBACK,
 'rollback_in_recent_deployments':ROLLBACK in known,'recent_deployments':len(dep),
 'home_v29111':b'content="29.1.11"' in home,
 'mine_v29111_css':b'mine-v29111-fidelity.css?v=1' in page,
 'css_v29111':b'V29.1.11' in css,
 'no_backend_work':True}
print('VIA_V29112_READ_ONLY_AUDIT '+json.dumps(info),flush=True)
assert v==EXPECTED,'Cloudflare active changed; do NOT build/deploy V29.1.12'
assert info['home_v29111'] and info['mine_v29111_css'] and info['css_v29111'],'Actual live frontend differs'
assert info['rollback_in_recent_deployments'],'V29.1.10 rollback missing from deployment history'
print('VIA_V29112_AUDIT_PASS live V29.1.11 and rollback confirmed',flush=True)
