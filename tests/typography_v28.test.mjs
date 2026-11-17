import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../pages/'+p,import.meta.url),'utf8');

test('la nueva tipografía no altera la geolocalización ni autenticación',()=>{
 const html=source('index.html'),js=source('address-selected-preview.js');
 assert.match(html,/address-typography-v28\.css\?v=28/);
 assert.match(html,/address-selected-preview\.js\?v=28/);
 assert.match(html,/app\.js\?v=27/);
 assert.match(html,/geo-v2\/core\.mjs\?v=3/);
 assert.match(js,/withDoorTogether/);
 assert.match(js,/via-selected-accuracy/);
 assert.match(js,/via-selected-place/);
 assert.match(js,/input\.title=label\+fullInfo/);
 assert.doesNotMatch(js,/window\.ViaAddress\.set/);
});
test('no hay CSS global agresivo ni cambios en campos de reserva',()=>{
 const css=source('address-typography-v28.css');
 assert.match(css,/\.reference-field \.via-selected-street/);
 assert.match(css,/\.reference-field \.via-selected-locality/);
 assert.match(css,/\.via-selected-accuracy\[hidden\]/);
 assert.doesNotMatch(css,/\*\s*\{\s*box-sizing/);
 assert.doesNotMatch(css,/position:\s*absolute/);
 assert.match(source('sw.js'),/passenger-driver-geov2-v28-typography/);
 assert.match(source('sw.js'),/address-typography-v28\.css/);
});
