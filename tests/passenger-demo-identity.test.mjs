import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('../pages/'+name,import.meta.url),'utf8');
test('demo displays code upfront and never claims to send email',()=>{
 const html=file('index.html'),app=file('app.js'),store=file('store.js'),cfg=file('config.js');
 assert.match(cfg,/demo:\s*true/,'QA must not create real bookings');
 assert.match(html,/id="demo-identity-note"/);
 assert.match(html,/no recibirás un email/);
 assert.match(html,/123456/);
 assert.match(app,/if\(demo\)\s*\{/);
 assert.match(app,/\$\('otp-code'\)\.value='123456'/);
 assert.match(app,/Continuar con código de prueba/);
 assert.match(app,/Confirmá tu solicitud de prueba/);
 assert.match(store,/if\(isDemo\(\)\)\{/);
 assert.match(store,/code!=='123456'/);
 assert.match(html,/app\.js\?v=15/);
});
