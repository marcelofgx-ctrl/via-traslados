// Consulta exclusivamente la D1 de Vía Traslados; no modifica recursos.
import fs from 'node:fs';
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!/^[a-f0-9]{32}$/i.test(account||''))throw Error('Faltan credenciales de Cloudflare válidas');
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database?name='+encodeURIComponent('via-traslados-db');
const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('Cloudflare respondió HTTP '+response.status+' al consultar la D1; revisar permiso D1 Read/Write');
const json=await response.json();
if(json.success!==true||!Array.isArray(json.result))throw Error('No se pudo consultar la base D1');
const exact=json.result.filter(x=>x?.name==='via-traslados-db');
if(exact.length!==1||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(exact[0].uuid||''))throw Error('La D1 via-traslados-db no existe o no tiene identificador válido');
console.log('D1 exclusiva via-traslados-db encontrada y accesible. No se modificó ningún recurso.');
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'VIA_D1_DATABASE_ID='+exact[0].uuid+'\n');
