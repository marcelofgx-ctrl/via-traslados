import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=file=>readFileSync(new URL('../pages/'+file,import.meta.url),'utf8');

function client(){
 const inputs={};
 const makeInput=()=>({value:'',dataset:{},setAttribute(){},addEventListener(){}});
 for(const id of ['home-origin','home-destination','origin','destination'])inputs[id]=makeInput();
 const document={
  getElementById(id){return inputs[id]||null},
  createElement(){return{classList:{add(){},remove(){}},setAttribute(){},replaceChildren(){},style:{}}},
  body:{appendChild(){}},
  addEventListener(){}
 };
 const listeners={};
 const window={addEventListener(type,callback){listeners[type]=callback}};
 runInNewContext(read('address-autocomplete.js'),{document,window});
 return{inputs,via:window.ViaAddress,listeners};
}
test('Roque Sáenz Peña 1711: cambiar Lagomar por Shangrilá sin desplazar coordenadas',()=>{
 const {inputs,via}=client();
 via.set('home-origin',{
  label:'ROQUE SAENZ PEÑA 1711, LAGOMAR, CANELONES',
  street:'ROQUE SAENZ PEÑA 1711',city:'Lagomar',department:'Canelones',
  lat:-34.843,lng:-56.040,accuracy:'portal'
 });
 assert.equal(inputs['home-origin'].value,'ROQUE SAENZ PEÑA 1711, Shangrilá, CANELONES');
 assert.equal(inputs['home-origin'].dataset.city,'Shangrilá');
 assert.equal(inputs['home-origin'].dataset.lat,'-34.843');
 assert.equal(inputs['home-origin'].dataset.lng,'-56.04');
 assert.equal(inputs['home-origin'].dataset.accuracy,'portal');
 via.copy('home-origin','origin');
 assert.equal(inputs.origin.value,inputs['home-origin'].value);
 assert.equal(inputs.origin.dataset.city,'Shangrilá');
});
test('la dirección guardada por el navegador también se corrige al volver a Inicio',()=>{
 const {inputs,listeners}=client();
 inputs['home-origin'].value='ROQUE SAENZ PEÑA 1711, LAGOMAR, CANELONES';
 listeners.pageshow();
 assert.equal(inputs['home-origin'].value,'ROQUE SAENZ PEÑA 1711, Shangrilá, CANELONES');
});

test('no cambiar ninguna otra altura ni calles del mismo departamento',()=>{
 const {inputs,via}=client();
 const cases=[
  ['Roque Sáenz Peña 1700, Lagomar, Canelones','Roque Sáenz Peña 1700','Lagomar','Canelones'],
  ['Calle Roque Sáenz Peña 1711, Lagomar, Canelones','Calle Roque Sáenz Peña 1711','Lagomar','Canelones'],
  ['Roque Sáenz Peña 1711, Montevideo, Montevideo','Roque Sáenz Peña 1711','Montevideo','Montevideo'],
  ['Roque Sáenz Peña 1711, Shangrilá, Canelones','Roque Sáenz Peña 1711','Shangrilá','Canelones']
 ];
 for(const [label,street,city,department] of cases){
  via.set('home-origin',{label,street,city,department,accuracy:'street'});
  assert.equal(inputs['home-origin'].value,label);
  assert.equal(inputs['home-origin'].dataset.city,city);
 }
});
test('corregir respuesta IDE tanto en sugerencias como en resolución exacta',async()=>{
 const source=read('_worker.js').replace('export default {async fetch(','globalThis.__viaWorker={async fetch(');
 const row={nomVia:'ROQUE SAENZ PEÑA',portalNumber:1711,localidad:'Lagomar',
  departamento:'Canelones',lat:-34.84,lng:-56.04,type:'CALLEyPORTAL',stateMsg:''};
 const context={URL,Response,AbortController,setTimeout,clearTimeout,
  fetch:async()=>new Response(JSON.stringify([row]),{status:200,headers:{'content-type':'application/json'}})};
 runInNewContext(source,context);
 for(const mode of ['suggest','resolve']){
  const url='https://viatraslados.com/api/direcciones?mode='+mode+
   '&q='+encodeURIComponent('Roque Sáenz Peña 1711, Shangrilá');
  const answer=await context.__viaWorker.fetch(new Request(url),{});
  assert.equal(answer.status,200);
  const result=await answer.json();
  assert.equal(result.results[0].city,'Shangrilá');
  assert.equal(result.results[0].label,'ROQUE SAENZ PEÑA 1711, Shangrilá, Canelones');
  assert.equal(result.results[0].lat,row.lat);
  assert.equal(result.results[0].lng,row.lng);
 }
 const other='https://viatraslados.com/api/direcciones?mode=suggest&q='+encodeURIComponent('Roque Sáenz Peña 1700');
 const answer=await context.__viaWorker.fetch(new Request(other),{});
 const result=await answer.json();
 assert.equal(result.results[0].city,'Lagomar','sin información fiable no se inventan otras localidades');
});
