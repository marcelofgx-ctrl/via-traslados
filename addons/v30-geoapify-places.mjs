// Vía Traslados V30 — complemento de lugares comerciales (NO sustituye IDE).
// El secreto VIA_GEOAPIFY_API_KEY vive solo en Cloudflare Worker.
// Activación explícita VIA_PLACES_ENABLED=true; apagado = legado byte a byte.
const CATEGORIES = 'accommodation,catering,commercial,rental,healthcare,tourism,entertainment';
const CACHE = new Map();
const RATE = new Map();
const MAX_CACHE = 180;
const now = () => Date.now();
const tidy = value => String(value ?? '').trim().replace(/\s+/g,' ').slice(0,100);
const fold = value => tidy(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const valid = (lat,lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat>=-36 && lat<=-30 && lon>=-59 && lon<=-52;
const num = n => Number(n);
const skip = q => q.length<4 || !/[a-záéíóúüñ]/i.test(q) ||
  /^\s*(?:av\.?|avenida|calle|camino|ruta|bulevar|blvr|rambla)\b/i.test(q) ||
  /\b\d{2,6}\b/.test(q);
// El usuario puede escribir «Hotel Radisson» aunque el nombre OSM sea
// «Radisson Victoria Plaza Hotel». Quitar únicamente el descriptor genérico.
const poiName = q => {
  const stripped = q.replace(/^\s*(?:(?:oficina de )?alquiler de autos|rentadora(?: de autos)?|hotel|restaurante|restaurant|shopping)\s+/i,'').trim();
  return stripped.length >= 4 ? stripped : q;
};

function throttle(request) {
  const ip = (request.headers.get('CF-Connecting-IP') || 'unknown').slice(0,80);
  const tick = now();
  if (RATE.size > 1024) RATE.clear();
  const prev = RATE.get(ip);
  if (!prev || tick-prev.start > 3600000) { RATE.set(ip,{start:tick,n:1}); return true; }
  if (prev.n >= 45) return false;
  prev.n++;
  return true;
}
function normalize(feature) {
  const p = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  const lat = num(coordinates?.[1] ?? p.lat), lng = num(coordinates?.[0] ?? p.lon);
  const name = tidy(p.name);
  if (!name || !valid(lat,lng) || fold(p.country_code || p.country_code_iso2 || '') !== 'uy') return null;
  const city = tidy(p.city || p.suburb || p.county || '');
  const department = tidy(p.state || '');
  const label = [name,city,department].filter(Boolean).join(', ');
  return {label,street:name,city,department,lat,lng,accuracy:'poi',
    kind:'place',source:'Geoapify Places',detail:'Confirmar entrada de recogida',
    placeId:tidy(p.place_id)};
}
function same(a,b) {
  if (valid(num(a.lat),num(a.lng)) && valid(num(b.lat),num(b.lng)) &&
    Math.abs(num(a.lat)-num(b.lat))<0.00015 && Math.abs(num(a.lng)-num(b.lng))<0.00015) return true;
  return fold(a.street || a.label) === fold(b.street || b.label) &&
    fold(a.city || a.department) === fold(b.city || b.department);
}
function combine(existing,added) {
  const fresh = added.filter(p=>p && !existing.some(x=>same(x,p)));
  if (!fresh.length) return existing;
  // La UI muestra 12 sugerencias. Reservar hasta 4 huecos para nuevos POI
  // sin desplazar los primeros resultados verificados de IDE Uruguay.
  const budget = Math.min(4,fresh.length);
  const items = existing.slice(0,12-budget);
  for (const p of fresh) if (!items.some(x=>same(x,p))) items.push(p);
  return items.slice(0,12);
}
async function search(q,lat,lng,key,fetcher,service) {
  const u = new URL('https://api.geoapify.com/v2/places');
  u.searchParams.set('categories',CATEGORIES);
  u.searchParams.set('name',poiName(q));
  u.searchParams.set('lang','es');
  u.searchParams.set('limit','12');
  // Traslados entre departamentos: el GPS ordena, NUNCA limita a 90 km.
  // Rectángulo aproximado de Uruguay + validación posterior country_code=uy.
  // countrycode:uy sigue documentado como «coming soon» para GET: evitar
  // depender de esa función hasta comprobarla con el proveedor real.
  u.searchParams.set('filter','rect:-58.6,-35.25,-53.1,-30.05');
  u.searchParams.set('bias',valid(lat,lng)
    ? 'proximity:'+lng+','+lat : 'proximity:-56.17,-34.90');
  if (!service) u.searchParams.set('apiKey',key);
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),2800);
  try {
    // Worker API conserva VIA_GEOAPIFY_API_KEY, nunca se copia a la WEB.
    const endpoint=service?new URL('https://via-poi.internal/api/via-places'):u;
    if(service){endpoint.searchParams.set('q',poiName(q));
      if(valid(lat,lng)){endpoint.searchParams.set('lat',String(lat));endpoint.searchParams.set('lng',String(lng));}}
    const response=service?
      await service.fetch(new Request(endpoint.toString(),{method:'GET',signal:controller.signal,headers:{Accept:'application/json'}})):
      await fetcher(u.toString(),{signal:controller.signal,headers:{Accept:'application/json'}});
    if (!response.ok) return [];
    const json = await response.json();
    return (Array.isArray(json?.features)?json.features:[]).map(normalize).filter(Boolean);
  } finally { clearTimeout(timeout); }
}
// Recibe la respuesta ORIGINAL del buscador. Ante cualquier error devuelve esa misma respuesta.
export async function extendPlaceSearch(request, originalResponse, env, fetcher=fetch) {
  const service=env?.VIA_POI_API&&typeof env.VIA_POI_API.fetch==='function'?env.VIA_POI_API:null;
  const apiKey=typeof env?.VIA_GEOAPIFY_API_KEY==='string'&&env.VIA_GEOAPIFY_API_KEY.length>=10
    ? env.VIA_GEOAPIFY_API_KEY : null;
  if(env?.VIA_PLACES_ENABLED!=='true'||(!apiKey&&!service))return originalResponse;
  try {
    const url = new URL(request.url);
    if (url.pathname !== '/api/direcciones' || url.searchParams.get('mode') !== 'places' ||
        !originalResponse.ok) return originalResponse;
    const q = tidy(url.searchParams.get('q'));
    if (skip(q)) return originalResponse;
    const old = await originalResponse.clone().json();
    if (!Array.isArray(old?.results)) return originalResponse;
    const lat = num(url.searchParams.get('lat')), lng = num(url.searchParams.get('lng'));
    const cacheKey = fold(q)+'|'+(valid(lat,lng)?lat.toFixed(2)+','+lng.toFixed(2):'uy');
    const cached = CACHE.get(cacheKey);
    let incoming;
    if (cached && cached.expires > now()) incoming = cached.places;
    else {
      if (!throttle(request)) return originalResponse;
      incoming = await search(q,lat,lng,apiKey,fetcher,service);
      if (CACHE.size >= MAX_CACHE) CACHE.clear();
      if (incoming.length) CACHE.set(cacheKey,{expires:now()+180000,places:incoming});
    }
    if (!incoming.length) return originalResponse;
    const merged = combine(old.results,incoming);
    if (merged.length === old.results.length && merged.every((item,i)=>item===old.results[i])) return originalResponse;
    const headers = new Headers(originalResponse.headers);
    headers.set('Content-Type','application/json; charset=utf-8');
    headers.set('Cache-Control','no-store');
    // Cuerpo JSON distinto: nunca reutilizar longitud, codificación ni ETag.
    for (const h of ['Content-Length','Content-Encoding','ETag','Last-Modified']) headers.delete(h);
    return new Response(JSON.stringify({...old,results:merged,provider:'IDE Uruguay + Geoapify Places'}),
      {status:originalResponse.status,headers});
  } catch { return originalResponse; }
}
