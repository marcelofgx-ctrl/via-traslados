import test from 'node:test';
import assert from 'node:assert/strict';
import {priceGuide,quoteBreakdown,commissionBps,mayQuoteAll,mayRelease,hasQuoteAccess} from '../backend/dispatch-business.js';
test('185 km/146 min: guía de tres niveles y sin tasas externas',()=>{
 const guide=priceGuide(185,146);
 assert.deepEqual([guide.minimum,guide.suggested,guide.maximum],[4130,5510,8540]);
 assert.equal(guide.currency,'UYU');
 assert.equal(guide.basis,'orientative');
 assert.equal(guide.extrasExcluded.includes('peajes'),true);
});
test('mínimo evita cifras absurdas en recorridos cortos',()=>{
 const g=priceGuide(5.1,8);
 assert.deepEqual([g.minimum,g.suggested,g.maximum],[650,850,1320]);
 assert.equal(priceGuide(0,0),null);
});
test('contratados: comisión 25% descontada del bruto, socio 0%',()=>{
 assert.equal(commissionBps('driver',null,null),2500);
 assert.equal(commissionBps('driver','partner',2500),0);
 assert.equal(commissionBps('admin',null,2500),0);
 assert.deepEqual(quoteBreakdown(5500,2500),
   {grossUyu:5500,commissionBps:2500,commissionUyu:1375,driverNetUyu:4125});
 assert.equal(quoteBreakdown(5500,0).driverNetUyu,5500);
});
test('publicación y permisos son independientes de modalidad',()=>{
 const partner={role:'driver',id:'p'};
 const newDriver={role:'driver',id:'c'};
 assert.equal(mayQuoteAll(partner,{can_quote_all:1}),true);
 assert.equal(mayQuoteAll(newDriver,{can_quote_all:0}),false);
 assert.equal(hasQuoteAccess(newDriver,{},false),false);
 assert.equal(hasQuoteAccess(newDriver,{},true),true);
 assert.equal(mayRelease(partner,{can_release:1}),true);
 assert.equal(mayRelease(newDriver,{can_release:0}),false);
 assert.equal(mayQuoteAll({role:'admin',id:'master'},{}),false);
});
