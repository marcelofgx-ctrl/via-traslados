import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGpsFix,evaluateReverseCandidates,buildPickupDisplay} from '../pages/geo-v2/core.mjs';
const point={lat:-34.85,lng:-56.02,source:'gps'};
test('GPS preserva lat/lng y expone la precisión',()=>{
 const r=assessGpsFix({coords:{latitude:point.lat,longitude:point.lng,accuracy:16},timestamp:100000},110000);
 assert.equal(r.valid,true);assert.equal(r.quality,'good');assert.equal(r.accuracyMeters,16);
});
test('GPS antiguo y GPS impreciso no se presentan como exactos',()=>{
 const stale=assessGpsFix({coords:{latitude:point.lat,longitude:point.lng,accuracy:10},timestamp:0},150000);
 const low=assessGpsFix({coords:{latitude:point.lat,longitude:point.lng,accuracy:260},timestamp:150000},150000);
 assert.equal(stale.quality,'stale');assert.equal(low.quality,'low');assert.equal(low.needsRefinement,true);
});
test('coordenadas inválidas rechazadas',()=>{
 assert.equal(assessGpsFix({coords:{latitude:100,longitude:15,accuracy:10}}).valid,false);
});
test('número de portal cercano jamás es domicilio confirmado',()=>{
 const r=buildPickupDisplay({point,reverseCandidates:[{
  street:'Calle Ficticia 1234',city:'Localidad Alfa',department:'Departamento Uno',distanceMeters:12
 }]});
 assert.equal(r.postalStatus,'suggested');
 assert.equal(r.title,'Cerca de Calle Ficticia');
 assert.equal(r.nearbyReference.nearbyPortal,'Calle Ficticia 1234');
 assert.deepEqual(r.point,point);
});
test('dos calles próximas causan ambigüedad; no inventar domicilio',()=>{
 const r=evaluateReverseCandidates([
  {street:'Calle Uno 50',distanceMeters:13},
  {street:'Calle Dos 60',distanceMeters:15}
 ]);
 assert.equal(r.status,'ambiguous');assert.equal(r.reference,null);
});
test('un resultado distante no se usa para rotular el punto',()=>{
 const r=evaluateReverseCandidates([{street:'Calle Lejana 500',distanceMeters:290}]);
 assert.equal(r.status,'unknown');
});
test('dirección postal confirmada por pasajero tiene prioridad',()=>{
 const r=buildPickupDisplay({point,postalAddress:{
  status:'user_confirmed',street:'Calle Elegida',number:'451',city:'Localidad B',department:'Departamento Dos'
 },reverseCandidates:[{street:'Calle Equivocada 20',distanceMeters:2}]});
 assert.equal(r.title,'Calle Elegida 451');assert.equal(r.postalStatus,'user_confirmed');
 assert.deepEqual(r.point,point);
});
test('resultado de otro lugar no introduce números ni excepciones regionales',()=>{
 for(const street of ['Camino del Bosque 149','Ruta del Sur 2000','Av. Principal 55']){
  const r=buildPickupDisplay({point,reverseCandidates:[{street,city:'Ciudad de prueba',distanceMeters:20}]});
  assert.equal(r.postalStatus,'suggested');
  assert.ok(!/\d/.test(r.title));assert.ok(r.nearbyReference?.nearbyPortal);
 }
});
