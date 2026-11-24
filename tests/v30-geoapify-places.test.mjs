import test from 'node:test';
import assert from 'node:assert/strict';
import {extendPlaceSearch} from '../addons/v30-geoapify-places.mjs';
const request = (q='Hotel Radisson',extra='') => new Request('https://viatraslados.com/api/direcciones?mode=places&q='+encodeURIComponent(q)+extra,{
  headers:{'CF-Connecting-IP':'192.0.2.1'}});
const legacy = () => new Response(JSON.stringify({results:[{
  label:'Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones',
  street:'Aeropuerto Internacional de Carrasco',city:'Colonia Nicolich',department:'Canelones',
  lat:-34.83696,lng:-56.01638,kind:'place',accuracy:'poi'
}],mode:'places',provider:'IDE Uruguay'}),{headers:{'Content-Type':'application/json'}});
const enabled={VIA_PLACES_ENABLED:'true',VIA_GEOAPIFY_API_KEY:'test_key_safely_long_enough'};
const mock = (name='Radisson Victoria Plaza Hotel',country='uy') =>
  async url => {
    const u = new URL(url);
    assert.equal(u.host,'api.geoapify.com');
    assert.equal(u.pathname,'/v2/places');
    assert.equal(u.searchParams.get('name'),'Radisson');
    assert(u.searchParams.get('categories').includes('rental.car'));
    return new Response(JSON.stringify({features:[{properties:{
      name,city:'Montevideo',state:'Montevideo',country_code:country,place_id:'poi-1'
    },geometry:{coordinates:[-56.198,-34.905]}}]}),{status:200});
  };
test('apagado retorna misma respuesta IDE, sin llamar proveedor',async()=>{
  const original=legacy();let calls=0;
  const result=await extendPlaceSearch(request(),original,{},async()=>{calls++;throw Error('unreachable')});
  assert.strictEqual(result,original);assert.equal(calls,0);
});
test('apagado aun con secret: exige flag explícito',async()=>{
  const original=legacy();
  const result=await extendPlaceSearch(request(),original,
    {VIA_GEOAPIFY_API_KEY:'long-secret-not-activated'},async()=>{throw Error('unexpected')});
  assert.strictEqual(result,original);
});
test('agrega POI real sin eliminar resultados IDE',async()=>{
  const res=await extendPlaceSearch(request(),legacy(),enabled,mock());
  const body=await res.json();
  assert.equal(body.results.length,2);
  assert.equal(body.results[0].source,undefined);
  assert.equal(body.results[1].source,'Geoapify Places');
  assert.equal(body.results[1].lat,-34.905);
  assert.equal(body.results[1].lng,-56.198);
  assert.equal(body.results[1].kind,'place');
});
test('filtra coordenadas y países fuera de Uruguay',async()=>{
  const original=legacy();
  const res=await extendPlaceSearch(request('Hotel Radisson','&lat=-34.9&lng=-56.1'),original,enabled,mock('Radisson Victoria Plaza Hotel','ar'));
  assert.strictEqual(res,original);
});
test('búsquedas de calle y número mantienen IDE sin consumo',async()=>{
  const original=legacy();let calls=0;
  const res=await extendPlaceSearch(request('Roque Saenz Pena 1711'),original,enabled,async()=>{calls++;throw Error()});
  assert.strictEqual(res,original);assert.equal(calls,0);
});
test('si Geoapify falla, no falla el buscador IDE',async()=>{
  const original=legacy();
  const res=await extendPlaceSearch(request('Hotel Radisson','&lat=-34.91&lng=-56.21'),original,enabled,
    async()=>{throw new Error('upstream down')});
  assert.strictEqual(res,original);
});
test('no altera ningún endpoint distinto de places',async()=>{
  const original=legacy();
  const r=new Request('https://viatraslados.com/api/direcciones?mode=reverse&lat=-34.9&lng=-56.2');
  const res=await extendPlaceSearch(r,original,enabled,async()=>{throw new Error('unexpected')});
  assert.strictEqual(res,original);
});

test('un listado IDE lleno deja visibles lugares comerciales añadidos',async()=>{
  const full=Array.from({length:12},(_,i)=>({label:'Punto '+i,street:'Punto '+i,
    city:'Montevideo',lat:-34.8+i*0.001,lng:-56.1,kind:'place'}));
  const original=new Response(JSON.stringify({results:full,mode:'places'}),{
    headers:{'Content-Type':'application/json'}});
  const result=await extendPlaceSearch(request(),original,enabled,mock());
  const body=await result.json();
  assert.equal(body.results.length,12);
  assert.equal(body.results[0].label,'Punto 0');
  assert(body.results.some(x=>x.source==='Geoapify Places'));
});

test('GPS en Montevideo no impide buscar un hotel lejano en Maldonado',async()=>{
  let called=false;
  const req=request('Enjoy Punta del Este','&lat=-34.905&lng=-56.19');
  const r=await extendPlaceSearch(req,legacy(),enabled,async link=>{
    called=true;
    const url=new URL(link);
    assert.equal(url.searchParams.get('filter'),'rect:-58.6,-35.25,-53.1,-30.05');
    assert.equal(url.searchParams.get('bias'),'proximity:-56.19,-34.905');
    assert.equal(url.searchParams.get('name'),'Enjoy Punta del Este');
    return new Response(JSON.stringify({features:[{
      properties:{name:'Enjoy Punta del Este',city:'Punta del Este',
        state:'Maldonado',country_code:'uy',place_id:'remote-maldonado'},
      geometry:{coordinates:[-54.936,-34.947]}
    }]}),{status:200});
  });
  assert(called);
  const body=await r.json();
  assert(body.results.some(x=>x.placeId==='remote-maldonado'));
  assert(body.results.some(x=>x.source==='Geoapify Places'&&x.lat===-34.947));
});

test('búsqueda sin GPS usa todo Uruguay y sesgo a Montevideo',async()=>{
  const req=request('Radisson Montevideo hotel');
  await extendPlaceSearch(req,legacy(),enabled,async link=>{
    const url=new URL(link);
    assert.equal(url.searchParams.get('filter'),'rect:-58.6,-35.25,-53.1,-30.05');
    assert.equal(url.searchParams.get('bias'),'proximity:-56.17,-34.90');
    return new Response(JSON.stringify({features:[]}),{status:200});
  });
});

test('no replica longitud ni ETag tras ampliar la respuesta JSON',async()=>{
  const original=legacy();
  original.headers.set('ETag','"version-antigua"');
  original.headers.set('Content-Length','77');
  const req=request('Posada del Sol Maldonado');
  const r=await extendPlaceSearch(req,original,enabled,async()=>{
    return new Response(JSON.stringify({features:[{
      properties:{name:'Posada del Sol',country_code:'uy',city:'Maldonado'},
      geometry:{coordinates:[-54.95,-34.90]}
    }]}),{status:200});
  });
  assert.equal(r.headers.has('ETag'),false);
  assert.equal(r.headers.has('Content-Length'),false);
  assert((await r.json()).results.some(x=>x.source==='Geoapify Places'));
});
