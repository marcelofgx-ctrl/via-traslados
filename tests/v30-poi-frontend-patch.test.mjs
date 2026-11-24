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
const setMeta=(input,place)=>{}; // mode=places
function select(){
  if(false){}else chosen={...chosen,source:'address_search', postalStatus:chosen.accuracy==='portal'?'user_confirmed':'user_confirmed'};
  setMeta(input,place);
}
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

test('al seleccionar POI se conserva fuente y no se inventa verificación postal',()=>{
  const p=patchAutocompleteSource(original);
  const start=p.indexOf("else chosen=chosen.kind==='place'?");
  const end=p.indexOf(';',start);
  assert(start>0&&end>start,'No se cambió la rama de selección');
  const branch=p.slice(start,end+1);
  const check=new Function('chosen','let state=chosen;'+branch.replace('else chosen=','state=')+'return state;');
  const place=check({kind:'place',source:'Geoapify Places',accuracy:'poi',lat:-34.905,lng:-56.198});
  assert.equal(place.source,'Geoapify Places');
  assert.equal(place.postalStatus,'unknown');
  assert.equal(place.lat,-34.905);
  const portal=check({kind:'address',source:'IDE Uruguay',accuracy:'portal'});
  assert.equal(portal.source,'address_search');
  assert.equal(portal.postalStatus,'user_confirmed');
});
