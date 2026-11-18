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
const name='via-traslados-maestro-qa-db';
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
if(previous?.uuid===db.uuid)throw Error('D1 MAESTRO coincide con D1 de V34 QA');
if(prod?.uuid===db.uuid)throw Error('D1 QA coincide con producción');
const config=`name = "via-traslados-maestro-api-qa"
main = "backend/qa-entry-maestro.js"
compatibility_date = "2026-11-04"
workers_dev = true
keep_vars = false

[[d1_databases]]
binding = "DB"
database_name = "via-traslados-maestro-qa-db"
database_id = "${db.uuid}"

[vars]
VIA_QA_MODE = "1"
PUBLIC_ORIGIN = "https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev"
OPERATOR_ORIGIN = "https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev"
VIA_FOUNDER_PHONE = "+59899000099"
VIA_FOUNDER_EMAIL = "fundador.qa@ejemplo.invalid"
RESEND_FROM = "Vía Traslados QA <noreply@ejemplo.invalid>"
`;
fs.writeFileSync('wrangler.maestroqa.toml',config);
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'VIA_MAESTRO_QA_D1_ID='+db.uuid+'\n');
console.log('Configuración Worker QA aislado generada (sin secretos publicados).');
