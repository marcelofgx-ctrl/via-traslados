import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=readFileSync('dist/via-store-v29-idempotencia-qa.js','utf8');
const k='via-booking-pending-idempotent-v1';
class Storage {
  map=new Map();
  getItem(key){return this.map.has(key)?this.map.get(key):null}
  setItem(key,value){this.map.set(key,String(value))}
  removeItem(key){this.map.delete(key)}
}
const make=()=>{
  const localStorage=new Storage(),sessionStorage=new Storage(),server=new Map(),requests=[];
  const window={ViaConfig:{apiUrl:'https://api.example',demo:false},dispatchEvent(){}};
  const context={window,localStorage,sessionStorage,crypto:webcrypto,TextEncoder,Uint8Array,
    Date,Event:class{},console,Response,fetch:async(url,init)=>{
      assert.equal(url,'https://api.example/api/requests');
      const key=init?.headers?.['Idempotency-Key'];
      assert.match(key,/^[a-f0-9]{64}$/);
      requests.push({key,body:init.body});
      if(!server.has(key))server.set(key,{id:'VIA-TEST-'+server.size,access_token:'a'.repeat(64),status:'requested'});
      if(context.dropOnce){context.dropOnce=false;throw Error('respuesta perdida');}
      return new Response(JSON.stringify(server.get(key)),{status:201,headers:{'Content-Type':'application/json'}});
    },dropOnce:false};
  window.crypto=webcrypto;
  vm.runInNewContext(source,context,{timeout:3000});
  const trip={name:'Ana Pereira',phone:'099 123 456',email:'ana@example.com',
    origin:'Shangrilá',destination:'Aeropuerto Carrasco',date:'2026-11-24',time:'10:00',
    passengers:2,bags:1,notes:''};
  localStorage.setItem('via-customer-session-v1',JSON.stringify({sessionToken:'b'.repeat(64),
    expiresAt:Math.floor(Date.now()/1000)+3600,profile:{email:trip.email,name:trip.name,phone:trip.phone}}));
  return {window,context,server,requests,localStorage,sessionStorage,trip};
};
test('store V29 QA marca la petición con clave aleatoria y conserva la clave si se pierde respuesta',async()=>{
 const x=make();x.context.dropOnce=true;
 await assert.rejects(()=>x.window.ViaStore.create(x.trip),/respuesta perdida/);
 assert.ok(x.sessionStorage.getItem(k),'Pendiente tras corte de red');
 const result=await x.window.ViaStore.create(x.trip);
 assert.equal(result.id,'VIA-TEST-0');
 assert.equal(x.requests[0].key,x.requests[1].key);
 assert.equal(x.server.size,1);
 assert.equal(x.sessionStorage.getItem(k),null,'Se limpia después de guardar referencia');
});
test('dos toques concurrentes no generan claves distintas para el mismo payload',async()=>{
 const x=make();const [a,b]=await Promise.all([
   x.window.ViaStore.create(x.trip),x.window.ViaStore.create(x.trip)]);
 assert.equal(a.id,b.id);
 assert.equal(x.requests[0].key,x.requests[1].key);
 assert.equal(x.server.size,1);
});
test('un cambio de identidad no reutiliza la clave pendiente de otra persona',async()=>{
 const x=make();x.context.dropOnce=true;
 await assert.rejects(()=>x.window.ViaStore.create(x.trip));
 const oldKey=JSON.parse(x.sessionStorage.getItem(k)).key;
 const tripB={...x.trip,email:'b@example.com'};
 x.localStorage.setItem('via-customer-session-v1',JSON.stringify({sessionToken:'c'.repeat(64),
    expiresAt:Math.floor(Date.now()/1000)+3600,profile:{email:tripB.email,name:'B',phone:tripB.phone}}));
 const b=await x.window.ViaStore.create(tripB);
 assert.match(b.id,/VIA-TEST-/);
 assert.notEqual(x.requests.at(-1).key,oldKey);
});
