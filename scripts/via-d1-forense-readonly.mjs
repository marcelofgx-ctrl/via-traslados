// Vía Traslados: examen FORENSE SOLO LECTURA de la D1 productiva.
// No consulta datos personales ni modifica registros. No exporta la base.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Credenciales faltantes');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
const fingerprint=s=>createHash('sha256').update(s).digest('hex').slice(0,20);
async function get(url){
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(28000)});
 if(!response.ok)throw Error('GET Cloudflare HTTP '+response.status);
 const json=await response.json();
 if(!json.success)throw Error('GET Cloudflare fallo: '+JSON.stringify(json.errors||[]).slice(0,180));
 return json.result;
}
async function named(name){
 const result=await get(base+'?name='+encodeURIComponent(name));
 return (result||[]).filter(x=>x.name===name);
}
const prods=await named('via-traslados-db');
const qas=await named('via-traslados-qa-db');
assert(prods.length===1,'No se puede identificar una única D1 productiva');
const prod=prods[0]; const id=prod.uuid;
assert(id&&qas.every(x=>x.uuid!==id),'D1 productiva confundida con QA');
const dburl=base+'/'+id;
async function select(sql){
 const accepted=[
  'SELECT COUNT(*) AS n FROM bookings',
  "SELECT status, COUNT(*) AS n FROM bookings GROUP BY status ORDER BY status",
  "SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest, MIN(updated_at) AS first_update, MAX(updated_at) AS last_update FROM bookings",
  "SELECT date(created_at) AS day,COUNT(*) AS n FROM bookings GROUP BY date(created_at) ORDER BY day",
  'SELECT COUNT(*) AS n FROM booking_events',
  'SELECT COUNT(*) AS n FROM booking_routes',
  'SELECT COUNT(*) AS n FROM booking_quotes',
  'SELECT COUNT(*) AS n FROM driver_assignments',
  "SELECT type,name FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type,name"
 ];
 assert(accepted.includes(sql),'SQL fuera de lista de SOLO lectura');
 const response=await fetch(dburl+'/query',{
  method:'POST',headers,body:JSON.stringify({sql}),signal:AbortSignal.timeout(28000)});
 if(!response.ok)throw Error('SELECT D1 HTTP '+response.status);
 const json=await response.json();
 assert(json.success&&json.result?.[0]?.success,'SELECT D1 falló');
 return json.result[0].results||[];
}
const objects=await select("SELECT type,name FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type,name");
const names=new Set(objects.filter(x=>x.type==='table').map(x=>x.name));
const stat=async(tab)=>names.has(tab)?Number((await select('SELECT COUNT(*) AS n FROM '+tab))[0]?.n||0):null;
const statuses=await select("SELECT status, COUNT(*) AS n FROM bookings GROUP BY status ORDER BY status");
const total=await stat('bookings');
assert(statuses.reduce((s,x)=>s+Number(x.n),0)===total,'Contadores de bookings inconsistentes');
const boundary=(await select("SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest, MIN(updated_at) AS first_update, MAX(updated_at) AS last_update FROM bookings"))[0];
const byDay=await select("SELECT date(created_at) AS day,COUNT(*) AS n FROM bookings GROUP BY date(created_at) ORDER BY day");
async function bookmark(timestamp){
 const target=dburl+'/time_travel/bookmark'+(timestamp?'?timestamp='+encodeURIComponent(timestamp):'');
 try{
  const result=await get(target);
  return {available:Boolean(result?.bookmark),fingerprint:result?.bookmark?fingerprint(result.bookmark):null};
 }catch(e){return {available:false,reason:String(e.message).slice(0,110)}}
}
const stamp0='2026-11-18T00:54:39Z';
const stamp1='2026-11-18T18:46:07Z';
const checks={
 checkedAt:new Date().toISOString(),
 database:{name:prod.name,uuidFingerprint:fingerprint(id),created_at:prod.created_at||null,version:prod.version||null,qaDifferent:true},
 previousAudits:{first:{timestamp:stamp0,reportedCount:24},second:{timestamp:stamp1,reportedCount:7}},
 current:{total,statuses,byDay,createdRange:boundary,events:await stat('booking_events'),routes:await stat('booking_routes'),quotes:await stat('booking_quotes'),assignments:await stat('driver_assignments'),tableCount:names.size,triggerCount:objects.filter(x=>x.type==='trigger').length},
 timeTravel:{atFirst:await bookmark(stamp0),atSecond:await bookmark(stamp1),now:await bookmark(null)},
 warnings:['Time-travel GET does not inspect historical rows; a bookmark alone cannot prove deletion or restoration.','Never restore D1 automatically.','No personal data, booking IDs or tokens were read.']
};
console.log('VIA_D1_FORENSE_READONLY '+JSON.stringify(checks));
console.log('VIA_D1_FORENSE_SUCCESS no writes, no restore, no user data');
