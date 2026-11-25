// Bounded shared cache. Stores only successful, public POI features, never raw search or exact bias.
const TTL=30*86400,MAX_BYTES=6000,SLOTS=8192;
const encoder=new TextEncoder();
export async function identity(q,lat,lng){
 const fold=String(q||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 if(fold.length<4||fold.length>100||/\d/.test(fold)||/^(calle|avenida|ruta|camino|rambla|bulevar|av)\b/.test(fold))return null;
 const cell=lat!=null&&lng!=null&&Number(lat)>=-36&&Number(lat)<=-30&&Number(lng)>=-59&&Number(lng)<=-52?Number(lat).toFixed(2)+','+Number(lng).toFixed(2):'uy';
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('poi-v1|'+fold+'|'+cell)));
 const key=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {key,slot:((digest[0]<<8)|digest[1])%SLOTS};
}
export function publicFeatures(body){
 if(!Array.isArray(body?.features))return [];
 return body.features.slice(0,12).flatMap(f=>{
  const p=f?.properties||{},c=f?.geometry?.coordinates;
  if(!p.name||String(p.country_code).toLowerCase()!=='uy'||!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<-59||c[0]>-52||c[1]<-36||c[1]>-30)return [];
  const properties={};
  for(const k of ['name','country_code','city','suburb','county','state','formatted','place_id','street','housenumber','postcode','result_type'])if(typeof p[k]==='string')properties[k]=p[k].slice(0,240);
  return [{type:'Feature',properties,geometry:{type:'Point',coordinates:c.slice(0,2)}}];
 });
}
export async function readShared(db,id,now=Math.floor(Date.now()/1000)){
 if(!db||!id)return null;
 try{
  const row=await db.prepare('SELECT payload FROM poi_search_cache WHERE slot=? AND cache_key=? AND expires_at>?').bind(id.slot,id.key,now).first();
  const features=publicFeatures(JSON.parse(row?.payload||'null'));
  return features.length?{features}:null;
 }catch{return null}
}
export async function writeShared(db,id,body,now=Math.floor(Date.now()/1000)){
 if(!db||!id)return false;
 try{
  const features=publicFeatures(body);
  const payload=JSON.stringify({features});
  if(!features.length||encoder.encode(payload).length>MAX_BYTES)return false;
  await db.prepare('INSERT INTO poi_search_cache(slot,cache_key,payload,expires_at) VALUES(?,?,?,?) ON CONFLICT(slot) DO UPDATE SET cache_key=excluded.cache_key,payload=excluded.payload,expires_at=excluded.expires_at').bind(id.slot,id.key,payload,now+TTL).run();
  return true;
 }catch{return false}
}
