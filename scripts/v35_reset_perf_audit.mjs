// Auditoría sin escritura: conteos por tabla/estado, latencias y bookmark D1.
// No imprime correo, teléfono, reserva, tokens, contraseñas ni clave maestra.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Cloudflare credentials absent');
const headers={Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'};
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
async function cf(url,body){
 const begin=performance.now();
 const r=await fetch(url,{method:body?'POST':'GET',headers,
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const j=await r.json().catch(()=>({}));
 assert(r.ok&&j.success===true&&(!j.result?.[0]||j.result[0].success!==false),
  'Cloudflare D1 failed HTTP '+r.status+': '+JSON.stringify(j.errors||[]).slice(0,180));
 return {body:j,ms:Math.round(performance.now()-begin)};
}
const list=(await cf(api+'?name=via-traslados-db')).body.result||[];
const prod=list.filter(x=>x.name==='via-traslados-db');
assert(prod.length===1,'Production D1 not unique');
const uuid=prod[0].uuid;
const qa=(await cf(api+'?name=via-traslados-qa-db')).body.result||[];
assert(!qa.some(x=>x.uuid===uuid),'Prod and QA D1 same');
async function query(sql) {
 assert(/^SELECT\b|^PRAGMA\s+(?:index_list|table_info)\b/i.test(sql.trim()),'Read only');
 const res=await cf(api+'/'+uuid+'/query',{sql});
 return {rows:res.body.result?.[0]?.results||[],ms:res.ms,dbms:res.body.result?.[0]?.meta?.duration??null};
}
const objects=(await query("SELECT type,name FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type,name")).rows;
const tables=objects.filter(x=>x.type==='table').map(x=>x.name);
assert(tables.includes('bookings')&&tables.includes('staff_users')&&tables.includes('booking_commission_ledger'),
 'Production schema missing required tables');
const counts={};
for (const t of tables) {
 assert(/^[a-z][a-z0-9_]*$/.test(t),'Invalid table name');
 counts[t]=Number((await query('SELECT COUNT(*) AS n FROM "'+t+'"')).rows[0]?.n||0);
}
const statuses=(await query('SELECT status,COUNT(*) AS n FROM bookings GROUP BY status ORDER BY status')).rows;
const commissions=(await query('SELECT payment_status,COUNT(*) AS n FROM booking_commission_ledger GROUP BY payment_status')).rows;
const staff=(await query('SELECT role,status,COUNT(*) AS n FROM staff_users GROUP BY role,status')).rows;
const indices=objects.filter(x=>x.type==='index').map(x=>x.name);
const httpEndpoints=[
'https://via-traslados-api.marcelof-gx.workers.dev/api/health',
'https://via-traslados-api.marcelof-gx.workers.dev/api/public/status',
'https://viatraslados.com/'
];
const checks=[];
for(const url of httpEndpoints){
 const samples=[];
 for(let i=0;i<8;i++){
  const start=performance.now();
  const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},
   signal:AbortSignal.timeout(20000)});
  const text=await r.text();
  assert(r.ok&&text.length>0,'Service unhealthy '+url);
  samples.push(Math.round(performance.now()-start));
 }
 const sorted=[...samples].sort((a,b)=>a-b);
 checks.push({path:new URL(url).pathname,host:new URL(url).host,ms:samples,
 p50:sorted[Math.floor(sorted.length/2)],p95:sorted[sorted.length-1]});
}
const dbsamples=[];
for(let i=0;i<8;i++)dbsamples.push((await query('SELECT COUNT(*) AS n FROM bookings')).ms);
dbsamples.sort((a,b)=>a-b);
const bookmark=await cf(api+'/'+uuid+'/time_travel/bookmark');
assert(/^[a-z0-9-]{30,100}$/i.test(bookmark.body.result?.bookmark||''),'No Time Travel bookmark');
const safe={database:'via-traslados-db',isolatedQa:true,auditedAt:new Date().toISOString(),
 tables:tables.length,indexCount:indices.length,triggerCount:objects.filter(x=>x.type==='trigger').length,
 counts,statuses,commissions,staff,http:checks,controlPlaneD1CountsP50ms:dbsamples[4],
 controlPlaneD1CountsP95ms:dbsamples[7],
 indexNames:indices,fullSnapshotNeeded:true};
fs.mkdirSync('/tmp/via-reset-audit',{recursive:true});
fs.writeFileSync('/tmp/via-reset-audit/audit.json',JSON.stringify(safe,null,2));
fs.writeFileSync('/tmp/via-reset-audit/d1-recovery-bookmark-PRIVATE.json',
 JSON.stringify({database:'via-traslados-db',uuid,bookmark:bookmark.body.result.bookmark,date:safe.auditedAt},null,2));
console.log('VIA_RESET_READONLY_AUDIT '+JSON.stringify({...safe,indexNames:undefined,counts:Object.fromEntries(Object.entries(counts).filter(([k,v])=>v>0))}));
console.log('BACKUP_NOT_YET_TAKEN. NO_ROWS_MODIFIED.');
