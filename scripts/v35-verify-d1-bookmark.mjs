// Comprobación previa de Time Travel D1. Exclusivamente GET; nunca restaura.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Credenciales ausentes');
const origin='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
const list=await fetch(origin+'?name=via-traslados-db',{headers,signal:AbortSignal.timeout(22000)});
assert(list.ok,'No es posible comprobar base D1: HTTP '+list.status);
const obj=await list.json();
const exact=obj.result?.filter(x=>x.name==='via-traslados-db')||[];
assert(exact.length===1,'Base no encontrada');
const r=await fetch(origin+'/'+exact[0].uuid+'/time_travel/bookmark',{headers,signal:AbortSignal.timeout(22000)});
const data=await r.json().catch(()=>({}));
assert(r.ok&&data.success===true&&/^[a-f0-9-]{30,100}$/i.test(data.result?.bookmark||''),
 'Time Travel no confirmado: HTTP '+r.status+'. No autorizar migración sin respaldo verificable.');
// No incluir datos de usuarios ni claves. La marca es temporal y deberá renovarse inmediatamente antes de desplegar.
console.log('D1 Time Travel disponible en via-traslados-db; bookmark actual verificado (longitud '+data.result.bookmark.length+').');
console.log('El punto de restauración tiene que capturarse de nuevo ANTES de la migración. No se restauró ni modificó D1.');
