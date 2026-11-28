import runpy,pathlib,json,sys,time,os,urllib.request,urllib.error,subprocess
m=runpy.run_path('scripts/via-resilience-api-build.py'); P=m['P']; R=m['M']; H=m['H']
API='via-traslados-api'; WEB='via-traslados-web-prod'; DB='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'; BASE='116ce6d7-6047-4a8e-8972-3e3c1bae7dcb'; OUT=pathlib.Path('v37-profile')
version=R['version']; cf=R['cf']
def contract(v):return m['contract'](API,v)
def query(sql):
 url='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database/'+DB+'/query'
 req=urllib.request.Request(url,data=json.dumps({'sql':sql}).encode(),headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(req,timeout=30) as r:j=json.load(r)
 assert j['success'] and all(x['success'] for x in j['result']);return j['result']
def check(url,path,expected):
 req=urllib.request.Request(url+path,headers={'Cache-Control':'no-cache'})
 try:
  with urllib.request.urlopen(req,timeout=25) as r:status=r.status;data=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected)
 if path=='/api/health':assert data.get('ok') is True
 return data
def prepare():
 assert version(API)==BASE and P['latest_uploaded_version'](API)==BASE,'Active API changed or source ambiguous'
 b=contract(BASE); assert b['DB']['type']=='d1' and (b['DB'].get('id') or b['DB'].get('database_id'))==DB
 for name,fields in [('staff_users',{'id','role','status','email','display_name'}),('staff_sessions',{'token_hash','staff_id','expires_at','revoked_at'}),('driver_vehicle_profiles',{'staff_id','license_plate','make','model','passenger_capacity','luggage_capacity','updated_at'})]:
  assert fields.issubset({r['name'] for r in query('PRAGMA table_info('+name+')')[0]['results']}),name
 s=P['api_source']();assert 'viaPoiHandle' in s and '/api/health' in s and '/api/operator/requests' in s and '/api/staff/driver-profile' not in s
 s=m['split'](s,'__viaV37Active')
 s+="\nimport {driverIdentityRoutes as viaV37ProfileRoutes} from './backend/driver-identity.js';\n"
 s+="\nexport default {...__viaV37Active,async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path==='/api/staff/driver-profile'||path==='/api/admin/driver-profiles'||/^\\/api\\/admin\\/driver-profiles\\/[a-f0-9-]{36}$/i.test(path)){const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});if(request.headers.get('Origin'))return send({error:'Origen no autorizado'},403);try{return await viaV37ProfileRoutes(request,{...env,VIA_DRIVER_IDENTITY_ENABLED:'true'},path,send,(error,status=400)=>send({error},status))}catch(e){return send({error:'No se pudo completar la operación'},500)}}return __viaV37Active.fetch.call(__viaV37Active,request,env,ctx)}};\n"
 (OUT/'api.mjs').write_text(s);subprocess.run(['node','--check',str(OUT/'api.mjs')],check=True)
 rt=m['meta'](API,BASE)['resources']['script_runtime'];cfg={'name':API,'main':'./api.mjs','compatibility_date':rt['compatibility_date'],'compatibility_flags':rt.get('compatibility_flags') or [],'workers_dev':True,'keep_vars':True,'d1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':DB}]}
 (OUT/'wrangler.jsonc').write_text(json.dumps(cfg));(OUT/'baseline.json').write_text(json.dumps({'api':BASE,'web':version(WEB)}))
 assert version(API)==BASE
 print('V37 exact active API source prepared; no production data modified',flush=True)
def promote(target,expected):
 assert version(API)==expected,'Concurrent API deployment'
 cf(API,'/deployments',{'strategy':'percentage','versions':[{'version_id':target,'percentage':100}],'annotations':{'workers/message':'V37 profile release or rollback'}})
 for _ in range(15):
  if version(API)==target:return
  time.sleep(2)
 raise AssertionError('API activation not confirmed')
def activate():
 assert version(API)==BASE
 candidate=P['latest_uploaded_version'](API);assert candidate!=BASE and contract(candidate)==contract(BASE),'Binding contract changed'
 assert all(m['meta'](API,candidate)['resources']['script_runtime'].get(k)==m['meta'](API,BASE)['resources']['script_runtime'].get(k) for k in ['compatibility_date','compatibility_flags'])
 preview='https://'+candidate[:8]+'-via-traslados-api.marcelof-gx.workers.dev'
 for path,status in [('/api/health',200),('/api/staff/driver-profile',401),('/api/admin/driver-profiles',401),('/api/operator/requests',401)]:check(preview,path,status)
 # Only additive tables; no production reservations, staff rows or profiles written.
 for n in ['007_driver_identity_profiles.sql','008_driver_vehicle_prefill.sql','009_driver_review_history.sql']:
  sql=(OUT/'backend/migrations'/n).read_text()
  assert 'qa_profile_pair' not in sql
  for stmt in sql.split(';'):
   stmt='\n'.join(l for l in stmt.splitlines() if not l.strip().startswith('--')).strip()
   if stmt:
    assert stmt.upper().startswith(('CREATE TABLE IF NOT EXISTS','CREATE INDEX IF NOT EXISTS'))
    query(stmt)
 assert version(WEB)==json.loads((OUT/'baseline.json').read_text())['web']
 (OUT/'activated.json').write_text(json.dumps({'candidate':candidate,'previous':BASE}))
 promote(candidate,BASE)
 live='https://via-traslados-api.marcelof-gx.workers.dev'
 for path,status in [('/api/health',200),('/api/staff/driver-profile',401),('/api/admin/driver-profiles',401),('/api/operator/requests',401)]:check(live,path,status)
 print('V37 production API active '+candidate+' rollback '+BASE,flush=True)
def rollback():
 r=json.loads((OUT/'activated.json').read_text());current=version(API)
 if current==r['candidate']:promote(r['previous'],current)
 else:assert current==r['previous'],'Concurrent change; no rollback'
 print('V37 API rollback confirmed',flush=True)
{'prepare':prepare,'activate':activate,'rollback':rollback}[sys.argv[1]]()
