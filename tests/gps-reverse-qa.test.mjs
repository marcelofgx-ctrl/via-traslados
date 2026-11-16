import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as geo from '../pages/geo-v2/core.mjs';
const source=readFileSync(new URL('../pages/reference.js',import.meta.url),'utf8');

function session(rows,opts={}){
 const fix={coords:{latitude:-34.854348,longitude:-56.003162,accuracy:18},timestamp:Date.now()};
 const input={value:'',dataset:{},dispatchEvent(){},title:''};
 let handler,pending;
 const gpsBtn={disabled:false,setAttribute(){},removeAttribute(){},addEventListener(event,callback){if(event==='click')handler=callback}};
 const dom={getElementById:id=>id==='home-origin'?input:id==='location-shortcut'?gpsBtn:null,
  querySelector(){return null}};
 const win={ViaGeoV2:geo,ViaSearchLocation:{update(){}},ViaAddress:{
   set(id,p){assert.equal(id,'home-origin');input.value=p.label;Object.assign(input.dataset,{
    lat:String(p.lat),lng:String(p.lng),accuracy:p.accuracy,
    postalStatus:p.postalStatus,city:p.city,department:p.department,
    gpsAccuracy:String(p.gpsAccuracy),source:p.source,addressSelected:'true'
   })}
  }};
 const nav={geolocation:{getCurrentPosition(callback){pending=callback(fix)}}};
 const context={document:dom,window:win,navigator:nav,AbortController,
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
  setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({results:rows})})};
 if(opts.fetch)context.fetch=opts.fetch;
 runInNewContext(source,context);
 return {input,async click(){handler();await pending},fix};
}
test('GPS muestra número cercano señalado expresamente como aproximado',async()=>{
 const app=session([{street:'CALLE FICTICIA 1711',city:'LOCALIDAD A',
  department:'CANELONES',distanceMeters:12,accuracy:'portal'}]);
 await app.click();
 assert.equal(app.input.value,'Cerca de CALLE FICTICIA 1711, LOCALIDAD A, CANELONES');
 assert.equal(Number(app.input.dataset.lat),app.fix.coords.latitude);
 assert.equal(Number(app.input.dataset.lng),app.fix.coords.longitude);
 assert.equal(app.input.dataset.accuracy,'gps');
 assert.equal(app.input.dataset.postalStatus,'suggested');
});
test('dos calles próximas no adjudican domicilio',async()=>{
 const app=session([
  {street:'CALLE A 31',city:'LOCALIDAD A',distanceMeters:12},
  {street:'CALLE B 1711',city:'LOCALIDAD A',distanceMeters:14}
 ]);
 await app.click();
 assert.equal(app.input.value,'Punto de recogida sin dirección confirmada');
 assert.equal(app.input.dataset.postalStatus,'unknown');
});
test('GPS distingue un resultado distante',async()=>{
 const app=session([{street:'CALLE DISTANTE 400',city:'MONTEVIDEO',
  department:'MONTEVIDEO',distanceMeters:700}]);
 await app.click();
 assert.equal(app.input.value,'Punto de recogida sin dirección confirmada');
});
test('respuesta tardía no sobrescribe una dirección posterior',async()=>{
 let release;
 const app=session([],{fetch:()=>new Promise(resolve=>{release=resolve})});
 const finished=app.click();
 app.input.value='Dirección elegida por usuario';
 app.input.dataset.accuracy='portal';
 release({ok:true,json:async()=>({results:[{street:'OTRA 2000',city:'MONTEVIDEO',distanceMeters:5}]})});
 await finished;
 assert.equal(app.input.value,'Dirección elegida por usuario');
});

test('GPS conserva el portal solo como referencia si está dentro de 35 m',async()=>{
 const app=session([{street:'AVENIDA DE PRUEBA 50',city:'Ciudad Uno',department:'Canelones',distanceMeters:22}]);
 await app.click();
 assert.match(app.input.value,/Cerca de AVENIDA DE PRUEBA 50/);
 assert.equal(app.input.dataset.postalStatus,'suggested');
});
