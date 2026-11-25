import {expandedProxy,rankPlaces} from './v303-poi-expansion.mjs';
import legacy from './legacy.mjs';
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 // Every non-POI route gets the exact original environment and request.
 if(request.method!=='GET'||url.pathname!=='/api/direcciones'||url.searchParams.get('mode')!=='places'||!env.VIA_POI_API)return legacy.fetch(request,env,ctx);
 const service=env.VIA_POI_API;
 const bridge={fetch(r){return expandedProxy(r,req=>service.fetch(req),env.POI_CACHE,ctx)}};
 const result=await legacy.fetch(request,{...env,VIA_POI_API:bridge},ctx);
 if(!result.ok)return result;
 try{const j=await result.clone().json();if(!Array.isArray(j.results))return result;
 const headers=new Headers(result.headers);for(const k of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(k);
 return new Response(JSON.stringify({...j,results:rankPlaces(url.searchParams.get('q'),j.results,url.searchParams.get('lat'),url.searchParams.get('lng'))}),{status:result.status,headers});
 }catch{return result}
}};
