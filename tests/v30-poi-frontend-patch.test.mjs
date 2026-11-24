import test from 'node:test';
import assert from 'node:assert/strict';
import {patchAutocompleteSource} from '../scripts/v30-poi-frontend-patch.mjs';
const original=String.raw`
function search(input){const q=input.value.trim();
  const isPlaceQuery=/\b(aeropuerto|shopping|hotel|hospital|sanatorio|terminal|estadio|universidad|costa urbana|centro comercial|plaza|teatro)\b/i.test(q);
  const [streets,places]=Promise.all([]);
  const poiResults=[],streetResults=[];
  const looksLikePlace=/\b(hotel|shopping)\b/i.test(q);
  const looksLikeAddress=false;
  const results=(looksLikePlace&&!looksLikeAddress)?[...poiResults,...streetResults]:[...streetResults,...poiResults];
  const unique=new Map();
}
function select(){ setMeta(input,place); } // mode=places
`;
test('no parchea un archivo desconocido ni se aplica dos veces',()=>{
  assert.throws(()=>patchAutocompleteSource('irreconocible'),/distinto/);
  const once=patchAutocompleteSource(original);
  assert.throws(()=>patchAutocompleteSource(once),/distinto/);
});
test('nombres propios activan places y calles/números se conservan',()=>{
  const p=patchAutocompleteSource(original);
  const start=p.indexOf('const legacyPlaceQuery=');
  const end=p.indexOf('const [streets,places]=');
  const check=new Function('q',p.slice(start,end)+'return isPlaceQuery;');
  for(const q of ['Hertz','Radisson','La Perdiz','Hyatt Centric Montevideo','Hotel Radisson'])
    assert.equal(check(q),true,q);
  for(const q of ['Av Italia 1000','Calle Colonia 1234','Camino Carrasco','Rambla República de México'])
    assert.equal(check(q),false,q);
});
test('una lista de doce calles reserva cuatro huecos para POI',()=>{
  const p=patchAutocompleteSource(original);
  const start=p.indexOf('const poiSlots=');
  const end=p.indexOf('const unique=new Map()');
  const arrange=new Function('looksLikePlace','looksLikeAddress','poiResults','streetResults',
    p.slice(start,end)+'return results;');
  const streets=Array.from({length:12},(_,i)=>'Calle '+i);
  const pois=['Hotel A','Restaurante B','Alquiler C','Hotel D'];
  const result=arrange(false,false,pois,streets);
  assert.equal(result.length,16);
  assert.deepEqual(result.slice(0,8),streets.slice(0,8));
  assert.deepEqual(result.slice(8,12),pois);
  assert.deepEqual(result.slice(0,12).filter(x=>pois.includes(x)),pois);
  assert.deepEqual(arrange(false,false,[],streets),streets);
});
