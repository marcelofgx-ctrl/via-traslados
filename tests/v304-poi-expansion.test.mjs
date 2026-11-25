import test from 'node:test';
import assert from 'node:assert/strict';
import {variant,rankFeatures,expandedProxy,rankPlaces} from '../addons/v304-poi-expansion.mjs';
const f=(name,id,lat,lng)=>({properties:{name,place_id:id,country_code:'uy'},geometry:{coordinates:[lng,lat]}});
test('generic query variants and name relevance',()=>{
 assert.equal(variant('Nuevo centro shopping'),'nuevocentro');
 assert.equal(variant('Punta Carretas shopping'),'puntacarretas');
 assert.equal(variant('Hotel Radisson'),'radisson');
 const rows=rankFeatures('Nuevo centro shopping',[f('Nuevocentro Shopping','a',-34.88,-56.16),f('Nuevo Centro Local','b',-34.90,-56.17),f('Otro Shopping','c',-34.87,-56.16)],-34.90,-56.17);
 assert.deepEqual(rows.map(x=>x.properties.place_id),['a','b']);
});
test('same chain ranks by proximity and retains distinct branches',()=>{
 const rows=rankFeatures('Cadena',[f('Cadena','far',-34.82,-56.1),f('Cadena','near',-34.9,-56.17),f('Cadena','near',-34.9,-56.17)],-34.9,-56.17);
 assert.deepEqual(rows.map(x=>x.properties.place_id),['near','far']);
 assert.deepEqual(rankPlaces('Cadena',[{name:'Cadena',lat:-34.82,lng:-56.1},{name:'Cadena',lat:-34.9,lng:-56.17}],-34.9,-56.17).map(x=>x.lat),[-34.9,-34.82]);
});
test('only one fallback, cached; quota error does not trigger fallback',async()=>{
 const calls=[];const req=new Request('https://internal/api/via-places?q=Nuevo+centro+shopping&lat=-34.9&lng=-56.17');
 const load=async r=>{const q=new URL(r.url).searchParams.get('q');calls.push(q);return Response.json({features:q==='nuevocentro'?[f('Nuevocentro Shopping','a',-34.88,-56.16)]:[]})};
 assert.equal((await (await expandedProxy(req,load)).json()).features.length,1);
 assert.deepEqual(calls,['nuevocentro','Nuevo centro shopping']);
 await expandedProxy(req,load);assert.equal(calls.length,2);
 let n=0;const r=await expandedProxy(new Request('https://internal/api/via-places?q=Otro+comercio'),async()=>{n++;return Response.json({error:'quota'},{status:429})});assert.equal(r.status,429);assert.equal(n,1);
});
