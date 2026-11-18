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
 `const idemKey=await stableSubmissionKey(payload);
 const headers={...(same?customerHeader():{'X-Verification-Token':auth.token}),'Idempotency-Key':idemKey};
 const res=await request('/api/requests',{method:'POST',headers,body:JSON.stringify(payload)});`,
 'cuerpo del envío real');

replaceOne(/remember\(res\.id,res\.access_token\)\s*;\s*clearVerified\(\)\s*;\s*return res\s*;/,
 `remember(res.id,res.access_token);
 sessionStorage.removeItem(PENDING_SUBMISSION);
 clearVerified();return res;`,
 'confirmar referencia antes de borrar la clave');

replaceOne(/(?:async\s+)?function\s+logout\s*\([^)]*\)\s*\{/,
 m=>m+" sessionStorage.removeItem(PENDING_SUBMISSION);",
 'limpieza de envío pendiente al cerrar sesión');

assert(js.includes("'Idempotency-Key':idemKey"),'Idempotency-Key sin conexión');
assert(js.includes('sessionStorage.removeItem(PENDING_SUBMISSION)'),'Sin limpieza del contexto');
await mkdir('dist',{recursive:true});
await writeFile('dist/via-store-v29-idempotencia-qa.js',js);
console.log('VIA_STORE_QA_PATCH_READY '+JSON.stringify({
 upstreamUrl:liveUrl,upstreamHash:EXPECTED,patchedHash:sha(js),
 bytes:Buffer.byteLength(js),module:'store.js',stage:'QA_ARTIFACT_ONLY'
}));
