import pathlib,json,hashlib,shutil
src=pathlib.Path('v30410-visual/assets');out=pathlib.Path('wait-compact-qa');assets=out/'assets'
expected=json.loads(pathlib.Path('v30410-visual/exact-hashes.json').read_text())
assert len(expected)==44
for n,h in expected.items():assert hashlib.sha256((src/n).read_bytes()).hexdigest()==h,n
shutil.copytree(src,assets,dirs_exist_ok=True)
p=assets/'via-gps-premium.css';p.write_text(p.read_text()+pathlib.Path('addons/via-wait-contrast.css').read_text())
p=assets/'index.html';s=p.read_text();assert s.count('>V30.4.10.20</span>')==1
s=s.replace('30.4.10.20','30.4.10.22').replace('>V30.4.10.22</span>','>V30.4.10.22 QA</span>');p.write_text(s)
p=assets/'config.js';s=p.read_text();assert s.count('https://via-traslados-api.marcelof-gx.workers.dev')==1
p.write_text(s.replace('https://via-traslados-api.marcelof-gx.workers.dev','https://via-traslados-wait-compact-qa.marcelof-gx.workers.dev'))
p=assets/'sw.js';s=p.read_text();assert '30.4.10.20-prod' in s;p.write_text(s.replace('30.4.10.20-prod','30.4.10.22-wait-qa'))
changed=[n for n,h in expected.items() if hashlib.sha256((assets/n).read_bytes()).hexdigest()!=h]
assert set(changed)=={'via-gps-premium.css','index.html','config.js','sw.js'},changed
(out/'worker.mjs').write_text("""export default {async fetch(r,env){const u=new URL(r.url);if(u.pathname==='/api/health'&&r.method==='GET')return Response.json({ok:true,environment:'wait-compact-qa',reservations:false});if(u.pathname==='/api/direcciones'&&r.method==='GET'){try{return await fetch(new URL(u.pathname+u.search,'https://viatraslados.com'),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)})}catch{return Response.json({error:'Buscador no disponible',results:[]},{status:503})}}if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method))return Response.json({error:'QA sin reservas'},{status:503});return env.ASSETS.fetch(r)}};""")
(out/'wrangler.jsonc').write_text(json.dumps({'name':'via-traslados-wait-compact-qa','main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,'assets':{'directory':'./assets','binding':'ASSETS','run_worker_first':['/api/*']}}))
print('VIA_WAIT_COMPACT_QA_READY '+str(changed))
