import fs from 'node:fs';
const id=process.env.VIA_D1_DATABASE_ID?.trim()||'';
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('Falta VIA_D1_DATABASE_ID (UUID de D1 exclusiva)');
const origin=process.env.VIA_PUBLIC_ORIGIN?.trim()||'';
const u=new URL(origin);
if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||/\.vercel\.app$/i.test(u.hostname))throw Error('VIA_PUBLIC_ORIGIN debe ser la web productiva de Cloudflare, nunca Vercel QA');
const from=process.env.VIA_RESEND_FROM?.trim()||'';
if(!/^.+<[^<>\s]+@[^<>\s]+>$/.test(from))throw Error('VIA_RESEND_FROM inválido');
const q=JSON.stringify;
fs.writeFileSync('wrangler.toml',`name = "via-traslados-api"
main = "backend/worker.js"
compatibility_date = "2026-11-04"
workers_dev = true

[[d1_databases]]
binding = "DB"
database_name = "via-traslados-db"
database_id = ${q(id)}

[vars]
PUBLIC_ORIGIN = ${q(origin)}
OPERATOR_ORIGIN = ${q(origin)}
RESEND_FROM = ${q(from)}
`);
console.log('Configuración de via-traslados-api generada sin secretos.');
