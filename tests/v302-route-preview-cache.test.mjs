import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRoutePreviewCache} from '../addons/via-route-preview-cache.mjs';
const A={lat:-34.85,lng:-56.03},B={lat:-34.90,lng:-56.10},C={lat:-34.91,lng:-56.11};
const sample={distanceKm:12.3,durationMinutes:19,source:'Geoapify'};
const setup=()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 let time=1000,calls=0;
 const make=()=>createRoutePreviewCache({storage,subtle:webcrypto.subtle,clock:()=>time,load:async()=>{calls++;return sample}});
 return {data,make,calls:()=>calls,advance:x=>time+=x};
};
test('same route concurrent, reload, back, changed label, reverse and changed pin',async()=>{
 const s=setup(),x=s.make();
 const p=await Promise.all(Array.from({length:10},()=>x.estimate('Calle A','Calle B',A,B)));
 assert.equal(p.length,10);assert.equal(s.calls(),1);
 assert.equal((await s.make().estimate('Otra etiqueta A','Otra etiqueta B',A,B)).cached,true);
 assert.equal(s.calls(),1);
 assert.equal((await x.estimate('Calle B','Calle A',B,A)).distanceKm,12.3);
 await x.estimate('Calle A','Calle C',A,C);assert.equal(s.calls(),3);
 assert(!JSON.stringify([...s.data.values()]).includes('Calle A'));
 assert(!JSON.stringify([...s.data.values()]).includes('-34.85'));
 s.advance(86400001);await s.make().estimate('Calle A','Calle B',A,B);assert.equal(s.calls(),4);
});
test('errors never cached and unavailable storage does not break route',async()=>{
 let n=0;const x=createRoutePreviewCache({storage:{getItem(){throw Error()},setItem(){throw Error()}},subtle:webcrypto.subtle,load:async()=>{if(++n===1)throw Error('network');return sample}});
 await assert.rejects(x.estimate('Calle A','Calle B',A,B));
 assert.equal((await x.estimate('Calle A','Calle B',A,B)).distanceKm,12.3);
 assert.equal((await x.estimate('Calle A','Calle B',A,B)).cached,true);assert.equal(n,2);
});
test('text-only routes not persisted; distinct endpoints not conflated',async()=>{
 const s=setup();await s.make().estimate('Calle A','Calle B',null,null);
 assert.equal(s.data.size,0);await s.make().estimate('Calle A','Calle B',null,null);assert.equal(s.calls(),2);
});
