import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const page=readFileSync(new URL('../pages/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../pages/wizard-ux.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../pages/wizard-ux.js',import.meta.url),'utf8');
test('nueva pantalla revisión del recorrido sin repetir instrucciones',()=>{
 assert.match(page,/Revisá tu traslado/);
 assert.match(page,/Confirmá el recorrido y los datos de recogida/);
 assert.doesNotMatch(page,/Todavía no es una reserva/);
 assert.match(page,/PASO 1 DE 3/);
});
test('cada dirección tiene dato real, resumen multilínea y botón editar',()=>{
 for(const id of ['origin','destination']){
  assert.match(page,new RegExp('id="'+id+'" name="'+id+'"'));
  assert.match(page,new RegExp('id="'+id+'-readout"'));
  assert.match(ui,new RegExp("'"+id+"'"));
 }
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/white-space:normal/);
 assert.match(ui,/via:address/);
 assert.match(ui,/start-booking/);
});
test('campos originales y pasos de verificación conservados',()=>{
 for(const id of ['date','time','passengers','bags','notes','name','phone','email','otp-code','send-code','verify-and-book','privacy-consent']){
  assert.ok(page.includes('id="'+id+'"'),'Falta campo '+id);
 }
 assert.match(page,/data-step="1"/);
 assert.match(page,/data-step="2"/);
 assert.match(page,/data-step="3"/);
 assert.match(page,/type="button" class="primary-btn wizard-next" id="to-contact"/);
 assert.match(page,/<details class="wizard-notes"/);
 assert.match(page,/<textarea id="notes" name="notes"/);
});
test('CSS aislado al flujo y scripts sin error de sintaxis',()=>{
 assert.match(css,/body\.premium-page\.in-booking/);
 assert.match(css,/body\.premium-page\.in-booking \.map-stage/);
 assert.match(css,/color-scheme:only light/);
 assert.match(page,/wizard-ux\.css\?v=12/);
 assert.match(page,/wizard-ux\.js\?v=12/);
 const currentOrder=page.indexOf('address-autocomplete.js?v=11');
 const newOrder=page.indexOf('wizard-ux.js?v=12');
 assert.ok(currentOrder>=0&&newOrder>currentOrder);
 execFileSync(process.execPath,['--check',new URL('../pages/wizard-ux.js',import.meta.url).pathname]);
});
