// Crear únicamente el Worker de staging de la descarga V35, si no existe.
// Nunca cambiar workers de pasajeros, producción ni QA V34.
import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
assert(token&&/^[a-f0-9]{32}$/i.test(account),'Cloudflare credentials missing');
const name='via-traslados-web-apk-v35-qa';
const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/workers';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const check=await fetch(url+'/'+name,{headers,signal:AbortSignal.timeout(30000)});
if(check.ok){
 const j=await check.json();
 assert(j.success===true,'Worker staging no accesible');
 console.log('Worker V35 staging registrado, no se altera');
}else if(check.status===404){
 const create=await fetch(url,{method:'POST',headers,
  body:JSON.stringify({name,subdomain:{enabled:true}}),signal:AbortSignal.timeout(30000)});
 const j=await create.json().catch(()=>({}));
 assert(create.ok&&j.success===true&&j.result?.name===name,
 'Cloudflare no permitió el Worker V35 QA ('+create.status+'). No desplegar prod.');
 console.log('Worker V35 QA creado; producción y V34 intactos');
}else throw Error('Cloudflare Worker staging HTTP '+check.status);
