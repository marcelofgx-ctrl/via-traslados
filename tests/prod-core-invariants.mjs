// Smoke de producción no destructivo. No envía correos ni crea reservas o cuentas.
import assert from 'node:assert/strict';
const WEB='https://viatraslados.com',API='https://via-traslados-api.marcelof-gx.workers.dev';
const headers={Origin:WEB,Accept:'application/json'};
async function check(name,url,init={},expected=200){
 const r=await fetch(url,{...init,signal:AbortSignal.timeout(28000)});
 const txt=await r.text();let json;
 if((r.headers.get('content-type')||'').includes('json'))try{json=JSON.parse(txt)}catch{}
 assert.equal(r.status,expected,name+' HTTP '+r.status);
 console.log('PROD_CORE_CHECK '+JSON.stringify({name,status:r.status,ms:null,cors:r.headers.get('access-control-allow-origin'),bytes:txt.length}));
 return {r,txt,json};
}
const health=await check('otp-health',API+'/api/health',{headers});
assert(health.json?.ok===true&&health.json?.otpAvailable===true,
 'OTP deshabilitado o sin credenciales configuradas');
assert.equal(health.r.headers.get('access-control-allow-origin'),WEB,'Falta permiso CORS web');
const state=await check('service-enabled',API+'/api/public/status',{headers});
assert(state.json?.enabled===true,'Servicio de reservas suspendido');
const preflight=await check('otp-cors-preflight',API+'/api/auth/start',{method:'OPTIONS',
 headers:{Origin:WEB,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}},204);
assert.equal(preflight.r.headers.get('access-control-allow-origin'),WEB);
const invalid=await check('otp-available-no-real-email',API+'/api/auth/start',{method:'POST',
 headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({email:'invalid'})},400);
assert(invalid.json?.error,'Se perdió contrato OTP');
const route=await check('distance-shangrila-airport',API+'/api/public/route-preview',{method:'POST',
 headers:{...headers,'Content-Type':'application/json'},
 body:JSON.stringify({origin:'Roque Sáenz Peña 1711, Shangrilá, Canelones',
 destination:'Aeropuerto Internacional de Carrasco, Colonia Nicolich, Canelones'})});
assert(route.json&&Number.isFinite(route.json.distanceKm)
 &&route.json.distanceKm>=2&&route.json.distanceKm<=9
 &&Number.isFinite(route.json.durationMinutes)&&route.json.durationMinutes>=2,
 'El motor geográfico no devuelve una ruta válida para Shangrilá');
const reverse=await check('reverse-geocoding',WEB+'/api/direcciones?mode=reverse&lat=-34.905&lng=-56.185');
assert(Array.isArray(reverse.json?.results),'Buscador IDE/Geoapify no devuelve resultados');
const home=await check('homepage',WEB+'/');
for(const marker of ['review-compact-v29.css?v=29','app.js?v=29','geo-v2/core.mjs?v=3',
 'via-driver-v35-download'])assert(home.txt.includes(marker),'Asset web faltante: '+marker);
const config=await check('config',WEB+'/config.js');
assert(config.txt.includes(API),'Se perdió API de producción configurada en frontend');
const app=await check('app-js',WEB+'/app.js?v=29');
assert(app.txt.includes('distanceKm')&&app.txt.includes('ViaStore'),'JS de reservas roto');
const geo=await check('geographic-engine',WEB+'/geo-v2/core.mjs?v=3');
assert(geo.txt.length>100&&!(geo.r.headers.get('content-type')||'').includes('text/html'),
 'Engine geográfico devuelto como HTML');
const booking=await check('booking-html',WEB+'/reserva.html');
assert(booking.txt.includes('status-container'),'Pantalla de reserva desapareció');
const existingApk=await check('apk-v35-availability',WEB+'/descargas/via-traslados-conductor-v35.apk');
assert(existingApk.txt.length>100000,'La APK productiva no está disponible');
console.log('PROD_CORE_INVARIANTS_PASS OTP_CONFIG_CORS_ROUTE_GEO_FRONTEND_APK; EMAIL_DELIVERY_NOT_VERIFIED');
