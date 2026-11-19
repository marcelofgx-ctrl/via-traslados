#!/usr/bin/env python3
"""GPS 29.1.1 QA: empaquetar web efectiva con hashes, sin editar producción."""
import json,pathlib,re,runpy,urllib.error,urllib.parse
s=runpy.run_path('scripts/via-v291-prepare.py')
get=s['http_get']; digest=s['digest']; active=s['active_version']; source=s['source_asset_list']
sanitize=s['sanitize_html']
live='https://viatraslados.com/'
out=pathlib.Path('gps-precision-build'); assets=out/'assets'
current='49313136-3544-4e5c-a010-2efc201de6f1'
rollback='ec35bd52-b832-4cff-bcb2-6a6b84c34c79'
assert active()==current,"Prod Worker version changed: stop, re-audit before patch"
raw,_=get(live)
html=sanitize(raw).decode()
for anchor in ('app.js?v=29.1','store.js?v=19.1','reference.js?v=26','geo-v2/core.mjs?v=3'):
 assert anchor in html,'Live script missing '+anchor
names=set(source())
names.update(s['EXTRAS'])
for match in re.findall(r'(?:src|href)=["\x27]\./([^"\x27?#]+)',html):
 if not match.startswith(('https:','data:')):names.add(match)
for match in re.findall(r'(?:import\(|from\s+)["\x27]\./([^"\x27?#]+)',html):
 names.add(match)
names.update(['index.html','geo-v2/core.mjs','reference.js','address-autocomplete.js',
 'address-selected-preview.js','review-compact-v29.css','via-v291-home-account.js',
 'via-v291-home-account.css','mine-identity-v291.css','sw.js','config.js',
 'descargas/via-traslados-conductor-v35.apk'])
assets.mkdir(parents=True,exist_ok=True)
inventory={}
for name in sorted(names):
 if name=='index.html':buf=html.encode()
 else:
  try:buf,h=get(live+urllib.parse.quote(name,safe='/'))
  except urllib.error.HTTPError as e:
   if e.code==404 and name not in ('reference.js','config.js','app.js','store.js','sw.js','geo-v2/core.mjs','descargas/via-traslados-conductor-v35.apk'):
    continue
   raise
  if name.endswith(('.js','.mjs','.css')) and b'<!doctype html' in buf[:200].lower():
   raise AssertionError('Static resource returned HTML: '+name)
 dest=assets/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(buf)
 inventory[name]=digest(buf)
assert inventory['reference.js']=='a184e955c0d3d4f13c67f858093ae648cc54a60e218ecd6c6c84ab4d8b46868f'
assert inventory['geo-v2/core.mjs']=='17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1'
assert inventory['descargas/via-traslados-conductor-v35.apk']=='324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
assert inventory['config.js']=='51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273'
assert len(inventory)>=33, 'Asset inventory unexpectedly incomplete'
(out/'prod-manifest.json').write_text(json.dumps({'status':'PREVIEW_ONLY','before_web_worker_version':current,
 'rollback_web_worker_version':rollback,'assets':inventory},indent=2)+'\n')
# Preview separado; no se permite llamar a ninguna API real desde esta prueba.
worker="""export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/'))return new Response(JSON.stringify({error:'GPS laboratorio: API de reservas deshabilitada'}),{
 status:503,headers:{'Content-Type':'application/json'}});
 return env.ASSETS.fetch(request);
}};
"""
(out/'worker.mjs').write_text(worker)
cfg={'name':'via-traslados-gps-precision-qa','main':'worker.mjs',
 'compatibility_date':'2026-11-10','workers_dev':True,
 'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
(out/'wrangler.gps-qa.jsonc').write_text(json.dumps(cfg,indent=2))
# El banner QUEDA SOLO en QA y evita que un pasajero haga una reserva aquí.
homepage=assets/'index.html'
text=homepage.read_text()
assert text.count('<body')==1
banner='<div role="status" style="background:#004c43;color:white;text-align:center;padding:8px;font:600 12px Arial">GPS QA · PRUEBA DE PRECISIÓN · SIN RESERVAS REALES</div>'
text=re.sub(r'(<body[^>]*>)',lambda m:m.group(1)+banner,text,count=1)
homepage.write_text(text)
print('VIA_GPS_PROD_SOURCE_SNAPSHOT_OK '+json.dumps({'assets':len(inventory),'reference':inventory['reference.js'],
 'geo':inventory['geo-v2/core.mjs'],'production':current,'rollback':rollback}))
