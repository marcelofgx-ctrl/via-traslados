#!/usr/bin/env python3
"""GET-only postrelease verification of public V29.1.14 web Worker and original core assets."""
import json,runpy,hashlib
lib=runpy.run_path('scripts/via-v291-prepare.py')
GET=lib['http_get'];cf=lib['cf'];active=lib['active_version']
BASE='2f2407d8-d665-47c6-9b14-edf7655b00a4'
CURRENT='d3f863be-575c-40eb-902b-96818085bb66'
actual=active()
assert actual==CURRENT,'Cloudflare does not currently serve V29.1.14 '+str(actual)
deployments=cf('/deployments').get('deployments',[])
assert any(x.get('version_id')==BASE for d in deployments for x in d.get('versions',[])),'V29.1.13 restore missing'
WEB='https://viatraslados.com/'
fragments={
 'index.html':['content="29.1.14"','reference.js?v=31','app.js?v=29.14'],
 'reference.js':['V29.1.14','clearWizardDraft','Confirmá el número','numberIsApproximate'],
 'app.js':['V29.1.14','routePending','identityEpoch'],
 'mis-reservas.html':['mine-v29113-inicio.css?v=1','via-home-divider'],
 'mine-v29113-inicio.css':['V29.1.13'],
 'mine-v29112-cohesion.js':['V29.1.12'],
 'mine-v29111-fidelity.css':['V29.1.11'],
}
sizes={}
for path,needles in fragments.items():
 content,hdr=GET(WEB+path)
 for needle in needles:assert needle.encode() in content,'Missing source '+path+' marker '+needle
 sizes[path]=len(content)
core={
 'store.js':'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 'geo-v2/core.mjs':'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1',
 'descargas/via-traslados-conductor-v35.apk':'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
}
for path,sha in core.items():
 content,hdr=GET(WEB+path)
 assert hashlib.sha256(content).hexdigest()==sha,'Functional asset changed '+path
 sizes[path]=len(content)
for path in ['passkeys.js','reserva.html','address-autocomplete.js']:
 content,hdr=GET(WEB+path)
 assert len(content)>100,'Missing functional resource '+path
 sizes[path]=len(content)
print('VIA_V29114_INDEPENDENT_LIVE_READONLY_PASS '+json.dumps({
 'version':'29.1.14','worker_version':actual,'rollback_to':BASE,
 'public_assets':sizes,'core_hashes_preserved':True,'production_data_writes':False
}),flush=True)
