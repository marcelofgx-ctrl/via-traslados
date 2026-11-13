import {priceGuide,commissionBps,mayQuoteAll,mayRelease,hasQuoteAccess,quoteBreakdown} from './dispatch-business.js';

export async function driverPolicy(env,actor){
 if(!actor||!['admin','driver'].includes(actor.role)||actor.status!=='approved')
   return {canQuoteAll:false,canRelease:false,commissionBps:2500};
 if(actor.role==='admin')
   return {canQuoteAll:actor.id!=='master',canRelease:true,commissionBps:0};
 const p=await env.DB.prepare(
   'SELECT can_quote_all,can_release,mode,commission_bps FROM driver_commercial_profiles WHERE staff_id=?'
 ).bind(actor.id).first();
 return {
   canQuoteAll:Number(p?.can_quote_all)===1,
   canRelease:Number(p?.can_release)===1,
   commissionBps:commissionBps(actor.role,p?.mode,p?.commission_bps)
 };
}
export async function visibilityFor(env,actor,bookingId,policy){
 if(actor?.role==='admin')return {visible:true,mayQuote:actor.id!=='master',mayRelease:policy.canRelease};
 const row=await env.DB.prepare(
   "SELECT b.status,a.driver_id,r.booking_id AS released "+
   "FROM bookings b LEFT JOIN driver_assignments a ON a.booking_id=b.id "+
   "LEFT JOIN booking_dispatch_releases r ON r.booking_id=b.id WHERE b.id=?"
 ).bind(bookingId).first();
 if(!row)return {visible:false,mayQuote:false,mayRelease:false};
 const assigned=row.driver_id===actor.id;
 const unclaimed=row.status==='requested'&&!row.driver_id;
 const released=Boolean(row.released);
 const canQuote=unclaimed&&(policy.canQuoteAll||released);
 return {
   visible:assigned||unclaimed&&(policy.canQuoteAll||policy.canRelease||released),
   mayQuote:canQuote,mayRelease:unclaimed&&policy.canRelease,assigned
 };
}
export async function quoteBooking(env,actor,bookingId,amount){
 if(!actor||actor.id==='master'||!['admin','driver'].includes(actor.role))
   return {status:403,error:'Ingresá con una cuenta de conductor habilitada para cotizar'};
 if(!Number.isInteger(amount)||amount<1||amount>10000000)
   return {status:400,error:'Importe inválido en pesos uruguayos'};
 const policy=await driverPolicy(env,actor);
 const permitted=await visibilityFor(env,actor,bookingId,policy);
 if(!permitted.mayQuote && !permitted.assigned)
   return {status:403,error:'Esta solicitud no está disponible para cotizar'};
 try{
  // El disparador SQL hace una sola operación atómica: verifica permisos,
  // cruce horario, asigna conductor y registra el nuevo estado y su tarifa.
  const insert=await env.DB.prepare(
    "INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps) "+
    "SELECT ?,u.id,?,CASE WHEN u.role='admin' OR p.mode='partner' THEN 0 "+
    "ELSE COALESCE(p.commission_bps,2500) END FROM staff_users u "+
    "LEFT JOIN driver_commercial_profiles p ON p.staff_id=u.id "+
    "WHERE u.id=? AND u.status='approved'"
  ).bind(bookingId,amount,actor.id).run();
  if(insert.meta?.changes!==1)return {status:409,error:'No se pudo adjudicar el traslado'};
  return {status:200,assignedTo:actor.id,quotePriceUyu:amount,
    ...quoteBreakdown(amount,policy.commissionBps)};
 }catch(e){
  const reason=String(e?.message||e);
  if(reason.includes('VIA_QUOTE_OVERLAP'))return {status:409,error:'Tenés otro viaje en ese horario'};
  if(reason.includes('VIA_QUOTE_CAPACITY'))return {status:409,error:'El vehículo no tiene capacidad suficiente'};
  if(reason.includes('VIA_QUOTE_AUTH'))return {status:403,error:'No tenés permiso para cotizar este viaje'};
  if(reason.includes('VIA_QUOTE_ASSIGNED_OTHER'))return {status:409,error:'El viaje ya pertenece a otro conductor'};
  if(reason.includes('VIA_QUOTE_STATUS')||reason.includes('UNIQUE'))
    return {status:409,error:'El viaje ya recibió una propuesta. Actualizá el listado'};
  throw e;
 }
}
export async function releaseBooking(env,actor,bookingId){
 const policy=await driverPolicy(env,actor);
 if(!mayRelease(actor,{can_release:policy.canRelease?1:0}))
   return {status:403,error:'No tenés permisos para liberar solicitudes'};
 const row=await env.DB.prepare(
   "SELECT b.status,a.driver_id FROM bookings b "+
   "LEFT JOIN driver_assignments a ON a.booking_id=b.id WHERE b.id=?"
 ).bind(bookingId).first();
 if(!row)return {status:404,error:'Solicitud inexistente'};
 if(row.status!=='requested'||row.driver_id)
   return {status:409,error:'Solo se liberan solicitudes nuevas sin conductor asignado'};
 const insert=await env.DB.prepare(
   "INSERT OR IGNORE INTO booking_dispatch_releases(booking_id,released_by) "+
   "SELECT ?,? WHERE EXISTS (SELECT 1 FROM bookings b WHERE b.id=? AND b.status='requested') "+
   "AND NOT EXISTS (SELECT 1 FROM driver_assignments a WHERE a.booking_id=?)"
 ).bind(bookingId,actor.id,bookingId,bookingId).run();
 return {status:200,released:true,unchanged:insert.meta?.changes===0};
}
export async function guideForBooking(env,actor,id){
 const policy=await driverPolicy(env,actor);
 const visibility=await visibilityFor(env,actor,id,policy);
 if(!visibility.visible)return {status:404,error:'Solicitud no disponible'};
 const route=await env.DB.prepare(
   "SELECT b.id,b.status,b.price_uyu,r.distance_m,r.duration_s "+
   "FROM bookings b LEFT JOIN booking_routes r ON r.booking_id=b.id WHERE b.id=?"
 ).bind(id).first();
 if(!route)return {status:404,error:'Solicitud no encontrada'};
 const guide=priceGuide(Number(route.distance_m)/1000,Number(route.duration_s)/60);
 return {status:200,guide,
  canQuote:visibility.mayQuote,
  canRelease:visibility.mayRelease,
  exampleAtSuggested:guide?quoteBreakdown(guide.suggested,policy.commissionBps):null};
}
