#!/usr/bin/env python3
"""Preview-only test of Geoapify Autocomplete and Geocoding for business names.
Uses existing unpublished API source and secret bindings. NO production deployment.
"""
import json,os,re,pathlib,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN']
ROOT=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/via-traslados-api'
ACTIVE='9349f01a-5824-4401-848f-edb4f3f7d5b0'
SOURCE='ed821e37-66bf-431b-a4d5-2930e2ce0633'
D1='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
OUT=pathlib.Path('v30-poi-autocomplete-probe')
def get(s):
 req=urllib.request.Request(ROOT+s,headers={'Authorization':'Bearer '+T})
 with urllib.request.urlopen(req,timeout=24) as r:return r.read(),r.headers.get('Content-Type','')
def verify():
 j=json.loads(get('/deployments')[0]);vs=j['result']['deployments'][0]['versions']
 assert len(vs)==1 and vs[0]['version_id']==ACTIVE and float(vs[0]['percentage'])==100,'Live API not pinned'
 j=json.loads(get('/versions?per_page=1')[0]);r=j['result']
 items=r['items'] if isinstance(r,dict) else r
 assert items and items[0]['id']==SOURCE,'Preview API source changed'
def source():
 body,mime=get('')
 assert 'multipart/' in mime.lower()
 m=re.search(r'boundary="?([^";]+)',mime);assert m
 found=[]
 for part in body.split(b'--'+m.group(1).encode()):
  if b'\r\n\r\n' not in part or b'Content-Disposition' not in part:continue
  head,content=part.split(b'\r\n\r\n',1)
  if b'.map' in head or b'.json' in head:continue
  if b'/api/health' in content and b'viaPoiHandle' in content and b'__viaActiveApiWorker' in content:
   found.append(content.rstrip(b'\r\n').decode('utf8'))
 assert len(found)==1,'No unique stage POI script'
 return found[0]
def build():
 verify();old=source()
 needle='async function viaPoiRemote(q, lat, lng, key) {'
 assert old.count(needle)==1
 helper=r'''
async function viaAutocompleteDiagnostic(q, mode, key) {
  const path = mode === "search" ? "/v1/geocode/search" : "/v1/geocode/autocomplete";
  const u = new URL("https://api.geoapify.com"+path);
  u.searchParams.set("text", q);
  u.searchParams.set("limit", "10");
  u.searchParams.set("lang", "es");
  u.searchParams.set("format", "geojson");
  u.searchParams.set("filter", "countrycode:uy");
  u.searchParams.set("bias", "proximity:-56.17,-34.90");
  if(mode==="amenity")u.searchParams.set("type", "amenity");
  u.searchParams.set("apiKey",key);
  const res=await fetch(u.toString(),{signal:AbortSignal.timeout(6500)});
  let data={};try{data=await res.json()}catch{}
  const arr=Array.isArray(data?.features)?data.features:Array.isArray(data?.results)?data.results:[];
  const named=arr.filter(f=>String(f?.properties?.name||f?.name||"").trim()).length;
  const uy=arr.filter(f=>String(f?.properties?.country_code||f?.country_code||"").toLowerCase()==="uy").length;
  const coords=arr.filter(f=>Array.isArray(f?.geometry?.coordinates)&&f.geometry.coordinates.length>=2).length;
  return new Response(JSON.stringify({features:[]}),{status:200,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Via-Auto-Upstream":String(res.status),
    "X-Via-Auto-Raw":String(arr.length),
    "X-Via-Auto-Named":String(named),
    "X-Via-Auto-Uy":String(uy),
    "X-Via-Auto-Coords":String(coords),
    "X-Via-Auto-Mode":mode
  }});
}
'''
 block=needle+r'''
  if(q.startsWith("ViaAutoProbe:"))
    return viaAutocompleteDiagnostic(q.slice("ViaAutoProbe:".length),"amenity",key);
  if(q.startsWith("ViaAutoAny:"))
    return viaAutocompleteDiagnostic(q.slice("ViaAutoAny:".length),"any",key);
  if(q.startsWith("ViaSearchProbe:"))
    return viaAutocompleteDiagnostic(q.slice("ViaSearchProbe:".length),"search",key);
'''
 new=old.replace(needle,helper+'\n'+block,1)
 assert new.count('viaAutocompleteDiagnostic(')>=4
 assert new.count('async function viaPoiHandle(')==1
 assert new.count('__viaActiveApiWorker')>=1
 OUT.mkdir(exist_ok=True)
 (OUT/'worker.mjs').write_text(new)
 config={'name':'via-traslados-api','main':'./worker.mjs','compatibility_date':'2026-11-10',
  'workers_dev':True,'keep_vars':True,
  'd1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':D1}]}
 (OUT/'wrangler.jsonc').write_text(json.dumps(config,indent=2))
 verify()
 print('VIA_AUTOCOMPLETE_VERSION_ONLY_READY '+json.dumps({'base':SOURCE,'active':ACTIVE,'modes':['amenity','any','search'],'noDeployment':True}),flush=True)
if __name__=='__main__':build()
