#!/usr/bin/env python3
"""Generador seguro V30 Places PROD: captura los DOS Workers y todos los assets efectivos.
NO despliega, no cambia D1. Siempre se ejecuta desde PR #55, jamás desde main vieja.
"""
import concurrent.futures,hashlib,json,os,pathlib,re,runpy,subprocess,urllib.error,urllib.parse,urllib.request
old=runpy.run_path('scripts/via-v291-prepare.py')
WEB='https://viatraslados.com'
BASE_WEB='ac8e0a7e-a032-47f8-8328-bd7b716a4342'
BASE_API='9349f01a-5824-4401-848f-edb4f3f7d5b0'
D1='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
OUT=pathlib.Path('v30-poi-prod-build')
ASSETS=OUT/'assets'
NEEDED={'index.html','app.js','store.js','config.js','address-autocomplete.js',
 'reference.js','geo-v2/core.mjs','passkeys.js','map-point-picker.js',
 'mis-reservas.html','descargas/via-traslados-conductor-v35.apk'}
get=old['http_get'];sha=lambda b:hashlib.sha256(b).hexdigest()
def worker_version(name):
 a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
 u='https://api.cloudflare.com/client/v4/accounts/'+a+'/workers/scripts/'+name+'/deployments'
 req=urllib.request.Request(u,headers={'Authorization':'Bearer '+t,'Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=20) as r:data=json.load(r)
 if not data.get('success'):raise AssertionError('No se pudo auditar Worker '+name)
 vs=data['result']['deployments'][0]['versions']
 if len(vs)!=1 or float(vs[0]['percentage'])!=100:raise AssertionError('Tráfico productivo dividido '+name)
 return vs[0]['version_id']
def latest_uploaded_version(name):
 """La descarga GET /scripts/name sigue la última versión SUBIDA, no necesariamente la activa."""
 a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
 u='https://api.cloudflare.com/client/v4/accounts/'+a+'/workers/scripts/'+name+'/versions?per_page=1'
 req=urllib.request.Request(u,headers={'Authorization':'Bearer '+t,'Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=20) as r:data=json.load(r)
 if not data.get('success') or not isinstance(data.get('result'),list) or not data['result']:
  raise AssertionError('No se pudo determinar última versión subida de '+name)
 return data['result'][0].get('id')

def api_source():
 a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
 u='https://api.cloudflare.com/client/v4/accounts/'+a+'/workers/scripts/via-traslados-api'
 req=urllib.request.Request(u,headers={'Authorization':'Bearer '+t})
 with urllib.request.urlopen(req,timeout=25) as r:
  mime=r.headers.get('Content-Type','')
  raw=r.read()
 if 'multipart/' not in mime.lower():
  code=raw.decode('utf8')
  if '/api/health' not in code:raise AssertionError('Worker API no reconocido')
  return code
 match=re.search(r'boundary="?([^";]+)',mime)
 if not match:raise AssertionError('API multipart sin boundary')
 candidates=[]
 for part in raw.split(b'--'+match.group(1).encode()):
  if b'Content-Disposition' not in part or b'\r\n\r\n' not in part:continue
  head,body=part.split(b'\r\n\r\n',1)
  # Elegir exactamente la parte ejecutable `worker.js`, nunca `worker.js.map`.
  # La exportación ESM se valida luego con el wrapper y con Wrangler --dry-run.
  if b'name="worker.js"' not in head:continue
  code=body.rstrip(b'\r\n').decode('utf8','replace')
  if '/api/health' in code:
   candidates.append(code)
 if len(candidates)!=1:raise AssertionError('Bundle API no único o dependencias no reconocidas')
 # La expresión previa podía atravesar todo el bundle minificado, dando un falso
 # positivo al mezclar un `import` dinámico con un `from` posterior dentro de cadenas.
 # Rechazar solo especificadores relativos completos; Wrangler --dry-run verificará
 # además que no quede ninguna dependencia sin resolver antes de cualquier despliegue.
 code=candidates[0]
 import_from=re.search(r'\bimport\s+[^;\n]{0,500}?\s+from\s*(["\x27])\.[^"\x27]+\1',code)
 import_side_effect=re.search(r'\bimport\s*(["\x27])\.[^"\x27]+\1',code)
 import_dynamic=re.search(r'\bimport\s*\(\s*(["\x27])\.[^"\x27]+\1',code)
 if import_from or import_side_effect or import_dynamic:
  raise AssertionError('Worker API tiene imports relativos reales; empaquetado abortado')
 return candidates[0]
def fetch_asset(name):
 try:body,hdr=get(WEB+'/'+urllib.parse.quote(name,safe='/'))
 except urllib.error.HTTPError as e:
  if e.code==404 and name not in NEEDED:return name,None
  raise
 if name.endswith(('.js','.mjs','.css')) and 'text/html' in hdr.get('Content-Type','').lower():
  raise AssertionError('Content-Type sospechoso '+name)
 if name.endswith('.html'):body=old['sanitize_html'](body)
 return name,body
def verify_versions():
 assert worker_version('via-traslados-web-prod')==BASE_WEB,'Web distinta: NO publicar'
 assert worker_version('via-traslados-api')==BASE_API,'API distinta: NO publicar'
 # Protección de rollback: el último script subido puede diferir del Worker desplegado.
 # En ese caso la descarga sin versionar NO sirve como fuente de producción.
 assert latest_uploaded_version('via-traslados-api')==BASE_API,(
  'API activa recuperada por rollback, pero última subida es distinta: NO empaquetar fuente ambigua')
 assert latest_uploaded_version('via-traslados-web-prod')==BASE_WEB,(
  'Web activa difiere de última subida: NO empaquetar fuente ambigua')
def generate():
 verify_versions()
 OUT.mkdir(parents=True,exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
 listed=set(old['source_asset_list']())|set(old['EXTRAS'])|NEEDED|{'sw.js','manifest.webmanifest'}
 names=sorted(n for n in listed if n and not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts)
 hashes={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for name,body in pool.map(fetch_asset,names):
   if body is None:continue
   dst=ASSETS/name;dst.parent.mkdir(parents=True,exist_ok=True)
   dst.write_bytes(body);hashes[name]=sha(body)
 assert len(hashes)>=32 and NEEDED.issubset(hashes),'Assets críticos faltantes'
 assert b'v30.0' in (ASSETS/'index.html').read_bytes().lower(),'Producción no es V30'
 pre=ASSETS/'address-autocomplete.js'
 patched=OUT/'address-autocomplete-patched.js'
 p=subprocess.run(['node','scripts/v30-poi-frontend-patch.mjs',str(pre),str(patched)],
  capture_output=True,text=True,timeout=30)
 assert p.returncode==0,'No se pudo añadir Places al frontend: '+p.stderr[-400:]
 pre.write_bytes(patched.read_bytes())
 assert hashes['config.js']==sha((ASSETS/'config.js').read_bytes()),'Config API cambiada'
 assert hashes['index.html']==sha((ASSETS/'index.html').read_bytes()),'HTML tocado'
 assert hashes['app.js']==sha((ASSETS/'app.js').read_bytes()),'Flujo reserva alterado'
 api=OUT/'api-live.mjs';api.write_text(api_source())
 p=subprocess.run(['node','scripts/v30-poi-api-bundle-wrapper.mjs',
  str(api),str(OUT/'api-poi.mjs')],capture_output=True,text=True,timeout=30)
 assert p.returncode==0,'No se pudo envolver Worker API activo '+p.stderr[-500:]
 web=OUT/'web-live.mjs';web.write_text(old['get_live_worker_source']())
 p=subprocess.run(['node','scripts/v30-geoapify-integration.mjs',
  str(web),str(OUT/'web-poi.mjs')],capture_output=True,text=True,timeout=30)
 assert p.returncode==0,'No se pudo envolver Worker WEB activo '+p.stderr[-500:]
 for path in ['api-poi.mjs','web-poi.mjs']:
  p=subprocess.run(['node','--check',str(OUT/path)],capture_output=True,text=True,timeout=30)
  assert p.returncode==0,'Error sintaxis '+path+': '+p.stderr[-300:]
 api_json={'name':'via-traslados-api','main':'./api-poi.mjs',
  'compatibility_date':'2026-11-10','workers_dev':True,'keep_vars':True,
  'd1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':D1}]}
 web_json={'name':'via-traslados-web-prod','main':'./web-poi.mjs',
  'compatibility_date':'2026-11-10','workers_dev':True,'keep_vars':True,
  'vars':{'VIA_PLACES_ENABLED':'true'},
  'services':[{'binding':'VIA_POI_API','service':'via-traslados-api'}],
  'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
 (OUT/'wrangler.api.jsonc').write_text(json.dumps(api_json,indent=2))
 (OUT/'wrangler.web.jsonc').write_text(json.dumps(web_json,indent=2))
 changed=sorted(n for n,h in hashes.items() if sha((ASSETS/n).read_bytes())!=h)
 assert changed==['address-autocomplete.js'],'Solo puede cambiar autocomplete: '+str(changed)
 report={'web_old_version':BASE_WEB,'api_old_version':BASE_API,'d1_database_id':D1,
  'assets_count':len(hashes),'changed_assets':changed,
  'orig_asset_hashes':hashes,'api_worker_source_sha256':sha(api.read_bytes()),
  'web_worker_source_sha256':sha(web.read_bytes()),
  'api_new_hash':sha((OUT/'api-poi.mjs').read_bytes()),
  'web_new_hash':sha((OUT/'web-poi.mjs').read_bytes()),
  'd1_migrations':'NONE','staff_changes':'NONE','booking_changes':'NONE',
  'credentials':'ONLY API Worker via keep-vars','service_binding':'VIA_POI_API'}
 (OUT/'manifest.json').write_text(json.dumps(report,indent=2))
 api.unlink();web.unlink()
 verify_versions()
 print('VIA_POI_PROD_PACKAGE_SAFE '+json.dumps({
  'assets':len(hashes),'changed_assets':changed,
  'api_base':BASE_API,'web_base':BASE_WEB,'rollback_pinned':True,
  'geoapify_credential_kept_in_API':True}),flush=True)
if __name__=='__main__':generate()
