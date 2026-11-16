import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../pages/reference.js',import.meta.url),'utf8');

function session(rows,opts={}){
 const gps={lat:-34.854348,lng:-56.003162};
 const input={value:'',dataset:{},dispatchEvent(){},title:''};
 let handler,pending;
 const gpsBtn={disabled:false,setAttribute(){},removeAttribute(){},addEventListener(event,callback){if(event==='click')handler=callback}};
 const dom={getElementById:id=>id==='home-origin'?input:id==='location-shortcut'?gpsBtn:null,
  querySelector(){return null},body:{classList:{contains(){return false}}}};
 const win={ViaSearchLocation:{update(){}},ViaAddress:{
   set(id,p){assert.equal(id,'home-origin');input.value=p.label;Object.assign(input.dataset,{
    lat:String(p.lat),lng:String(p.lng),accuracy:p.accuracy,city:p.city,department:p.department,addressSelected:'true'
   })}
  },addEventListener(){}};
 const nav={geolocation:{getCurrentPosition(callback){
   pending=callback({coords:{latitude:gps.lat,longitude:gps.lng,accuracy:18}});
 }}};
 const context={document:dom,window:win,navigator:nav,AbortController,CustomEvent:class {
  constructor(type,options){this.type=type;this.detail=options.detail}
 },setTimeout,clearTimeout,requestAnimationFrame() {},
 fetch:async()=>({ok:true,json:async()=>({results:rows})})};
 if(opts.fetch)context.fetch=opts.fetch;
 runInNewContext(source,context);
 return {input,async click(){handler();await pending},gps};
}
test('GPS muestra la dirección cercana y conserva el punto medido',async()=>{
 const app=session([{street:'ROQUE SAENZ PEÑA 1711',city:'SHANGRILA',
  department:'CANELONES',distanceMeters:20}]);
 await app.click();
 assert.equal(app.input.value,'Cerca de ROQUE SAENZ PEÑA, CANELONES');
 assert.equal(Number(app.input.dataset.lat),app.gps.lat);
 assert.equal(Number(app.input.dataset.lng),app.gps.lng);
 assert.equal(app.input.dataset.accuracy,'gps');
});
test('GPS distingue la dirección no confirmada',async()=>{
 const app=session([{street:'AVENIDA DISTANTE 400',city:'MONTEVIDEO',
  department:'MONTEVIDEO',distanceMeters:700}]);
 await app.click();
 assert.equal(app.input.value,'Punto GPS sin dirección postal confirmada');
 assert.equal(app.input.dataset.accuracy,'gps');
});
test('respuesta tardía no reemplaza una dirección escrita por el usuario',async()=>{
 let release;
 const app=session([],{fetch:()=>new Promise(resolve=>{release=resolve})});
 const finished=app.click();
 app.input.value='Dirección elegida manualmente';
 app.input.dataset.accuracy='unconfirmed';
 release({ok:true,json:async()=>({results:[{street:'OTRA 2000',city:'MONTEVIDEO',
  department:'MONTEVIDEO',distanceMeters:5}]})});
 await finished;
 assert.equal(app.input.value,'Dirección elegida manualmente');
});

test('el GPS no reescala la portada y no publica números de puerta aproximados',()=>{
 assert.doesNotMatch(source,/home\.style\.zoom/);
 assert.match(source,/stripDoor/);
 assert.match(source,/input\.value===original/);
});
