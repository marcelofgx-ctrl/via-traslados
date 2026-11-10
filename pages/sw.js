// Vía Traslados — nunca servir formularios públicos desde caché si el servicio está suspendido.
const VERSION='via-traslados-public-gate-v2';
const ASSETS=['./styles.css','./premium.css','./map.js','./app.js','./store.js','./config.js','./manifest.webmanifest','./icon.svg','./rambla-atmosfera.webp','./rambla-skyline-v09.webp','./reference.css','./reference.js','./address-autocomplete.css','./address-autocomplete.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('via-traslados-')&&key!==VERSION).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
 const nav=req.mode==='navigate'||url.pathname==='/'||url.pathname.endsWith('.html');
 if(nav){
  // Navegación obligatoriamente en línea para respetar el interruptor del administrador.
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).catch(()=>new Response('Vía Traslados no está disponible sin conexión.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}})));
  return;
 }
 event.respondWith(fetch(req).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(req,copy)).catch(()=>{});}
  return response;
 }).catch(()=>caches.match(req)));
});
