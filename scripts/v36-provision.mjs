// Provisionar exclusivamente QA; nunca modificar via-traslados-db ni via-traslados-api.
import fs from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const key=process.env.CLOUDFLARE_API_TOKEN||'';
if(!/^[a-f0-9]{32}$/i.test(account)||!key)throw Error('No hay credenciales Cloudflare para QA');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
async function cf(url,opt={}){
 const r=await fetch(url,{...opt,headers:{Authorization:'Bearer '+key,
  'Content-Type':'application/json',...opt.headers},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Cloudflare QA HTTP '+r.status);
 const j=await r.json();
 if(j.success!==true)throw Error('Error de Cloudflare al preparar QA');
 return j.result;
}
const name='via-traslados-v36-qa-db';
const matches=(await cf(base+'?name='+encodeURIComponent(name))).filter(v=>v.name===name);
if(matches.length>1)throw Error('D1 QA duplicada');
let db=matches[0];
if(!db){
 db=await cf(base,{method:'POST',body:JSON.stringify({name})});
 console.log('Creada nueva D1 QA (sin tocar producción)');
}else console.log('Encontrada D1 QA existente');
if(!/^[a-f0-9-]{36}$/i.test(db.uuid||''))throw Error('UUID D1 QA inválido');
const prod=(await cf(base+'?name=via-traslados-db')).find(v=>v.name==='via-traslados-db');
const previous=(await cf(base+'?name=via-traslados-qa-db')).find(v=>v.name==='via-traslados-qa-db');
if(previous?.uuid===db.uuid)throw Error('D1 V36 coincide con D1 de V34 QA');
if(prod?.uuid===db.uuid||db.uuid==='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'||db.uuid==='146017ce-09a7-4457-abd2-694a5a5b3e92')throw Error('D1 QA coincide con otra base');
const v35=(await cf(base+'?name=via-traslados-v35-qa-db')).find(v=>v.name==='via-traslados-v35-qa-db');if(v35?.uuid===db.uuid)throw Error('D1 coincide con V35 QA');
const config=`name = "via-traslados-api-v36-qa"
main = "backend/qa-entry-v36.js"
compatibility_date = "2026-11-04"
workers_dev = true
keep_vars = false

[[d1_databases]]
binding = "DB"
database_name = "via-traslados-v36-qa-db"
database_id = "${db.uuid}"

[vars]
VIA_QA_MODE = "V36_PROFILE_PRIVATE"\nVIA_DRIVER_IDENTITY_ENABLED = "true"
PUBLIC_ORIGIN = "https://via-traslados-pasajeros.pages.dev"
OPERATOR_ORIGIN = "https://via-traslados-pasajeros.pages.dev"



`;
fs.writeFileSync('wrangler.v36qa.toml',config);
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'VIA_V36_D1_ID='+db.uuid+'\n');
console.log('Configuración Worker QA aislado generada (sin secretos publicados).');
