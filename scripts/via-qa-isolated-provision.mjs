// Provisión aislada. ÚNICO recurso que puede crear: D1 QA con nombre exacto.
// Prohíbe modificar la D1 y Workers de producción. Nunca imprime tokens.
import fs from 'node:fs';
import path from 'node:path';
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const QA_DB = 'via-traslados-db-auth-qa-20261121';
const PROD_DB = 'via-traslados-db';
const QA_WORKER = 'via-traslados-api-auth-qa-20261121';
const QA_ORIGIN = 'https://via-traslados-current-prod-qa.marcelof-gx.workers.dev';
if(!/^[a-f0-9]{32}$/i.test(ACCOUNT) || TOKEN.length<20)throw Error('Cloudflare: credenciales CI no configuradas');
if(!QA_DB.includes('-qa-')||QA_DB===PROD_DB||!QA_WORKER.includes('-qa-'))throw Error('Guardia QA: nombre prohibido');
async function call(method,route,body){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+route,{
   method,headers:{Authorization:'Bearer '+TOKEN,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await r.json();
 if(!r.ok||!data.success)throw Error('Cloudflare '+method+' '+route.split('?')[0]+' HTTP '+r.status+' '+(data.errors||[]).map(e=>e.code).join(','));
 return data;
}
const databases=[];
for(let page=1;page<=20;page++){
 const d=await call('GET','/d1/database?per_page=100&page='+page);
 databases.push(...d.result);
 if(!d.result_info || page>=d.result_info.total_pages)break;
}
const production=databases.find(d=>d.name===PROD_DB);
if(!production?.uuid)throw Error('Guardia: D1 de producción no encontrada en inventario, abortando sin cambios');
if(databases.filter(d=>d.name===QA_DB).length>1)throw Error('D1 QA duplicada; abortando');
let db=databases.find(d=>d.name===QA_DB);
if(!db){
 const created=await call('POST','/d1/database',{name:QA_DB});
 db=created.result;
 console.log('CREATED_QA_D1',QA_DB);
}else console.log('REUSED_ISOLATED_QA_D1',QA_DB);
const uuid=db.uuid;
if(!/^[a-f0-9-]{36}$/i.test(uuid)||uuid===production.uuid)throw Error('Guardia: UUID QA inválido o igual al productivo');
fs.mkdirSync('.qa',{recursive:true});
const origin=QA_ORIGIN,quote=JSON.stringify;
const fromRaw=(process.env.VIA_QA_RESEND_FROM||'').trim();
const match=fromRaw.match(/<([^<>\s]+@[^<>\s]+)>$/);
const from=match?'Vía Traslados QA <'+match[1]+'>':'';
fs.writeFileSync('.qa/wrangler-backend.toml',[
 'name = '+quote(QA_WORKER),
 'main = "../backend/qa-entry.js"',
 'compatibility_date = "2026-11-10"',
 'workers_dev = true',
 '[[d1_databases]]',
 'binding = "DB"',
 'database_name = '+quote(QA_DB),
 'database_id = '+quote(uuid),
 '[vars]',
 'PUBLIC_ORIGIN = '+quote(origin),
 'OPERATOR_ORIGIN = '+quote(origin),
 'RESEND_FROM = '+quote(from),
 'VIA_QA_ENV = "isolated"',
 'VIA_QA_NAME = '+quote(QA_DB),
 'VIA_QA_TEST_EMAILS = '+quote((process.env.VIA_QA_TEST_EMAILS||'').toLowerCase().trim()),
 ''
].join('\n'));
fs.writeFileSync('.qa/qa-d1-id.txt',uuid+'\n');
if(fs.readFileSync('.qa/wrangler-backend.toml','utf8').includes('via-traslados-db"'))throw Error('Guardia: referencia D1 productiva');
console.log('QA_CONFIG_SAFE',QA_WORKER,QA_DB,'public origin',origin,'resend metadata',Boolean(from));
