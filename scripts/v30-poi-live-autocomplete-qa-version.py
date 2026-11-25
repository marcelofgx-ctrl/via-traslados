#!/usr/bin/env python3
"""Create QA-only uploaded Cloudflare API version with proven Geoapify Autocomplete.
Never deploy traffic. Reuses secret in API via Wrangler keep-vars.
The active API version and original booking internals must stay untouched.
"""
import json,os,re,hashlib,pathlib,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN']
ROOT=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/via-traslados-api'
ACTIVE='9349f01a-5824-4401-848f-edb4f3f7d5b0'
SOURCE='595d67be-293b-4b3f-9022-6a5a672f8aad'
D1='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
OUT=pathlib.Path('v30-poi-live-autocomplete-qa')
def get(s):
 req=urllib.request.Request(ROOT+s,headers={'Authorization':'Bearer '+T})
 with urllib.request.urlopen(req,timeout=25) as r:return r.read(),r.headers.get('Content-Type','')
def verify():
 data=json.loads(get('/deployments')[0])
 vs=data['result']['deployments'][0]['versions']
 assert len(vs)==1 and vs[0]['version_id']==ACTIVE and float(vs[0]['percentage'])==100,'Production API active version unexpected'
 data=json.loads(get('/versions?per_page=1')[0])
 rows=data['result']['items'] if isinstance(data['result'],dict) else data['result']
 assert rows and rows[0]['id']==SOURCE,'Uploaded source version changed; abort'
def source():
 raw,mime=get('')
 assert 'multipart/' in mime.lower(),'Expected multi-part Cloudflare bundle'
 b=re.search(r'boundary="?([^";]+)',mime);assert b
 candidates=[]
 for part in raw.split(b'--'+b.group(1).encode()):
  if b'\r\n\r\n' not in part or b'Content-Disposition' not in part:continue
  header,body=part.split(b'\r\n\r\n',1)
  if b'.map' in header or b'.json' in header:continue
  if b'/api/health' in body and b'viaPoiHandle' in body and b'__viaActiveApiWorker' in body:
   candidates.append(body.rstrip(b'\r\n').decode('utf8'))
 assert len(candidates)==1,'No unique API candidate'
 return candidates[0]
def build():
 verify()
 s=source()
 a=s.find('async function viaPoiRemote(')
 b=s.find('\n__name(viaPoiRemote, "viaPoiRemote");',a)
 assert 0<a<b and s.count('async function viaPoiRemote(')==1
 assert s.count('async function viaPoiHandle(')==1
 prior=s[a:b]
 assert '/v2/places' in prior and '/api/health' in s
 replacement=r'''async function viaPoiRemote(q,lat,lng,key) {
  const canonical=q.replace(/^\s*(?:hotel|restaurante|restaurant|shopping|oficina de alquiler de autos|rentadora)\s+/i,"").trim()
    .replace(/\bmc[\s-]*donald'?s\b/gi,"McDonald's");
  const fetchGeo=async (endpoint,amenityOnly) => {
    const url=new URL('https://api.geoapify.com'+endpoint);
    url.searchParams.set('text',canonical);
    url.searchParams.set('lang','es');
    url.searchParams.set('format','geojson');
    url.searchParams.set('limit','12');
    url.searchParams.set('filter','countrycode:uy');
    if(amenityOnly)url.searchParams.set('type','amenity');
    url.searchParams.set('bias',viaPoiValid(lat,lng)?'proximity:'+lng+','+lat:'proximity:-56.17,-34.90');
    url.searchParams.set('apiKey',key);
    const response=await fetch(url.toString(),{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(7200)});
    if(response.status===429)return {error:'geoapify_quota',status:429};
    if(response.status===401||response.status===403)return {error:'geoapify_permission',status:503};
    if(!response.ok)return {error:'geoapify_upstream',status:502};
    let body;try{body=await response.json()}catch{return {error:'geoapify_invalid_response',status:502}};
    if(!Array.isArray(body?.features))return {error:'geoapify_invalid_response',status:502};
    return {features:body.features};
  };
  const first=await fetchGeo('/v1/geocode/autocomplete',true);
  if(first.error)return viaPoiJson({error:first.error},first.status);
  let values=first.features.map(viaPoiNormalize).filter(Boolean);
  // Conservador: no presentar direcciones o palabras parecidas como establecimientos.
  const plain=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]/g,'');
  const root=plain(canonical);
  values=values.filter(f=>plain(f.properties.name).includes(root)||root.includes(plain(f.properties.name)));
  if(!values.length){
    const second=await fetchGeo('/v1/geocode/search',false);
    if(!second.error)values=second.features.map(viaPoiNormalize).filter(Boolean)
      .filter(f=>plain(f.properties.name).includes(root)||root.includes(plain(f.properties.name)));
  }
  const seen=new Set();
  const unique=values.filter(f=>{
    const id=f.properties.place_id||f.properties.name+'|'+f.geometry.coordinates.join(',');
    if(seen.has(id))return false;seen.add(id);return true;
  }).slice(0,12);
  return viaPoiJson({features:unique},200,{
    'X-Via-Poi-Source':'Geoapify Autocomplete',
    'X-Via-Poi-Accepted':String(unique.length),
    'Cache-Control':'no-store'
  });
}'''
 new=s[:a]+replacement+s[b:]
 assert new.count('async function viaPoiHandle(')==1 and new.count('async function viaPoiRemote(')==1
 assert new.count('__viaActiveApiWorker')>=1 and new.count('/api/public/route-preview')>=1
 assert new.count('VIA_GEOAPIFY_API_KEY')>=1
 OUT.mkdir(exist_ok=True)
 (OUT/'worker.mjs').write_text(new)
 config={'name':'via-traslados-api','main':'./worker.mjs','compatibility_date':'2026-11-10','workers_dev':True,
  'keep_vars':True,'d1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':D1}]}
 (OUT/'wrangler.jsonc').write_text(json.dumps(config,indent=2))
 verify()
 print('VIA_POI_REAL_QA_API_READY '+json.dumps({'source':SOURCE,'active':ACTIVE,
  'new_script_sha256':hashlib.sha256(new.encode()).hexdigest(),
  'edited_function':'viaPoiRemote only','api_deploy':False,'keep_api_secret':True,'business_logic_untouched':True}))
if __name__=='__main__':build()
