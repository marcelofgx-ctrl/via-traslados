import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=readFileSync('android-driver/app/src/main/java/uy/viatraslados/conductor/MainActivity.java','utf8');
const method=code.slice(code.indexOf('private void details(JSONObject item)'),
                        code.indexOf('private void openMaps(JSONObject item)'));

test('V31: los estados comparten un bloque de precio o pendiente',()=>{
 assert.match(method,/fare\.setBackground\(bg\(item\.optInt\("price",0\)>0\?SOFT/);
 assert.match(method,/fareTitle="PRESUPUESTO"/);
 assert.match(method,/fareTitle="OFERTA ENVIADA"/);
 assert.match(method,/fareTitle="OFERTA ACEPTADA"/);
 assert.match(method,/fareTitle="VIAJE CONFIRMADO"/);
 assert.match(method,/fare\.addView\(fareInfo,new LinearLayout\.LayoutParams\(0,-2,1\)\)/);
 assert.match(method,/fare\.addView\(fareAmount,priceParams\)/);
});
test('V31: opciones administrativas plegables y sin enlaces dispersos',()=>{
 assert.match(method,/actions\.setVisibility\(View\.GONE\)/);
 assert.match(method,/expand\.setOnClickListener/);
 assert.match(method,/GESTIONAR SOLICITUD/);
 assert.match(method,/Liberar para otros conductores/);
 assert.match(method,/Asignar conductor manualmente/);
 assert.match(method,/Cancelar solicitud/);
 assert.doesNotMatch(method,/body\.addView\(manual/);
});
test('V31: no crea botón redundante de volver para oferta enviada',()=>{
 assert.match(method,/footer\.setVisibility\(View\.GONE\)/);
 assert.doesNotMatch(method,/button\("Volver al panel"/);
 assert.match(method,/button\("Cotizar y tomar viaje/);
});
test('V31: deja notas reales visibles, omite solo el texto ficticio de la demo',()=>{
 assert.match(method,/BuildConfig\.VIA_PREVIEW&&notes\.startsWith\("Datos inventados"\)/);
 assert.match(method,/INDICACIONES DEL PASAJERO/);
});
