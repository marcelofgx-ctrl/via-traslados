#!/usr/bin/env python3
"""Build diagnostics ONLY, using the uploaded (not deployed) POI preview API.
No production traffic changes, no secrets copied or logged.
"""
import json,os,re,pathlib,urllib.request
ACCOUNT=os.environ['CLOUDFLARE_ACCOUNT_ID'];TOKEN=os.environ['CLOUDFLARE_API_TOKEN']
ROOT=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/via-traslados-api'
ACTIVE='9349f01a-5824-4401-848f-edb4f3f7d5b0'
SOURCE='5ee67d4a-a4c2-4b0a-9638-b9526e2870ae'
D1='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
OUT=pathlib.Path('v30-poi-category-probe')
def get(suffix):
  req=urllib.request.Request(ROOT+suffix,headers={'Authorization':'Bearer '+TOKEN})
  with urllib.request.urlopen(req,timeout=25) as r:return r.read(),r.headers.get('Content-Type','')
def verify():
  j=json.loads(get('/deployments')[0])
  v=j['result']['deployments'][0]['versions']
  assert len(v)==1 and v[0]['version_id']==ACTIVE and float(v[0]['percentage'])==100,'Production version unexpected; do not proceed'
  j=json.loads(get('/versions?per_page=1')[0])
  items=j['result']['items'] if isinstance(j['result'],dict) else j['result']
  assert items[0]['id']==SOURCE,'Last uploaded version unexpected; do not proceed'
def source():
  raw,mime=get('')
  assert 'multipart/' in mime.lower()
  b=re.search(r'boundary="?([^";]+)',mime)
  assert b
  matches=[]
  for part in raw.split(b'--'+b.group(1).encode()):
    if b'\r\n\r\n' not in part or b'Content-Disposition' not in part:continue
    head,body=part.split(b'\r\n\r\n',1)
    if b'.map' in head or b'.json' in head:continue
    if b'viaPoiHandle' in body and b'/api/health' in body and b'__viaActiveApiWorker' in body:
      matches.append(body.rstrip(b'\r\n').decode('utf8'))
  assert len(matches)==1,'No unique preview executable script'
  return matches[0]
def build():
  verify()
  old=source()
  a=old.index('async function viaPoiRemote(')
  b=old.index('async function viaPoiHandle(',a)
  section=old[a:b]
  regex=r'(?m)^  url\.searchParams\.set\("name",.*\);\s*$'
  assert len(re.findall(regex,section))==1, 'Name setter changed; do not patch'
  replacement='''
  if (q === "ViaAllDiagnostic") {
    url.searchParams.delete("name");
  } else if (q === "ViaCategoryDiagnostic") {
    url.searchParams.delete("name");
    url.searchParams.set("categories","catering.restaurant");
    url.searchParams.set("filter","circle:-56.17,-34.90,15000");
  } else {
    url.searchParams.set("name", q.replace(/\\bmc[\\s-]*donald'?s\\b/gi, "McDonald's"));
  }
'''
  section=re.sub(regex,lambda _:replacement,section,count=1)
  new=old[:a]+section+old[b:]
  assert new.count('ViaCategoryDiagnostic')==1 and new.count('ViaAllDiagnostic')==1
  assert new.count('async function viaPoiRemote(')==1
  assert new.count('async function viaPoiHandle(')==1
  assert new.count('__viaActiveApiWorker')>=1
  OUT.mkdir(exist_ok=True)
  (OUT/'worker.mjs').write_text(new)
  cfg={'name':'via-traslados-api','main':'./worker.mjs','compatibility_date':'2026-11-10',
    'workers_dev':True,'keep_vars':True,
    'd1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':D1}]}
  (OUT/'wrangler.jsonc').write_text(json.dumps(cfg,indent=2))
  verify()
  print('VIA_POI_CATEGORY_DIAGNOSTIC_PACKAGED '+json.dumps({'source':SOURCE,'active':ACTIVE,'requests':'category-only and named','noDeployment':True}),flush=True)
if __name__=='__main__':build()
