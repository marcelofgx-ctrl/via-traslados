import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root='design/via/booking-v23/';
const source=p=>readFileSync(root+p,'utf8');
test('el registro ofrece dos canales; correo obligatorio solo cuando se elige correo',()=>{
 const html=source('index.html'),script=source('app.js');
 assert.match(html,/name="registration-channel" value="email" checked/);
 assert.match(html,/name="registration-channel" value="whatsapp"/);
 assert.match(html,/id="signup-email-group"/);
 assert.match(script,/setVerificationChannel\(channel\)/);
 assert.match(script,/window\.ViaVerification\.verify\(selectedPhone,code,'registration'/);
 assert.match(html,/verification-channel\.js\?v=1/);
});
test('reservas y recuperación conservan PIN y passkeys sin nuevo WhatsApp por cada viaje',()=>{
 const mine=source('mis-reservas.html'),script=source('app.js');
 assert.match(mine,/id="mine-login-pin-submit"/);
 assert.match(mine,/id="mine-login-passkey"/);
 assert.match(mine,/id="mine-login-whatsapp"/);
 assert.match(mine,/id="mine-login-send"/);
 assert.match(script,/S\.pinLogin\(selectedPhone/);
 assert.match(script,/ViaPasskeys\.signIn/);
 assert.match(script,/if\(recoveryChannel==='whatsapp'\)/);
 assert.match(script,/window\.ViaVerification\.verify\(selectedPhone,code,'recovery'\)/);
});
test('el secreto del celular verificador no debe aparecer en los recursos del navegador',()=>{
 for(const file of ['app.js','verification-channel.js','index.html','mis-reservas.html']){
  assert.doesNotMatch(source(file),/WHATSAPP_BRIDGE_KEY/);
 }
});
