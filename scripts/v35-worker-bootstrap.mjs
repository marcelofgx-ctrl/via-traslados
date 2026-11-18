// Registrar un Worker de QA nuevo cuando la API moderna de Cloudflare lo exige.
// Nunca actualiza ni elimina Workers existentes, producción o la QA V34.
import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
assert(token&&/^[a-f0-9]{32}$/i.test(account),'Credenciales ausentes');
const name='via-traslados-api-v35-qa';
const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/workers';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const check=await fetch(url+'/'+name,{headers,signal:AbortSignal.timeout(25000)});
if(check.ok) {
 const j=await check.json();assert(j.success,'Respuesta de Worker existente inválida');
 console.log('Worker V35 QA ya registrado, no se modificó');
} else if(check.status===404) {
 const create=await fetch(url,{method:'POST',headers,
  body:JSON.stringify({name,subdomain:{enabled:true}}),signal:AbortSignal.timeout(25000)});
 const j=await create.json().catch(()=>({}));
 if(!create.ok||j.success!==true||j.result?.name!==name)
  throw Error('Registro Worker exclusivo V35 QA rechazado (HTTP '+create.status+'); otras apps intactas');
 console.log('Registrado nuevo Worker V35 QA con workers.dev; producción y QA V34 intactos');
} else {
 throw Error('No es posible consultar el registro Worker V35 QA: HTTP '+check.status);
}
