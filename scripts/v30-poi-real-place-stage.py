#!/usr/bin/env python3
"""V30 QA stage only: bridge live Geoapify results from UNDEPLOYED API version.
No production Worker deploy; QA reservation endpoints stay blocked; no D1
binding in QA web. The preview API maintains existing secret and a rate counter.
"""
import json,pathlib,runpy,subprocess,hashlib
OLD=runpy.run_path('scripts/v30-poi-qa-package.py')
VERSION='a50f7a32-974b-42e1-89e4-095af4e6aebd'
QA_API='https://'+VERSION[:8]+'-via-traslados-api.marcelof-gx.workers.dev'
PRODUCTION_API='9349f01a-5824-4401-848f-edb4f3f7d5b0'
OUT=pathlib.Path('v30-poi-qa-build')
def build():
 OLD['build']()
 worker=OUT/'worker-qa.mjs'
 original=worker.read_text()
 marker='return __viaExtendPlaceSearch(request,original,env);'
 assert original.count(marker)==1 and 'QA aislada: ninguna API de reservas disponible' in original
 assert 'if(pathname.startsWith("/api/")&&pathname!=="/api/direcciones")' in original
 bridge=r'''const viaQaPoiService={
  async fetch(internalRequest){
   const parsed=new URL(internalRequest.url);
   if(internalRequest.method!=="GET"||parsed.pathname!=="/api/via-places")
    return new Response(JSON.stringify({error:"QA POI GET only"}),{status:405});
   const upstream=new URL("https://a50f7a32-via-traslados-api.marcelof-gx.workers.dev"+parsed.pathname+parsed.search);
   return fetch(upstream.toString(),{headers:{"Accept":"application/json"},
      signal:AbortSignal.timeout(9000)});
  }
 };
 return __viaExtendPlaceSearch(request,original,{
   VIA_PLACES_ENABLED:"true",
   VIA_POI_API:viaQaPoiService
 });'''
 changed=original.replace(marker,bridge)
 assert changed.count('viaQaPoiService')==2
 assert changed.count('VIA_POI_API:viaQaPoiService')==1
 assert changed.count('QA aislada: ninguna API de reservas disponible')==1
 assert changed.count('return __viaExtendPlaceSearch(')==1
 worker.write_text(changed)
 cfgfile=OUT/'wrangler.qa.jsonc'
 cfg=json.loads(cfgfile.read_text())
 assert cfg['name']=='via-traslados-v30-poi-stage-20261124' and 'd1_databases' not in cfg and 'services' not in cfg
 cfg['vars']['VIA_PLACES_ENABLED']='true'
 cfgfile.write_text(json.dumps(cfg,indent=2))
 data=json.loads((OUT/'manifest.json').read_text())
 data['places_flag']='true QA-only with Geoapify Autocomplete via nondeployed API'
 data['places_qa_api_version']=VERSION
 data['places_qa_origin']=QA_API
 data['api_except_directions']='blocked; only directions triggers Geoapify backend version GET'
 data['d1_write']='QA web has no D1; versioned API writes rate-limiter counters in existing API D1'
 data['route_preview']='blocked; no bookings or route previews in stage'
 data['worker_sha256']=hashlib.sha256(changed.encode()).hexdigest()
 (OUT/'manifest.json').write_text(json.dumps(data,indent=2))
 p=subprocess.run(['node','--check',str(worker)],capture_output=True,text=True,timeout=25)
 assert p.returncode==0,'QA Worker JS syntax failure '+p.stderr[-250:]
 print('VIA_REAL_PLACES_STAGE_READY '+json.dumps({'url':'https://via-traslados-v30-poi-stage-20261124.marcelof-gx.workers.dev',
  'usesExperimentalApi':VERSION,'productionApiUntouched':PRODUCTION_API,'productionWebUntouched':True,
  'noReservationWrites':True,'noApiKeyExposed':True,'routingInStage':'blocked','changedAssetCount':3}),flush=True)
if __name__=='__main__':build()
