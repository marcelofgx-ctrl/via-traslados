import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {routeEstimateRoutes} from '../backend/route-estimate.js';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))
 .map(x=>x.toString(16).padStart(2,'0')).join('');
const ID='VIA-ABC1234';
const path='/api/operator/requests/'+ID+'/route';
const route=(headers={})=>new Request('https://api.via.example'+path,{headers});
const sample={
 id:ID,origin:'Roque Saenz Peña 1711, Shangrilá, Canelones',
 destination:'Doctor Luis Bonavita 1266, Montevideo'
};
function fakeDb(booking=sample){
 const cache=new Map(),rates=new Map();
 let queries=0;
 return {cache,rates,get queries(){return queries},prepare(sql){
  let args=[];
  const q={bind(...p){args=p;return q},async first(){
   if(sql.includes('FROM bookings WHERE id='))return args[0]===ID?booking:null;
   if(sql.includes('FROM booking_routes WHERE booking_id='))return cache.get(args[0])||null;
   if(sql.startsWith('INSERT INTO otp_rate_limits')){
    const count=(rates.get(args[0])||0)+1;rates.set(args[0],count);return{attempts:count};
   }
   if(sql.includes('FROM driver_assignments'))return null;
   return null;
  },async run(){
   if(sql.startsWith('INSERT INTO booking_routes')){
    queries++;cache.set(args[0],{distance_m:args[1],duration_s:args[2],provider:args[3],updated_at:Math.floor(Date.now()/1000)});
   }
   return{meta:{changes:1}};
  }};
  return q;
 }};
}
const auth=async DB=>({DB,OPERATOR_KEY_HASH:await hash('test-admin-secret'),VIA_GEOAPIFY_API_KEY:'geo-test-secret-only'});
const admin=()=>route({'X-Operator-Key':'test-admin-secret'});
const mockIde=u=>{
 const s=new URL(u).searchParams.get('q')||'';
 if(s.includes('Roque Saenz'))return[{lat:-34.831, lng:-56.031,type:'CALLEyPORTAL'}];
 if(s.includes('Bonavita'))return[{lat:-34.896,lng:-56.141,type:'CALLEyPORTAL'}];
 return[];
};
const realRoute={results:[{distance:24250,time:2030}]};
test('autenticación obligatoria; no se filtra ruta ni datos',async()=>{
 const r=await routeEstimateRoutes(route(),{DB:fakeDb()},path);
 assert.equal(r.status,401);
});
test('sin secreto Geoapify no devuelve kilómetros inventados ni llama a proveedores',async()=>{
 const DB=fakeDb(),env=await auth(DB);delete env.VIA_GEOAPIFY_API_KEY;
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('no external calls expected')};
 try{
  const r=await routeEstimateRoutes(admin(),env,path);
  assert.equal(r.status,503);
  assert.equal((await r.json()).reason,'route_provider_missing');
  assert.equal(calls,0);assert.equal(DB.queries,0);
 }finally{globalThis.fetch=old}
});
test('IDE Uruguay + Geoapify: kilómetros y minutos automáticos, con cacheo',async()=>{
 const DB=fakeDb(),env=await auth(DB),old=globalThis.fetch;
 let ideCalls=0,geoCalls=0;
 globalThis.fetch=async url=>{
  const u=new URL(url);
  if(u.hostname==='direcciones.ide.uy'){
   ideCalls++;return new Response(JSON.stringify(mockIde(u)),{status:200});
  }
  assert.equal(u.hostname,'api.geoapify.com');
  assert.equal(u.pathname,'/v1/routing');
  geoCalls++;
  assert.equal(u.searchParams.get('apiKey'),env.VIA_GEOAPIFY_API_KEY);
  assert.equal(u.searchParams.get('mode'),'drive');
  assert.equal(u.searchParams.get('format'),'json');
  assert.equal(u.searchParams.get('waypoints'),'-34.831000,-56.031000|-34.896000,-56.141000');
  return new Response(JSON.stringify(realRoute),{status:200});
 };
 try{
  const r=await routeEstimateRoutes(admin(),env,path);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{
   distanceKm:24.3,durationMinutes:34,source:'Geoapify',estimate:true,
   trafficIncluded:false,cached:false,
   attribution:'© OpenStreetMap contributors · Powered by Geoapify',
   attributionUrl:'https://www.geoapify.com/'
  });
  const cached=await routeEstimateRoutes(admin(),env,path);
  assert.equal(cached.status,200);
  assert.equal((await cached.json()).cached,true);
  assert.equal(geoCalls,1);assert.equal(ideCalls,2);
  assert.equal(DB.cache.get(ID).provider,'geoapify');
 }finally{globalThis.fetch=old}
});
test('lugares verificados usan coordenadas sin geocodificar nuevamente',async()=>{
 const DB=fakeDb({id:ID,origin:'Montevideo Shopping, Montevideo',
  destination:'Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones'});
 const env=await auth(DB),old=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{
  const u=new URL(url);calls++;
  assert.equal(u.pathname,'/v1/routing');
  const waypoints=u.searchParams.get('waypoints');
  assert.match(waypoints,/^-34\.908680,-56\.138018\|-34\.836960,-56\.016380$/);
  return new Response(JSON.stringify(realRoute),{status:200});
 };
 try{
  const r=await routeEstimateRoutes(admin(),env,path);
  assert.equal(r.status,200);assert.equal(calls,1);
 }finally{globalThis.fetch=old}
});
test('Geoapify Geocoding se usa solo si IDE no resuelve con precisión',async()=>{
 const DB=fakeDb(),env=await auth(DB),old=globalThis.fetch;
 let geocodeCalls=0,routeCalls=0;
 globalThis.fetch=async url=>{
  const u=new URL(url);
  if(u.hostname==='direcciones.ide.uy')
   return new Response(JSON.stringify([{lat:-34.85,lng:-56.05,type:'CALLE'}]),{status:200});
  if(u.pathname==='/v1/geocode/search'){
   geocodeCalls++;assert.equal(u.searchParams.get('filter'),'countrycode:uy');
   const roque=String(u.searchParams.get('text')).includes('Roque');
   return new Response(JSON.stringify({results:[{
    lat:roque?-34.831:-34.896,lon:roque?-56.031:-56.141,country_code:'uy',
    housenumber:roque?'1711':'1266',rank:{confidence:0.95,match_type:'full_match'}
   }]}),{status:200});
  }
  routeCalls++;
  return new Response(JSON.stringify(realRoute),{status:200});
 };
 try{
  const r=await routeEstimateRoutes(admin(),env,path);
  assert.equal(r.status,200);
  assert.equal(geocodeCalls,2);assert.equal(routeCalls,1);
 }finally{globalThis.fetch=old}
});
test('coordenadas imprecisas no generan rutas falsas',async()=>{
 const DB=fakeDb(),env=await auth(DB),old=globalThis.fetch;let routes=0;
 globalThis.fetch=async url=>{
  const u=new URL(url);
  if(u.hostname==='direcciones.ide.uy')
   return new Response(JSON.stringify([{lat:-34.85,lng:-56.05,type:'CALLE'}]),{status:200});
  if(u.pathname==='/v1/geocode/search')
   return new Response(JSON.stringify({results:[{
    lat:-34.88,lon:-56.12,country_code:'uy',rank:{confidence:0.3}
   }]}),{status:200});
  routes++;return new Response(JSON.stringify(realRoute),{status:200});
 };
 try{
  const r=await routeEstimateRoutes(admin(),env,path);
  assert.equal(r.status,422);assert.equal(routes,0);assert.equal(DB.queries,0);
 }finally{globalThis.fetch=old}
});
test('errores de API y cuenta sin permiso no exponen secretos',async()=>{
 const DB=fakeDb(),env=await auth(DB);
 const unauthorized=await routeEstimateRoutes(route(),env,path);
 assert.equal(unauthorized.status,401);
 const prev=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=new URL(url);
  if(u.hostname==='direcciones.ide.uy')
   return new Response(JSON.stringify(mockIde(u)),{status:200});
  return new Response(JSON.stringify({message:'rate limit exceeded'}),{status:429});
 };
 try{
  const res=await routeEstimateRoutes(admin(),env,path);
  assert.equal(res.status,429);
  const body=JSON.stringify(await res.json());
  assert.equal(body.includes(env.VIA_GEOAPIFY_API_KEY),false);
 }finally{globalThis.fetch=prev}
});
