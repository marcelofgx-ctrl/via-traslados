#!/usr/bin/env python3
"""V29.1.6: promotion of already tested mine patch. Fail closed, Cloudflare rollback."""
import runpy,pathlib,json,hashlib,subprocess,time,urllib.parse
s=runpy.run_path('scripts/via-v291-prepare.py')
root=pathlib.Path('mine-v2916-build');assets=root/'assets'
get=s['http_get']; digest=s['digest']; active=s['active_version']
LIVE='https://viatraslados.com'
BASE='d3561c58-fedf-4273-9b21-e07de026308d'
def prepare():
 manifest=json.loads((root/'manifest.json').read_text())
 assert manifest['baseline_web_version']==BASE and active()==BASE
 assert digest((assets/'geo-v2/core.mjs').read_bytes())==manifest['assets_before']['geo-v2/core.mjs']
 assert digest((assets/'store.js').read_bytes())==manifest['assets_before']['store.js']
 assert digest((assets/'config.js').read_bytes())==manifest['assets_before']['config.js']
 changed=sorted(k for k,v in manifest['assets_before'].items() if digest((assets/k).read_bytes())!=v)
 assert changed==['app.js','mis-reservas.html'],changed
 assert (assets/'mine-identity-v291.css').is_file()
 home=(assets/'index.html').read_text()
 assert 'content="29.1.5"' in home and 'via-release-indicator' not in home
 assert home.count('</footer>')==1
 home=home.replace('</footer>','<small id="via-release-indicator" aria-label="Versión de la aplicación" style="display:inline-block;margin-left:9px;font:500 10px/1.4 system-ui,sans-serif;letter-spacing:.025em;opacity:.55;white-space:nowrap">v29.1.6</small></footer>',1)
 home=home.replace('content="29.1.5"','content="29.1.6"',1)
 (assets/'index.html').write_text(home)
 # Do not ship QA's API-blocking worker or test config to production.
 (root/'worker.mjs').write_text((root/'production-worker.mjs').read_text())
 for name,worker in [('wrangler.stage.jsonc','via-traslados-mine-v2916-stage'),('wrangler.prod.jsonc','via-traslados-web-prod')]:
  (root/name).write_text(json.dumps({'name':worker,'main':'worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'keep_vars':True,'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}},indent=2))
 (root/'rollback-version.txt').write_text(BASE)
 (root/'release-manifest.json').write_text(json.dumps({'baseline':BASE,'modified':changed+['index.html'],'new':['mine-identity-v291.css'],'original':manifest['assets_before']},indent=2))
 print('PRODUCTION_CANDIDATE_READY',changed,flush=True)
def smoke(url):
 for name,needle in [('index.html',b'via-release-indicator'),('mis-reservas.html',b'app.js?v=29.3'),('mine-identity-v291.css',b'#mine-welcome.hidden')]:
  raw,_=get(url+'/'+name)
  if needle not in raw:raise AssertionError('Missing '+name)
 for name in ('app.js','store.js','geo-v2/core.mjs','config.js','descargas/via-traslados-conductor-v35.apk'):
  raw,_=get(url+'/'+name)
  if digest(raw)!=digest((assets/name).read_bytes()):raise AssertionError('Asset mismatch '+name)
 print('SMOKE_OK',url,flush=True)
def stage():
 url='https://via-traslados-mine-v2916-stage.marcelof-gx.workers.dev'
 for i in range(20):
  try:smoke(url);return
  except Exception as e:
   print('STAGE_WAIT',i,str(e)[:120],flush=True);time.sleep(5)
 raise AssertionError('Stage failed; production unchanged')
def release():
 old=(root/'rollback-version.txt').read_text().strip()
 assert old==BASE and active()==old,'Production changed, abort'
 manifest=json.loads((root/'release-manifest.json').read_text())
 for name,sha in manifest['original'].items():
  raw,_=get(LIVE+'/'+urllib.parse.quote(name,safe='/'))
  if name.endswith('.html'):raw=s['sanitize_html'](raw)
  if digest(raw)!=sha:raise AssertionError('Production changed: '+name)
 changed=False
 try:
  p=subprocess.run(['npx','--yes','wrangler@4.160.1','deploy','--config',str(root/'wrangler.prod.jsonc'),'--keep-vars'],capture_output=True,text=True,timeout=300)
  if p.returncode:raise RuntimeError('Wrangler failed: '+p.stderr[-600:])
  changed=True
  for i in range(20):
   try:
    smoke(LIVE)
    if active()==old:raise AssertionError('Old version active')
    print('V2916_PROD_RELEASE_VERIFIED',active(),flush=True);return
   except Exception as e:print('PROD_WAIT',i,str(e)[:120],flush=True);time.sleep(5)
  raise AssertionError('Production smoke failed')
 except Exception:
  if changed or active()!=old:
   s['cf']('/deployments',{'strategy':'percentage','versions':[{'percentage':100,'version_id':old}],'annotations':{'workers/message':'Rollback V29.1.6 failed smoke'}})
   assert active()==old,'Rollback not confirmed'
   print('ROLLBACK_CONFIRMED',old,flush=True)
  raise
if __name__=='__main__':
 import sys
 {'prepare':prepare,'stage':stage,'release':release}[sys.argv[1]]()
