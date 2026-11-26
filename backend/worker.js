import {beginOtp,checkOtp,consumeVerifiedSession,normalizeEmail,emailOtpAvailable} from './auth.js';
import {locationPoint} from './location-v30.js';
import {hourlyEnabled,hourlySelect,hourlyFields,createHourly,quoteHourly} from './hourly-api.js';
import {staffRoutes,identity,webEnabled} from './staff.js';
import {staffPhoneRoutes} from './staff-phone.js';
import {routeEstimateRoutes,precalculateBookingRoute} from './route-estimate.js';
import {customerSession,customerRoutes} from './customer-auth.js';
import {customerPasskeyRoutes} from './customer-passkeys.js';
import {allowedOriginsFor} from './origins.js';
import {driverPolicy,visibilityFor,quoteBooking,releaseBooking,guideForBooking} from './dispatch-ops.js';
const STEPS={requested:['quoted','cancelled'],quoted:['accepted','cancelled'],accepted:['confirmed','cancelled'],confirmed:['en_route','cancelled'],en_route:['arrived','cancelled'],arrived:['in_progress','cancelled'],in_progress:['completed'],completed:[],cancelled:[]};
const FIELDS='id,origin,destination,trip_date,trip_time,passengers,bags,notes,status,price_uyu,created_at,updated_at';
const OP_FIELDS=FIELDS+',customer_name,phone,email';
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const clean=(x,max)=>String(x??'').trim().slice(0,max);
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let delta=0;for(let i=0;i<a.length;i++)delta|=a.charCodeAt(i)^b.charCodeAt(i);return delta===0};
export const validTransition=(from,to)=>Boolean(STEPS[from]?.includes(to));
export function validateBooking(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Datos incorrectos');
 const q={name:clean(p.name,100),phone:clean(p.phone,30),email:clean(p.email,200),origin:clean(p.origin,200),destination:clean(p.destination,200),date:clean(p.date,10),time:clean(p.time,5),notes:clean(p.notes,500),passengers:Number(p.passengers),bags:Number(p.bags),
  originLocation:locationPoint(p.originLocation),destinationLocation:locationPoint(p.destinationLocation)};
 if(q.name.length<2||q.origin.length<4||q.destination.length<4||!/^\+?[\d\s()\-]{7,30}$/.test(q.phone))throw Error('Completá nombre, celular, origen y destino');
 q.email=normalizeEmail(q.email);
 if(q.origin.toLowerCase()===q.destination.toLowerCase())throw Error('Origen y destino deben ser distintos');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(q.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(q.time))throw Error('Fecha u hora incorrectas');
 const date=new Date(q.date+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==q.date)throw Error('Fecha inválida');
 const today=new Date().toISOString().slice(0,10);if(q.date<today||q.date>new Date(Date.now()+366*864e5).toISOString().slice(0,10))throw Error('Fecha fuera de rango');
 if(!Number.isInteger(q.passengers)||q.passengers<1||q.passengers>8||!Number.isInteger(q.bags)||q.bags<0||q.bags>5)throw Error('Pasajeros o valijas inválidos');
 return q
}
const publicRow=r=>({...hourlyFields(r),id:r.id,origin:r.origin,destination:r.destination,date:r.trip_date,time:r.trip_time,passengers:r.passengers,bags:r.bags,notes:r.notes,status:r.status,price:r.price_uyu,created_at:r.created_at,updated_at:r.updated_at,
 route:r.route_provider==='geoapify'&&Number(r.route_distance_m)>0&&Number(r.route_duration_s)>0?
 {distanceKm:Math.round(Number(r.route_distance_m)/100)/10,durationMinutes:Math.ceil(Number(r.route_duration_s)/60),
  estimate:true,trafficIncluded:false,source:'Geoapify',attribution:'© OpenStreetMap contributors · Powered by Geoapify'}:null});
const operatorRow=r=>({...publicRow(r),name:r.customer_name,phone:r.phone,email:r.email,
 assignedDriverId:r.assigned_driver_id||null,assignedDriverName:r.assigned_driver_name||null,
 route:r.route_provider==='geoapify'&&Number(r.route_distance_m)>0&&Number(r.route_duration_s)>0?
  {distanceKm:Math.round(Number(r.route_distance_m)/100)/10,
   durationMinutes:Math.ceil(Number(r.route_duration_s)/60),
   source:'Geoapify',estimate:true,trafficIncluded:false,
   attribution:'© OpenStreetMap contributors · Powered by Geoapify',
   attributionUrl:'https://www.geoapify.com/'}:null
});
const routeSelect=alias=>
 "(SELECT distance_m FROM booking_routes WHERE booking_id="+alias+".id AND provider='geoapify') AS route_distance_m,"+
 "(SELECT duration_s FROM booking_routes WHERE booking_id="+alias+".id AND provider='geoapify') AS route_duration_s,"+
 "(SELECT provider FROM booking_routes WHERE booking_id="+alias+".id AND provider='geoapify') AS route_provider";
function scheduleMissingRoutes(env,ctx,rows,max=2){
 if(!ctx?.waitUntil)return;
 const missing=rows.filter(x=>x.service_type!=='hourly'&&!x.route_distance_m&&
  ['requested','quoted','accepted','confirmed'].includes(x.status)).slice(0,20);
 if(!missing.length)return;
 ctx.waitUntil((async()=>{
  const tasks=[];
  for(const booking of missing){
   if(tasks.length>=max)break;
   try{
    // Reserva por 10 min para que dos teléfonos no pidan la misma ruta.
    // Reintento automático posterior si el geocodificador no responde.
    const claimed=await env.DB.prepare(
     'INSERT INTO otp_rate_limits (rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=600 THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=600 THEN 1 ELSE attempts+1 END RETURNING attempts'
    ).bind('via-autocalc:'+booking.id).first();
    if(claimed?.attempts!==1)continue;
    tasks.push(precalculateBookingRoute(env,booking,'auto:'+booking.id).catch(()=>null));
   }catch{ /* Sin mapa, la reserva sigue intacta. */ }
  }
  await Promise.all(tasks);
 })());
}
const authorized=async(req,env)=>identity(req,env);
const getBooking=async(req,env,id)=>{
 const account=await customerSession(req,env);
 // Si hay una cuenta autenticada, únicamente puede consultar sus propias reservas.
 // Un token antiguo en un teléfono compartido no prevalece sobre otra identidad.
 if(account){
  return env.DB.prepare(`SELECT ${FIELDS}${hourlyEnabled(env)?hourlySelect('bookings'):''},${routeSelect('bookings')} FROM bookings WHERE id=? AND email=?`)
   .bind(id,account.email).first();
 }
 // Compatibilidad con reservas anteriores al sistema de cuentas: enlace con token.
 const token=req.headers.get('X-Booking-Token')||'';
 if(!token||token.length>200)return null;
 const row=await env.DB.prepare(`SELECT ${FIELDS}${hourlyEnabled(env)?hourlySelect('bookings'):''},${routeSelect('bookings')},access_token_hash FROM bookings WHERE id=?`).bind(id).first();
 return row&&equal(await hash(token),row.access_token_hash)?row:null;
};
async function transition(env,id,from,to,actor,price){
 const withPrice=price!==null;
 const statement=`UPDATE bookings SET status=?,updated_at=datetime('now')${withPrice?',price_uyu=?':''} WHERE id=? AND status=? RETURNING id,status`;
 const args=withPrice?[to,price,id,from]:[to,id,from];
 // UPDATE RETURNING confirma exactamente el registro modificado; los triggers
 // de comisión pueden incrementar meta.changes y no deben producir falsos 409.
 const changed=await env.DB.prepare(statement).bind(...args).first();
 if(changed?.id!==id||changed?.status!==to)return false;
 await env.DB.prepare('INSERT INTO booking_events (booking_id,old_status,new_status,actor) VALUES (?,?,?,?)').bind(id,from,to,actor).run();
 return true;
}
export default {async fetch(req,env,ctx){
 const url=new URL(req.url),origin=req.headers.get('Origin');
  const allowed=allowedOriginsFor(env,url.pathname);
 const cors={'Access-Control-Allow-Origin':origin&&allowed.includes(origin)?origin:'null','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Booking-Token,X-Operator-Key,X-Verification-Token,Authorization','Vary':'Origin'};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(origin&&!allowed.includes(origin))return reply({error:'Origen no autorizado'},403,cors);
 const send=(data,status=200)=>reply(data,status,cors),err=(error,status=400)=>send({error},status);
 if(!env.DB)return err('Base de datos no configurada',503);
 try{
  const path=url.pathname;
  if(path==='/api/health'&&req.method==='GET')return send({ok:true,name:'via-traslados',otpAvailable:emailOtpAvailable(env),...(hourlyEnabled(env)?{backendVersion:'31.1-qa',hourlyEnabled:true}:{})});
  const phoneHandled=await staffPhoneRoutes(req,env,path,send,err);if(phoneHandled)return phoneHandled;
  const handled=await staffRoutes(req,env,path,send,err);if(handled)return handled;
  if(path==='/api/public/route-preview'&&!await webEnabled(env))return err('Vía Traslados está temporalmente fuera de servicio.',503);
  const distanceHandled=await routeEstimateRoutes(req,env,path,send);if(distanceHandled)return distanceHandled;
  if((path.startsWith('/api/auth/')||path.startsWith('/api/customer/')||path==='/api/requests'||path.startsWith('/api/requests/'))&&!await webEnabled(env))return err('Vía Traslados está temporalmente fuera de servicio. Volvé a intentar más tarde.',503);
  if(path==='/api/auth/start'&&req.method==='POST'){const r=await beginOtp(req,env);return send(r.data,r.status)}
  if(path==='/api/auth/verify'&&req.method==='POST'){const r=await checkOtp(req,env);return send(r.data,r.status)}
  // Las peticiones WebAuthn deben despacharse ANTES del parser general de clientes.
  const passkeyHandled=await customerPasskeyRoutes(req,env,path,send);if(passkeyHandled)return passkeyHandled;
  const customerHandled=await customerRoutes(req,env,path,send);if(customerHandled)return customerHandled;
  if(path==='/api/requests'&&req.method==='POST'){
   if(Number(req.headers.get('Content-Length')||0)>6000)return err('Solicitud demasiado grande',413);
   const raw=await req.text();if(raw.length>6000)return err('Solicitud demasiado grande',413);
   const p=JSON.parse(raw);if(p?.website)return err('Solicitud rechazada');
   if(p?.serviceType==='hourly'){
    if(!hourlyEnabled(env))return err('Modalidad no habilitada',403);
    const result=await createHourly(env,await customerSession(req,env),p);
    return result.error?err(result.error,result.status):send(result.data,result.status);
   }
   if(p?.serviceType!=null&&p.serviceType!=='point_to_point')return err('Modalidad inválida',400);
   let booking;try{booking=validateBooking(p)}catch(e){return err(e.message)}
   const account=await customerSession(req,env);
    if(account&&account.email!==booking.email)return err('El correo del pasajero no coincide con la cuenta verificada.',403);
    if(!account&&!await consumeVerifiedSession(req,env,booking.email))
      return err('Necesitás verificar tu correo antes de solicitar un traslado.',401);
   await env.DB.prepare("INSERT INTO customers (email,name,phone) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,updated_at=datetime('now')").bind(booking.email,booking.name,booking.phone).run();
   const id='VIA-'+crypto.randomUUID().slice(0,12).toUpperCase(),token=random(),tokenHash=await hash(token);
   // Atomic booking + immutable chosen points + initial event. A failed insert
   // cannot leave a reservation missing its original map coordinates.
   const main=env.DB.prepare('INSERT INTO bookings (id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,notes,access_token_hash,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,booking.name,booking.phone,booking.email,booking.origin,booking.destination,booking.date,booking.time,booking.passengers,booking.bags,booking.notes,tokenHash,'requested');
   const op=booking.originLocation,dp=booking.destinationLocation;
   const points=env.DB.prepare('INSERT INTO booking_locations (booking_id,origin_lat,origin_lng,destination_lat,destination_lng,origin_source,destination_source,origin_postal_status,destination_postal_status,origin_number_approximate,destination_number_approximate) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,op?.lat??null,op?.lon??null,dp?.lat??null,dp?.lon??null,
     op?.source||null,dp?.source||null,op?.postalStatus||'unknown',dp?.postalStatus||'unknown',
     op?.numberIsApproximate?1:0,dp?.numberIsApproximate?1:0);
   const event=env.DB.prepare('INSERT INTO booking_events (booking_id,old_status,new_status,actor) VALUES (?,?,?,?)').bind(id,null,'requested','passenger');
   if(typeof env.DB.batch==='function')await env.DB.batch([main,points,event]);
   else { // Compatibility with the existing in-memory test D1 driver.
    await main.run();await points.run();await event.run();
   }
   scheduleMissingRoutes(env,ctx,[{id,origin:booking.origin,destination:booking.destination,
    originLocation:op,destinationLocation:dp,status:'requested'}],1);
   return send({id,access_token:token,status:'requested'},201)
  }
  const item=path.match(/^\/api\/requests\/([A-Z0-9-]+)(?:\/(accept|cancel))?$/);
  if(item){
   const id=item[1],row=await getBooking(req,env,id);if(!row)return err('Reserva no encontrada o no autorizada',404);
   if(req.method==='GET'&&!item[2])return send(publicRow(row));
   if(req.method==='POST'&&item[2]){
    const to=item[2]==='accept'?'accepted':'cancelled';
    if(row.service_type==='hourly'&&row.status===to)return send({id,status:to,replayed:true});
    if(!validTransition(row.status,to))return err('Estado incompatible',409);
    try{if(!await transition(env,id,row.status,to,'passenger',null))return err('Reserva modificada',409)}catch(e){if(String(e).includes('VIA_HOURLY_ACCEPT')||String(e).includes('VIA_QUOTE_OVERLAP'))return err('La asignación o agenda cambió. Actualizá la reserva.',409);throw e}
    return send({id,status:to})
   }
  }
  if(path==='/api/operator/requests'&&req.method==='GET'){
   const actor=await authorized(req,env);if(!actor)return err('Acceso no autorizado',401);
   const policy=await driverPolicy(env,actor);
   if(actor.role==='admin'){
     const rows=await env.DB.prepare(`SELECT ${OP_FIELDS}${hourlyEnabled(env)?hourlySelect('bookings'):''},${routeSelect('bookings')},(SELECT driver_id FROM driver_assignments WHERE booking_id=bookings.id) AS assigned_driver_id,(SELECT u.display_name FROM driver_assignments a JOIN staff_users u ON a.driver_id=u.id WHERE a.booking_id=bookings.id) AS assigned_driver_name,(SELECT booking_id FROM booking_dispatch_releases r WHERE r.booking_id=bookings.id) AS released FROM bookings ORDER BY trip_date DESC,trip_time DESC LIMIT 200`).all();
     scheduleMissingRoutes(env,ctx,rows.results);
     return send(rows.results.map(r=>({...operatorRow(r),
       canQuote:actor.id!=='master'&&r.status==='requested'&&!r.assigned_driver_id,
       canRelease:r.status==='requested'&&!r.assigned_driver_id&&!r.released,
       released:Boolean(r.released)
     })));
   }
   if(actor.role!=='driver')return err('Acceso no autorizado',403);
   const rows=await env.DB.prepare(
     `SELECT b.*,a.driver_id AS assigned_driver_id,u.display_name AS assigned_driver_name,
      r.booking_id AS released,${routeSelect('b')}${hourlyEnabled(env)?hourlySelect('b'):''} FROM bookings b
      LEFT JOIN driver_assignments a ON a.booking_id=b.id
      LEFT JOIN staff_users u ON u.id=a.driver_id
      LEFT JOIN booking_dispatch_releases r ON r.booking_id=b.id
      WHERE a.driver_id=? OR (b.status='requested' AND a.driver_id IS NULL
        AND (?=1 OR ?=1 OR r.booking_id IS NOT NULL))
      ORDER BY b.trip_date DESC,b.trip_time DESC LIMIT 200`
   ).bind(actor.id,policy.canQuoteAll?1:0,policy.canRelease?1:0).all();
   scheduleMissingRoutes(env,ctx,rows.results);
   return send(rows.results.map(r=>{
     const assigned=r.assigned_driver_id===actor.id;
     const data=operatorRow(r);
     if(!assigned){
       // No exponer datos personales de pasajeros a todos los conductores.
       data.name=null;data.phone=null;data.email=null;
     }
     data.canQuote=r.status==='requested'&&
       (assigned||(!r.assigned_driver_id&&(policy.canQuoteAll||Boolean(r.released))));
     data.canRelease=r.status==='requested'&&!r.assigned_driver_id&&
       policy.canRelease&&!r.released;
     data.released=Boolean(r.released);
     return data;
   }));
  }
  const guideMatch=path.match(/^\/api\/operator\/requests\/([A-Z0-9-]+)\/price-guide$/);
  if(guideMatch&&req.method==='GET'){
    const actor=await authorized(req,env);if(!actor)return err('Acceso no autorizado',401);
    const result=await guideForBooking(env,actor,guideMatch[1]);
    return result.error?err(result.error,result.status):send(result);
  }
  const releaseMatch=path.match(/^\/api\/operator\/requests\/([A-Z0-9-]+)\/release$/);
  if(releaseMatch&&req.method==='POST'){
    const actor=await authorized(req,env);if(!actor)return err('Acceso no autorizado',401);
    const result=await releaseBooking(env,actor,releaseMatch[1]);
    return result.error?err(result.error,result.status):send(result);
  }
  const op=path.match(/^\/api\/operator\/requests\/([A-Z0-9-]+)$/);
  if(op&&req.method==='PATCH'){
   const actor=await authorized(req,env);if(!actor)return err('Acceso no autorizado',401);
   const id=op[1],body=await req.json();
   if(actor.role!=='admin'&&body?.status!=='quoted'){
     const assignment=await env.DB.prepare('SELECT driver_id FROM driver_assignments WHERE booking_id=?').bind(id).first();
     if(assignment?.driver_id!==actor.id)return err('Este viaje no te fue asignado',403);
   }
   const row=await env.DB.prepare(`SELECT ${OP_FIELDS}${hourlyEnabled(env)?hourlySelect('bookings'):''} FROM bookings WHERE id=?`).bind(id).first();
   if(!row)return err('Solicitud no encontrada',404);
   const to=body?.status;
   if(to==='quoted'){
     const amount=Number(body?.price);
     const outcome=row.service_type==='hourly'?await quoteHourly(env,actor,id,body):await quoteBooking(env,actor,id,amount);
     if(outcome.error)return err(outcome.error,outcome.status);
     const updated=await env.DB.prepare(
       `SELECT ${OP_FIELDS}${hourlyEnabled(env)?hourlySelect('bookings'):''},${routeSelect('bookings')},
       (SELECT driver_id FROM driver_assignments WHERE booking_id=bookings.id) AS assigned_driver_id,
       (SELECT u.display_name FROM driver_assignments a JOIN staff_users u ON a.driver_id=u.id
        WHERE a.booking_id=bookings.id) AS assigned_driver_name
       FROM bookings WHERE id=?`
     ).bind(id).first();
     return send({...operatorRow(updated),selfAssigned:true,
       quoteFinancials:{grossUyu:outcome.grossUyu,
         commissionUyu:outcome.commissionUyu,driverNetUyu:outcome.driverNetUyu}});
   }
   if(!validTransition(row.status,to)||to==='accepted')return err('Cambio no permitido',409);
   if(!await transition(env,id,row.status,to,'operator',null))return err('Reserva modificada',409);
   const updated=await env.DB.prepare(`SELECT ${OP_FIELDS}${hourlyEnabled(env)?hourlySelect('bookings'):''} FROM bookings WHERE id=?`).bind(id).first();
   return send(operatorRow(updated))
  }
  return err('Ruta no encontrada',404)
 }catch(e){console.error('via-api',e?.name||'Error');return err('No fue posible completar la operación',500)}
}};
