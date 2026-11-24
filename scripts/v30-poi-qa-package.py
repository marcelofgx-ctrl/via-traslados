#!/usr/bin/env python3
"""V30 Geoapify POI: build QA-only from EFFECTIVE live prod source/assets.
Never deploys, reads/writes no D1, never reads existing secret values.
All API except /api/direcciones is blocked in QA. No production API config.
"""
import concurrent.futures,hashlib,json,os,pathlib,re,runpy,subprocess,urllib.error,urllib.parse
old=runpy.run_path('scripts/via-v291-prepare.py')
get=old['http_get'];live_version=old['active_version']
source=old['get_live_worker_source'];assets_list=old['source_asset_list'];extra=old['EXTRAS']
BASE='ac8e0a7e-a032-47f8-8328-bd7b716a4342'
WEB='https://viatraslados.com'
STAGE='via-traslados-v30-poi-stage-20261124'
STAGE_URL='https://'+STAGE+'.marcelof-gx.workers.dev'
OUT=pathlib.Path('v30-poi-qa-build');ASSETS=OUT/'assets'
CRITICAL={'index.html','app.js','store.js','config.js','address-autocomplete.js',
          'reference.js','geo-v2/core.mjs','passkeys.js','map-point-picker.js','mis-reservas.html'}
prod_api='https://via-traslados-api.marcelof-gx.workers.dev'
def sha(b):return hashlib.sha256(b).hexdigest()
def needed():
    listed=set(assets_list())|set(extra)|CRITICAL|{'sw.js','manifest.webmanifest'}
    return sorted(x for x in listed if x and not x.startswith('/') and '..' not in pathlib.PurePosixPath(x).parts)
def read(name):
    try:
        buf,headers=get(WEB+'/'+urllib.parse.quote(name,safe='/'))
    except urllib.error.HTTPError as e:
        if e.code==404 and name not in CRITICAL:return name,None
        raise
    if name.endswith(('.js','.mjs','.css')) and 'text/html' in headers.get('Content-Type','').lower():
        raise AssertionError('Asset inesperado '+name)
    if name.endswith('.html'):buf=old['sanitize_html'](buf)
    return name,buf
def build():
    assert live_version()==BASE,'PRODUCCIÓN CAMBIÓ: detener QA antes de crear artefactos'
    OUT.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
    rows={};names=needed()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for name,buf in pool.map(read,names):
            if buf is None:continue
            (ASSETS/name).parent.mkdir(parents=True,exist_ok=True)
            (ASSETS/name).write_bytes(buf)
            rows[name]=sha(buf)
    assert CRITICAL.issubset(rows.keys()),'Faltan assets V30 críticos'
    print('VIA_POI_QA_ASSET_INVENTORY '+json.dumps({
      'requested':len(names),'fetched':len(rows),'missingOptional':len(names)-len(rows)}),flush=True)
    assert len(rows)>=32,'Inventario insuficiente: no desplegar'
    assert b'v30.0' in (ASSETS/'index.html').read_bytes().lower(),'No es V30.0'
    original=(ASSETS/'address-autocomplete.js').read_text()
    assert 'mode=places' in original and 'const isPlaceQuery=' in original,'Contrato frontend cambió'
    p=subprocess.run(['node','scripts/v30-poi-frontend-patch.mjs',
       str(ASSETS/'address-autocomplete.js'),str(OUT/'address-autocomplete-qa.js')],
       capture_output=True,text=True,timeout=22)
    assert p.returncode==0,'No se pudo crear parche QA '+p.stderr[-260:]
    (ASSETS/'address-autocomplete.js').write_bytes((OUT/'address-autocomplete-qa.js').read_bytes())
    config=(ASSETS/'config.js').read_text()
    assert config.count(prod_api)==1,'Configuración V30 inesperada; no arriesgar conexión API prod'
    config=config.replace(prod_api,STAGE_URL)
    (ASSETS/'config.js').write_text(config)
    html=(ASSETS/'index.html').read_text()
    assert html.lower().count('</body>')==1,'Index HTML inesperado'
    qa_notice=('<aside id="via-poi-qa-safety-banner" role="status" '
      'style="position:fixed;z-index:2147483647;bottom:0;left:0;right:0;'
      'background:#263f3b;color:#fff;padding:8px 12px;font:600 12px sans-serif;text-align:center">'
      'V30 QA GEOAPIFY · NO REALIZA RESERVAS · DATOS DE PRUEBA</aside>')
    html=re.sub(r'</body>',qa_notice+'</body>',html,count=1,flags=re.I)
    (ASSETS/'index.html').write_text(html)
    actual=source()
    (OUT/'worker-live.mjs').write_text(actual)
    p=subprocess.run(['node','scripts/v30-geoapify-integration.mjs',
       str(OUT/'worker-live.mjs'),str(OUT/'worker-pre-qa.mjs')],
       capture_output=True,text=True,timeout=28)
    assert p.returncode==0,'Integración Worker V30 no aplicable '+p.stderr[-260:]
    js=(OUT/'worker-pre-qa.mjs').read_text()
    exact='const original=await __viaLegacyWorker.fetch(request,env,ctx);'
    assert js.count(exact)==1,'No se pudo proteger API QA'
    replacement=('const pathname=new URL(request.url).pathname;'
      'if(pathname.startsWith("/api/")&&pathname!=="/api/direcciones")'
      'return new Response(JSON.stringify({error:"QA aislada: ninguna API de reservas disponible"}),'
      '{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});'
      +exact)
    js=js.replace(exact,replacement)
    (OUT/'worker-qa.mjs').write_text(js)
    p=subprocess.run(['node','--check',str(OUT/'worker-qa.mjs')],capture_output=True,text=True,timeout=22)
    assert p.returncode==0,'Worker no compila '+p.stderr[-260:]
    changed=[x for x in rows if sha((ASSETS/x).read_bytes())!=rows[x]]
    assert set(changed)=={'index.html','config.js','address-autocomplete.js'},'Assets inesperadamente alterados: '+str(changed)
    cfg={'name':STAGE,'main':'./worker-qa.mjs','compatibility_date':'2026-11-10',
       'workers_dev':True,'keep_vars':True,
       'vars':{'VIA_PLACES_ENABLED':'false'},
       'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}
    (OUT/'wrangler.qa.jsonc').write_text(json.dumps(cfg,indent=2))
    manifest={'production_worker_before':BASE,'public_source':WEB,
       'stage':STAGE_URL,'source_count':len(rows),
       'sha256_sources':rows,'changed_assets':sorted(changed),
       'prod_write':False,'d1_write':False,'secret_read':False,
       'places_flag':'false','api_except_directions':'blocked','worker_sha256':sha(js.encode())}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    (OUT/'worker-live.mjs').unlink()
    (OUT/'worker-pre-qa.mjs').unlink()
    assert live_version()==BASE,'PRODUCCIÓN CAMBIÓ durante construcción: abortar'
    print('VIA_POI_ISOLATED_QA_BUILT '+json.dumps({
      'prod_source':BASE,'assets':len(rows),'changed':sorted(changed),
      'no_prod_api':True,'qa_url':STAGE_URL,'key':'NOT_READ_OR_COPIED'}),flush=True)
if __name__=='__main__':build()
