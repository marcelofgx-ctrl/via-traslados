// Additive forward geocoding backup. No client credentials or booking writes.
const vfClean=s=>String(s??'').normalize('NFC').trim().replace(/\s+/g,' ').slice(0,200);
const vfFold=s=>vfClean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const vfStreet=s=>vfFold(s).replace(/^(calle|avenida|av|bulevar|blvr|boulevard|pasaje|rambla|camino)\s+/,'');
const vfValid=(a,b)=>a!=null&&b!=null&&a!==''&&b!==''&&Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Number(a)>=-36&&Number(a)<=-30&&Number(b)>=-59&&Number(b)<=-52;
export function vfParse(q){
 const [head,...loc]=vfClean(q).split(',').map(x=>x.trim());
 const m=head.match(/^(.+?\S)\s+(\d{1,6}[a-z]?)$/i);
 const numbered=m&&!/^(calle|avenida|av\.?|ruta|camino|pasaje|bulevar|rambla|km)$/i.test(m[1]);
 return {street:numbered?m[1]:head,number:numbered?m[2].toLowerCase():'',loc:loc.filter(Boolean).filter(x=>vfFold(x)!=='uruguay')};
}
export function vfNormalize(body,q,mode){
 const t=vfParse(q),out=[],seen=new Set();
 if(!t.street)return out;
 for(const f of Array.isArray(body?.features)?body.features:[]){
  const p=f?.properties||{},c=f?.geometry?.coordinates,lat=c?.[1]??p.lat,lng=c?.[0]??p.lon;
  if(!vfValid(lat,lng)||vfFold(p.country_code)!=='uy'||!['building','street'].includes(p.result_type))continue;
  const street=vfClean(p.street),city=vfClean(p.city||p.town||p.village||p.municipality),department=vfClean(p.state).replace(/^Departamento de /i,'');
  if(!street||!city||!department||!t.loc.every(x=>vfFold(city+' '+department).includes(vfFold(x))))continue;
  const equal=vfStreet(street)===vfStreet(t.street);
  const partial=!t.number&&mode==='suggest'&&vfStreet(t.street).length>=3&&vfStreet(street).startsWith(vfStreet(t.street));
  if(!equal&&!partial)continue;
  const house=vfClean(p.housenumber).toLowerCase(),rank=p.rank||{};
  // No interpolated or lower-confidence positions become exact portals.
  const exact=!!t.number&&equal&&p.result_type==='building'&&house===t.number&&
    ['full_match','match_by_building'].includes(rank.match_type)&&Number(rank.confidence)>=0.9&&Number(rank.confidence_building_level)>=0.9&&p.datasource?.sourcename!=='openaddresses_interpolation';
  const name=street+(t.number?' '+t.number:'');
  const label=[name,city,department].filter((x,i,a)=>i===0||vfFold(x)!==vfFold(a[i-1])).join(', ');
  const key=vfFold(label)+'|'+(exact?Number(lat).toFixed(5)+','+Number(lng).toFixed(5):'street');
  if(seen.has(key))continue;seen.add(key);
  out.push({street:name,label,city,department,kind:exact?'address':'street',accuracy:exact?'portal':'unconfirmed',
   source:'Geoapify',postalStatus:'unknown',lat:exact?Number(lat):null,lng:exact?Number(lng):null,numberIsApproximate:!!t.number&&!exact});
 }
 const exact=out.filter(x=>x.accuracy==='portal');
 // If multiple distinct exact candidates exist, resolve must not select the first arbitrarily.
 if(mode==='resolve')return exact.length===1?exact:[];
 return (exact.length?exact:out).slice(0,8);
}
const vfJson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function vfRate(env,key,cap,seconds){
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('via-forward:'+key));
 const id='via-forward-'+Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
 const row=await env.DB.prepare('INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(id,seconds,seconds).first();
 return Number(row?.attempts||Infinity)<=cap;
}
export async function vfHandle(request,env){
 if(request.method!=='GET')return vfJson({error:'method_not_allowed'},405);
 const u=new URL(request.url),q=vfClean(u.searchParams.get('q')),mode=u.searchParams.get('mode');
 if(q.length<3||q.length>160||!['suggest','resolve'].includes(mode)||!/\p{L}/u.test(q))return vfJson({error:'invalid_address_query',results:[]},400);
 if(!env.DB||typeof env.VIA_GEOAPIFY_API_KEY!=='string'||env.VIA_GEOAPIFY_API_KEY.length<10)return vfJson({error:'backup_unconfigured',results:[]},503);
 try{
  const ip=(request.headers.get('CF-Connecting-IP')||'unknown').slice(0,80);
  if(!await vfRate(env,'global',350,86400)||!await vfRate(env,'ip:'+ip,40,3600))return vfJson({error:'backup_rate_limited',results:[]},429);
  const parsed=vfParse(q);
  const url=new URL('https://api.geoapify.com/v1/geocode/'+(mode==='resolve'||parsed.number?'search':'autocomplete'));
  url.searchParams.set('text',q);url.searchParams.set('filter','countrycode:uy');url.searchParams.set('format','geojson');url.searchParams.set('lang','es');url.searchParams.set('limit','8');
  const a=u.searchParams.get('lat'),b=u.searchParams.get('lng');
  if(vfValid(a,b))url.searchParams.set('bias','proximity:'+Number(b).toFixed(2)+','+Number(a).toFixed(2));
  url.searchParams.set('apiKey',env.VIA_GEOAPIFY_API_KEY);
  const r=await fetch(url,{signal:AbortSignal.timeout(3800),headers:{Accept:'application/json'}});
  if(!r.ok)return vfJson({error:'backup_provider_unavailable',results:[]},r.status===429?429:503);
  const body=await r.json();if(!Array.isArray(body.features))return vfJson({error:'backup_invalid_response',results:[]},503);
  let rows=vfNormalize(body,q,mode);
  // Numbered search may find only a street. A second call is deliberately not
  // made here: the web bridge can recover street-only on the next explicit search.
  return vfJson({results:rows,mode,provider:'Geoapify'});
 }catch{return vfJson({error:'backup_unavailable',results:[]},503)}
}
