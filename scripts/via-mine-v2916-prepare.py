#!/usr/bin/env python3
"""Snapshot de V29.1.5 y paquete QA de Mis reservas, sin escribir en API/D1."""
import concurrent.futures, hashlib, json, pathlib, re, runpy, urllib.error, urllib.parse
s=runpy.run_path('scripts/via-v291-prepare.py')
get=s['http_get']; sha=s['digest']; clean=s['sanitize_html']
BASE='d3561c58-fedf-4273-9b21-e07de026308d'
assert s['active_version']()==BASE, 'Producción cambió: detener y reauditar'
root=pathlib.Path('mine-v2916-build'); assets=root/'assets';assets.mkdir(parents=True,exist_ok=True)
raw,_=get('https://viatraslados.com/')
assert b'content="29.1.5"' in raw
names=set(s['source_asset_list']())|set(s['EXTRAS'])|{'index.html','mis-reservas.html','reserva.html','sw.js','geo-v2/core.mjs','descargas/via-traslados-conductor-v35.apk'}
required=set();inventory={};pending=set(names)
def download(name):
 try:
  data,headers=get('https://viatraslados.com/'+urllib.parse.quote(name,safe='/'))
 except urllib.error.HTTPError as e:
  if e.code==404:return name,None
  raise
 if name.endswith(('.css','.js','.mjs')):assert 'html' not in headers.get('Content-Type',''),name+' devolvió HTML'
 if name.endswith('.html'):data=clean(data)
 return name,data
while pending:
 batch=sorted(pending);pending=set()
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for name,data in pool.map(download,batch):
   if data is None:
    if name=='mine-identity-v291.css':continue # dependencia rota que este parche recupera
    assert name not in required,'Dependencia pública ausente: '+name
    continue
   path=assets/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);inventory[name]=sha(data)
   if name.endswith('.html'):
    for href in re.findall(r'(?:src|href)=["\x27]([^"\x27]+)',data.decode()):
     u=urllib.parse.urlparse(href)
     if u.netloc or u.scheme or not u.path:continue
     child=pathlib.PurePosixPath(name).parent/u.path.removeprefix('./').removeprefix('/')
     child=str(child)
     if not child.endswith(('.html','.css','.js','.mjs','.svg','.webmanifest','.png')):continue
     if child.startswith('../'):continue
     required.add(child)
     if child not in inventory and child not in names:pending.add(child);names.add(child)
assert len(inventory)>=40, 'Inventario productivo incompleto'
expected={
 'app.js':'73afe2490a64b9a1c1b6cf4ce61283c1f68184208cbe783a70126cecc3b21e69',
 'store.js':'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 'reference.js':'e585ee99e2214c6fd24e776c1dfa9eb75be41cc63e2040806237835abee6c1a2',
 'address-autocomplete.js':'54f74853a72debba09d9f18eec44fa3dc05f3f366250b5c41672555c28a63a2a',
 'address-selected-preview.js':'bf0f7aa019eab8f42fe8dc5fe12a2c559f5871ff07266a4c8ea0dc1fb4f234e8',
 'geo-v2/core.mjs':'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1',
 'descargas/via-traslados-conductor-v35.apk':'324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
}
for name,digest in expected.items():assert inventory[name]==digest,'Cambio productivo: '+name
(root/'production-worker.mjs').write_text(s['get_live_worker_source']())
(root/'manifest.json').write_text(json.dumps({'baseline_web_version':BASE,'assets_before':inventory,'required_assets':sorted(required),'repaired_missing_asset':'mine-identity-v291.css','version':'29.1.6-qa'},indent=2)+'\n')
(root/'worker.mjs').write_text("export default {async fetch(req,env){if(new URL(req.url).pathname.startsWith('/api/'))return new Response('QA sin reservas reales',{status:503});return env.ASSETS.fetch(req)}};\n")
(root/'wrangler.qa.jsonc').write_text(json.dumps({'name':'via-traslados-mine-access-qa','main':'worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}},indent=2)+'\n')
assert s['active_version']()==BASE,'La versión productiva cambió durante snapshot'
print('MINE_SOURCE_SNAPSHOT_OK',len(inventory),'BASE',BASE)
