import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../pages/'+p,import.meta.url),'utf8');
test('autenticación y rutas de reservas V25 permanecen intactas',()=>{
 assert.match(read('config.js'),/demo:\s*false/);
 assert.match(read('index.html'),/app\.js\?v=27/);
 assert.match(read('app.js'),/function initPassenger/);
 assert.match(read('app.js'),/function initBooking/);
 assert.match(read('app.js'),/originLocation=window\.ViaAddress/);
 assert.match(read('app.js'),/destinationLocation=window\.ViaAddress/);
});
test('el banner de Turnstile no permanece luego de una identificación exitosa',()=>{
 const s=read('app.js');
 assert.match(s,/function beginReturning\(data\)\{\s*clearError\(\)/);
 assert.match(s,/function beginSignup\(\)\{\s*clearError\(\)/);
 assert.match(s,/\$\('change-phone'\)\?\.addEventListener\('click',\(\)=>\{[^;]+;clearError\(\)/);
 assert.match(s,/\$\('registration-change-phone'\)\?\.addEventListener\('click',\(\)=>\{[^;]+;clearError\(\)/);
 // Nunca eliminar la comprobación real Turnstile de las solicitudes.
 assert.match(s,/S\.identifyPhone\(phone,turnstileToken\)/);
 assert.match(s,/!S\.isDemo\(\)&&!turnstileToken/);
});
test('no registra una passkey sin consultar /customer/me al servidor',()=>{
 const s=read('app.js');
 assert.match(s,/refreshed=Boolean\(await S\.resume\(\)\)/);
 assert.match(s,/session&&Number\(session\.passkeys\)>0/);
 assert.match(s,/session&&Number\(session\.passkeys\)===0/);
 assert.match(s,/if\(!await S\.resume\(\)\)/);
 assert.match(s,/AlreadyRegisteredError/);
 assert.match(s,/InvalidStateError/);
 assert.match(read('sw.js'),/passenger-driver-geov2-v27/);
 assert.match(read('index.html'),/geo-v2\/core\.mjs/);
});
