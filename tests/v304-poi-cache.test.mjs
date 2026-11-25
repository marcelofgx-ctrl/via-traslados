import test from 'node:test';
import assert from 'node:assert/strict';
import {identity,readShared,writeShared} from '../addons/v304-poi-cache.mjs';
const fixture={features:[{properties:{name:'Centro Comercial',country_code:'uy',place_id:'a',formatted:'Avenida pública',private:'discard'},geometry:{coordinates:[-56.1,-34.9]}}]};
test('shared cache bounded slots, no raw query, no expired/error entries',async()=>{
 const rows=new Map();
 const db={prepare(sql){let a;const s={bind(...v){a=v;return s},async first(){const r=rows.get(a[0]);return r&&r.cache_key===a[1]&&r.expires_at>a[2]?r:null},async run(){rows.set(a[0],{cache_key:a[1],payload:a[2],expires_at:a[3]})}};return s}};
 const key=await identity('Centro Comercial',-34.901,-56.101),same=await identity('CENTRO COMERCIAL',-34.902,-56.102);
 assert.deepEqual(key,same);assert(key.slot>=0&&key.slot<8192);assert.equal(key.key.length,64);
 assert.equal(await identity('Calle 1234',-34.9,-56.1),null);
 assert.equal(await writeShared(db,key,{features:[]},10),false);
 assert.equal(await writeShared(db,key,fixture,10),true);
 assert.equal((await readShared(db,key,11)).features[0].properties.private,undefined);
 assert.equal(await readShared(db,key,10+30*86400),null);
 assert.equal(await readShared({prepare(){throw Error('D1 unavailable')}},key,11),null);
 assert.equal(await writeShared(db,key,{features:[]},10),false);
});
