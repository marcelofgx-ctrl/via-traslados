// Diagnóstico seguro: solo endpoint público de ruta, sin crear reservas ni pasajeros.
import assert from 'node:assert/strict';
const base='https://via-traslados-api.marcelof-gx.workers.dev';
const payload={origin:'Montevideo Shopping, Montevideo, Uruguay',
 destination:'Aeropuerto Internacional de Carrasco, Canelones, Uruguay'};
async function probe(label){
 const t=performance.now();
 const r=await fetch(base+'/api/public/route-preview',{
  method:'POST',
  headers:{'Content-Type':'application/json','Origin':'https://viatraslados.com'},
  body:JSON.stringify(payload),
  signal:AbortSignal.timeout(30000)});
 const d=await r.json().catch(()=>({}));
 const ms=Math.round(performance.now()-t);
 const summary={label,status:r.status,totalMs:ms,cached:Boolean(d.cached),
  hasRoute:Number.isFinite(d.distanceKm)&&d.distanceKm>0,
  provider:d.source||null,failCode:r.ok?null:(r.status===429?'provider_rate_limit':r.status)};
 console.log('VIA_ROUTE_PREVIEW_PERFORMANCE '+JSON.stringify(summary));
 return summary;
}
const cold=await probe('first_or_cached');
const warm=await probe('repeat_same_request');
assert(warm.status===200||warm.status===429,
 'No se puede obtener preview estable; diagnosticar API o proveedor.');
if(cold.status===200&&warm.status===200){
 console.log('VIA_ROUTE_PREVIEW_DIAGNOSIS '+JSON.stringify({
  firstMs:cold.totalMs,repeatMs:warm.totalMs,
  cachedOnRepeat:warm.cached,
  coldVsWarmRatio:Number((cold.totalMs/Math.max(1,warm.totalMs)).toFixed(1))
 }));
}
