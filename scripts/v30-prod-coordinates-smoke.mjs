// GET + one coordinate-only routing preview, no bookings, no OTP, no D1 writes.
// Uses a public central-Montevideo point instead of any passenger's address.
import assert from 'node:assert/strict';
const API='https://via-traslados-api.marcelof-gx.workers.dev';
const WEB='https://viatraslados.com';
const body={
 origin:'Zona céntrica de Montevideo, sin número de puerta',
 destination:'Aeropuerto Internacional de Carrasco',
 originLocation:{lat:-34.905,lng:-56.185,source:'map',postalStatus:'unknown'},
 destinationLocation:{lat:-34.83696,lng:-56.01638,source:'selected',postalStatus:'selected'}
};
const res=await fetch(API+'/api/public/route-preview',{
 method:'POST',headers:{Origin:WEB,'Content-Type':'application/json'},
 body:JSON.stringify(body),signal:AbortSignal.timeout(27000)
});
const value=await res.json().catch(()=>({error:'NonJSON'}));
assert.equal(res.status,200,'V30 production coordinate route failed '+JSON.stringify({status:res.status,error:value.error,reason:value.reason}));
assert(Number.isFinite(Number(value.distanceKm))&&Number(value.distanceKm)>5&&Number(value.distanceKm)<75,
 'V30 returned no plausible route by confirmed coordinates');
assert(Number(value.durationMinutes)>1,'V30 duration missing');
console.log('VIA_V30_PROD_COORDINATES_ROUTE_VERIFIED '+JSON.stringify({
 routeKm:Number(value.distanceKm),minutes:Number(value.durationMinutes),
 source:value.source,usedConfirmedCoordinates:true,createdBooking:false
}));
