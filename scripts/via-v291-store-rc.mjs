// V29.1-RC1: proteger únicamente sesión, identidad, y logout; NO nuevas APIs.
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

// Evitar que la respuesta 401 de A (ya desconectado) borre la cuenta B.
// La función request() V19 original borra ACCOUNT sin comparar el token.
replaceOne(/if\(r\.status===401&&path==='\/api\/customer\/me'\)localStorage\.removeItem\(ACCOUNT\);/,
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
 "",
 " sessionStorage.removeItem('via-demo-phone-v1');",
 " clearVerified();",
 " global.dispatchEvent(new Event('via-customer-session'));",
 " if(token&&!isDemo())try{",
 "  await request('/api/customer/logout',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'});",
 " }catch{}",
 "}"
 ].join('\n'),
 'logout: limpiar inmediatamente sin esperar red');


assert(!js.includes('Idempotency-Key'),'No incluir contrato nuevo de D1 en V29.1');
assert(!js.includes('via-booking-pending-idempotent-v1'),'Sin estado de reserva de QA');
await mkdir('dist',{recursive:true});
await writeFile('dist/via-v291-store.js',js);
console.log('VIA_V291_STORE_RC_READY '+JSON.stringify({upstreamHash:EXPECTED,patchedHash:sha(js),bytes:Buffer.byteLength(js),stage:'RC_NOT_DEPLOYED'}));
