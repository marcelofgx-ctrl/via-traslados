// QA-only release guard. No production database access, no restore.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const a=process.env.CLOUDFLARE_ACCOUNT_ID,t=process.env.CLOUDFLARE_API_TOKEN;
assert(/^[a-f0-9]{32}$/i.test(a||'')&&t);
const root='https://api.cloudflare.com/client/v4/accounts/'+a,qa='146017ce-09a7-4457-abd2-694a5a5b3e92',db='/d1/database/'+qa;
const old='36b8d437-48cf-476c-92af-a74488458e38';
const mode=process.argv[2];
async function api(path,body){
 const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const v=await r.json().catch(()=>({}));assert(r.ok&&v.success,'Cloudflare HTTP '+r.status+' '+path);return v.result
}
async function sql(query){const r=await api(db+'/query',{sql:query,params:[]});assert(r[0]?.success,'QA SQL failed');return r[0].results}
async function active(name){const p='/workers/scripts/'+name,d=await api(p+'/deployments'),v=d.deployments?.[0]?.versions||[];assert(v.length===1&&v[0].percentage===100,'Ambiguous '+name);return v[0].version_id}
assert(await active('via-traslados-web-prod')==='d29d5304-db8d-48bb-a082-44b336454ed6','Production web changed');
assert(await active('via-traslados-api')==='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b','Production API changed');
assert((await api(db)).name==='via-traslados-qa-db');
const worker=await active('via-traslados-api-qa');
const binds=(await api('/workers/scripts/via-traslados-api-qa/versions/'+worker)).resources.bindings;
assert(binds.some(b=>b.name==='DB'&&b.type==='d1'&&(b.id||b.database_id)===qa)&&!binds.some(b=>(b.id||b.database_id)==='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'),'Wrong D1');
const tables=['bookings','booking_quotes','driver_assignments','booking_events','booking_routes','booking_locations','booking_commission_ledger','customers','staff_users'];
async function counts(){return Object.fromEntries(await Promise.all(tables.map(async n=>[n,(await sql('SELECT count(*) AS n FROM '+n))[0].n])))}
const meta='/tmp/via-qa-recovery.json';
if(mode==='before'){
 assert(worker===old,'QA version changed');
 const schema=await sql("SELECT name FROM sqlite_master WHERE name='via_service_intervals'");assert(schema.length===0,'Already migrated');
 const timestamp=new Date().toISOString();
 const point=await api(db+'/time_travel/bookmark?timestamp='+encodeURIComponent(timestamp));
 assert(typeof point.bookmark==='string'&&point.bookmark.length>20,'Recoverable point missing');
 const before=await counts();
 const marker={timestamp,bookmarkSha256:createHash('sha256').update(point.bookmark).digest('hex'),worker,db:qa,counts:before};
 writeFileSync(meta,JSON.stringify(marker));
 console.log('QA_RECOVERY_POINT '+JSON.stringify({timestamp,bookmarkSha256:marker.bookmarkSha256,worker,db:qa}));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## QA recovery checkpoint\nDatabase: via-traslados-qa-db. UTC: '+timestamp+'; verified bookmark SHA-256: '+marker.bookmarkSha256+'; prior API: '+worker+'. No restore executed.\n');
}else if(mode==='after-migration'){
 assert(worker===old,'API changed unexpectedly during migration');
 const before=JSON.parse(readFileSync(meta,'utf8'));
 assert.deepEqual(await counts(),before.counts,'QA row counts changed during migration; stop and inspect');
 assert.deepEqual(await sql('PRAGMA foreign_key_check'),[],'Foreign keys failed');
 const cols=await sql('PRAGMA table_info(bookings)');
 assert(cols.find(x=>x.name==='destination')?.notnull===0&&cols.some(x=>x.name==='hourly_request_id'),'Migration not verified');
 assert((await sql("SELECT count(*) AS n FROM bookings WHERE service_type<>'point_to_point' OR destination IS NULL"))[0].n===0,'Historical rows changed');
 assert((await sql("SELECT name FROM sqlite_master WHERE name IN ('via_service_intervals','via_hourly_accept_guard','via_hourly_assignment_insert','via_hourly_late_route_insert','via_quote_commit','via_commission_on_completion')")).length===6,'Critical triggers absent');
 console.log('QA_MIGRATION_VERIFIED existing row counts unchanged; foreign keys OK');
}else if(mode==='after-deploy'){
 assert(worker!==old,'QA version did not change');
 assert(binds.some(b=>b.name==='VIA_HOURLY_ENABLED'&&b.text==='1'),'Hourly flag not active');
 const h=await fetch('https://via-traslados-api-qa.marcelof-gx.workers.dev/api/health',{signal:AbortSignal.timeout(20000)});
 assert(h.ok);const j=await h.json();assert(j.ok&&j.backendVersion==='31.1-qa'&&j.hourlyEnabled===true,'Domain does not serve candidate');
 console.log('QA_ACTIVE_VERSION '+JSON.stringify({worker,backendVersion:j.backendVersion,otpAvailable:j.otpAvailable}));
}else throw Error('Unknown gate');
