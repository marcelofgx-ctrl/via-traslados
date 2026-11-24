import test from 'node:test';
import assert from 'node:assert/strict';
import {viaPoiHandle} from '../addons/v30-poi-api-proxy.mjs';
import {extendPlaceSearch} from '../addons/v30-geoapify-places.mjs';
const vars={VIA_GEOAPIFY_API_KEY:'fake-qa-secret-do-not-use'};
function db(){
 const values=new Map();
 return {prepare(sql){
   assert(sql.includes('otp_rate_limits'));
   return {bind(key,seconds){
     return {async first(){const n=(values.get(key)||0)+1;values.set(key,n);return {attempts:n};}};
   }};
 }};
}
const feature=(name='Radisson Victoria Plaza Hotel')=>({
 type:'Feature',properties:{name,country_code:'uy',city:'Montevideo',state:'Montevideo',place_id:'mock-radisson'},
 geometry:{type:'Point',coordinates:[-56.198,-34.905]}
});
test('proxy API mantiene secreto fuera de la respuesta y usa cobertura nacional',async()=>{
 const save=globalThis.fetch;
 let requested;
 globalThis.fetch=async url=>{
  requested=new URL(url);
  return new Response(JSON.stringify({features:[feature()]}),{status:200});
 };
 try{
  const response=await viaPoiHandle(new Request('https://api.via/api/via-places?q=Hotel%20Radisson&lat=-34.90&lng=-56.19'),{...vars,DB:db()});
  assert.equal(response.status,200);
  const raw=await response.text();
  assert(!raw.includes('fake-qa-secret'));
  const body=JSON.parse(raw);
  assert.equal(body.features.length,1);
  assert.equal(requested.searchParams.get('name'),'Hotel Radisson');
  assert.equal(requested.searchParams.get('filter'),'rect:-58.6,-35.25,-53.1,-30.05');
  assert.equal(requested.searchParams.get('bias'),'proximity:-56.19,-34.9');
  assert.equal(requested.searchParams.get('apiKey'),vars.VIA_GEOAPIFY_API_KEY);
 }finally{globalThis.fetch=save}
});
test('sin clave API el servicio rechaza sin intentar consultar proveedor',async()=>{
 const r=await viaPoiHandle(new Request('https://api.via/api/via-places?q=Radisson'),
   {DB:db()});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'geoapify_unconfigured');
});
test('filtra POI fuera de Uruguay sin introducir coordenadas falsas',async()=>{
 const save=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({features:[
  feature(),{...feature('Otro'),properties:{name:'Otro',country_code:'ar'},
    geometry:{type:'Point',coordinates:[-58.3,-34.6]}}
 ]}),{status:200});
 try{
  const r=await viaPoiHandle(new Request('https://api.via/api/via-places?q=Radisson'),{...vars,DB:db()});
  assert.equal((await r.json()).features.length,1);
 }finally{globalThis.fetch=save}
});
test('el Worker web invoca el binding y combina IDE con POI, sin copiar clave',async()=>{
 let called=false;
 const service={async fetch(request){
   called=true;
   const u=new URL(request.url);
   assert.equal(u.pathname,'/api/via-places');
   assert.equal(u.searchParams.get('q'),'Radisson');
   assert.equal(u.searchParams.get('lat'),'-34.9');
   return new Response(JSON.stringify({features:[feature()]}));
 }};
 const req=new Request('https://viatraslados.com/api/direcciones?mode=places&q=Radisson&lat=-34.90&lng=-56.19');
 const old=new Response(JSON.stringify({results:[{label:'Aeropuerto Carrasco',street:'Aeropuerto Carrasco',
  city:'Canelones',lat:-34.83696,lng:-56.01638,kind:'place'}],mode:'places',provider:'IDE Uruguay'}));
 const r=await extendPlaceSearch(req,old,{VIA_PLACES_ENABLED:'true',VIA_POI_API:service},
   async()=>{throw Error('La web no debe consultar Geoapify ni su clave')});
 assert(called);
 const d=await r.json();
 assert.equal(d.results.length,2);
 assert.equal(d.results[1].source,'Geoapify Places');
 assert.equal(d.results[1].lat,-34.905);
 assert.equal(d.results[1].lng,-56.198);
});
test('sin flag la web no usa el binding y conserva respuesta exacta IDE',async()=>{
 let called=false;
 const old=new Response(JSON.stringify({results:[{label:'Base IDE'}]}));
 const r=await extendPlaceSearch(new Request('https://viatraslados.com/api/direcciones?mode=places&q=Radisson'),
  old,{VIA_POI_API:{async fetch(){called=true;throw Error()}}});
 assert.strictEqual(r,old);assert.equal(called,false);
});
