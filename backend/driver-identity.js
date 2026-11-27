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
 let i=2;
 while(i+4<a.length){
  if(a[i++]!==255)return null;while(a[i]===255)i++;
  const marker=a[i++];if(marker===218||marker===217)return null;
  const n=a[i]*256+a[i+1];if(n<2||i+n>a.length)return null;
  if([192,193,194].includes(marker)){
   if(n<8)return null;
   const h=a[i+3]*256+a[i+4],w=a[i+5]*256+a[i+6];
   return w>=320&&h>=240&&w<=1600&&h<=1600?{w,h}:null;
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
 const photos=['driver','front','rear'].map(k=>p.photos?.[k]);
 if(!photos.every(jpegSize)||new Set(photos).size!==3)throw Error('Se necesitan tres fotos JPEG distintas y legibles');
 const r=p.recognition||{};
 const signal=x=>['pass','review'].includes(x)?x:'review';
 const frontPlate=normalizePlate(r.frontPlate),rearPlate=normalizePlate(r.rearPlate);
 const recognition={face:signal(r.face),front:signal(r.front),rear:signal(r.rear),
  frontPlate:validPlate(frontPlate)?frontPlate:'',rearPlate:validPlate(rearPlate)?rearPlate:'',
  plateMatch:frontPlate===plate&&rearPlate===plate};
 return {plate,make,model,color,photos,recognition};
}
const metadata=r=>r?{revision:r.revision,state:r.review_state,plate:r.plate,make:r.make,model:r.model,color:r.color,
 missing:[],reviewNote:r.review_note||'',updatedAt:r.updated_at}: {state:'missing',missing:['driver','front','rear','plate']};
const META='revision,review_state,plate,make,model,color,review_note,updated_at';
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
  const v=await env.DB.prepare('SELECT license_plate AS plate,make,model FROM driver_vehicle_profiles WHERE staff_id=?').bind(actor.id).first();
  const info=metadata(r);if(r?.review_state==='approved'&&(!v||normalizePlate(v.plate)!==r.plate||v.make!==r.make||v.model!==r.model)){info.state='vehicle_changed';info.missing=['front','rear','plate'];}
  return send({...info,vehicle:v||null});
 }
 if(own&&req.method==='POST'){
  let p;try{p=validateProfile(await body(req))}catch(e){return err(e.message||'Fotos inválidas',400)}
  const rev=crypto.randomUUID();
  // A single replacement invalidates any prior approval immediately.
  await env.DB.prepare("INSERT INTO driver_identity_profiles(staff_id,revision,review_state,plate,make,model,color,driver_jpeg,front_jpeg,rear_jpeg,recognition_json,consent_at) VALUES (?,?,'pending',?,?,?,?,?,?,?,?,unixepoch()) ON CONFLICT(staff_id) DO UPDATE SET revision=excluded.revision,review_state='pending',plate=excluded.plate,make=excluded.make,model=excluded.model,color=excluded.color,driver_jpeg=excluded.driver_jpeg,front_jpeg=excluded.front_jpeg,rear_jpeg=excluded.rear_jpeg,recognition_json=excluded.recognition_json,consent_at=unixepoch(),updated_at=unixepoch(),reviewed_at=NULL,reviewed_by=NULL,review_note=''")
   .bind(actor.id,rev,p.plate,p.make,p.model,p.color,...p.photos,JSON.stringify(p.recognition)).run();
  return send({state:'pending',revision:rev,missing:[]},201);
 }
 if(actor.role!=='admin')return err('Solo administración',403);
 if(list&&req.method==='GET'){
  const r=await env.DB.prepare("SELECT p.staff_id AS id,u.display_name AS name,p.revision,p.review_state AS state,p.plate,p.make,p.model,p.color FROM driver_identity_profiles p JOIN staff_users u ON u.id=p.staff_id WHERE p.review_state='pending' ORDER BY p.updated_at LIMIT 50").all();
  return send({profiles:r.results||[]});
 }
 if(match&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT p.*,u.display_name AS name FROM driver_identity_profiles p JOIN staff_users u ON u.id=p.staff_id WHERE p.staff_id=?').bind(match[1]).first();
  if(!r)return err('Ficha inexistente',404);
  return send({...metadata(r),id:match[1],name:r.name,recognition:JSON.parse(r.recognition_json),photos:{driver:r.driver_jpeg,front:r.front_jpeg,rear:r.rear_jpeg}});
 }
 if(match&&req.method==='PATCH'){
  let p;try{p=await body(req,2500)}catch{return err('Datos inválidos',400)}
  if(!['approved','rejected'].includes(p.state)||!ID.test(p.revision||''))return err('Revisión inválida',400);
  const note=clean(p.note,350);if(p.state==='rejected'&&!note)return err('Indicá el motivo',400);
  const q=env.DB.prepare("UPDATE driver_identity_profiles SET review_state=?,reviewed_by=?,reviewed_at=unixepoch(),review_note=? WHERE staff_id=? AND revision=? AND review_state='pending' RETURNING staff_id")
    .bind(p.state,actor.id,note,match[1],p.revision);
  if(p.state==='approved'){
   // Keep operational capacity unchanged; synchronize only identity of the car.
   const v=env.DB.prepare("INSERT INTO driver_vehicle_profiles(staff_id,license_plate,make,model) SELECT staff_id,plate,make,model FROM driver_identity_profiles WHERE staff_id=? AND revision=? AND review_state='approved' AND reviewed_by=? ON CONFLICT(staff_id) DO UPDATE SET license_plate=excluded.license_plate,make=excluded.make,model=excluded.model,updated_at=unixepoch()").bind(match[1],p.revision,actor.id);
   const result=await env.DB.batch([q,v]);if(!result[0]?.results?.length)return err('La ficha cambió. Actualizá la revisión.',409);
  }else if(!await q.first())return err('La ficha cambió. Actualizá la revisión.',409);
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
