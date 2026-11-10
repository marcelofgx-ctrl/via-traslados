import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const path=name=>readFileSync(new URL('../pages/'+name,import.meta.url),'utf8');
const storage=()=>{const map=new Map();return{
 getItem:key=>map.has(key)?map.get(key):null,
 setItem:(key,value)=>map.set(key,String(value)),
 removeItem:key=>map.delete(key),
 clear:()=>map.clear()
}};
const createClient=(cfg={demo:true,apiUrl:''},local=storage(),session=storage())=>{
 const context={VIA_CONFIG:cfg,dispatchEvent(){},navigator:{},isSecureContext:true};
 const sandbox={window:context,localStorage:local,sessionStorage:session,
   Date,Math,Event:class Event{constructor(type){this.type=type}},
   fetch:async()=>{throw Error('No network in demo')},console};
 runInNewContext(path('store.js'),sandbox);
 return{S:context.ViaStore,local,session,ctx:context,sandbox};
};
test('primera verificación crea sesión recordada y la próxima reserva no exige un segundo código',async()=>{
 const {S,local,session}=createClient();
 const first=await S.startVerification('cliente@example.com');
 assert.equal(first.demo,true);
 await S.verifyCode('cliente@example.com','123456',{name:'Ana Ruiz',phone:'094 123 456'});
 assert.equal(S.customer().profile.email,'cliente@example.com');
 const entry={name:'Ana Ruiz',phone:'094 123 456',email:'cliente@example.com',
  origin:'Montevideo Shopping',destination:'Aeropuerto Carrasco',date:'2027-02-20',
  time:'15:00',passengers:2,bags:1,notes:''};
 const booked=await S.create(entry);
 assert.ok(booked.id.startsWith('VIA-'));
 const second=createClient({demo:true},local,session);
 assert.equal(second.S.customer().profile.name,'Ana Ruiz');
 const again=await second.S.create(entry);
 assert.ok(again.id.startsWith('VIA-'),'a second OTP is not needed on a recognized device');
 assert.equal((await second.S.mine()).length,2);
});
test('sin sesión y solo con teléfono no se entra a una cuenta',async()=>{
 const {S}=createClient();
 assert.equal(S.customer(),null);
 const found=await S.startPhoneLogin('094 123 456');
 assert.equal(found.recognized,false);
 assert.equal(S.customer(),null);
});
test('al cerrar sesión deja de reconocer al pasajero',async()=>{
 const {S}=createClient();
 await S.startVerification('ana@example.com');
 await S.verifyCode('ana@example.com','123456',{name:'Ana Test',phone:'094 123 456'});
 assert.ok(S.customer());
 await S.logout();
 assert.equal(S.customer(),null);
});
test('un token de sesión falso o vencido no se reconoce como usuario real',()=>{
 const local=storage();
 local.setItem('via-customer-session-v1',JSON.stringify({
  sessionToken:'not-a-server-token',expiresAt:Math.floor(Date.now()/1000)+1000,
  profile:{email:'fake@example.com',name:'Fake',phone:'094 123 456'}
 }));
 const client=createClient({demo:false,apiUrl:'https://api.example'},local);
 assert.equal(client.S.customer(),null);
 local.setItem('via-customer-session-v1',JSON.stringify({
  sessionToken:'a'.repeat(64),expiresAt:Math.floor(Date.now()/1000)-10,
  profile:{email:'fake@example.com',name:'Fake',phone:'094 123 456'}
 }));
 assert.equal(client.S.customer(),null);
});
test('el paso 2 incluye celular, huella opcional, y código al correo asociado',()=>{
 const html=path('index.html'),app=path('app.js'),keys=path('passkeys.js');
 for(const id of ['return-phone','return-passkey','return-send-code','return-code',
  'return-verify','known-customer','forget-customer','privacy-consent']){
  assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 }
 assert.ok(html.indexOf('store.js?v=16')<html.indexOf('passkeys.js?v=16'));
 assert.ok(html.indexOf('passkeys.js?v=16')<html.indexOf('app.js?v=16'));
 assert.match(app,/S\.resume\(\)/);
 assert.match(app,/S\.startPhoneLogin/);
 assert.match(app,/S\.finishPhoneLogin/);
 assert.match(app,/S\.customer\(\)\?\.profile/);
 assert.match(keys,/credentials\?\.create|credentials\.create/);
 assert.match(keys,/credentials\?\.get|credentials\.get/);
 assert.match(keys,/if\(!available\(\)\)/);
 assert.match(path('reserva.html'),/id="enable-passkey"/);
});
