// Vía Traslados V33 · ÚNICAMENTE ensayo Cloudflare D1 QA.
// Los registros se limitan a identidades sintéticas; foto guardada en D1 QA
// a baja resolución. ANTES de producción: migrar fotos a R2 privado,
// verificación real de celular/correo y deshabilitar el administrador demo.
import {identity} from './staff.js';
const encoder=new TextEncoder();
const hex=buffer=>Array.from(new Uint8Array(buffer)).map(v=>v.toString(16).padStart(2,'0')).join('');
const sha=async t=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(t)));
const rhex=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const bad=(m,n=400)=>response({error:m},n);
const founder=actor=>actor?.id==='00000000-0000-4000-8000-000000000001'&&
 actor?.role==='admin';
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const safeEmail=e=>/^[a-z0-9._+-]{2,70}@qa\.invalid$/.test(e);
const emailText=x=>String(x??'').trim().toLowerCase();
const safePhone=p=>/^09[0-9]{7}$/.test(p)&&p.startsWith('099000');
function vehicle(p){
 if(!p||typeof p!=='object')throw Error('Datos del vehículo incompletos');
 const plate=clean(p.plate,12).toUpperCase(),make=clean(p.make,40),
   model=clean(p.model,45),color=clean(p.color,35);
 const year=Number(p.year),passengers=Number(p.passengers),bags=Number(p.bags);
 if(!/^QA[0-9]{3,7}$/.test(plate))throw Error('Usá una matrícula ficticia QA, por ejemplo QA1234');
 if(make.length<2||model.length<2)throw Error('Ingresá marca y modelo');
 if(!Number.isInteger(year)||year<1990||year>new Date().getFullYear()+2)
   throw Error('Año fuera de rango');
 if(!Number.isInteger(passengers)||passengers<1||passengers>8||
   !Number.isInteger(bags)||bags<0||bags>10)
   throw Error('Revisá las capacidades del vehículo');
 return {plate,make,model,color,year,passengers,bags};
}
function photoValid(jpeg){
 if(typeof jpeg!=='string'||jpeg.length<250||jpeg.length>160000||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(jpeg))return false;
 try{
   const bytes=atob(jpeg);
   return bytes.length<=120000&&bytes.length>=170&&
     bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216&&bytes.charCodeAt(2)===255&&
     bytes.charCodeAt(bytes.length-2)===255&&bytes.charCodeAt(bytes.length-1)===217;
 }catch{return false}
}
async function settings(env){
 const rows=await env.DB.prepare(
  "SELECT setting_key,setting_value FROM service_settings "+
  "WHERE setting_key IN ('qa_enrollment_open','qa_enrollment_photo_required')"
 ).all();
 const map=Object.fromEntries((rows.results||[]).map(x=>[x.setting_key,x.setting_value]));
 return {open:map.qa_enrollment_open!=='0',photoRequired:map.qa_enrollment_photo_required!=='0'};
}
async function pbkdf2(password,salt,iters=100000){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),
  'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',
  salt:Uint8Array.from(salt.match(/../g).map(x=>parseInt(x,16))),
  iterations:iters,hash:'SHA-256'},key,256);
 return hex(bits);
}
function eq(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
async function json(req,max){
 const len=Number(req.headers.get('Content-Length')||0);
 if(len>max)throw Error('Datos demasiado grandes');
 const raw=await req.text();
 if(raw.length>max)throw Error('Datos demasiado grandes');
 return JSON.parse(raw);
}
async function register(req,env){
 const cfg=await settings(env);
 if(!cfg.open)return bad('Las inscripciones están cerradas',403);
 let p;try{p=await json(req,170000)}catch{return bad('Solicitud demasiado grande o inválida',413)}
 const name=clean(p.name,90),email=emailText(p.email),
  phone=clean(p.phone,15),password=p.password;
 if(name.length<3||!safeEmail(email)||!safePhone(phone)||
   typeof password!=='string'||password.length<12||password.length>128)
   return bad('Usá solo un nombre de prueba, teléfono 099000xxx, correo @qa.invalid y clave de 12 caracteres');
 let v;try{v=vehicle(p.vehicle)}catch(e){return bad(e.message)}
 const jpeg=p.photoJpegBase64||'';
 if(jpeg&&!photoValid(jpeg))return bad('Fotografía JPEG no válida o superior a 120 KB');
 if(cfg.photoRequired&&!jpeg)return bad('Agregá una fotografía de prueba del vehículo');
 const id=crypto.randomUUID(),salt=rhex(16),hash=await pbkdf2(password,salt);
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status) "+
     "VALUES(?,?,?,?,?,100000,'driver','pending')")
    .bind(id,email,name,salt,hash),
   env.DB.prepare("INSERT INTO staff_contacts(staff_id,phone,email_verified_at) "+
    "VALUES(?,?,unixepoch())").bind(id,phone),
   env.DB.prepare("INSERT INTO driver_vehicle_profiles "+
    "(staff_id,license_plate,make,model,passenger_capacity,luggage_capacity) "+
    "VALUES(?,?,?,?,?,?)").bind(id,v.plate,v.make,v.model,v.passengers,v.bags),
   env.DB.prepare("INSERT INTO qa_driver_applications "+
    "(staff_id,vehicle_year,vehicle_color,photo_jpeg_base64) VALUES(?,?,?,?)")
    .bind(id,v.year,v.color,jpeg),
   env.DB.prepare("INSERT INTO admin_audit(actor_id,action,target,detail) "+
    "VALUES('qa-registrant','qa-driver-applied',?,'Inscripción sintética en QA')")
    .bind(id)
  ]);
  return response({submitted:true,status:'pending',id,
    message:'Solicitud registrada. Un administrador QA deberá aprobarla.'},201);
 }catch(e){
  if(/UNIQUE|constraint/i.test(String(e)))return bad('Correo o celular QA ya registrado',409);
  console.error('qa-registration',e?.name||'error');
  return bad('No se pudo registrar la solicitud',500);
 }
}
async function login(req,env){
 let p;try{p=await json(req,4000)}catch{return bad('Datos inválidos')}
 const email=emailText(p.email),password=p.password;
 if(!safeEmail(email)||typeof password!=='string'||password.length>128)
   return bad('Credenciales incorrectas',401);
 const row=await env.DB.prepare(
  "SELECT u.id,u.display_name,u.password_salt,u.password_hash,u.iterations,u.role,u.status "+
  "FROM staff_users u JOIN qa_driver_applications a ON a.staff_id=u.id WHERE u.email=?"
 ).bind(email).first();
 if(!row||!eq(await pbkdf2(password,row.password_salt,Number(row.iterations)),row.password_hash))
  return bad('Credenciales incorrectas',401);
 if(row.status==='pending')return bad('Tu inscripción está pendiente de aprobación.',403);
 if(row.status!=='approved')return bad('La solicitud fue rechazada o la cuenta está bloqueada',403);
 const token=rhex(32);
 await env.DB.prepare(
  'INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+7200)'
 ).bind(await sha(token),row.id).run();
 return response({token,expiresIn:7200,qa:true,
  user:{id:row.id,name:row.display_name,role:'driver',status:'approved',
   capabilities:{canManageRoles:false}}});
}
async function list(env,actor){
 if(!founder(actor))return bad('Solo administrador QA',403);
 const rows=await env.DB.prepare(
  "SELECT u.id,u.display_name,u.email,u.status,u.created_at,c.phone,"+
  "v.license_plate,v.make,v.model,v.passenger_capacity,v.luggage_capacity,"+
  "q.vehicle_year,q.vehicle_color,q.photo_jpeg_base64!='' AS has_photo,q.review_note "+
  "FROM qa_driver_applications q JOIN staff_users u ON u.id=q.staff_id "+
  "JOIN staff_contacts c ON c.staff_id=u.id "+
  "JOIN driver_vehicle_profiles v ON v.staff_id=u.id "+
  "ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END,u.created_at DESC LIMIT 100"
 ).all();
 const items=(rows.results||[]).map(x=>({id:x.id,name:x.display_name,
  email:x.email,phone:x.phone,status:x.status,
  vehicle:{plate:x.license_plate,make:x.make,model:x.model,year:x.vehicle_year,
   color:x.vehicle_color,passengers:x.passenger_capacity,bags:x.luggage_capacity,
   hasPhoto:Boolean(x.has_photo)},reviewNote:x.review_note}));
 return response({items,pending:items.filter(x=>x.status==='pending').length});
}
async function photo(env,actor,id){
 if(!founder(actor)&&actor?.id!==id)return bad('Sin acceso a esta fotografía',403);
 const row=await env.DB.prepare(
  'SELECT photo_jpeg_base64 FROM qa_driver_applications WHERE staff_id=?'
 ).bind(id).first();
 if(!row)return bad('No existe la solicitud',404);
 return response({jpegBase64:row.photo_jpeg_base64||''});
}
async function decide(req,env,actor,id){
 if(!founder(actor))return bad('Solo administrador QA',403);
 let p;try{p=await json(req,4000)}catch{return bad('Datos inválidos')}
 const status=p.action==='approve'?'approved':
    p.action==='reject'?'blocked':null;
 if(!status)return bad('Decisión inválida');
 const note=clean(p.note,250);
 const row=await env.DB.prepare(
  'SELECT u.status FROM staff_users u JOIN qa_driver_applications q ON q.staff_id=u.id WHERE u.id=?'
 ).bind(id).first();
 if(!row)return bad('Solicitud no encontrada',404);
 if(row.status!=='pending')return bad('La solicitud ya fue procesada',409);
 const changed=await env.DB.prepare(
  "UPDATE staff_users SET status=?,updated_at=unixepoch(),"+
  "approved_at=CASE WHEN ?='approved' THEN unixepoch() ELSE approved_at END "+
  "WHERE id=? AND status='pending' RETURNING id"
 ).bind(status,status,id).first();
 if(!changed)return bad('La solicitud ya fue resuelta',409);
 await env.DB.batch([
   env.DB.prepare(
    'UPDATE qa_driver_applications SET review_note=?,reviewed_at=unixepoch(),reviewed_by=? WHERE staff_id=?'
   ).bind(note,actor.id,id),
   env.DB.prepare(
    "INSERT INTO admin_audit(actor_id,action,target,detail) VALUES(?,?,?,?)"
   ).bind(actor.id,status==='approved'?'qa-driver-approved':'qa-driver-rejected',id,note)
 ]);
 return response({id,status});
}
async function deleteQa(env,actor,id){
 if(!founder(actor))return bad('Solo administrador QA',403);
 const changed=await env.DB.prepare(
  "DELETE FROM staff_users WHERE id=? AND role='driver' AND "+
  "EXISTS(SELECT 1 FROM qa_driver_applications WHERE staff_id=?) "+
  "AND NOT EXISTS(SELECT 1 FROM driver_assignments WHERE driver_id=?) RETURNING id"
 ).bind(id,id,id).first();
 return changed?response({deleted:true}):bad('No se puede eliminar este conductor QA',409);
}
async function changeSettings(req,env,actor){
 if(!founder(actor))return bad('Solo administrador QA',403);
 let p;try{p=await json(req,2000)}catch{return bad('Datos inválidos')}
 if(typeof p.open!=='boolean'||typeof p.photoRequired!=='boolean')
  return bad('Preferencias inválidas');
 await env.DB.batch([
  env.DB.prepare("INSERT INTO service_settings(setting_key,setting_value,updated_by) "+
   "VALUES('qa_enrollment_open',?,?) ON CONFLICT(setting_key) DO UPDATE SET "+
   "setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=unixepoch()")
   .bind(p.open?'1':'0',actor.id),
  env.DB.prepare("INSERT INTO service_settings(setting_key,setting_value,updated_by) "+
   "VALUES('qa_enrollment_photo_required',?,?) ON CONFLICT(setting_key) DO UPDATE SET "+
   "setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=unixepoch()")
   .bind(p.photoRequired?'1':'0',actor.id)
 ]);
 return response({config:{open:p.open,photoRequired:p.photoRequired}});
}
export async function onboarding(req,env,path,actor){
 if(env.VIA_QA_MODE!=='1')return bad('QA solamente',403);
 const method=req.method;
 if(path==='/api/qa/driver-form'&&method==='GET')
  return response({config:await settings(env),qaOnly:true,
   notice:'Solo datos y fotografías sintéticos, no cargues información personal real.'});
 if(path==='/api/qa/driver-applications'&&method==='POST')return register(req,env);
 if(path==='/api/qa/driver-login'&&method==='POST')return login(req,env);
 if(path==='/api/qa/driver-applications'&&method==='GET')return list(env,actor);
 if(path==='/api/qa/driver-form'&&method==='PATCH')return changeSettings(req,env,actor);
 const m=/^\/api\/qa\/driver-applications\/([a-f0-9-]{36})(?:\/(photo))?$/.exec(path);
 if(m&&method==='GET'&&m[2]==='photo')return photo(env,actor,m[1]);
 if(m&&method==='PATCH'&&!m[2])return decide(req,env,actor,m[1]);
 if(m&&method==='DELETE'&&!m[2])return deleteQa(env,actor,m[1]);
 return bad('Ruta de inscripción inexistente',404);
}
