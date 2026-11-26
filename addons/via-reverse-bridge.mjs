// First usable nearby reference wins. Never change the original GPS point.
export function viaReverseUsable(rows,lat,lng){
 if(!Array.isArray(rows))return false;
 const d=x=>{const y=Number(x.lat),z=Number(x.lng),r=Math.PI/180;if(!Number.isFinite(y)||!Number.isFinite(z))return Infinity;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin((y-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(y*r)*Math.sin((z-lng)*r/2)**2)))};
 const near=rows.filter(x=>typeof x?.street==='string'&&x.street.trim()).map(x=>({s:x.street.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+\d{1,6}[a-z]?$/i,'').trim(),d:d(x)})).filter(x=>x.d<=100).sort((a,b)=>a.d-b.d);
 return !!near.length&&!near.some(x=>x.d-near[0].d<=25&&x.s!==near[0].s);
}
export async function viaReverseRace(request,env,legacy,ctx){
 const u=new URL(request.url),a=u.searchParams.get('lat'),b=u.searchParams.get('lng'),lat=Number(a),lng=Number(b);
 if(a===null||b===null||!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -36||lat> -30||lng< -59||lng> -52||!env.VIA_POI_API)return legacy.fetch(request,env,ctx);
 const safe=(r)=>r.clone().json().then(j=>({r,usable:r.ok&&viaReverseUsable(j.results,lat,lng)})).catch(()=>({r,usable:false}));
 let timer;
 const primary=Promise.resolve().then(()=>legacy.fetch(request,env,ctx)).then(safe).catch(()=>null);
 const secondary=new Promise(resolve=>{timer=setTimeout(resolve,900)}).then(()=>{
  const dest=new URL('https://via-traslados-api.marcelof-gx.workers.dev/api/via-reverse');dest.searchParams.set('lat',a);dest.searchParams.set('lng',b);
  const headers=new Headers({Accept:'application/json'});const ip=request.headers.get('CF-Connecting-IP');if(ip)headers.set('CF-Connecting-IP',ip);
  return env.VIA_POI_API.fetch(new Request(dest,{headers,signal:AbortSignal.timeout(4200)}));
 }).then(safe).catch(()=>null);
 return new Promise(resolve=>{
  let done=false,n=0,first=null,second=null;
  const finish=r=>{if(done)return;done=true;clearTimeout(deadline);clearTimeout(timer);resolve(r)};
  const failure=()=>new Response(JSON.stringify({error:'No se pudo identificar la dirección',results:[]}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const deadline=setTimeout(()=>finish(first?.r?.ok?first.r:second?.r?.ok?second.r:first?.r||second?.r||failure()),5600);
  const receive=(x,p)=>{if(done)return;if(p)first=x;else second=x;n++;if(x?.usable){finish(x.r);return}if(n===2)finish(first?.r?.ok?first.r:second?.r?.ok?second.r:first?.r||second?.r||failure())};
  primary.then(x=>receive(x,true));secondary.then(x=>receive(x,false));
 });
}
