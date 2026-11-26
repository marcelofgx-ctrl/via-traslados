import {vfParse} from './via-forward-api.mjs';
import {viaReverseRace} from './via-reverse-bridge.mjs';
const clean=x=>String(x??'').trim().replace(/\s+/g,' ').slice(0,220);
const fold=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const valid=(a,b)=>a!=null&&b!=null&&Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Number(a)>=-36&&Number(a)<=-30&&Number(b)>=-59&&Number(b)<=-52;
const json=(body,status=200,tag='')=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Via-Address-Source':tag}});
async function identity(q,mode,lat,lng){
 const h=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('via-address-v1|'+fold(q)+'|'+mode+'|'+(valid(lat,lng)?Number(lat).toFixed(2)+','+Number(lng).toFixed(2):'uy'))));
 return {key:[...h].map(x=>x.toString(16).padStart(2,'0')).join(''),slot:((h[0]<<8)|h[1])%4096};
}
function cacheable(rows,q){
 const n=vfParse(q).number;
 return (Array.isArray(rows)?rows:[]).filter(x=>x&&x.kind!=='place'&&x.accuracy==='portal'&&valid(x.lat,x.lng)&&n&&vfParse(x.street).number===n&&fold(vfParse(x.street).street)===fold(vfParse(q).street)).slice(0,6).map(x=>({street:clean(x.street),label:clean(x.label),city:clean(x.city),department:clean(x.department),kind:'address',accuracy:'portal',source:clean(x.source)||'IDE Uruguay',lat:Number(x.lat),lng:Number(x.lng),postalStatus:'unknown'}));
}
async function read(db,id,q){try{const r=await db.prepare('SELECT payload FROM address_search_cache WHERE slot=? AND cache_key=? AND expires_at>unixepoch()').bind(id.slot,id.key).first();const rows=cacheable(JSON.parse(r?.payload||'null'),q);return rows.length?rows:null}catch{return null}}
async function write(db,id,rows,q){try{const safe=cacheable(rows,q),p=JSON.stringify(safe);if(!safe.length||new TextEncoder().encode(p).length>6000)return;await db.prepare('INSERT INTO address_search_cache(slot,cache_key,payload,expires_at) VALUES(?,?,?,unixepoch()+604800) ON CONFLICT(slot) DO UPDATE SET cache_key=excluded.cache_key,payload=excluded.payload,expires_at=excluded.expires_at').bind(id.slot,id.key,p).run()}catch{}}
const inspect=async p=>{try{const r=await p,j=await r.clone().json();return {r,rows:Array.isArray(j.results)?j.results:[],ok:r.ok&&Array.isArray(j.results)}}catch{return {ok:false,rows:[]}}};
export async function addressRace(request,env,legacy,ctx,{lead=1800,deadline=7400}={}){
 const u=new URL(request.url),mode=u.searchParams.get('mode'),q=clean(u.searchParams.get('q'));
 if(request.method!=='GET'||u.pathname!=='/api/direcciones')return legacy.fetch(request,env,ctx);
 if(mode==='reverse')return viaReverseRace(request,env,legacy,ctx);
 if(!['suggest','resolve'].includes(mode)||q.length<3||q.length>160||!env.VIA_POI_API)return legacy.fetch(request,env,ctx);
 const number=vfParse(q).number,id=await identity(q,mode,u.searchParams.get('lat'),u.searchParams.get('lng'));
 const hit=await read(env.POI_CACHE,id,q);
 if(hit)return json({results:hit,mode,provider:'D1 cache'},200,'cache');
 const usable=x=>x?.ok&&x.rows.length>0&&(mode!=='resolve'||x.rows.some(r=>r.accuracy==='portal'&&valid(r.lat,r.lng)));
 const exact=x=>usable(x)&&(!number||cacheable(x.rows,q).length>0);
 let launch,timer,stop;let first,second,started=false,done=false;
 const primary=inspect(Promise.resolve().then(()=>legacy.fetch(request,env,ctx)));
 const fallback=()=>{if(started||done)return;started=true;clearTimeout(launch);
  const dest=new URL('https://via-traslados-api.marcelof-gx.workers.dev/api/via-forward');
  for(const key of ['mode','q','lat','lng'])if(u.searchParams.has(key))dest.searchParams.set(key,u.searchParams.get(key));
  const h=new Headers({Accept:'application/json'}),ip=request.headers.get('CF-Connecting-IP');if(ip)h.set('CF-Connecting-IP',ip);
  inspect(Promise.resolve().then(()=>env.VIA_POI_API.fetch(new Request(dest,{headers:h,signal:AbortSignal.timeout(5000)})))).then(x=>{second=x;decide()});
 };
 let decide;
 return new Promise(resolve=>{
  const finish=(x,source)=>{if(done)return;done=true;clearTimeout(launch);clearTimeout(timer);
   if(x&&ctx?.waitUntil)ctx.waitUntil(write(env.POI_CACHE,id,x.rows,q));
   if(x){const h=new Headers(x.r.headers);h.set('X-Via-Address-Source',source);resolve(new Response(x.r.body,{status:x.r.status,headers:h}))}
   else resolve(json({error:'address_providers_unavailable',results:[]},503,'unavailable'));
  };
  const conclude=()=>{
   if(usable(first))return finish(first,'IDE');
   if(usable(second))return finish(second,'Geoapify');
   // Empty is definitive only when both providers actually responded normally.
   if(first?.ok&&second?.ok)return finish(first,'empty');
   return finish(null,'unavailable');
  };
  decide=()=>{if(done)return;if(exact(first))return finish(first,'IDE');if(exact(second))return finish(second,'Geoapify');if(first)fallback();if(first&&second)conclude()};
  launch=setTimeout(fallback,lead);timer=setTimeout(conclude,deadline);
  primary.then(x=>{first=x;decide()});
 });
}
