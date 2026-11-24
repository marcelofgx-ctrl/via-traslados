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
    assert.equal(u.searchParams.get('name'),'Hotel Radisson');
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
