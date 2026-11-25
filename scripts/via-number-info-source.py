import urllib.request,re,subprocess,concurrent.futures
url='https://9e2dac8c-via-traslados-web-prod.marcelof-gx.workers.dev'
paths=[p.removeprefix('pages/') for p in subprocess.check_output(['git','ls-tree','-r','--name-only','4ee78e500a773afb702e50092dcba15b52457492','pages/'],text=True).splitlines() if p.endswith(('.js','.mjs','.html','.css')) and not '/_' in p]
paths+=['flow-premium.js','flow-premium.css','via-refinement.css']
def get(p):
 try:
  with urllib.request.urlopen(urllib.request.Request(url+'/'+p,headers={'User-Agent':'ViaTrasladosV35SignedRelease','Cache-Control':'no-cache','Accept-Encoding':'identity'}),timeout=35) as r:s=r.read().decode()
  for m in re.finditer(r'Número orientativo|número cercano|Ajustar en el mapa|Mejorando precisión',s,re.I):
   print('VIA_NOTICE_SOURCE '+p+' '+s[max(0,m.start()-650):m.end()+900].replace('\n',' '),flush=True)
 except Exception as e:print('VIA_NOTICE_FETCH '+p+' '+str(e),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(get,paths))
