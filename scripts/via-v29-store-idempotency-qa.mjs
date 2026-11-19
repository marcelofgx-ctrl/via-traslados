// QA: parche mínimo sobre el store.js V19 REAL servido por viatraslados.com.
// NO despliega a Cloudflare ni altera el backend/D1/motor geográfico.
// Si cambia el hash de producción, ABORTA y exige nueva auditoría.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const liveUrl='https://viatraslados.com/store.js?v=19';
const EXPECTED='4626099e71bf45a50bd02cdd4aa5eb1c8c7d03e09d97387ee27ca8e9801294ef';
const sha=s=>createHash('sha256').update(s).digest('hex');
const response=await fetch(liveUrl,{signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200,'Store V19 vivo no disponible');
let js=await response.text();
assert.equal(sha(js),EXPECTED,'CAMBIO DE PRODUCCIÓN: no parchear assets desconocidos');
const replaceOne=(pattern,replacement,label)=>{
 const matches=[...js.matchAll(new RegExp(pattern.source,'g'))];
 assert.equal(matches.length,1,label+': ancla no única');
 js=js.replace(pattern,replacement);
};

replaceOne(/const VERIFY\s*=\s*['"]via-traslados-verified-session-v3['"]\s*;/,
 m=>m+"\n const PENDING_SUBMISSION='via-booking-pending-idempotent-v1';",
 'constante privada pendiente');

const helper=`
 // La clave de cada envío se conserva hasta recibir la referencia confirmada.
 // El digest incluye usuario y payload; nunca se almacena ruta ni email en claro.
 async function stableSubmissionKey(payload){
   if(!global.crypto?.subtle || !global.crypto?.getRandomValues)
     throw Error('Este navegador no permite proteger el envío. Usá una conexión segura.');
   const user=customer()?.profile?.email||'';
   const bytes=await global.crypto.subtle.digest('SHA-256',
     new TextEncoder().encode(JSON.stringify({user,payload})));
   const digest=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
   let saved=null;
   try{saved=JSON.parse(sessionStorage.getItem(PENDING_SUBMISSION)||'null')}catch{}
   if(saved?.digest===digest && /^[a-f0-9]{64}$/.test(saved.key))return saved.key;
   const random=global.crypto.getRandomValues(new Uint8Array(32));
   const key=Array.from(random,x=>x.toString(16).padStart(2,'0')).join('');
   sessionStorage.setItem(PENDING_SUBMISSION,JSON.stringify({digest,key}));
   return key;
 }
`;
replaceOne(/async function create\s*\(payload\)\s*\{/,
 m=>helper+"\n "+m,
 'crear reserva');

replaceOne(/const headers\s*=\s*same\s*\?\s*customerHeader\(\)\s*:\s*\{\s*'X-Verification-Token'\s*:\s*auth\.token\s*\}\s*;\s*const res\s*=\s*await request\(\s*'\/api\/requests'\s*,\s*\{\s*method\s*:\s*'POST'\s*,\s*headers\s*,\s*body\s*:\s*JSON\.stringify\(payload\)\s*\}\s*\)\s*;/,
 `const sessionAtSend=customer()?.sessionToken||null;
 const idemKey=await stableSubmissionKey(payload);
 const headers={...(same?customerHeader():{'X-Verification-Token':auth.token}),'Idempotency-Key':idemKey};
 const res=await request('/api/requests',{method:'POST',headers,body:JSON.stringify(payload)});`,
 'cuerpo del envío real');

replaceOne(/remember\(res\.id,res\.access_token\)\s*;\s*clearVerified\(\)\s*;\s*return res\s*;/,
 `if((customer()?.sessionToken||null)!==sessionAtSend)
   throw Error('La identidad cambió durante el envío. Ingresá con la cuenta original para recuperar la reserva.');
 remember(res.id,res.access_token);
 sessionStorage.removeItem(PENDING_SUBMISSION);
 clearVerified();return res;`,
 'confirmar referencia antes de borrar la clave');

replaceOne(/(?:async\s+)?function\s+logout\s*\([^)]*\)\s*\{/,
 m=>m+" sessionStorage.removeItem(PENDING_SUBMISSION);",
 'limpieza de envío pendiente al cerrar sesión');

replaceOne(/global\.ViaStore=\{isDemo,startVerification,verifyCode,create,get/,
 `let activeCreate=null;
 function guardedCreate(payload){
   const serialized=JSON.stringify(payload);
   if(activeCreate){
     if(activeCreate.serialized!==serialized)
       return Promise.reject(new Error('Ya se está enviando una solicitud. Esperá su resultado antes de cambiar los datos.'));
     return activeCreate.promise;
   }
   let promise;
   promise=create(payload).finally(()=>{if(activeCreate?.promise===promise)activeCreate=null;});
   activeCreate={serialized,promise};
   return promise;
 }
 global.ViaStore={isDemo,startVerification,verifyCode,create:guardedCreate,get`,
 'bloqueo de doble toque en la API pública');
// Evitar que la respuesta 401 de A (ya desconectado) borre la cuenta B.
// La función request() V19 original borra ACCOUNT sin comparar el token.
replaceOne(/if\(r\.status===401&&path==='\\/api\\/customer\\/me'\)localStorage\.removeItem\(ACCOUNT\);/,
 "if(r.status===401&&path==='/api/customer/me'){"+
 "const sent=(opts.headers?.Authorization||'').match(/^Bearer ([a-f0-9]{64})$/i)?.[1];"+
 "if(sent&&customer()?.sessionToken===sent)localStorage.removeItem(ACCOUNT);"+
 "}",
 'request: revocar solo sesión que produjo 401');

// Seguridad de sesión sobre fuente V19 exacta: no permitir que una consulta A
// tardía restaure A ni pinte sus reservas al haber ingresado B.
replaceOne(/async function resume\(\)\{[\s\S]*?\n\}/,
 [
 "async function resume(){",
 " const c=customer();if(!c)return null;",
 " if(isDemo())return c.profile;",
 " const token=c.sessionToken;",
 " try{",
 "  const live=await request('/api/customer/me',{headers:{Authorization:'Bearer '+token}});",
 "  if(customer()?.sessionToken!==token)return null;",
 "  if(!live?.profile)return null;",
 "  setCustomer({...c,profile:live.profile,passkeys:live.passkeys||0});",
 "  return live.profile;",
 " }catch(e){",
 "  if((e.status===401||e.status===403)&&customer()?.sessionToken===token)",
 "   localStorage.removeItem(ACCOUNT);",
 "  return null;",
 " }",
 "}"
 ].join('\n'),
 'resume: descartar sesión antigua');

replaceOne(/async function mine\(\)\{[\s\S]*?\n\}/,
 [
 "async function mine(){",
 " if(isDemo())return records();",
 " const account=customer();",
 " if(account){",
 "  try{",
 "   const rows=await request('/api/customer/bookings',{headers:{Authorization:'Bearer '+account.sessionToken}});",
 "   return customer()?.sessionToken===account.sessionToken?rows:[];",
 "  }catch(e){",
 "   if(e.status===401&&customer()?.sessionToken===account.sessionToken)",
 "    localStorage.removeItem(ACCOUNT);",
 "   else if(e.status!==401)throw e;",
 "   return [];",
 "  }",
 " }",
 " const ids=Object.keys(access());",
 " const list=await Promise.all(ids.map(async id=>{try{return await get(id)}catch{return null}}));",
 " return customer()?[]:list.filter(Boolean);",
 "}"
 ].join('\n'),
 'mine: reservas aisladas por sesión');

replaceOne(/async function logout\(\)\{[\s\S]*?\n\}/,
 [
 "async function logout(){",
 " const c=customer(),token=c?.sessionToken;",
 " // Limpiar primero la sesión local para poder usar otra identidad sin esperar red.",
 " localStorage.removeItem(ACCOUNT);",
 " if(!isDemo())localStorage.removeItem(ACCESS);",
 " sessionStorage.removeItem(PENDING_SUBMISSION);",
 " sessionStorage.removeItem('via-demo-phone-v1');",
 " clearVerified();",
 " global.dispatchEvent(new Event('via-customer-session'));",
 " if(token&&!isDemo())try{",
 "  await request('/api/customer/logout',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'});",
 " }catch{}",
 "}"
 ].join('\n'),
 'logout: limpiar inmediatamente sin esperar red');

assert(js.includes("'Idempotency-Key':idemKey"),'Idempotency-Key sin conexión');
assert(js.includes('sessionStorage.removeItem(PENDING_SUBMISSION)'),'Sin limpieza del contexto');
await mkdir('dist',{recursive:true});
await writeFile('dist/via-store-v29-idempotencia-qa.js',js);
console.log('VIA_STORE_QA_PATCH_READY '+JSON.stringify({
 upstreamUrl:liveUrl,upstreamHash:EXPECTED,patchedHash:sha(js),
 bytes:Buffer.byteLength(js),module:'store.js',stage:'QA_ARTIFACT_ONLY'
}));
