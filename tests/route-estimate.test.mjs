import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {routeEstimateRoutes} from '../backend/route-estimate.js';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))
 .map(x=>x.toString(16).padStart(2,'0')).join('');
const ID='VIA-ABC1234';
function fakeDb(){
 const booked={id:ID,origin:'Montevideo Shopping, Montevideo',destination:'Aeropuerto de Carrasco, Canelones'};
 const cache=new Map();let rates=0,queries=0;
 return {cache,get queries(){return queries},prepare(sql){let params=[];
 const q={bind(...p){params=p;return q},async first(){
  if(sql.includes('FROM bookings WHERE id='))return params[0]===ID?booked:null;
  if(sql.includes('FROM booking_routes WHERE booking_id='))return cache.get(params[0])||null;
  if(sql.startsWith('INSERT INTO otp_rate_limits')){rates++;return{attempts:rates};}
  if(sql.includes('FROM driver_assignments'))return null;
  return null;
 },async run(){
  if(sql.startsWith('INSERT INTO booking_routes')){queries++;cache.set(params[0],{distance_m:params[1],duration_s:params[2],updated_at:Math.floor(Date.now()/1000)});}
  return{meta:{changes:1}};
 }};return q;}}
};
const route=(headers={})=>new Request('https://api.via.example/api/operator/requests/'+ID+'/route',{headers});
test('no consultar kilómetros ni revelar reservas sin autenticación',async()=>{
 const db=fakeDb();
 const r=await routeEstimateRoutes(route(),{DB:db},'/api/operator/requests/'+ID+'/route');
 assert.equal(r.status,401);
});
test('sin Google Routes configurado se explica la ausencia de kilómetros, sin inventarlos',async()=>{
 const DB=fakeDb(),secret='llave-administrativa-de-prueba';
 const e={DB,OPERATOR_KEY_HASH:await hash(secret)};
 const r=await routeEstimateRoutes(route({'X-Operator-Key':secret}),e,'/api/operator/requests/'+ID+'/route');
 assert.equal(r.status,503);
 assert.equal((await r.json()).reason,'route_provider_missing');
 assert.equal(DB.queries,0);
});
test('ruta real se consulta una vez, calcula distancia y minutos, y se almacena sin clave',async()=>{
 const DB=fakeDb(),secret='llave-administrativa-de-prueba',e={
  DB,OPERATOR_KEY_HASH:await hash(secret),VIA_GOOGLE_ROUTES_KEY:'test-only-server-key'
 };
 const orig=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(String(url),'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(options.headers['X-Goog-Api-Key'],'test-only-server-key');
  const p=JSON.parse(options.body);
  assert.equal(p.travelMode,'DRIVE');
  assert.match(p.origin.address,/Uruguay/);
  return new Response(JSON.stringify({routes:[{distanceMeters:24250,duration:'2030s'}]}),{status:200});
 };
 try{
  const req=()=>route({'X-Operator-Key':secret});
  const first=await routeEstimateRoutes(req(),e,'/api/operator/requests/'+ID+'/route');
  assert.equal(first.status,200);
  assert.deepEqual(await first.json(),{
   distanceKm:24.3,durationMinutes:34,source:'Google Routes',estimate:true,
   trafficIncluded:false,cached:false
  });
  const second=await routeEstimateRoutes(req(),e,'/api/operator/requests/'+ID+'/route');
  assert.equal(second.status,200);
  assert.equal((await second.json()).cached,true);
  assert.equal(DB.queries,1);assert.equal(calls,1);
 }finally{globalThis.fetch=orig}
});
test('rutas sin resultados no muestran kilómetros ficticios',async()=>{
 const DB=fakeDb(),secret='llave-administrativa-de-prueba',
 env={DB,OPERATOR_KEY_HASH:await hash(secret),VIA_GOOGLE_ROUTES_KEY:'test-only-server-key'};
 const prev=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({routes:[]}),{status:200});
 try{
  const r=await routeEstimateRoutes(route({'X-Operator-Key':secret}),env,'/api/operator/requests/'+ID+'/route');
  assert.equal(r.status,422);assert.equal(DB.queries,0);
 }finally{globalThis.fetch=prev}
});
