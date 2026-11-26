// V31.1: real QA hourly API. Feature flag is OFF by default; enable only after QA migration.
import {normalizeHourly,normalizeHourlyQuote} from './hourly-contract.js';
import {bookingSeconds} from './assignment-rules.js';
import {locationPoint} from './location-v30.js';
import {quoteBreakdown} from './dispatch-business.js';
export const hourlyEnabled=env=>env.VIA_HOURLY_ENABLED==='1';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const textField=(x,max)=>{if(x==null)return '';if(typeof x!=='string'||x.trim().length>max)throw Error('Texto inválido');return x.trim()};
const uyClock=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Montevideo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const localNow=()=>{const p=Object.fromEntries(uyClock.formatToParts(new Date()).map(x=>[x.type,x.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)};
export const hourlySelect=alias=>", "+alias+".service_type,"+alias+".requested_duration_minutes,"+alias+".itinerary_notes,"+
 ["included_duration_minutes","included_km","extra_time_terms","extra_km_terms","quote_notes"].map(k=>"(SELECT "+k+" FROM booking_quotes WHERE booking_id="+alias+".id) AS "+k).join(",");
export function hourlyFields(row){
 if(row.service_type!=='hourly')return row.service_type==='point_to_point'?{serviceType:'point_to_point'}:{};
 return {serviceType:'hourly',requestedDurationMinutes:row.requested_duration_minutes,itineraryNotes:row.itinerary_notes||'',
 hourlyQuote:row.included_duration_minutes==null?null:{priceUyu:row.price_uyu??row.price,includedDurationMinutes:row.included_duration_minutes,includedKm:row.included_km??null,extraTimeTerms:row.extra_time_terms||'',extraKmTerms:row.extra_km_terms||'',quoteNotes:row.quote_notes||''}};
}
export function validateHourlyRequest(p){
 const q=normalizeHourly(p);
 if(q.origin.length<4||p.destination!=null&&p.destination!==''||p.destinationLocation!=null)throw Error('Ingresá solamente el punto de recogida');
 const start=bookingSeconds(q.date,q.time)*1000, now=localNow();
 if(start<now||start>now+366*864e5)throw Error('Fecha u hora fuera de rango');
 if(typeof p.requestId!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.requestId)))throw Error('Identificador de solicitud inválido');
 const point=locationPoint(p.originLocation);
 if(p.originLocation!=null&&!point)throw Error('Ubicación de recogida inválida');
 return {...q,originLocation:point,notes:textField(p.notes,500),requestId:p.requestId.toLowerCase()};
}
export async function createHourly(env,account,p){
 if(!account)return {status:401,error:'Ingresá a tu cuenta verificada para solicitar un conductor por hora'};
 let q;try{q=validateHourlyRequest(p)}catch(e){return {status:400,error:e.message}}
 if(p.email&&String(p.email).trim().toLowerCase()!==account.email)return {status:403,error:'El correo no coincide con tu cuenta'};
 // Key scoped to verified account. No booking token is issued: account bearer is required.
 const fingerprint=await hash(JSON.stringify(q));
 const key=q.requestId;
 const read=()=>env.DB.prepare('SELECT id,status,hourly_request_hash FROM bookings WHERE email=? AND hourly_request_id=?').bind(account.email,key).first();
 const replay=row=>row.hourly_request_hash===fingerprint?{status:200,data:{id:row.id,status:row.status,serviceType:'hourly',replayed:true}}:{status:409,error:'El identificador ya corresponde a otra solicitud'};
 const prior=await read();if(prior)return replay(prior);
 const id='VIA-'+crypto.randomUUID().toUpperCase(), inaccessibleHash=await hash(crypto.randomUUID()+crypto.randomUUID()), op=q.originLocation;
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO bookings(id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,notes,access_token_hash,status,service_type,requested_duration_minutes,itinerary_notes,hourly_request_id,hourly_request_hash) VALUES(?,?,?,?,?,NULL,?,?,?,?,?,?,'requested','hourly',?,?,?,?)").bind(id,account.name,account.phone,account.email,q.origin,q.date,q.time,q.passengers,q.bags,q.notes,inaccessibleHash,q.requestedDurationMinutes,q.itineraryNotes,key,fingerprint),
   env.DB.prepare("INSERT INTO booking_locations(booking_id,origin_lat,origin_lng,origin_source,origin_postal_status,origin_number_approximate) VALUES(?,?,?,?,?,?)").bind(id,op?.lat??null,op?.lon??null,op?.source??null,op?.postalStatus??'unknown',op?.numberIsApproximate?1:0),
   env.DB.prepare("INSERT INTO booking_events(booking_id,old_status,new_status,actor) VALUES(?,NULL,'requested','passenger')").bind(id)
  ]);
 }catch(e){const row=await read();if(row)return replay(row);throw e}
 return {status:201,data:{id,status:'requested',serviceType:'hourly'}};
}
export function validateHourlyOffer(p){
 const q=normalizeHourlyQuote({priceUyu:p.price,includedKm:p.includedKm});
 const n=p.includedDurationMinutes;
 if(!Number.isInteger(n)||n<60||n>1440||n%30!==0)throw Error('Horas incluidas inválidas');
 return {...q,includedDurationMinutes:n,extraTimeTerms:textField(p.extraTimeTerms,1500),extraKmTerms:textField(p.extraKmTerms,1500),quoteNotes:textField(p.quoteNotes,1500)};
}
export async function quoteHourly(env,actor,id,p){
 if(!actor||actor.id==='master'||!['admin','driver'].includes(actor.role)||actor.status!=='approved')return {status:403,error:'Cuenta no habilitada para cotizar'};
 let q;try{q=validateHourlyOffer(p)}catch(e){return {status:400,error:e.message}}
 const read=()=>env.DB.prepare("SELECT q.*,b.status,a.driver_id AS assigned_driver FROM booking_quotes q JOIN bookings b ON b.id=q.booking_id LEFT JOIN driver_assignments a ON a.booking_id=q.booking_id WHERE q.booking_id=?").bind(id).first();
 const matches=r=>r&&r.driver_id===actor.id&&r.assigned_driver===actor.id&&r.price_uyu===q.priceUyu&&r.included_duration_minutes===q.includedDurationMinutes&&r.included_km===q.includedKm&&(r.extra_time_terms||'')===q.extraTimeTerms&&(r.extra_km_terms||'')===q.extraKmTerms&&(r.quote_notes||'')===q.quoteNotes;
 const done=r=>({status:200,assignedTo:actor.id,quotePriceUyu:q.priceUyu,...quoteBreakdown(q.priceUyu,r.commission_bps)});
 try{
  const prior=await read();if(prior)return matches(prior)&&prior.status!=='cancelled'?done(prior):{status:409,error:'La solicitud ya tiene una propuesta'};
  await env.DB.prepare("INSERT INTO booking_quotes(booking_id,driver_id,price_uyu,commission_bps,included_duration_minutes,included_km,extra_time_terms,extra_km_terms,quote_notes) SELECT ?,u.id,?,CASE WHEN u.role='admin' OR p.mode='partner' THEN 0 ELSE COALESCE(p.commission_bps,2500) END,?,?,?,?,? FROM staff_users u LEFT JOIN driver_commercial_profiles p ON p.staff_id=u.id WHERE u.id=? AND u.status='approved'").bind(id,q.priceUyu,q.includedDurationMinutes,q.includedKm,q.extraTimeTerms,q.extraKmTerms,q.quoteNotes,actor.id).run();
  const row=await read();return matches(row)&&row.status!=='cancelled'?done(row):{status:409,error:'No se pudo confirmar la asignación'};
 }catch(e){
  const row=await read();if(matches(row)&&row.status!=='cancelled')return done(row);
  const reason=String(e?.message||e);
  if(reason.includes('VIA_QUOTE_OVERLAP'))return {status:409,error:'Tenés otro servicio en ese horario'};
  if(reason.includes('VIA_QUOTE_CAPACITY'))return {status:409,error:'Capacidad insuficiente del vehículo'};
  if(reason.includes('VIA_QUOTE_AUTH'))return {status:403,error:'No tenés permiso para cotizar'};
  if(reason.includes('VIA_QUOTE_STATUS')||reason.includes('VIA_QUOTE_ASSIGNED_OTHER')||reason.includes('UNIQUE'))return {status:409,error:'La solicitud ya no está disponible'};
  throw e;
 }
}
