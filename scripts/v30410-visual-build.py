import pathlib,runpy,json,re,concurrent.futures,urllib.parse,time,shutil
M=runpy.run_path('scripts/v302-route-cache-qa.py');P=M['P'];O=M['O']
BASE='b23d68ea-5aae-4827-b808-3c4c3504a959';API='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b'
OUT=pathlib.Path('v30410-visual');ASSETS=OUT/'assets'
def guard():
 assert M['version'](M['WEB'])==BASE and M['version'](M['API'])==API,'Production changed'
guard(); ASSETS.mkdir(parents=True,exist_ok=True)
url='https://'+BASE[:8]+'-via-traslados-web-prod.marcelof-gx.workers.dev'
names=sorted(set(O['source_asset_list']())|set(O['EXTRAS'])|P['NEEDED']|{'sw.js','manifest.webmanifest','via-v3049-state.js'})
def fetch(n):
 for i in range(4):
  try:
   b,h=P['get'](url+'/'+urllib.parse.quote(n,safe='/'))
   if n.endswith('.html'):b=O['sanitize_html'](b)
   if n.endswith(('.js','.mjs','.css')):assert 'text/html' not in h.get('Content-Type','')
   return n,b
  except Exception as e:
   if getattr(e,'code',0)==404 and n not in P['NEEDED'] and n!='via-v3049-state.js':return n,None
   if i==3:raise
   time.sleep(2*(i+1))
hashes={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for n,b in pool.map(fetch,names):
  if b is None:continue
  p=ASSETS/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);hashes[n]=P['sha'](b)
assert len(hashes)==40 and P['NEEDED'].issubset(hashes)
p=ASSETS/'index.html';s=p.read_text();assert s.count('</head>')==1 and 'via-visible-release' in s
p.write_text(s.replace('</head>','<script src="/via-visual-profile.js?v=30.4.10"></script><link rel="stylesheet" href="/via-visual-compat.css?v=30.4.10"></head>').replace('>V30.4.9</span>','>V30.4.10 QA</span>').replace('aria-label="Versión 30.4.9"','aria-label="Versión 30.4.10 QA"'))
for n in ['via-visual-profile.js','via-visual-compat.css']:shutil.copyfile('addons/'+n,ASSETS/n)
changed=[n for n,h in hashes.items() if P['sha']((ASSETS/n).read_bytes())!=h]
assert changed==['index.html'],changed
(OUT/'manifest.json').write_text(json.dumps({'base':BASE,'api':API,'source_assets':hashes,'changed':changed,'new':['via-visual-profile.js','via-visual-compat.css'],'qa_only':True},indent=2))
# Separate static preview, never routes requests to production or QA bookings.
preview=OUT/'preview';shutil.copytree(ASSETS,preview,dirs_exist_ok=True)
cfg=preview/'config.js';s=cfg.read_text();old='https://via-traslados-api.marcelof-gx.workers.dev';assert s.count(old)==1
cfg.write_text(s.replace(old,'https://via-traslados-v30410-visual-qa.marcelof-gx.workers.dev'))
sw=preview/'sw.js';s=sw.read_text();assert 'via-traslados-v30.4.9-session' in s
sw.write_text(s.replace('via-traslados-v30.4.9-session','via-traslados-v30.4.10-visual-qa'))
(OUT/'worker.mjs').write_text("export default {async fetch(r,env){const u=new URL(r.url);if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method))return Response.json({error:'Vista visual QA aislada; sin reservas'},{status:503});return env.ASSETS.fetch(r)}}")
(OUT/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-v30410-visual-qa','main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./preview','binding':'ASSETS','run_worker_first':True}}))
guard();print('VIA_VISUAL_CANDIDATE_READY 40 base assets; only index + independent visual layer; no production changes',flush=True)
