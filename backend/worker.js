import {beginOtp,checkOtp,consumeVerifiedSession,normalizeEmail,emailOtpAvailable} from './auth.js';
import {staffRoutes,identity,webEnabled} from './staff.js';
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
 const q={name:clean(p.name,100),phone:clean(p.phone,30),email:clean(p.email,200),origin:clean(p.origin,200),destination:clean(p.destination,200),date:clean(p.date,10),time:clean(p.time,5),notes:clean(p.notes,500),passengers:Number(p.passengers),bags:Number(p.bags)};
 if(q.name.length<2||q.origin.length<4||q.destination.length<4||!/^\+?[\d\s()\-]{7,30}$/.test(q.phone))throw Error('Completá nombre, celular, origen y destino');
 q.email=normalizeEmail(q.email);
 if(q.origin.toLowerCase()===q.destination.toLowerCase())throw Error('Origen y destino deben ser distintos');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(q.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(q.time))throw Error('Fecha u hora incorrectas');
 const date=new Date(q.date+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==q.date)throw Error('Fecha inválida');
 const today=new Date().toISOString().slice(0,10);if(q.date<today||q.date>new Date(Date.now()+366*864e5).toISOString().slice(0,10))throw Error('Fecha fuera de rango');
 if(!Number.isInteger(q.passengers)||q.passengers<1||q.passengers>8||!Number.isInteger(q.bags)||q.bags<0||q.bags>5)throw Error('Pasajeros o valijas inválidos');
 return q
}
const publicRow=r=>({id:r.id,origin:r.origin,destination:r.destination,date:r.trip_date,time:r.trip_time,passengers:r.passengers,bags:r.bags,notes:r.notes,status:r.status,price:r.price_uyu,created_at:r.created_at,updated_at:r.updated_at});
const operatorRow=r=>({...publicRow(r),name:r.customer_name,phone:r.phone,email:r.email,assignedDriverId:r.assigned_driver_id||null,assignedDriverName:r.assigned_driver_name||null});
const authorized=async(req,env)=>identity(req,env);
const getBooking=async(req,env,id)=>{const token=req.headers.get('X-Booking-Token')||'';if(!token||token.length>200)return null;const row=await env.DB.prepare(`SELECT ${FIELDS},access_token_hash FROM bookings WHERE id=?`).bind(id).first();return row&&equal(await hash(token),row.access_token_hash)?row:null};
async function transition(env,id,from,to,actor,price){const withPrice=price!==null;const statement=`UPDATE bookings SET status=?,updated_at=datetime('now')${withPrice?',price_uyu=?':''} WHERE id=? AND status=?`;const args=withPrice?[to,price,id,from]:[to,id,from];const change=await env.DB.prepare(statement).bind(...args).run();if(change.meta.changes!==1)return false;await env.DB.prepare('INSERT INTO booking_events (booking_id,old_status,new_status,actor) VALUES (?,?,?,?)').bind(id,from,to,actor).run();return true}
export default {async fetch(req,env){
 const url=new URL(req.url),origin=req.headers.get('Origin');
 const allowed=[env.PUBLIC_ORIGIN,env.OPERATOR_ORIGIN].filter(Boolean).map(value=>{try{return new URL(value).origin}catch{return String(value).replace(/\/+$/,'')}});
 const cors={'Access-Control-Allow-Origin':origin&&allowed.includes(origin)?origin:'null','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Booking-Token,X-Operator-Key,X-Verification-Token,Authorization','Vary':'Origin'};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(origin&&!allowed.includes(origin))return reply({error:'Origen no autorizado'},403,cors);
 const send=(data,status=200)=>reply(data,status,cors),err=(error,status=400)=>send({error},status);
 if(!env.DB)return err('Base de datos no configurada',503);
 try{
  const path=url.pathname;
  if(path==='/api/health'&&req.method==='GET')return send({ok:true,name:'via-traslados',otpAvailable:emailOtpAvailable(env)});
  const handled=await staffRoutes(req,env,path,send,err);if(handled)return handled;
  if((path.startsWith('/api/auth/')||path==='/api/requests'||path.startsWith('/api/requests/'))&&!await webEnabled(env))return err('Vía Traslados está temporalmente fuera de servicio. Volvé a intentar más tarde.',503);
  if(path==='/api/auth/start'&&req.method==='POST'){const r=await beginOtp(req,env);return send(r.data,r.status)}
  if(path==='/api/auth/verify'&&req.method==='POST'){const r=await checkOtp(req,env);return send(r.data,r.status)}
  if(path==='/api/requests'&&req.method==='POST'){
   if(Number(req.headers.get('Content-Length')||0)>6000)return err('Solicitud demasiado grande',413);
   const raw=await req.text();if(raw.length>6000)return err('Solicitud demasiado grande',413);
   const p=JSON.parse(raw);if(p?.website)return err('Solicitud rechazada');
   let booking;try{booking=validateBooking(p)}catch(e){return err(e.message)}
   if(!await consumeVerifiedSession(req,env,booking.email))return err('Necesitás verificar tu correo antes de solicitar un traslado.',401);
   await env.DB.prepare("INSERT INTO customers (email,name,phone) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,updated_at=datetime('now')").bind(booking.email,booking.name,booking.phone).run();
   const id='VIA-'+crypto.randomUUID().slice(0,12).toUpperCase(),token=random(),tokenHash=await hash(token);
   await env.DB.prepare('INSERT INTO bookings (id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,notes,access_token_hash,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,booking.name,booking.phone,booking.email,booking.origin,booking.destination,booking.date,booking.time,booking.passengers,booking.bags,booking.notes,tokenHash,'requested').run();
   await env.DB.prepare('INSERT INTO booking_events (booking_id,old_status,new_status,actor) VALUES (?,?,?,?)').bind(id,null,'requested','passenger').run();
   return send({id,access_token:token,status:'requested'},201)
  }
  const item=path.match(/^\/api\/requests\/([A-Z0-9-]+)(?:\/(accept|cancel))?$/);
  if(item){
   const id=item[1],row=await getBooking(req,env,id);if(!row)return err('Reserva no encontrada o no autorizada',404);
   if(req.method==='GET'&&!item[2])return send(publicRow(row));
   if(req.method==='POST'&&item[2]){
    const to=item[2]==='accept'?'accepted':'cancelled';
    if(!validTransition(row.status,to))return err('Estado incompatible',409);
    if(!await transition(env,id,row.status,to,'passenger',null))return err('Reserva modificada',409);
    return send({id,status:to})
   }
  }
  if(path==='/api/operator/requests'&&req.method==='GET'){
   const actor=await authorized(req,env);if(!actor)return err('Acceso no autorizado',401);
   if(actor.role==='admin'){
     const rows=await env.DB.prepare(`SELECT ${OP_FIELDS},(SELECT driver_id FROM driver_assignments WHERE booking_id=bookings.id) AS assigned_driver_id,(SELECT u.display_name FROM driver_assignments a JOIN staff_users u ON a.driver_id=u.id WHERE a.booking_id=bookings.id) AS assigned_driver_name FROM bookings ORDER BY trip_date DESC,trip_time DESC LIMIT 200`).all();
     return send(rows.results.map(operatorRow));
   }
   const rows=await env.DB.prepare('SELECT b.*,a.driver_id AS assigned_driver_id,u.display_name AS assigned_driver_name FROM bookings b JOIN driver_assignments a ON a.booking_id=b.id JOIN staff_users u ON u.id=a.driver_id WHERE a.driver_id=? ORDER BY b.trip_date DESC,b.trip_time DESC LIMIT 200').bind(actor.id).all();
   return send(rows.results.map(operatorRow))
  }
  const op=path.match(/^\/api\/operator\/requests\/([A-Z0-9-]+)$/);
  if(op&&req.method==='PATCH'){
   const actor=await authorized(req,env);if(!actor)return err('Acceso no autorizado',401);
   const id=op[1],body=await req.json();
   if(actor.role!=='admin'){
     const assignment=await env.DB.prepare('SELECT driver_id FROM driver_assignments WHERE booking_id=?').bind(id).first();
     if(assignment?.driver_id!==actor.id)return err('Este viaje no te fue asignado',403);
   }
   const row=await env.DB.prepare(`SELECT ${OP_FIELDS} FROM bookings WHERE id=?`).bind(id).first();
   if(!row)return err('Solicitud no encontrada',404);
   const to=body?.status;if(!validTransition(row.status,to)||to==='accepted')return err('Cambio no permitido',409);
   let price=null;if(to==='quoted'){price=Number(body?.price);if(!Number.isInteger(price)||price<1||price>10000000)return err('Importe inválido')}
   if(!await transition(env,id,row.status,to,'operator',price))return err('Reserva modificada',409);
   const updated=await env.DB.prepare(`SELECT ${OP_FIELDS} FROM bookings WHERE id=?`).bind(id).first();
   return send(operatorRow(updated))
  }
  return err('Ruta no encontrada',404)
 }catch(e){console.error('via-api',e?.name||'Error');return err('No fue posible completar la operación',500)}
}};
