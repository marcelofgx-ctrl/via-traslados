// Captura punto de recuperación Time Travel de la única D1 productiva.
// No accede a filas ni modifica la base. Sólo metadata de Cloudflare.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Faltan credenciales Cloudflare');
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const list=await fetch(base+'?name=via-traslados-db',{headers,signal:AbortSignal.timeout(22000)});
assert(list.ok,'D1 no accesible');
const d=await list.json();
const matches=d.result?.filter(x=>x.name==='via-traslados-db')||[];
assert(matches.length===1,'Nombre D1 exclusivo inválido');
const res=await fetch(base+'/'+matches[0].uuid+'/time_travel/bookmark',{headers,signal:AbortSignal.timeout(22000)});
const snapshot=await res.json().catch(()=>({}));
assert(res.ok&&snapshot.success===true&&/^[a-f0-9-]{30,100}$/i.test(snapshot.result?.bookmark||''),'Time Travel no disponible');
const output=process.env.RUNNER_TEMP+'/via-v35-bookmark.json';
fs.writeFileSync(output,JSON.stringify({database:'via-traslados-db',capturedAt:new Date().toISOString(),bookmark:snapshot.result.bookmark})+'\n',{mode:0o600});
console.log('V35_BACKUP_READY: Bookmark D1 capturado en artefacto privado; no se modificaron reservas.');
