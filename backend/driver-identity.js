import {identity} from './staff.js';
export const identityProfileEnabled=env=>env.VIA_DRIVER_IDENTITY_ENABLED==='true';
const ACTIVE=new Set(['confirmed','en_route','arrived','in_progress']);
const MAX_PHOTO=240000,MAX_BODY=730000;
const ID=/^[a-f0-9-]{36}$/i;
const clean=(x,max)=>typeof x==='string'?x.trim().replace(/\s+/g,' ').slice(0,max):'';
export const normalizePlate=x=>clean(x,20).toUpperCase().replace(/[ -]/g,'');
export function validPlate(x){return /^[A-Z]{3}[0-9]{4}$/.test(x)}
export function jpegSize(value){
 if(typeof value!=='string'||value.length<16||value.length>MAX_PHOTO||! /^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4)return null;
 let a;try{a=Uint8Array.from(atob(value),x=>x.charCodeAt(0))}catch{return null}
 if(a[0]!==255||a[1]!==216||a[a.length-2]!==255||a[a.length-1]!==217)return null;
 let i=2,dimensions=null;
 while(i+4<a.length){
  if(a[i++]!==255)return null;while(a[i]===255)i++;
  const marker=a[i++];if(marker===218)return dimensions;if(marker===217)return null;
  // Android re-encodes images; reject EXIF/XMP, IPTC and comments in direct uploads.
  if([225,237,254].includes(marker))return null;
  const n=a[i]*256+a[i+1];if(n<2||i+n>a.length)return null;
  if([192,193,194].includes(marker)){
   if(n<8)return null;
   const h=a[i+3]*256+a[i+4],w=a[i+5]*256+a[i+6];
   if(w<320||h<240||w>1600||h>1600)return null;dimensions={w,h};
  }
  i+=n;
 }return null;
}
async function body(req,max=MAX_BODY){
 if(Number(req.headers.get('Content-Length')||0)>max)throw Error('Datos demasiado extensos');
 // Limit before buffering arbitrary uploads; one UTF-8 JSON request only.
 const reader=req.body?.getReader();if(!reader)throw Error('Datos inválidos');
 const dec=new TextDecoder('utf-8',{fatal:true});let count=0,raw='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>max)throw Error('Datos demasiado extensos');raw+=dec.decode(value,{stream:true})}raw+=dec.decode()}
 catch(e){await reader.cancel().catch(()=>{});throw e}
 const p=JSON.parse(raw);if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Datos inválidos');return p;
}
export function validateProfile(p){
 if(p?.consent!==true)throw Error('Autorizá mostrar las fotos al pasajero de una reserva confirmada');
 const plate=normalizePlate(p.plate),make=clean(p.make,45),model=clean(p.model,45),color=clean(p.color,35);
 if(!validPlate(plate)||!make||!model||!color)throw Error('Completá matrícula uruguaya, marca, modelo y color');
 const year=p.year==null?null:Number(p.year);
 if(year!==null&&(!Number.isInteger(year)||year<1900||year>new Date().getUTCFullYear()+1))throw Error('Año de vehículo inválido');
 const photos=['driver','front','rear'].map(k=>p.photos?.[k]);
 if(!photos.every(jpegSize)||new Set(photos).size!==3)throw Error('Se necesitan tres fotos JPEG distintas y legibles');
 const r=p.recognition||{};
 const signal=x=>['pass','review'].includes(x)?x:'review';
 const frontPlate=normalizePlate(r.frontPlate),rearPlate=normalizePlate(r.rearPlate);
 const recognition={face:signal(r.face),front:signal(r.front),rear:signal(r.rear),
  frontPlate:validPlate(frontPlate)?frontPlate:'',rearPlate:validPlate(rearPlate)?rearPlate:'',
  plateMatch:frontPlate===plate&&rearPlate===plate,vehicleYear:year};
 return {plate,make,model,color,photos,recognition};
}
const metadata=r=>r?{revision:r.revision,state:r.review_state==='rejected'&&String(r.review_action||'').startsWith('revoked:')?'revoked':r.review_state,plate:r.plate,make:r.make,model:r.model,color:r.color,
 year:r.vehicle_year??(r.recognition_json?JSON.parse(r.recognition_json).vehicleYear??null:null),missing:[],reviewNote:r.review_note||'',updatedAt:r.updated_at}: {state:'missing',missing:['driver','front','rear','plate']};
const META="revision,review_state,plate,make,model,color,review_note,review_action,updated_at,json_extract(recognition_json,'$.vehicleYear') AS vehicle_year";
export async function driverIdentityRoutes(req,env,path,send,err){
 const own=path==='/api/staff/driver-profile';
 const list=path==='/api/admin/driver-profiles';
 const match=path.match(/^\/api\/admin\/driver-profiles\/([a-f0-9-]{36})$/i);
 if(!own&&!list&&!match)return null;
 if(!identityProfileEnabled(env))return err('Ficha de conductor no habilitada',404);
 const actor=await identity(req,env);
 if(!actor||actor.master||!ID.test(actor.id)||!['driver','admin'].includes(actor.role))return err('No autorizado',401);
 if(own&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT '+META+' FROM driver_identity_profiles WHERE staff_id=?').bind(actor.id).first();
  const v=await env.DB.prepare('SELECT v.license_plate AS plate,v.make,v.model,v.passenger_capacity AS passengerCapacity,v.luggage_capacity AS luggageCapacity,d.color,d.model_year AS year,d.vehicle_type AS type FROM driver_vehicle_profiles v LEFT JOIN driver_vehicle_prefill d ON d.staff_id=v.staff_id AND d.make=v.make AND d.model=v.model WHERE v.staff_id=?').bind(actor.id).first();
  const info=metadata(r);if(r?.review_state==='approved'&&(!v||normalizePlate(v.plate)!==r.plate||v.make!==r.make||v.model!==r.model)){info.state='vehicle_changed';info.missing=['front','rear','plate'];}
  const vehicle=v?{...v,color:v.color||(r&&r.make===v.make&&r.model===v.model?r.color:'')}:null;
  const include=new URL(req.url).searchParams.get('include')==='photos';
  if(include&&r){
   const details=await env.DB.prepare('SELECT driver_jpeg,front_jpeg,rear_jpeg,recognition_json FROM driver_identity_profiles WHERE staff_id=? AND revision=?').bind(actor.id,r.revision).first();
   if(details){info.photos={driver:details.driver_jpeg,front:details.front_jpeg,rear:details.rear_jpeg};info.recognition=JSON.parse(details.recognition_json);}
   info.history=(await env.DB.prepare("SELECT h.state,h.note,h.created_at AS at,u.display_name AS reviewer FROM driver_profile_review_history h JOIN staff_users u ON u.id=h.actor_id WHERE h.staff_id=? ORDER BY h.created_at DESC,h.rowid DESC LIMIT 30").bind(actor.id).all()).results||[];
  }
  return send({...info,name:actor.name,vehicle});
 }
 if(own&&req.method==='POST'){
  let p;try{p=validateProfile(await body(req))}catch(e){return err(e.message||'Fotos inválidas',400)}
  const rev=crypto.randomUUID();
  // A single replacement invalidates any prior approval immediately.
  await env.DB.prepare("INSERT INTO driver_identity_profiles(staff_id,revision,review_state,plate,make,model,color,driver_jpeg,front_jpeg,rear_jpeg,recognition_json,consent_at) VALUES (?,?,'pending',?,?,?,?,?,?,?,?,unixepoch()) ON CONFLICT(staff_id) DO UPDATE SET revision=excluded.revision,review_state='pending',plate=excluded.plate,make=excluded.make,model=excluded.model,color=excluded.color,driver_jpeg=excluded.driver_jpeg,front_jpeg=excluded.front_jpeg,rear_jpeg=excluded.rear_jpeg,recognition_json=excluded.recognition_json,consent_at=unixepoch(),updated_at=unixepoch(),reviewed_at=NULL,reviewed_by=NULL,review_action=NULL,review_note=''")
   .bind(actor.id,rev,p.plate,p.make,p.model,p.color,...p.photos,JSON.stringify(p.recognition)).run();
  return send({state:'pending',revision:rev,missing:[]},201);
 }
 if(actor.role!=='admin')return err('Solo administración',403);
 if(list&&req.method==='GET'){
  const r=await env.DB.prepare("SELECT p.staff_id AS id,u.display_name AS name,p.revision,CASE WHEN p.review_state='rejected' AND p.review_action LIKE 'revoked:%' THEN 'revoked' ELSE p.review_state END AS state,p.plate,p.make,p.model,p.color FROM driver_identity_profiles p JOIN staff_users u ON u.id=p.staff_id ORDER BY CASE WHEN p.review_state='pending' THEN 0 ELSE 1 END,p.updated_at DESC LIMIT 100").all();
  return send({profiles:r.results||[]});
 }
 if(match&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT p.*,u.display_name AS name FROM driver_identity_profiles p JOIN staff_users u ON u.id=p.staff_id WHERE p.staff_id=?').bind(match[1]).first();
  if(!r)return err('Ficha inexistente',404);
  const history=(await env.DB.prepare("SELECT h.state,h.note,h.created_at AS at,u.display_name AS reviewer FROM driver_profile_review_history h JOIN staff_users u ON u.id=h.actor_id WHERE h.staff_id=? ORDER BY h.created_at DESC,h.rowid DESC LIMIT 30").bind(match[1]).all()).results||[];
  return send({...metadata(r),id:match[1],name:r.name,history,recognition:JSON.parse(r.recognition_json),photos:{driver:r.driver_jpeg,front:r.front_jpeg,rear:r.rear_jpeg}});
 }
 if(match&&req.method==='PATCH'){
  let p;try{p=await body(req,2500)}catch{return err('Datos inválidos',400)}
  if(!['approved','rejected','revoked'].includes(p.state)||!ID.test(p.revision||''))return err('Revisión inválida',400);
  if(match[1]===actor.id)return err('No podés revisar tu propia ficha',403);
  const note=clean(p.note,350);if(p.state!=='approved'&&!note)return err('Indicá el motivo',400);
  const action=(p.state==='revoked'?'revoked:':'')+crypto.randomUUID();
  const stored=p.state==='revoked'?'rejected':p.state;
  const allowed=p.state==='approved'?['pending']:p.state==='revoked'?['approved']:['pending','approved'];
  const q=env.DB.prepare("UPDATE driver_identity_profiles SET review_state=?,reviewed_by=?,reviewed_at=unixepoch(),review_note=?,review_action=? WHERE staff_id=? AND revision=? AND review_state IN (?,?) RETURNING staff_id")
    .bind(stored,actor.id,note,action,match[1],p.revision,allowed[0],allowed[1]||allowed[0]);
  const history=env.DB.prepare('INSERT INTO driver_profile_review_history(action_id,staff_id,revision,actor_id,state,note) SELECT ?,staff_id,revision,?,?,? FROM driver_identity_profiles WHERE staff_id=? AND revision=? AND review_action=?').bind(action,actor.id,p.state,note,match[1],p.revision,action);
  if(p.state==='approved'){
   // Keep operational capacity unchanged; synchronize only identity of the car.
   const v=env.DB.prepare("INSERT INTO driver_vehicle_profiles(staff_id,license_plate,make,model) SELECT staff_id,plate,make,model FROM driver_identity_profiles WHERE staff_id=? AND revision=? AND review_state='approved' AND review_action=? ON CONFLICT(staff_id) DO UPDATE SET license_plate=excluded.license_plate,make=excluded.make,model=excluded.model,updated_at=unixepoch()").bind(match[1],p.revision,action);
   const descriptors=env.DB.prepare("INSERT INTO driver_vehicle_prefill(staff_id,make,model,color,model_year,vehicle_type) SELECT p.staff_id,p.make,p.model,p.color,COALESCE(json_extract(p.recognition_json,'$.vehicleYear'),CASE WHEN d.make=p.make AND d.model=p.model THEN d.model_year END),CASE WHEN d.make=p.make AND d.model=p.model THEN COALESCE(d.vehicle_type,'') ELSE '' END FROM driver_identity_profiles p LEFT JOIN driver_vehicle_prefill d ON d.staff_id=p.staff_id WHERE p.staff_id=? AND p.revision=? AND p.review_state='approved' AND p.review_action=? ON CONFLICT(staff_id) DO UPDATE SET make=excluded.make,model=excluded.model,color=excluded.color,model_year=excluded.model_year,vehicle_type=excluded.vehicle_type").bind(match[1],p.revision,action);
   const result=await env.DB.batch([q,v,descriptors,history]);if(!result[0]?.results?.length)return err('La ficha cambió. Actualizá la revisión.',409);
  }else{const result=await env.DB.batch([q,history]);if(!result[0]?.results?.length)return err('La ficha cambió. Actualizá la revisión.',409);}
  return send({state:p.state,revision:p.revision});
 }
 return err('Método no permitido',405);
}
export async function confirmedDriverProfile(env,booking){
 if(!identityProfileEnabled(env)||!ACTIVE.has(booking.status))return null;
 // Re-check live booking status and current assignment. No photo for cancelled,
 // unassigned, unapproved or mismatched operational vehicle records.
 const r=await env.DB.prepare("SELECT u.display_name AS name,p.plate,p.make,p.model,p.color,p.driver_jpeg,p.front_jpeg,p.rear_jpeg FROM bookings b JOIN driver_assignments a ON a.booking_id=b.id JOIN staff_users u ON u.id=a.driver_id JOIN driver_identity_profiles p ON p.staff_id=u.id JOIN driver_vehicle_profiles v ON v.staff_id=u.id WHERE b.id=? AND b.status IN ('confirmed','en_route','arrived','in_progress') AND u.status='approved' AND p.review_state='approved' AND REPLACE(REPLACE(UPPER(v.license_plate),' ',''),'-','')=p.plate AND v.make=p.make AND v.model=p.model").bind(booking.id).first();
 if(!r)return null;
 return {name:r.name,plate:r.plate,make:r.make,model:r.model,color:r.color,reviewed:true,photos:{driver:r.driver_jpeg,front:r.front_jpeg,rear:r.rear_jpeg}};
}
