import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../pages/map-point-picker.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../pages/index.html',import.meta.url),'utf8');
function mount(){
 const controls=[],inputs={},containers={};
 for(const id of ['home-origin','home-destination','origin','destination']){
  containers[id]={appendChild(el){controls.push({id,button:el})}};
  inputs[id]={dataset:{},closest:()=>containers[id]};
 }
 const document={
  getElementById:id=>inputs[id],
  createElement:tag=>({type:tag,attributes:{},setAttribute(k,v){this.attributes[k]=v},
   addEventListener(type,callback){this['on_'+type]=callback}}),
  body:{appendChild(){}}
 };
 let gpsRequests=0;
 const navigator={geolocation:{getCurrentPosition(){gpsRequests++}}};
 const window={};
 runInNewContext(js,{document,window,navigator});
 return{controls,inputs,window,gpsRequests};
}
test('el mapa permite seleccionar tanto origen como destino en ambos formularios',()=>{
 const {controls}=mount();
 assert.deepEqual(controls.map(c=>c.id),['home-origin','home-destination','origin','destination']);
 for(const item of controls){
  assert.equal(item.button.type,'button');
  assert.match(item.button.attributes['aria-label'],/en mapa/);
  assert.equal(typeof item.button.on_click,'function');
 }
});
test('la página no pide GPS por sí sola, solo cuando se pulsa el botón',()=>{
 const result=mount();assert.equal(result.gpsRequests,0);
});
test('el script y el estilo del selector se cargan en el inicio de reservas',()=>{
 assert.match(html,/map-point-picker\.css\?v=1/);
 assert.match(html,/map-point-picker\.js\?v=1/);
 assert.match(js,/accuracy:'map'/);
 assert.match(js,/dispatchEvent\(new CustomEvent\('via:address'/);
});
