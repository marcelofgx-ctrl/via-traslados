// Vía Traslados V30 — proxy Geoapify Places exclusivo del Worker API.
// La clave VIA_GEOAPIFY_API_KEY nunca sale del Worker API ni aparece en respuesta.
// No toca reservas, usuarios, schema ni autenticación. Usa otp_rate_limits existente.
const VIA_POI_CATEGORIES='accommodation,catering,commercial,rental,healthcare,tourism,entertainment';
const viaPoiCache=new Map();
const viaPoiText=x=>String(x??'').normalize('NFC').replace(/\s+/g,' ').trim().slice(0,95);
const viaPoiFold=x=>viaPoiText(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const viaPoiValid=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52;
const viaPoiJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'
}});
const viaPoiHash=async text=>{
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
};
async function viaPoiRate(env,key,max,seconds){
 const rateKey='via-poi-'+await viaPoiHash(key);
 const data=await env.DB.prepare(
   'INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES (?,unixepoch(),1) '+
   'ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,'+
   'attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts'
 ).bind(rateKey,seconds,seconds).first();
 return Number(data?.attempts||Infinity)<=max;
}
function viaPoiNormalize(feature){
 const p=feature?.properties||{},c=feature?.geometry?.coordinates;
 const lat=Number(c?.[1]??p.lat),lng=Number(c?.[0]??p.lon);
 if(!viaPoiValid(lat,lng)||viaPoiFold(p.country_code||p.country_code_iso2)!=='uy'||!viaPoiText(p.name))return null;
 return {type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{
  name:viaPoiText(p.name),city:viaPoiText(p.city||p.suburb||p.county),
  state:viaPoiText(p.state),country_code:'uy',place_id:viaPoiText(p.place_id),
  formatted:viaPoiText(p.formatted)
 }};
}
async function viaPoiRemote(q,lat,lng,key){
 const url=new URL('https://api.geoapify.com/v2/places');
 url.searchParams.set('categories',VIA_POI_CATEGORIES);
 url.searchParams.set('name',q);
 url.searchParams.set('lang','es');
 url.searchParams.set('limit','12');
 url.searchParams.set('filter','rect:-58.6,-35.25,-53.1,-30.05');
 url.searchParams.set('bias',viaPoiValid(lat,lng)?'proximity:'+lng+','+lat:'proximity:-56.17,-34.90');
 url.searchParams.set('apiKey',key);
 const r=await fetch(url.toString(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6800)});
 if(r.status===429)return viaPoiJson({error:'geoapify_quota'},429);
 if(r.status===400)return viaPoiJson({error:'geoapify_bad_categories'},502);
 if(r.status===401||r.status===403)return viaPoiJson({error:'geoapify_permission'},503);
 if(!r.ok)return viaPoiJson({error:'geoapify_upstream'},502);
 const body=await r.json();
 if(!Array.isArray(body?.features))return viaPoiJson({error:'geoapify_invalid_response'},502);
 return viaPoiJson({features:body.features.map(viaPoiNormalize).filter(Boolean).slice(0,12)});
}
async function viaPoiHandle(request,env){
 if(request.method!=='GET')return viaPoiJson({error:'method_not_allowed'},405);
 if(typeof env?.VIA_GEOAPIFY_API_KEY!=='string'||env.VIA_GEOAPIFY_API_KEY.length<10)
  return viaPoiJson({error:'geoapify_unconfigured'},503);
 if(!env.DB)return viaPoiJson({error:'rate_limiter_unavailable'},503);
 const u=new URL(request.url),q=viaPoiText(u.searchParams.get('q'));
 if(q.length<4||!/[a-záéíóúüñ]/i.test(q)||/\b\d{3,6}\b/.test(q))
  return viaPoiJson({features:[]});
 const lat=Number(u.searchParams.get('lat')),lng=Number(u.searchParams.get('lng'));
 const cachedKey=viaPoiFold(q)+'|'+(viaPoiValid(lat,lng)?lat.toFixed(2)+','+lng.toFixed(2):'uy');
 const cached=viaPoiCache.get(cachedKey);
 if(cached&&cached.until>Date.now())return viaPoiJson(cached.body);
 if(viaPoiCache.size>200)viaPoiCache.clear();
 try{
  // Tope persistente global y por IP; compartido entre instancias.
  const ip=(request.headers.get('CF-Connecting-IP')||'unknown').slice(0,80);
  const allowed=await viaPoiRate(env,'global',900,86400)
    &&await viaPoiRate(env,'ip:'+ip,65,3600);
  if(!allowed)return viaPoiJson({error:'poi_rate_limited'},429);
  const res=await viaPoiRemote(q,lat,lng,env.VIA_GEOAPIFY_API_KEY);
  if(res.ok){
   const body=await res.clone().json();
   if(body.features?.length)viaPoiCache.set(cachedKey,{until:Date.now()+180000,body});
  }
  return res;
 }catch{return viaPoiJson({error:'poi_upstream_unavailable'},503)}
}

export {viaPoiHandle};
