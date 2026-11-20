#!/usr/bin/env python3
"""V29.1.3: copiar bytes reales del Worker web a QA, detenerse si Cloudflare cambia."""
import json, pathlib, re, runpy, urllib.error, urllib.parse
s = runpy.run_path('scripts/via-v291-prepare.py')
get, digest, active = s['http_get'], s['digest'], s['active_version']
base = 'https://viatraslados.com/'
out = pathlib.Path('gps-v2913-build')
assets = out / 'assets'
EXPECTED_WEB = 'f2575cba-3454-4181-b985-5c627a301384'
EXPECTED_REF = '0d406c29b3339e3f18a3c0fdc2155ca4cd2015e72b93e4ad8d28cc44c70ba0a5'
EXPECTED_GEO = '17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1'
EXPECTED_CONFIG = '51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273'
EXPECTED_APK = '324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'
assert active() == EXPECTED_WEB, 'Web productiva cambió: DETENER, reauditar'
raw, _ = get(base)
html = s['sanitize_html'](raw).decode()
for anchor in ('app.js?v=29.1', 'store.js?v=19.1',
               'reference.js?v=28', 'geo-v2/core.mjs?v=3', 'content="29.1.2"'):
    assert anchor in html, 'HTML productivo no coincide: ' + anchor
names = set(s['source_asset_list']())
names.update(s['EXTRAS'])
for match in re.findall(r'(?:src|href)=["\x27]\./([^"\x27?#]+)', html):
    names.add(match)
for match in re.findall(r'(?:import\(|from\s+)["\x27]\./([^"\x27?#]+)', html):
    names.add(match)
names.update(['index.html', 'geo-v2/core.mjs', 'reference.js', 'config.js',
              'descargas/via-traslados-conductor-v35.apk', 'sw.js',
              'map-point-picker.js', 'address-autocomplete.js'])
assets.mkdir(parents=True, exist_ok=True)
inventory = {}
for name in sorted(names):
    if name == 'index.html':
        buf = html.encode()
    else:
        try:
            buf, _ = get(base + urllib.parse.quote(name, safe='/'))
        except urllib.error.HTTPError as e:
            if e.code == 404 and name not in (
                'reference.js', 'app.js', 'store.js', 'config.js', 'sw.js',
                'geo-v2/core.mjs', 'map-point-picker.js',
                'descargas/via-traslados-conductor-v35.apk'):
                continue
            raise
        if name.endswith(('.js', '.mjs', '.css')) and b'<!doctype html' in buf[:200].lower():
            raise AssertionError('Se recibió HTML en vez del recurso: ' + name)
    dest = assets / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(buf)
    inventory[name] = digest(buf)
assert len(inventory) >= 33, 'Inventario incompleto'
for item, expected in [('reference.js', EXPECTED_REF),
                       ('geo-v2/core.mjs', EXPECTED_GEO),
                       ('config.js', EXPECTED_CONFIG),
                       ('descargas/via-traslados-conductor-v35.apk', EXPECTED_APK)]:
    assert inventory[item] == expected, 'Hash productivo cambió: ' + item
(out / 'manifest.json').write_text(json.dumps({
    'stage': 'QA', 'baseline_web_version': EXPECTED_WEB,
    'rollback_web_version': EXPECTED_WEB,
    'assets_before': inventory, 'version': '29.1.3'
}, indent=2) + '\n')
# QA nunca proxy a /api productiva. Se reemplaza config.js en el build QA
# por un origen aislado y el Worker responde 503 a cualquier ruta /api/*.
(out / 'worker.mjs').write_text(
    "export default {async fetch(req,env){"
    "if(new URL(req.url).pathname.startsWith('/api/'))"
    "return new Response('GPS QA: reservas deshabilitadas',{status:503});"
    "return env.ASSETS.fetch(req)}};\n"
)
(out / 'wrangler.qa.jsonc').write_text(json.dumps({
    'name': 'via-traslados-gps-precision-qa',
    'main': 'worker.mjs', 'compatibility_date': '2026-11-10',
    'workers_dev': True,
    'assets': {'directory': './assets', 'binding': 'ASSETS',
               'run_worker_first': ['/api/*']}
}, indent=2) + '\n')
# Banner solo QA. Se remueve antes de construir un futuro paquete de producción.
banner = ('<div role="status" id="via-gps-qa-banner" '
          'style="background:#004c43;color:white;text-align:center;padding:8px;'
          'font:600 12px Arial">GPS QA · V29.1.3 · SIN RESERVAS REALES</div>')
homepage = assets / 'index.html'
source = homepage.read_text()
assert source.count('<body') == 1
source = re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + banner, source, count=1)
homepage.write_text(source)
print('VIA_GPS_V2912_SOURCE_SNAPSHOT_OK ' +
      json.dumps({'baseline': EXPECTED_WEB, 'files': len(inventory),
                  'reference': inventory['reference.js'],
                  'geo': inventory['geo-v2/core.mjs']}))
