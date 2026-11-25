/* Route estimates only: bounded local cache, privacy-preserving hashed keys, single flight. */
export function createRoutePreviewCache({load,storage,subtle=globalThis.crypto?.subtle,clock=Date.now}){
 const KEY='via-route-preview-cache-v1',MAX=48,DAY=86400000;
 const memory=new Map(),pending=new Map();
 const fold=s=>String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
 const point=p=>{
  p=p?.point||p;const a=p?.lat,b=p?.lng??p?.lon;
  return typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)&&a>=-36&&a<=-30&&b>=-59&&b<=-52?a.toFixed(6)+','+b.toFixed(6):null;
 };
 const valid=r=>r&&Number.isFinite(r.distanceKm)&&r.distanceKm>0&&Number.isFinite(r.durationMinutes)&&r.durationMinutes>0&&r.source==='Geoapify';
 const safe=r=>({distanceKm:r.distanceKm,durationMinutes:r.durationMinutes,source:r.source,estimate:true,trafficIncluded:false,attribution:'© OpenStreetMap contributors · Powered by Geoapify'});
 const fresh=(e,ttl)=>e&&Number.isFinite(e.at)&&e.at<=clock()&&clock()-e.at<ttl&&valid(e.value);
 function read(){try{const a=JSON.parse(storage?.getItem(KEY)||'{}');return a&&typeof a==='object'&&!Array.isArray(a)?a:{}}catch{return{}}}
 function write(key,e){
  try{const a=read();a[key]=e;
   const rows=Object.entries(a).filter(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&fresh(v,DAY)).sort((a,b)=>b[1].at-a[1].at).slice(0,MAX);
   storage?.setItem(KEY,JSON.stringify(Object.fromEntries(rows)));
  }catch{}
 }
 async function hash(s){try{if(!subtle)return null;const b=await subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch{return null}}
 function put(k,e){memory.delete(k);memory.set(k,e);while(memory.size>MAX)memory.delete(memory.keys().next().value)}
 function estimate(origin,destination,op,dp){
  const a=point(op),b=point(dp),both=!!(a&&b);
  if(!fold(origin)||!fold(destination)||fold(origin)===fold(destination))return load(origin,destination,op,dp);
  const key=JSON.stringify(['drive-v1',a||fold(origin),b||fold(destination)]);
  const ttl=both?DAY:21600000;
  if(fresh(memory.get(key),ttl))return Promise.resolve({...memory.get(key).value,cached:true});
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   // Persist only confirmed coordinate-pair routes; never retain address labels or coordinates.
   const id=both?await hash(key):null;
   if(id){const saved=read()[id];if(fresh(saved,ttl)){put(key,saved);return {...saved.value,cached:true}}}
   const value=await load(origin,destination,op,dp);
   if(valid(value)){const e={at:clock(),value:safe(value)};put(key,e);if(id)write(id,e)}
   return value;
  })();
  pending.set(key,task);
  task.then(()=>pending.delete(key),()=>pending.delete(key));
  return task;
 }
 return {estimate};
}
