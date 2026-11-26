import runpy,pathlib,json,concurrent.futures,urllib.parse,re,subprocess
M=runpy.run_path('scripts/via-resilience-api-build.py');P=M['P'];H=M['H'];R=M['M']
W='25a28e6e-73e0-4fcd-8c52-1489ede9f7e4';A='116ce6d7-6047-4a8e-8972-3e3c1bae7dcb'
out=pathlib.Path('home-return-qa');assets=out/'assets'
r=json.loads(pathlib.Path('via-resilience/web-candidate.json').read_text());assert r['candidate']==W and len(r['hashes'])==44
def guard():assert R['version'](M['WEB'])==W and R['version'](M['API'])==A
guard()
def copy(n):
 b,_=P['get']('https://viatraslados.com/'+urllib.parse.quote(n,safe='/'))
 if n.endswith('.html'):
  y,_=P['get'](r['preview']+'/'+urllib.parse.quote(n,safe='/'))
  assert H['html_tokens'](b)==H['html_tokens'](y),n
  b=R['O']['sanitize_html'](b)
 else:assert P['sha'](b)==r['hashes'][n],n
 p=assets/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(copy,r['hashes']))
p=assets/'app.js';s=p.read_text()
old="hero.scrollIntoView({block:'start',behavior:'smooth'});"
assert s.count(old)==1,'Active return anchor differs'
new="""// Home is a single viewport. Do not align the hero below the header.
   if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
   const resetHomePosition=()=>{
    if(document.body.classList.contains('in-booking')||hero.classList.contains('hidden'))return;
    window.scrollTo({top:0,left:0,behavior:'instant'});
    if(document.scrollingElement)document.scrollingElement.scrollTop=0;
   };
   resetHomePosition();
   requestAnimationFrame(()=>{resetHomePosition();requestAnimationFrame(resetHomePosition)});"""
p.write_text(s.replace(old,new));subprocess.run(['node','--check',str(p)],check=True)
p=assets/'index.html';s=p.read_text();assert 'V30.4.10.24' in s
s=s.replace('30.4.10.24','30.4.10.25').replace('>V30.4.10.25</span>','>V30.4.10.25 QA</span>')
s=re.sub(r'app\.js\?v=[^"\x27\s<>]+','app.js?v=30.4.10.25',s);p.write_text(s)
p=assets/'sw.js';s=p.read_text();assert '30.4.10.24' in s;p.write_text(s.replace('30.4.10.24-prod','30.4.10.25-home-qa'))
p=assets/'config.js';s=p.read_text();assert s.count('https://via-traslados-api.marcelof-gx.workers.dev')==1
p.write_text(s.replace('https://via-traslados-api.marcelof-gx.workers.dev','https://via-traslados-home-return-qa.marcelof-gx.workers.dev'))
(out/'worker.mjs').write_text("""export default {async fetch(r,env){const u=new URL(r.url);if(u.pathname==='/api/health'&&r.method==='GET')return Response.json({ok:true,environment:'home-return-qa'});if(u.pathname==='/api/direcciones'&&r.method==='GET'){try{return await fetch(new URL(u.pathname+u.search,'https://viatraslados.com'),{signal:AbortSignal.timeout(12000)})}catch{return Response.json({error:'Buscador no disponible',results:[]},{status:503})}}if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method))return Response.json({error:'QA sin reservas'},{status:503});return env.ASSETS.fetch(r)}};""")
(out/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-home-return-qa','main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}))
guard();print('VIA_HOME_RETURN_QA_READY')
