import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
const a=process.env.CLOUDFLARE_ACCOUNT_ID,t=process.env.CLOUDFLARE_API_TOKEN;
assert(/^[a-f0-9]{32}$/i.test(a||'')&&t,'Authorized connection absent');
const root='https://api.cloudflare.com/client/v4/accounts/'+a;
const qa='146017ce-09a7-4457-abd2-694a5a5b3e92',prod='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0';
const db='/d1/database/'+qa;
async function api(path,body){const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const v=await r.json().catch(()=>({}));assert(r.ok&&v.success,'Cloudflare HTTP '+r.status+' '+path);return v.result}
async function sql(query){const r=await api(db+'/query',{sql:query,params:[]});assert(r[0]?.success,'QA schema read failed');return r[0].results}
async function active(name){const p='/workers/scripts/'+name;const d=await api(p+'/deployments');const v=d.deployments?.[0]?.versions||[];assert(v.length===1&&v[0].percentage===100,'Ambiguous deployment '+name);return v[0].version_id}
const web=await active('via-traslados-web-prod'),backend=await active('via-traslados-api'),worker=await active('via-traslados-api-qa');
assert(web==='d29d5304-db8d-48bb-a082-44b336454ed6'&&backend==='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b','Production baseline changed, stop and re-audit');
assert(worker==='36b8d437-48cf-476c-92af-a74488458e38','QA baseline changed, stop and re-audit');
const q='/workers/scripts/via-traslados-api-qa';
const binding=(await api(q+'/versions/'+worker)).resources.bindings;
assert(binding.some(b=>b.name==='DB'&&b.type==='d1'&&(b.id||b.database_id)===qa)&&!binding.some(b=>(b.id||b.database_id)===prod),'Wrong D1');
assert((await api(db)).name==='via-traslados-qa-db','Unexpected D1 name');
const secrets=await api(q+'/secrets');
const names=secrets.map(x=>x.name);
console.log('QA_AUTH_CAPABILITIES '+JSON.stringify(Object.fromEntries(['OTP_PEPPER','TURNSTILE_SECRET_KEY','RESEND_API_KEY','VIA_GEOAPIFY_API_KEY','OPERATOR_KEY_HASH'].map(n=>[n,names.includes(n)]))));
const schema=await sql("SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name");
assert(schema.length===48,'QA schema changed; review new structure');
assert(!schema.some(x=>x.name==='via_service_intervals'),'Already migrated');
writeFileSync('/tmp/via-qa-schema.sql',schema.map(x=>x.sql.replace(/;$/,'')+';').join('\n'));
const mark=await api(db+'/time_travel/bookmark');
assert(typeof mark.bookmark==='string'&&mark.bookmark.length>20,'No recovery point');
const health=await fetch('https://via-traslados-api-qa.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(20000)});
assert(health.ok,'QA health failed');
const h=await health.json();console.log('QA_HEALTH '+JSON.stringify({ok:h.ok,otpAvailable:h.otpAvailable}));
console.log('QA_SOURCE_AND_RECOVERY_PREFLIGHT_PASS (no writes)');
