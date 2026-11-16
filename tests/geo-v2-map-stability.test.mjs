import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as geo from '../pages/geo-v2/core.mjs';
const source=readFileSync(new URL('../pages/map-point-picker.js',import.meta.url),'utf8');

function makeEnvironment(reverseRows=[]){
 const listeners={},inputs={},widgets={},timers=new Map();let timerId=0;
 let gl=null,reverseCalls=0,lastSelection=null,resizeCalls=0;
 const makeEl=id=>({id,hidden:false,disabled:false,style:{},dataset:{},value:'',children:[],attributes:{},listeners:{},
  classList:{add(){},remove(){}},getBoundingClientRect(){return{width:700,height:600}},
  setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},
  addEventListener(k,fn){this.listeners[k]=fn},appendChild(el){this.children.push(el)},
  append(){},replaceChildren(){this.children=[]},focus(){},blur(){},closest(){return this.parent||null},
  dispatchEvent(){},querySelector(k){return this.refs?.[k]||null},querySelectorAll(){return []},
  set innerHTML(v){this.markup=v}});
 const names=['#via-picker-title','.via-picker-reference','.via-picker-coordinates','#via-picker-query',
  '#via-picker-results','.via-picker-tile-warning','.via-picker-close','.via-picker-confirm',
  '.via-picker-recenter','.via-picker-retry','.via-picker-clear','#via-picker-map'];
 for(const name of names)widgets[name]=makeEl(name);
 widgets['.via-picker-tile-warning'].refs={'span':makeEl('span')};
 const modal=makeEl('modal');modal.hidden=true;modal.refs=widgets;
 for(const id of ['home-origin','home-destination','origin','destination']){
  inputs[id]=makeEl(id);inputs[id].parent=makeEl(id+'-parent');
 }
 inputs['home-origin'].dataset={lat:'-34.85',lng:'-56.00',accuracy:'gps',postalStatus:'suggested'};
 inputs['home-origin'].value='Cerca de Calle Anterior 50';
 const doc={body:makeEl('body'),activeElement:makeEl('active'),
  createElement:tag=>tag==='div'?modal:makeEl(tag),
  getElementById:id=>inputs[id]||null,addEventListener(){}};
 class GL {
  constructor(cfg){gl=this;this.point={lat:cfg.center[1],lng:cfg.center[0]};this.zoom=cfg.zoom;this.events={}}
  addControl(){} on(k,fn){this.events[k]=fn}
  getCenter(){return this.point} getZoom(){return this.zoom}
  jumpTo(x){this.point={lat:x.center[1],lng:x.center[0]};this.zoom=x.zoom;this.events.moveend?.()}
  easeTo(x){this.point={lat:x.center[1],lng:x.center[0]};this.events.moveend?.()}
  resize(){resizeCalls++;this.events.moveend?.()}
 }
 const win={ViaGeoV2:geo,maplibregl:{Map:GL,supported:()=>true,NavigationControl:class{},AttributionControl:class{}},
  ViaAddress:{get(id){const el=inputs[id];return{label:el.value,
    lat:el.dataset.lat?Number(el.dataset.lat):null,lng:el.dataset.lng?Number(el.dataset.lng):null,
    postalStatus:el.dataset.postalStatus,city:el.dataset.city||'',department:el.dataset.department||''}},
   set(id,p){lastSelection=p;inputs[id].value=p.label;Object.assign(inputs[id].dataset,
    {lat:String(p.lat),lng:String(p.lng),postalStatus:p.postalStatus,accuracy:p.accuracy})}},
  ViaSearchLocation:{get(){return null},update(){}},addEventListener(){}};
 const timeout=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId};
 const clear=id=>timers.delete(id);
 const fakeFetch=async()=>{reverseCalls++;return{ok:true,json:async()=>({results:reverseRows})}};
 class EventClass{constructor(type,detail={}){this.type=type;this.detail=detail.detail}}
 runInNewContext(source,{document:doc,window:win,navigator:{geolocation:{getCurrentPosition(){}}},
  L:{},requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){},
  setTimeout:timeout,clearTimeout:clear,AbortController,
  CustomEvent:EventClass,Event:EventClass,fetch:fakeFetch});
 return{
  modal,inputs,widgets,get gl(){return gl},get reverseCalls(){return reverseCalls},
  get selection(){return lastSelection},get resizeCalls(){return resizeCalls},
  open(id='home-origin'){inputs[id].parent.children[0].listeners.click({preventDefault(){},stopPropagation(){}})},
  drag(lat,lng){gl.events.dragstart();gl.jumpTo({center:[lng,lat],zoom:18})},
  async confirm(){await widgets['.via-picker-confirm'].listeners.click()},
  resize(){gl.resize();gl.resize();gl.resize()}
 };
}
test('microactualizaciones del tamaño no cambian el punto ni disparan otra geocodificación',()=>{
 const app=makeEnvironment();app.open();
 app.resize();
 assert.equal(app.reverseCalls,0);
 assert.equal(app.gl.getCenter().lat,-34.85);
});
test('confirmar luego de desplazar persiste coordenadas y domicilio cercano',async()=>{
 const app=makeEnvironment([{street:'AVENIDA TEST 123',city:'Ciudad Uno',
  department:'Canelones',accuracy:'portal',distanceMeters:8}]);
 app.open();app.drag(-34.852,-56.004);app.resize();await app.confirm();
 assert.equal(app.reverseCalls,1);
 assert.equal(app.selection.lat,-34.852);
 assert.equal(app.selection.lng,-56.004);
 assert.equal(app.selection.label,'Cerca de AVENIDA TEST 123, Ciudad Uno, Canelones');
 assert.equal(app.selection.postalStatus,'suggested');
 assert.equal(app.selection.numberIsApproximate,true);
 assert.equal(app.modal.hidden,true);
});
test('sin dirección, conserva el punto ajustado sin inventar puerta',async()=>{
 const app=makeEnvironment([]);app.open();app.drag(-34.853,-56.005);
 await app.confirm();
 assert.equal(app.selection.label,'Punto confirmado en el mapa (sin dirección postal)');
 assert.equal(app.selection.lat,-34.853);
 assert.equal(app.selection.lng,-56.005);
});
test('al abrir y confirmar sin mover mantiene la dirección anterior y coordenadas',async()=>{
 const app=makeEnvironment([]);
 app.open();await app.confirm();
 assert.equal(app.selection.label,'Cerca de Calle Anterior 50');
 assert.equal(app.selection.lat,-34.85);
 assert.equal(app.selection.lng,-56);
});
