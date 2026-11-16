import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../pages/api/direcciones.mjs',import.meta.url),'utf8').replace('export default async function handler(', 'module.exports=async function handler(');
function setup(mockFetch){
 const module={exports:{}};
 runInNewContext(source,{module,exports:module.exports,URL,AbortSignal,fetch:mockFetch});
 return async(query)=>{
  let status=200,headers={};
  const res={setHeader(k,v){headers[k]=v},status(v){status=v;return this},json(v){this.payload=v;return this}};
  await module.exports({method:'GET',query},res);
  return {status,...res.payload};
 };
}
const row=(street,n,city,department,lat,lng)=>({
 nomVia:street,portalNumber:n,localidad:city,departamento:department,lat,lng,
 type:'CALLEyPORTAL',stateMsg:''
});
const response=rows=>({ok:true,json:async()=>rows});
const candidates=rows=>setup(async()=>response(rows));

test('prioriza el portal en Lagomar frente a la misma calle en Montevideo',async()=>{
 const search=candidates([
  row('Roque Saenz Peña',1711,'Pocitos','Montevideo',-34.91,-56.15),
  row('Roque Saenz Peña',1711,'Lagomar','Canelones',-34.84,-56.04)
 ]);
 const result=await search({q:'Roque Saenz Peña 1711, Lagomar',mode:'suggest'});
 assert.equal(result.status,200);
 assert.equal(result.results[0].department,'Canelones');
 assert.equal(result.results[0].lat,-34.84);
});
test('no adjudica coordenadas cuando la puerta difiere',async()=>{
 const search=candidates([row('Roque Saenz Peña',1713,'Lagomar','Canelones',-34.84,-56.04)]);
 const r=await search({q:'Roque Saenz Peña 1711, Shangrilá',mode:'resolve'});
 assert.equal(r.status,200);
 assert.equal(r.results.length,0);
});
test('no sustituye localidades por excepciones locales',async()=>{
 const search=candidates([row('Roque Saenz Peña',1711,'Lagomar','Canelones',-34.84,-56.04)]);
 const mismatch=await search({q:'Roque Saenz Peña 1711, Shangrilá',mode:'resolve'});
 assert.equal(mismatch.results.length,0);
 const r=await search({q:'Roque Saenz Peña 1711, Lagomar',mode:'resolve'});
 assert.equal(r.results.length,1);
 assert.equal(r.results[0].city,'Lagomar');
 assert.equal(r.results[0].accuracy,'portal');
});
test('puntos de interés siguen funcionando en QA',async()=>{
 const search=setup(async()=>response([]));
 const r=await search({q:'aeropuerto carrasco',mode:'places'});
 assert.equal(r.status,200);
 assert.equal(r.results[0].street,'Aeropuerto Internacional de Carrasco');
 assert.equal(r.results[0].kind,'place');
});
test('no se aceptan consultas vacías',async()=>{
 const search=candidates([]);
 const r=await search({q:'x',mode:'suggest'});
 assert.equal(r.status,400);
});

test('geocodificación inversa no certifica domicilio aunque el portal esté cerca',async()=>{
 const search=candidates([row('Calle Test',450,'Ciudad Test','Canelones',-34.84,-56.04)]);
 const r=await search({mode:'reverse',lat:-34.840001,lng:-56.040001});
 assert.equal(r.policy,'reference_only');
 assert.equal(r.results[0].referenceOnly,true);
});
