// Generic POI query expansion, bounded to two proxy calls. Never changes IDE.
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const compact=s=>fold(s).replace(/ /g,'');
const descriptors=new Set(['shopping','hotel','hoteles','restaurante','restaurant','restaurantes','comercio','tienda','supermercado','centro comercial','mall','local','sucursal']);
const core=q=>fold(q).replace(/^(?:centro comercial|shopping|hotel|restaurante|restaurant|supermercado|tienda|sucursal)\s+/,'').replace(/\s+(?:centro comercial|shopping|hotel|restaurante|restaurant|supermercado|tienda|sucursal|mall)$/,'').trim()||fold(q);
export function variant(q){
 const c=core(q),words=c.split(' ');
 if(words.length===2&&words.every(w=>w.length>=3)&&!words.some(w=>descriptors.has(w)))return words.join('');
 if(c!==fold(q)&&c.length>=4)return c;
 return null;
}
function relevance(q,n){
 const a=compact(q),b=compact(n),c=compact(core(q)),d=compact(core(n));
 if(!b||!a)return 99;
 if(a===b||c===d)return 0;
 if(b.includes(a)||b.includes(c)||d.includes(c)||a.includes(b)&&b.length>=5)return 1;
 const words=core(q).split(' ').filter(w=>w.length>=3);
 if(words.length&&words.every(w=>fold(n).includes(w)))return 2;
 return 99;
}
const geo=(a,b)=>a!=null&&b!=null&&Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Number(a)>=-36&&Number(a)<=-30&&Number(b)>=-59&&Number(b)<=-52;
const point=f=>{const p=f?.geometry?.coordinates;return geo(p?.[1],p?.[0])?[Number(p[1]),Number(p[0])]:null};
function dist(a,b,lat,lng){return (a-lat)**2+((b-lng)*Math.cos(lat*Math.PI/180))**2}
export function rankFeatures(q,features,lat,lng){
 const seen=new Set(),out=[];
 for(const f of features){
  const p=point(f),name=f?.properties?.name;
  if(!p||!name||fold(f?.properties?.country_code)!=='uy'||relevance(q,name)===99)continue;
  const id=f.properties.place_id||compact(name)+'|'+p.map(x=>x.toFixed(5)).join(',');
  if(seen.has(id))continue;seen.add(id);out.push(f);
 }
 return out.sort((a,b)=>{
  const r=relevance(q,a.properties.name)-relevance(q,b.properties.name);
  if(r)return r;
  if(!geo(lat,lng))return 0;
  return dist(...point(a),Number(lat),Number(lng))-dist(...point(b),Number(lat),Number(lng));
 }).slice(0,12);
}
const cache=new Map(),pending=new Map();
export async function expandedProxy(request,fetcher){
 const u=new URL(request.url),q=u.searchParams.get('q')||'',lat=u.searchParams.get('lat'),lng=u.searchParams.get('lng');
 const key=fold(q)+'|'+(geo(lat,lng)?Number(lat).toFixed(3)+','+Number(lng).toFixed(3):'uy');
 const saved=cache.get(key);
 const response=body=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(saved&&saved.until>Date.now())return response(saved.body);
 if(pending.has(key))return response(await pending.get(key));
 let first=await fetcher(request);
 if(!first.ok)return first;
 let body=await first.json();
 let results=rankFeatures(q,body.features||[],lat,lng);
 const alt=variant(q);
 // Only one supplementary query, never for numeric addresses or provider errors.
 if(alt&&fold(alt)!==fold(q)&&!/\d/.test(q)&&results.length<4){
  const v=new URL(u);v.searchParams.set('q',alt);
  const work=(async()=>{try{
   const r=await fetcher(new Request(v,{method:'GET',headers:{Accept:'application/json'}}));
   if(r.ok){const j=await r.json();results=rankFeatures(q,[...results,...(j.features||[])],lat,lng)}
  }catch{}return {features:results}})();
  pending.set(key,work);try{body=await work}finally{pending.delete(key)}
 }else body={features:results};
 if(body.features.length){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{body,until:Date.now()+180000})}
 return response(body);
}
// Re-rank results after the legacy merge, keeping all coordinates and original labels.
export function rankPlaces(q,rows,lat,lng){
 const byDistance=(a,b)=>geo(lat,lng)&&geo(a.lat,a.lng)&&geo(b.lat,b.lng)?dist(a.lat,a.lng,Number(lat),Number(lng))-dist(b.lat,b.lng,Number(lat),Number(lng)):0;
 return [...rows].sort((a,b)=>{const ar=relevance(q,a.name||a.street||a.label),br=relevance(q,b.name||b.street||b.label);return ar-br||byDistance(a,b)});
}
