// Auditoría D1 productiva 100% SELECT. No imprimir PII ni claves, ni modificar tablas.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Credenciales Cloudflare ausentes');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
async function cf(url,body){
  const response=await fetch(url,{headers,method:body?'POST':'GET',
   body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  assert(response.ok&&data.success===true&&(!data.result?.[0]||data.result[0].success!==false),
   'Cloudflare consulta falló HTTP '+response.status+' '+JSON.stringify(data.errors||[]).slice(0,160));
  return data.result;
}
const dbs=await cf(root+'?name=via-traslados-db');
const prod=dbs.filter(x=>x.name==='via-traslados-db');
assert(prod.length===1,'D1 de prod no identificada unívocamente');
const qa=await cf(root+'?name=via-traslados-qa-db');
assert(!qa.some(x=>x.uuid===prod[0].uuid),'D1 prod no separada de QA');
const endpoint=root+'/'+prod[0].uuid+'/query';
async function select(sql){
 assert(/^SELECT\s/i.test(sql),'Solo SELECT permitido');
 const r=await cf(endpoint,{sql});
 return r[0].results||[];
}
// El celular de la consulta solo existe en memoria; nunca enviamos su valor a logs.
const phone='+59899203302';
const local='099203302';
const cleanExpr=col=>"replace(replace(replace(replace("+col+",' ',''),'-',''),'(',''),')','')";
const details=await select(`SELECT
 u.role AS role,u.status AS status,
 CASE WHEN c.email_verified_at IS NOT NULL THEN 1 ELSE 0 END AS verified,
 CASE WHEN vp.staff_id IS NOT NULL THEN 1 ELSE 0 END AS hasVehicle,
 CASE WHEN c.staff_id IS NOT NULL THEN 1 ELSE 0 END AS hasContact,
 u.created_at AS createdAt,u.updated_at AS updatedAt
 FROM staff_contacts c JOIN staff_users u ON u.id=c.staff_id
 LEFT JOIN driver_vehicle_profiles vp ON vp.staff_id=u.id
 WHERE c.phone='${phone}'`);
const legacy=await select(`SELECT
 (SELECT COUNT(*) FROM customers WHERE ${cleanExpr('phone')} IN ('${phone}','${local}','59899203302')) AS passengerAccounts,
 (SELECT COUNT(*) FROM bookings WHERE ${cleanExpr('phone')} IN ('${phone}','${local}','59899203302')) AS passengerBookings,
 (SELECT COUNT(*) FROM staff_contacts WHERE phone='${phone}') AS teamContactMatches,
 (SELECT COUNT(*) FROM staff_users WHERE role='driver' AND status='pending') AS pendingDrivers,
 (SELECT COUNT(*) FROM staff_users WHERE role='driver' AND status='approved') AS approvedDrivers,
 (SELECT COUNT(*) FROM staff_users WHERE role='driver' AND status='blocked') AS blockedDrivers,
 (SELECT COUNT(*) FROM staff_users WHERE role='admin' AND status='approved') AS admins,
 (SELECT COUNT(*) FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id
    WHERE u.role='driver' AND c.staff_id IS NULL) AS driversWithoutPhone
 `);
const statuses=await select("SELECT role,status,COUNT(*) AS total FROM staff_users GROUP BY role,status ORDER BY role,status");
const audit=await select("SELECT action,COUNT(*) AS count FROM admin_audit WHERE action LIKE '%register%' GROUP BY action ORDER BY action");
console.log('REGISTRATION_DIAG_READONLY '+JSON.stringify({
 database:'via-traslados-db',qaIsolated:true,staffMatchesForRequestedPhone:details,
 totals:legacy[0],staffStatuses:statuses,registrationAuditTypes:audit,
 checkedAt:new Date().toISOString()
}));
console.log('PROD_DATA_UNCHANGED_NO_PII_OUTPUT');
