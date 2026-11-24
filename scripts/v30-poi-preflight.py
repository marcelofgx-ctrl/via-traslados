#!/usr/bin/env python3
"""Comprobación read-only: Worker efectivo V30 vs parche opcional Geoapify."""
import hashlib,json,os,pathlib,re,runpy,subprocess,urllib.parse,urllib.error
old=runpy.run_path('scripts/via-v291-prepare.py')
get=old['http_get']
version=old['active_version']
worker=old['get_live_worker_source']
live='https://viatraslados.com'
account=os.environ['CLOUDFLARE_ACCOUNT_ID']
token=os.environ['CLOUDFLARE_API_TOKEN']
assert len(account)==32 and len(token)>20, 'Secrets Cloudflare no disponibles'
before=version()
home,_=get(live+'/')
s=home.decode('utf8')
assert 'v30.0' in s and ('content="30.0"' in s or 'v30.0</small>' in s), 'No está sirviendo V30.0'
bundle=worker()
print('VIA_WORKER_MODULE_SHAPE '+json.dumps({'source_length':len(bundle),'export_default':bundle.count('export default'),'export_braced':bundle.count('export{')+bundle.count('export {'),'add_event_listener':bundle.count('addEventListener('),'fetch_handlers':bundle.count('fetch('),'has_directions':'/api/direcciones' in bundle,'has_assets':'env.ASSETS.fetch(request)' in bundle}),flush=True)
assert (bundle.count('export default')==1 or len(re.findall(r'export\\s*\\{\\s*([A-Za-z_$][\\w$]*)\\s+as\\s+default\\s*\\}\\s*;?',bundle))==1),'Worker distinto: export no reconocido'
assert 'env.ASSETS.fetch(request)' in bundle and '/api/direcciones' in bundle,'Worker inesperado'
dir=pathlib.Path('v30-places-preflight');dir.mkdir(exist_ok=True)
(dir/'worker-active.mjs').write_text(bundle,encoding='utf8')
p=subprocess.run(['node','scripts/v30-geoapify-integration.mjs',
 str(dir/'worker-active.mjs'),str(dir/'worker-poi.mjs')],
 capture_output=True,text=True,timeout=30)
assert p.returncode==0,'Integración no aplicable a Worker activo: '+p.stderr[-350:]
p=subprocess.run(['node','--check',str(dir/'worker-poi.mjs')],
 capture_output=True,text=True,timeout=30)
assert p.returncode==0,'Código integrado no compila: '+p.stderr[-350:]
sha={}
for filename in ('app.js','store.js','address-autocomplete.js','reference.js','geo-v2/core.mjs','config.js'):
 body,head=get(live+'/'+filename)
 assert len(body)>100,'Archivo crítico ausente '+filename
 assert 'text/html' not in head.get('Content-Type','').lower(),'Archivo crítico incorrecto '+filename
 sha[filename]=hashlib.sha256(body).hexdigest()
assert before==version(),'Worker productivo cambió durante la revisión'
report={'status':'V30_POI_PREFLIGHT_PASS','web_version':'v30.0',
 'active_worker_version_id':before,
 'live_worker_sha256':hashlib.sha256(bundle.encode()).hexdigest(),
 'patched_worker_sha256':hashlib.sha256((dir/'worker-poi.mjs').read_bytes()).hexdigest(),
 'unchanged_critical_assets':sha,
 'deployment':'NONE','d1_changes':'NONE','api_changes':'NONE',
 'secrets_checked':'presence of CI Cloudflare account/token only; Geoapify WEB binding not verified'}
(dir/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
(dir/'worker-active.mjs').unlink()
(dir/'worker-poi.mjs').unlink()
print('V30_POI_PREFLIGHT_PASS '+json.dumps({'version':before,'assets':len(sha),'deployment':'none'}))
