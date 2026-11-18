// Inventario de assets HTTP realmente servidos (sin correo, sin reservas).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const host='https://viatraslados.com';
const urls=['/','/app.js?v=29','/config.js','/sw.js','/reserva.html','/geo-v2/core.mjs?v=3'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const assets={};
for(const path of urls){
 const res=await fetch(host+path,{headers:{Accept:'*/*'},signal:AbortSignal.timeout(25000)});
 assert.equal(res.status,200,path+' status '+res.status);
 const content=await res.text();
 assert(content.length>50,path+' cuerpo vacío');
 assets[path]={bytes:Buffer.byteLength(content),sha256:sha(content),type:res.headers.get('content-type')};
 if(path==='/'){
   const paths=[...content.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(x=>x[1]);
   console.log('VIA_WEB_ACTIVE_SCRIPT_PATHS '+JSON.stringify(paths));
 }
 if(path==='/app.js?v=29'){
   const terms=['/api/requests','/requests','X-Verification-Token','ViaStore','fetch(','localStorage','sessionStorage','sendBooking','submitBooking','createBooking'];
   const occurrences={};
   for(const term of terms){
     let at=content.indexOf(term); const matches=[];
     while(at>=0&&matches.length<4){
       matches.push({at,code:content.slice(Math.max(0,at-280),Math.min(content.length,at+360)).replace(/\s+/g,' ')});
       at=content.indexOf(term,at+term.length);
     }
     occurrences[term]=matches;
   }
   // Se registra solo JS público: no se lee localStorage del usuario ni información privada.
   console.log('VIA_WEB_ACTIVE_JS_CONTEXT '+JSON.stringify(occurrences));
 }
}
console.log('VIA_WEB_ACTIVE_ASSET_HASHES '+JSON.stringify(assets));
console.log('VIA_WEB_AUDIT_READONLY_NO_BOOKINGS_NO_AUTH_NO_DEPLOY');
