// Numbered street fallback. Never infer coordinates or a confirmed portal.
const numberedFold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const streetKey=s=>numberedFold(s).replace(/^(calle|avenida|av|bulevar|blvr|boulevard|pasaje|rambla|camino)\s+/,'');
export function viaNumberQuery(q){
 const [head,...rest]=String(q||'').split(',').map(s=>s.trim());
 const m=head.match(/^(.+?\S)\s+(\d{1,6}[a-z]?)$/i);
 if(!m||!/[\p{L}]/u.test(m[1])||/^(calle|avenida|av\.?|ruta|camino|pasaje|bulevar|blvr\.?|rambla|km)$/i.test(m[1]))return null;
 return {street:m[1],number:m[2].toLowerCase(),localities:rest.filter(Boolean),full:head};
}
function rowStreet(r){return String(r?.street||r?.label||'').split(',')[0].trim()}
function localityMatches(r,q){
 const locality=numberedFold([r.city,r.department].filter(Boolean).join(' '));
 return q.localities.every(s=>locality.includes(numberedFold(s)));
}
export function viaVerifiedPortal(row,q){
 if(!q||!row||row.kind==='place'||row.accuracy!=='portal'||row.lat==null||row.lng==null||
 !Number.isFinite(Number(row.lat))||!Number.isFinite(Number(row.lng))||
 Number(row.lat)<-36||Number(row.lat)>-30||Number(row.lng)<-59||Number(row.lng)>-52)return false;
 const parsed=viaNumberQuery(rowStreet(row));
 return !!parsed&&parsed.number===q.number&&streetKey(parsed.street)===streetKey(q.street)&&localityMatches(row,q);
}
export function viaUnverifiedStreet(rows,q){
 const out=[],seen=new Set();
 for(const row of rows||[]){
  if(!row||row.kind==='place'||!localityMatches(row,q))continue;
  const s=rowStreet(row),base=viaNumberQuery(s)?.street||s;
  if(streetKey(base)!==streetKey(q.street))continue;
  const street=base+' '+q.number,label=[street,row.city,row.department].filter(Boolean).join(', ');
  const key=numberedFold(label);if(seen.has(key))continue;seen.add(key);
  // Do not copy coordinates or precision from another portal or street centroid.
  out.push({street,label,city:row.city||'',department:row.department||'',kind:'street',accuracy:'unconfirmed',postalStatus:'unknown',lat:null,lng:null,numberIsApproximate:true});
 }
 return out;
}
export async function viaNumberedSuggest(endpoint,q,signal,fetcher=fetch){
 const request=async (mode,value)=>{
  const url=value==null?endpoint+'&mode='+mode:new URL(endpoint,globalThis.location?.origin||'https://viatraslados.com');
  if(value!=null){url.searchParams.set('q',value);url.searchParams.set('mode',mode)}
  const r=await fetcher(String(url),{signal});if(!r.ok)throw Error('Address HTTP '+r.status);
  const j=await r.json();if(!Array.isArray(j.results))throw Error('Invalid address response');return j;
 };
 const initial=await request('suggest',null);
 const parsed=viaNumberQuery(q);
 if(!parsed||initial.results.length||signal?.aborted)return initial;
 const base=[parsed.street,...parsed.localities].join(', ');
 const [resolved,street]=await Promise.allSettled([request('resolve',q),request('suggest',base)]);
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const exact=resolved.status==='fulfilled'?resolved.value.results.filter(row=>viaVerifiedPortal(row,parsed)):[];
 if(exact.length)return {...initial,results:exact};
 const candidates=street.status==='fulfilled'?viaUnverifiedStreet(street.value.results,parsed):[];
 if(!candidates.length&&resolved.status==='rejected'&&street.status==='rejected')throw Error('Fallback unavailable');
 return {...initial,results:candidates};
}
