import test from 'node:test';import assert from 'node:assert/strict';
import {vfNormalize} from '../addons/via-forward-api.mjs';
import {addressRace} from '../addons/via-address-race.mjs';
const q='Arenal Grande 2200, Montevideo';
const p={country_code:'uy',street:'Arenal Grande',city:'Montevideo',state:'Montevideo',housenumber:'2200',result_type:'building',rank:{match_type:'full_match',confidence:1,confidence_building_level:1}};
const feature=properties=>({properties,geometry:{coordinates:[-56.17,-34.88]}});
const good={results:vfNormalize({features:[feature(p)]},q,'suggest')};
test('exact portal, strict confidence and correct locality',()=>{assert.equal(good.results[0].accuracy,'portal');assert.equal(good.results[0].lat,-34.88);assert.equal(vfNormalize({features:[feature({...p,housenumber:'2202'})]},q,'suggest')[0].lat,null);assert.equal(vfNormalize({features:[feature({...p,rank:{}})]},q,'suggest')[0].accuracy,'unconfirmed');assert.deepEqual(vfNormalize({features:[feature({...p,city:'Salto',state:'Salto'})]},q,'suggest'),[])});
test('street only is not a portal; resolve refuses it',()=>{const b={features:[feature({...p,result_type:'street',housenumber:null})]};assert.equal(vfNormalize(b,q,'suggest')[0].street,'Arenal Grande 2200');assert.equal(vfNormalize(b,q,'suggest')[0].lng,null);assert.deepEqual(vfNormalize(b,q,'resolve'),[])});
const req=()=>new Request('https://viatraslados.com/api/direcciones?mode=suggest&q='+encodeURIComponent(q));
const res=(j,s=200)=>Response.json(j,{status:s});
const race=(a,b)=>addressRace(req(),{VIA_POI_API:{fetch:async()=>b()},POI_CACHE:null},{fetch:async()=>a()},null,{lead:5,deadline:80});
test('healthy exact IDE stays first, no backup',async()=>{let n=0;const r=await race(()=>res(good),()=>{n++;return res(good)});assert.equal(r.headers.get('X-Via-Address-Source'),'IDE');assert.equal(n,0)});
test('IDE 503 recovers via backup',async()=>{const r=await race(()=>res({results:[]},503),()=>res(good));assert.equal(r.status,200);assert.equal(r.headers.get('X-Via-Address-Source'),'Geoapify')});
test('both failures are not a no-match; true empty needs two successful replies',async()=>{assert.equal((await race(()=>res({results:[]},503),()=>res({results:[]},503))).status,503);assert.equal((await race(()=>res({results:[]}),()=>res({results:[]},503))).status,503);assert.equal((await race(()=>res({results:[]}),()=>res({results:[]}))).status,200)});
test('POI untouched',async()=>{let n=0;const r=await addressRace(new Request('https://viatraslados.com/api/direcciones?mode=places&q=Hotel'),{VIA_POI_API:{fetch(){throw Error('no')}}},{fetch(){n++;return res({results:[]})}},null);assert.equal(r.status,200);assert.equal(n,1)});

test('numbered street fallback performs one bounded street lookup and preserves number without point',async()=>{
 const env={VIA_POI_API:{fetch:async r=>{const u=new URL(r.url);return res({results:u.searchParams.get('q').includes('2200')?[]:[{street:'Arenal Grande',city:'Montevideo',department:'Montevideo',kind:'street',accuracy:'unconfirmed',lat:null,lng:null}]})}}};
 const r=await addressRace(req(),env,{fetch:async()=>res({results:[]},503)},null,{lead:5,deadline:80});
 const row=(await r.json()).results[0];assert.equal(row.street,'Arenal Grande 2200');assert.equal(row.lat,null);assert.equal(row.accuracy,'unconfirmed');
});
test('resolve never trusts another portal with wrong number or locality',async()=>{
 const r=await addressRace(new Request('https://viatraslados.com/api/direcciones?mode=resolve&q='+encodeURIComponent(q)),{VIA_POI_API:{fetch:async()=>res({results:[]})}},{fetch:async()=>res({results:[{...good.results[0],street:'Arenal Grande 2202'}]})},null,{lead:5,deadline:80});
 assert.deepEqual((await r.json()).results,[]);
});

test('a verified suggested portal is reusable by resolve even when both providers go offline',async()=>{
 const store=new Map(),pending=[];
 const db={prepare(sql){return {bind(...args){this.args=args;return this},async first(){const [slot,key]=this.args;const r=store.get(slot);return r?.key===key?{payload:r.payload}:null},async run(){const [slot,key,payload]=this.args;store.set(slot,{key,payload});return{success:true}}}}};
 const env={POI_CACHE:db,VIA_POI_API:{fetch:async()=>res(good)}};
 const c={waitUntil(p){pending.push(p)}};
 await addressRace(req(),env,{fetch:async()=>res(good)},c,{lead:5,deadline:80});
 await Promise.all(pending);
 const resolveReq=new Request('https://viatraslados.com/api/direcciones?mode=resolve&q='+encodeURIComponent(q));
 const dead={fetch:async()=>{throw Error('provider offline')}};
 const result=await addressRace(resolveReq,{...env,VIA_POI_API:dead},dead,c,{lead:5,deadline:80});
 assert.equal(result.headers.get('X-Via-Address-Source'),'cache');
 assert.deepEqual((await result.json()).results.map(x=>x.accuracy),['portal']);
});
