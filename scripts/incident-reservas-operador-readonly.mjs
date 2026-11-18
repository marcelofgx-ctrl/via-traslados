import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Cloudflare credentials missing');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
async function cf(url,body){
 const response=await fetch(url,{method:body?'POST':'GET',headers,
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const data=await response.json().catch(()=>({}));
 assert(response.ok&&data.success===true&&(!body||data.result?.[0]?.success),
 'Cloudflare D1 failed '+response.status+' '+JSON.stringify(data.errors||[]).slice(0,180));
 return data.result;
}
const databases=(await cf(base+'?name=via-traslados-db')).filter(x=>x.name==='via-traslados-db');
assert(databases.length===1,'Production database not unique');
const endpoint=base+'/'+databases[0].uuid+'/query';
async function select(sql){
 assert(/^\s*SELECT\s/i.test(sql)&&!/;/.test(sql),'SELECT only');
 const data=await cf(endpoint,{sql});return data[0].results||[];
}
const timeline=await select("SELECT id, status, trip_date, trip_time, created_at, updated_at, CASE WHEN price_uyu IS NULL THEN 0 ELSE 1 END AS priced FROM bookings ORDER BY created_at DESC LIMIT 15");
const stats=await select("SELECT status,COUNT(*) AS n FROM bookings GROUP BY status ORDER BY status");
const recent=await select("SELECT COUNT(*) AS booked60m, SUM(CASE WHEN status='requested' THEN 1 ELSE 0 END) AS requested60m FROM bookings WHERE created_at >= datetime('now','-1 hour')");
const people=await select("SELECT u.role,u.status,COUNT(*) AS n,SUM(CASE WHEN c.email_verified_at IS NULL THEN 0 ELSE 1 END) AS emailVerified,SUM(CASE WHEN v.staff_id IS NULL THEN 0 ELSE 1 END) AS haveVehicle FROM staff_users u LEFT JOIN staff_contacts c ON c.staff_id=u.id LEFT JOIN driver_vehicle_profiles v ON v.staff_id=u.id GROUP BY u.role,u.status ORDER BY u.role,u.status");
const offerStats=await select("SELECT (SELECT COUNT(*) FROM booking_quotes) AS offers,(SELECT COUNT(*) FROM driver_assignments) AS assignments,(SELECT COUNT(*) FROM booking_dispatch_releases) AS released,(SELECT COUNT(*) FROM booking_events WHERE new_status='requested') AS createdEvents,(SELECT COUNT(*) FROM booking_events WHERE new_status='quoted') AS quotedEvents");
const quoteDetails=await select("SELECT q.booking_id,b.status,CASE WHEN a.driver_id IS NULL THEN 'missing' ELSE 'present' END AS assignment,u.role,u.status AS driverStatus FROM booking_quotes q LEFT JOIN bookings b ON b.id=q.booking_id LEFT JOIN driver_assignments a ON a.booking_id=q.booking_id LEFT JOIN staff_users u ON u.id=q.driver_id ORDER BY q.created_at DESC LIMIT 10");
const publicSettings=await select("SELECT setting_key,setting_value FROM service_settings WHERE setting_key IN ('public_web_enabled')");
const eligible=await select("SELECT u.role,COUNT(*) AS n FROM staff_users u JOIN staff_contacts c ON c.staff_id=u.id WHERE u.status='approved' AND c.email_verified_at IS NOT NULL GROUP BY u.role");
const faults=await select("SELECT COUNT(*) AS unassignedRequested FROM bookings b LEFT JOIN driver_assignments a ON a.booking_id=b.id WHERE b.status='requested' AND a.driver_id IS NULL");
const pairs=await select("SELECT b1.id AS newer,b2.id AS older,CASE WHEN b1.email=b2.email THEN 1 ELSE 0 END AS sameCustomer,CASE WHEN b1.origin=b2.origin AND b1.destination=b2.destination THEN 1 ELSE 0 END AS sameRoute,CASE WHEN b1.trip_date=b2.trip_date AND b1.trip_time=b2.trip_time THEN 1 ELSE 0 END AS sameTime,CAST(strftime('%s',b1.created_at) AS INTEGER)-CAST(strftime('%s',b2.created_at) AS INTEGER) AS secondsApart FROM bookings b1 JOIN bookings b2 ON b1.id='VIA-D314F0E7-93A' AND b2.id='VIA-98D5D7F4-897'");
const overlaps=await select("SELECT target.id AS requestedId,other.id AS conflictingConfirmedId,other.trip_date,other.trip_time, other.status FROM bookings target JOIN bookings other ON target.id IN ('VIA-98D5D7F4-897','VIA-D314F0E7-93A') AND other.status='confirmed' AND other.trip_date=target.trip_date AND other.trip_time=target.trip_time JOIN driver_assignments a ON a.booking_id=other.id WHERE target.status='requested'");
console.log('OPERATIONAL_CONFLICTS '+JSON.stringify({duplicateSignals:pairs,overlaps,checkedAt:new Date().toISOString()}));
console.log('RESERVATION_OPERATOR_AUDIT '+JSON.stringify({
 checkedAt:new Date().toISOString(),statuses:stats,
 recent:recent[0],lastBookings:timeline,drivers:people,
 offers:offerStats[0],quoteDetails,publicSettings,
 eligible,unassigned:faults[0]
}));
console.log('READ_ONLY_NO_PRIVATE_EMAIL_PHONE_OR_SESSIONS');
