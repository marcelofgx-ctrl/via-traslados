#!/usr/bin/env python3
"""Prepare one API version-only experiment from known previous candidate, NEVER deploy.
Reads only currently uploaded API code; requires active production stays pinned.
No API keys, source scripts, D1 data or personal info printed.
"""
import hashlib,json,os,pathlib,re,urllib.request,sys
ACCOUNT=os.environ['CLOUDFLARE_ACCOUNT_ID']
TOKEN=os.environ['CLOUDFLARE_API_TOKEN']
ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/via-traslados-api'
PRODUCTION='9349f01a-5824-4401-848f-edb4f3f7d5b0'
CANDIDATE='39d2d942-1597-4bdc-9c17-76acf2b1a025'
D1='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
OUT=pathlib.Path('v30-poi-version-only')
def fetch(path,accept=None):
  headers={'Authorization':'Bearer '+TOKEN}
  if accept:headers['Accept']=accept
  req=urllib.request.Request(ROOT+path,headers=headers)
  with urllib.request.urlopen(req,timeout=25) as r:return r.read(),r.headers.get('Content-Type','')
def assert_source():
  raw,_=fetch('/deployments','application/json')
  j=json.loads(raw)
  vs=j['result']['deployments'][0]['versions']
  assert j.get('success') and len(vs)==1 and vs[0]['version_id']==PRODUCTION and vs[0]['percentage']==100, 'Production API is not pinned; stop'
  raw,_=fetch('/versions?per_page=1','application/json')
  j=json.loads(raw)
  xs=j['result']['items'] if isinstance(j['result'],dict) else j['result']
  assert j.get('success') and xs and xs[0]['id']==CANDIDATE, 'Unexpected latest uploaded API version; stop'
def get_js():
  body,mime=fetch('')
  if 'multipart/' not in mime.lower():raise AssertionError('Expected Cloudflare multi-part; stop')
  m=re.search(r'boundary="?([^";]+)',mime)
  assert m,'multipart boundary missing'
  chosen=[]
  inventory=[]
  for part in body.split(b'--'+m.group(1).encode()):
    if b'Content-Disposition' not in part or b'\r\n\r\n' not in part:continue
    head,code=part.split(b'\r\n\r\n',1)
    name=re.search(rb'name="([^"]+)"',head)
    kind=name.group(1).decode('ascii','replace') if name else 'unknown'
    if kind.endswith('.map') or kind.endswith('.json'):continue
    inventory.append({'name':kind,'bytes':len(code)})
    if b'/api/health' in code and b'viaPoiHandle' in code and b'__viaActiveApiWorker' in code:
      chosen.append(code.rstrip(b'\r\n').decode('utf8'))
  assert len(chosen)==1, 'No unique effective POI module; parts='+json.dumps(inventory)
  return chosen[0]
def change_once(txt,old,new):
  assert txt.count(old)==1, 'Unexpected live addon signature; stop'
  return txt.replace(old,new,1)
def build():
  assert_source()
  old=get_js()
  assert '/api/health' in old and 'viaPoiHandle' in old and '__viaActiveApiWorker' in old, 'No previously rolled-back POI candidate; stop'
  assert old.count('async function viaPoiRemote(')==1
  new=old
  # IMPORTANT: diagnostic only; permit Geoapify to rank by user's proximity.
  # Server-side normalization still rejects other countries and invalid coordinates.
  new=change_once(new,
    " url.searchParams.set('filter','rect:-58.6,-35.25,-53.1,-30.05');",
    " // QA version only: provider proximity ranking without rectangle, to test empty Places response.")
  new=change_once(new,
    " url.searchParams.set('name',q);",
    r""" url.searchParams.set('name',q.replace(/\bmc[\s-]*donald'?s\b/gi,"McDonald's"));""")
  oldReturn=" return viaPoiJson({features:body.features.map(viaPoiNormalize).filter(Boolean).slice(0,12)});"
  newReturn=""" const kept=body.features.map(viaPoiNormalize).filter(Boolean).slice(0,12);
 const named=body.features.filter(f=>String(f?.properties?.name||'').trim()).length;
 const uy=body.features.filter(f=>String(f?.properties?.country_code||f?.properties?.country_code_iso2||'').toLowerCase()==='uy').length;
 return new Response(JSON.stringify({features:kept}),{status:200,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Via-Poi-Raw':String(body.features.length),
  'X-Via-Poi-Named':String(named),
  'X-Via-Poi-Uy':String(uy),
  'X-Via-Poi-Accepted':String(kept.length)
 }});"""
  new=change_once(new,oldReturn,newReturn)
  assert new.count('__viaActiveApiWorker')>=1 and new.count('async function viaPoiHandle(')==1
  assert new.count('/api/public/route-preview')>=1
  OUT.mkdir(exist_ok=True)
  (OUT/'worker.mjs').write_text(new)
  config={'name':'via-traslados-api','main':'./worker.mjs','compatibility_date':'2026-11-10',
    'workers_dev':True,'keep_vars':True,
    'd1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':D1}]}
  (OUT/'wrangler.api.jsonc').write_text(json.dumps(config,indent=2))
  assert_source()
  print('VIA_POI_VERSION_ONLY_READY '+json.dumps({'baseLatest':CANDIDATE,
    'liveVersionPreserved':PRODUCTION,'newBytes':len(new),'patches':3,
    'sourceKept':True,'noBookingWrites':True,'noProductionDeploy':True}),flush=True)
if __name__=='__main__':build()
