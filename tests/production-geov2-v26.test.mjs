import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessGpsFix,evaluateReverseCandidates,buildPickupDisplay} from '../pages/geo-v2/core.mjs';
const get=p=>readFileSync(new URL('../pages/'+p,import.meta.url),'utf8');
test('versión candidata conserva auth y reservas reales V25, nunca demo',()=>{
 assert.match(get('config.js'),/demo:\s*false/);
 assert.match(get('index.html'),/app\.js\?v=25/);
 assert.match(get('index.html'),/passkeys\.js\?v=21/);
 assert.match(get('index.html'),/via-ux-v25\.css\?v=25/);
 assert.match(get('app.js'),/originLocation=window\.ViaAddress/);
 assert.match(get('app.js'),/destinationLocation=window\.ViaAddress/);
 assert.match(get('sw.js'),/url\.pathname\.includes\('\/api\/'\)/);
});
test('GPS nunca sustituye la coordenada con la de una puerta cercana',()=>{
 const p={lat:-34.854306,lng:-56.003147,source:'gps'};
 const r=buildPickupDisplay({point:p,reverseCandidates:[
  {street:'Calle de Prueba 31',city:'Ciudad Uno',department:'Canelones',
   lat:-34.85431,lng:-56.00314,accuracy:'portal'}]});
 assert.equal(r.postalStatus,'suggested');
 assert.match(r.title,/Cerca de Calle de Prueba 31/);
 assert.equal(r.numberIsApproximate,true);
 assert.deepEqual(r.point,p);
});
test('distingue falta de precisión y direcciones ambiguas',()=>{
 const position=assessGpsFix({coords:{latitude:-34.85,longitude:-56.02,accuracy:190},timestamp:10000},20000);
 assert.equal(position.quality,'low');
 const r=evaluateReverseCandidates([
  {street:'Avenida Alfa 12',distanceMeters:8},
  {street:'Camino Beta 90',distanceMeters:12}
 ]);
 assert.equal(r.status,'ambiguous');
});
test('la UI usa mapa ajustable sin publicar número de puerta inventado',()=>{
 const html=get('index.html'),map=get('map-point-picker.js');
 assert.match(html,/geo-v2\/core\.mjs\?v=3/);
 assert.match(html,/map-point-picker\.js\?v=26/);
 assert.match(map,/getReverse\(point,controller\.signal\)/);
 assert.match(map,/numberIsApproximate/);
 assert.match(map,/meters\(lastGeoPoint,point\)<1\.5/);
 assert.match(get('address-autocomplete.js'),/postalStatus/);
 assert.match(get('reference.js'),/ViaGeoV2/);
});
test('los activos cartográficos se actualizan sin reemplazar el paquete V25',()=>{
 const sw=get('sw.js');
 assert.match(sw,/via-traslados-passenger-driver-geov2-v26/);
 for(const file of ['map-point-picker.js','map-point-picker.css','address-selected-preview.js','address-selected-preview.css','geo-v2/core.mjs','geo-v2-stable-layout.css']){
  assert.ok(sw.includes("'./"+file+"'"),file);
 }
 assert.match(get('index.html'),/maplibre-gl@6\.18\.0/);
});
