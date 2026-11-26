// Independent bounded reverse cache in the geographic D1 only.
// Store provider street references, never raw GPS coordinates, account IDs or IPs.
// The hashed small cell is location-derived, not anonymous; restrict access and retention.
const TTL=7*86400,SLOTS=4096,MAX_BYTES=4096,encoder=new TextEncoder();
const clean=x=>typeof x==='string'?x.trim().replace(/\s+/g,' ').slice(0,160):'';
const valid=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52;
const distance=(a,b,c,d)=>{const r=Math.PI/180;return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2)))};
const streetKey=x=>clean(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+(?:n[º°o.]?\s*)?\d{1,6}[a-z]?$/i,'');
export async function reverseCacheIdentity(lat,lng){
 if(!valid(lat,lng))return null;
 const h=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('reverse-v1|'+lat.toFixed(4)+'|'+lng.toFixed(4))));
 return {key:Array.from(h,x=>x.toString(16).padStart(2,'0')).join(''),slot:((h[0]<<8)|h[1])%SLOTS};
}
export function reverseCacheRows(rows,lat,lng){
 if(!Array.isArray(rows)||!valid(lat,lng))return [];
 return rows.slice(0,12).flatMap(x=>{
  if(!x||x.lat==null||x.lng==null)return [];
  const y=Number(x.lat),z=Number(x.lng),street=clean(x.street),source=clean(x.source);
  if(!valid(y,z)||!street||!['IDE Uruguay','Geoapify'].includes(source))return [];
  const d=distance(lat,lng,y,z);if(d>125)return [];
  return [{street,city:clean(x.city),department:clean(x.department),lat:y,lng:z,distanceMeters:d,source,accuracy:'reference'}];
 }).sort((a,b)=>a.distanceMeters-b.distanceMeters);
}
function reliable(rows){
 // Extra margin for location variation within an approximately 10 m cell.
 if(!rows.length||rows[0].distanceMeters>65)return false;
 const k=streetKey(rows[0].street);
 return !!k&&!rows.some(x=>x.distanceMeters-rows[0].distanceMeters<=55&&streetKey(x.street)!==k);
}
export async function reverseCacheRead(db,id,lat,lng,now=Math.floor(Date.now()/1000)){
 if(!db||!id)return null;
 try{
 const row=await db.prepare('SELECT payload FROM reverse_reference_cache WHERE slot=? AND cache_key=? AND expires_at>?').bind(id.slot,id.key,now).first();
 const rows=reverseCacheRows(JSON.parse(row?.payload||'null'),lat,lng);
 return reliable(rows)?rows.filter(x=>x.distanceMeters<=100):null;
 }catch{return null}
}
export async function reverseCacheWrite(db,id,rows,lat,lng,now=Math.floor(Date.now()/1000)){
 if(!db||!id)return false;
 try{
 const safe=reverseCacheRows(rows,lat,lng);
 if(!reliable(safe))return false;
 // Distances are relative to current GPS, so do not persist them.
 const payload=JSON.stringify(safe.map(({distanceMeters,...r})=>r));
 if(encoder.encode(payload).length>MAX_BYTES)return false;
 await db.prepare('INSERT INTO reverse_reference_cache(slot,cache_key,payload,expires_at) VALUES(?,?,?,?) ON CONFLICT(slot) DO UPDATE SET cache_key=excluded.cache_key,payload=excluded.payload,expires_at=excluded.expires_at').bind(id.slot,id.key,payload,now+TTL).run();
 return true;
 }catch{return false}
}
