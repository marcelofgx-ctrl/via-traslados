// Reverse geocoding backup. The existing Geoapify credential remains in the API Worker.
const viaReverseJson=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const viaReverseValid=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52;
const viaReverseClean=x=>String(x??'').trim().replace(/\s+/g,' ').slice(0,160);
function viaReverseDistance(a,b,c,d){
 const r=Math.PI/180,dy=(c-a)*r,dx=(d-b)*r;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin(dy/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(dx/2)**2)));
}
export function viaReverseNormalize(body,lat,lng){
 const rows=Array.isArray(body?.features)?body.features:[];
 return rows.flatMap(f=>{
  const p=f?.properties||{},c=f?.geometry?.coordinates;
  const y=Number(c?.[1]??p.lat),x=Number(c?.[0]??p.lon),street=viaReverseClean(p.street);
  if(!street||String(p.country_code||'').toLowerCase()!=='uy'||!viaReverseValid(y,x))return [];
  if(!['building','amenity','street'].includes(p.result_type))return [];
  const d=viaReverseDistance(lat,lng,y,x);
  if(!Number.isFinite(d)||d>100)return [];
  const house=viaReverseClean(p.housenumber);
  const useHouse=p.result_type==='building'&&d<=35&&/^\d{1,6}[a-z]?$/i.test(house);
  return [{street:street+(useHouse?' '+house:''),city:viaReverseClean(p.city||p.town||p.village),department:viaReverseClean(p.state),lat:y,lng:x,distanceMeters:d,source:'Geoapify',accuracy:'reference'}];
 }).sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,5);
}
async function viaReverseRate(env,key,max,seconds){
 const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('via-reverse:'+key));
 const id='via-reverse-'+Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,'0')).join('');
 const row=await env.DB.prepare('INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(id,seconds,seconds).first();
 return Number(row?.attempts||Infinity)<=max;
}
export async function viaReverseHandle(request,env){
 if(request.method!=='GET')return viaReverseJson({error:'method_not_allowed'},405);
 const u=new URL(request.url),a=u.searchParams.get('lat'),b=u.searchParams.get('lng'),lat=Number(a),lng=Number(b);
 if(a===null||b===null||!viaReverseValid(lat,lng))return viaReverseJson({error:'invalid_coordinates',results:[]},400);
 if(!env.DB||typeof env.VIA_GEOAPIFY_API_KEY!=='string'||env.VIA_GEOAPIFY_API_KEY.length<10)return viaReverseJson({error:'reverse_unconfigured',results:[]},503);
 try{
  const ip=(request.headers.get('CF-Connecting-IP')||'unknown').slice(0,80);
  if(!await viaReverseRate(env,'global',300,86400)||!await viaReverseRate(env,'ip:'+ip,30,3600))return viaReverseJson({error:'reverse_rate_limited',results:[]},429);
  const url=new URL('https://api.geoapify.com/v1/geocode/reverse');
  url.searchParams.set('lat',String(lat));url.searchParams.set('lon',String(lng));url.searchParams.set('format','geojson');url.searchParams.set('lang','es');url.searchParams.set('limit','5');url.searchParams.set('apiKey',env.VIA_GEOAPIFY_API_KEY);
  const r=await fetch(url,{signal:AbortSignal.timeout(3200),headers:{Accept:'application/json'}});
  if(!r.ok)return viaReverseJson({error:'reverse_provider_unavailable',results:[]},r.status===429?429:503);
  const j=await r.json();
  return viaReverseJson({results:viaReverseNormalize(j,lat,lng),mode:'reverse',provider:'Geoapify'});
 }catch{return viaReverseJson({error:'reverse_unavailable',results:[]},503)}
}
