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
 # Read-only QA bridge diagnostic: count results and status, never print keys/addresses.
 probe='''if(pathname==="/__via-qa/poi-diagnostic"){
    try{
      const upstream=new URL("https://a50f7a32-via-traslados-api.marcelof-gx.workers.dev/api/via-places?q=Radisson");
      const result=await fetch(upstream.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8500)});
      let obj={};try{obj=await result.json()}catch{}
      return new Response(JSON.stringify({upstreamHttp:result.status,
        featureCount:Array.isArray(obj.features)?obj.features.length:null,
        errorCode:obj.error||null}),{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }catch(error){
      return new Response(JSON.stringify({bridgeErrorType:error?.name||"unknown",
        bridgeErrorMessage:String(error?.message||"").slice(0,100)}),
        {status:502,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
   }
   '''
 clause='if(pathname.startsWith("/api/")&&pathname!=="/api/direcciones")'
 assert changed.count(clause)==1,'QA API gate unexpectedly changed'
 # Only the exact route-preview endpoint can pass; no cookies, session or arbitrary API paths.
 route=r'''if(pathname==="/api/public/route-preview"&&request.method==="POST"){
    const json=(data,status)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    try{
      const raw=await request.text();if(raw.length>1200)return json({error:"Consulta demasiado grande"},413);
      const data=JSON.parse(raw);
      const point=p=>{const lat=Number(p?.lat),lng=Number(p?.lng??p?.lon);
       return p?.lat!=null&&(p?.lng!=null||p?.lon!=null)&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52?{lat,lng}:null;};
      const o=point(data.originLocation),d=point(data.destinationLocation);
      if(!o||!d)return json({error:"Seleccioná dos puntos en el mapa o el buscador"},422);
      const body={origin:"Punto QA origen",destination:"Punto QA destino",originLocation:o,destinationLocation:d};
      const upstream=await fetch("https://via-traslados-api.marcelof-gx.workers.dev/api/public/route-preview",{
       method:"POST",headers:{"Content-Type":"application/json","Origin":"https://viatraslados.com"},
       body:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
      const result=await upstream.json();
      return json(upstream.ok?{distanceKm:result.distanceKm,durationMinutes:result.durationMinutes,source:result.source,cached:result.cached,estimated:result.estimated}: {error:result.error||"Ruta no disponible"},upstream.status);
    }catch{return json({error:"Ruta no disponible"},503);}
   }
   '''
 changed=changed.replace(clause,probe+route+clause,1)
 assert changed.count('viaQaPoiService')==2
 assert changed.count('VIA_POI_API:viaQaPoiService')==1
 assert changed.count('QA aislada: ninguna API de reservas disponible')==1
 assert changed.count('return __viaExtendPlaceSearch(')==1
 worker.write_text(changed)
 cfgfile=OUT/'wrangler.qa.jsonc'
 cfg=json.loads(cfgfile.read_text())
 assert cfg['name']=='via-traslados-v30-poi-stage-20261124' and 'd1_databases' not in cfg and 'services' not in cfg
 cfg['vars']['VIA_PLACES_ENABLED']='true'
 # Only this QA Worker: route version URL subrequests via the public edge.
 # Do not change production compatibility flags or API/D1 bindings.
 cfg['compatibility_flags']=['global_fetch_strictly_public']
 cfgfile.write_text(json.dumps(cfg,indent=2))
 html=OUT/'assets/index.html'
 text=html.read_text()
 assert text.count('V30 QA GEOAPIFY · NO REALIZA RESERVAS · DATOS DE PRUEBA')==1
 html.write_text(text.replace('V30 QA GEOAPIFY · NO REALIZA RESERVAS · DATOS DE PRUEBA','V30 QA GEOAPIFY 2 · SIN RESERVAS · RUTAS REALES'))
 data=json.loads((OUT/'manifest.json').read_text())
 data['places_flag']='true QA-only with Geoapify Autocomplete via nondeployed API'
 data['places_qa_api_version']=VERSION
 data['places_qa_origin']=QA_API
 data['qa_compatibility_flags']=cfg['compatibility_flags']
 data['api_except_directions']='blocked except exact POST route-preview; directions triggers Geoapify backend version GET'
 data['d1_write']='QA web has no D1; public API may write only rate-limit and route cache counters for these endpoints'
 data['route_preview']='POST allowlisted route-preview, coordinates only; production public route quota/cache; no booking data'
 data['worker_sha256']=hashlib.sha256(changed.encode()).hexdigest()
 (OUT/'manifest.json').write_text(json.dumps(data,indent=2))
 p=subprocess.run(['node','--check',str(worker)],capture_output=True,text=True,timeout=25)
 assert p.returncode==0,'QA Worker JS syntax failure '+p.stderr[-250:]
 print('VIA_REAL_PLACES_STAGE_READY '+json.dumps({'url':'https://via-traslados-v30-poi-stage-20261124.marcelof-gx.workers.dev',
  'usesExperimentalApi':VERSION,'productionApiUntouched':PRODUCTION_API,'productionWebUntouched':True,
  'noReservationWrites':True,'noApiKeyExposed':True,'routingInStage':'coordinate-only preview','changedAssetCount':3}),flush=True)
if __name__=='__main__':build()
