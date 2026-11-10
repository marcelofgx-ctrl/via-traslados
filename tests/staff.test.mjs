import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {staffRoutes,identity,webEnabled} from '../backend/staff.js';
const now=()=>Math.floor(Date.now()/1000);
const json=(path,payload,headers={})=>new Request('https://api.example'+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.7',...headers},body:JSON.stringify(payload)});
const patch=(path,payload,headers={})=>new Request('https://api.example'+path,{method:'PATCH',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.7',...headers},body:JSON.stringify(payload)});
const get=(path,headers={})=>new Request('https://api.example'+path,{headers});
const send=(data,status=200)=>new Response(JSON.stringify(data),{status});
const err=(msg,status=400)=>send({error:msg},status);
async function handle(req,env){return staffRoutes(req,env,new URL(req.url).pathname,send,err)}
function memoryDB(){
 const staff=new Map(),limits=new Map(),sessions=new Map(),audit=[],settings=new Map([['public_web_enabled','1']]);
 const DB={staff,limits,sessions,audit,settings,
   prepare(sql){let args=[];
     const st={
       bind(...a){args=a;return st},
       async first(){
         if(sql.startsWith('INSERT INTO otp_rate_limits')){const k=args[0],limit=limits.get(k)||{t:now(),n:0};limit.n++;limits.set(k,limit);return {attempts:limit.n}}
         if(sql.startsWith('SELECT * FROM staff_users WHERE email='))return [...staff.values()].find(x=>x.email===args[0])||null;
         if(sql.startsWith('SELECT COUNT(*) AS n FROM staff_users'))return {n:[...staff.values()].filter(x=>x.role==='admin').length};
         if(sql.startsWith('SELECT setting_value FROM service_settings'))return {setting_value:settings.get('public_web_enabled')};
         if(sql.startsWith('SELECT id,status FROM staff_users'))return staff.get(args[0])||null;
         if(sql.startsWith('SELECT id FROM staff_users WHERE id=')){const x=staff.get(args[0]);return x?.status==='approved'&&x.role==='driver'?{id:x.id}:null}
         if(sql.startsWith('SELECT u.id,u.email,u.display_name')){const session=sessions.get(args[0]);if(!session||session.expires_at<=now()||session.revoked_at)return null;const user=staff.get(session.staff_id);return user?.status==='approved'?user:null}
         return null;
       },
       async run(){
         if(sql.startsWith('INSERT INTO staff_users(')){
           if(sql.includes(' SELECT ')){
             if([...staff.values()].some(x=>x.role==='admin'))return {meta:{changes:0}};
             const [id,email,display_name,password_salt,password_hash,iterations]=args;
             staff.set(id,{id,email,display_name,password_salt,password_hash,iterations,role:'admin',status:'approved',created_at:now(),updated_at:now()});
           }else{
             const [id,email,display_name,password_salt,password_hash,iterations,role,status]=args;
             if([...staff.values()].some(x=>x.email===email))throw Error('UNIQUE constraint failed');
             staff.set(id,{id,email,display_name,password_salt,password_hash,iterations,role,status,created_at:now(),updated_at:now()});
           }
         }
         if(sql.startsWith('INSERT INTO admin_audit'))audit.push(args);
         if(sql.startsWith('INSERT INTO staff_sessions'))sessions.set(args[0],{staff_id:args[1],expires_at:args[2],revoked_at:null});
         if(sql.startsWith('UPDATE staff_users SET status=')){const x=staff.get(args[2]);x.status=args[0];staff.set(x.id,x)}
         if(sql.startsWith('UPDATE staff_sessions SET revoked_at=')){
           for(const s of sessions.values())if(sql.includes('staff_id=?')&&s.staff_id===args[0])s.revoked_at=now();
           if(sql.includes('token_hash=?')){const s=sessions.get(args[0]);if(s)s.revoked_at=now()}
         }
         if(sql.startsWith('INSERT INTO service_settings'))settings.set('public_web_enabled',args[0]);
         return {meta:{changes:1}};
       },
       async all(){
         if(sql.startsWith('SELECT id,email,display_name,role,status'))return{results:[...staff.values()].filter(x=>x.role==='driver')};
         if(sql.startsWith('SELECT status,COUNT(*)'))return{results:[]};
         if(sql.startsWith('SELECT actor_id,action'))return{results:[]};
         return{results:[]};
       }
     };
     return st;
   }
 };
 return DB;
}
test('web habilitada por defecto y apagado protegido por administrador',async()=>{
 const db=memoryDB(),env={DB:db,OPERATOR_KEY_HASH:'f'.repeat(64)};
 assert.equal(await webEnabled(env),true);
 assert.equal((await handle(patch('/api/admin/settings',{publicEnabled:false}),env)).status,403);
 assert.equal((await handle(get('/api/public/status'),env)).status,200);
 assert.equal(db.settings.get('public_web_enabled'),'1');
});
test('registro público crea solo conductores pendientes, sin autoproclamarse administrador',async()=>{
 const db=memoryDB(),env={DB:db};
 const r=await handle(json('/api/staff/register',{name:'Conductor de Prueba',email:'Prueba@example.com',password:'UnaClaveMuyFuerte123',role:'admin',status:'approved'}),env);
 assert.equal(r.status,201);
 const user=[...db.staff.values()][0];
 assert.equal(user.email,'prueba@example.com');
 assert.equal(user.role,'driver');
 assert.equal(user.status,'pending');
 assert.equal(user.password_hash.length,64);
 assert.ok(user.password_hash!=='UnaClaveMuyFuerte123');
 const login=await handle(json('/api/staff/login',{email:'Prueba@example.com',password:'UnaClaveMuyFuerte123'}),env);
 assert.equal(login.status,403);
});
test('contraseña corta y acceso admin anónimo rechazados',async()=>{
 const db=memoryDB(),env={DB:db};
 assert.equal((await handle(json('/api/staff/register',{name:'Pepe Chofer',email:'p@ejemplo.com',password:'1234'}),env)).status,400);
 assert.equal((await handle(get('/api/admin/drivers'),env)).status,403);
 assert.equal((await handle(patch('/api/admin/drivers/'+crypto.randomUUID(),{status:'approved'}),env)).status,403);
});
test('clave maestra permite activar cuenta admin solo una vez, bloquear conductores y apagar web',async()=>{
 const db=memoryDB();
 const master='clave-maestra-de-pruebas-no-compartir';
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(master)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const env={DB:db,OPERATOR_KEY_HASH:digest};
 const headers={'X-Operator-Key':master};
 const admin=await handle(json('/api/admin/bootstrap',{name:'Administrador General',email:'admin@ejemplo.com',password:'OtraClaveFuerte2026'},headers),env);
 assert.equal(admin.status,201);
 assert.equal((await handle(json('/api/admin/bootstrap',{name:'Otro Administrador',email:'otro@ejemplo.com',password:'OtraClaveFuerte2026'},headers),env)).status,409);
 const reg=await handle(json('/api/staff/register',{name:'Chofer Pendiente',email:'driver@ejemplo.com',password:'ClaveChoferFuerte2026'}),env);
 assert.equal(reg.status,201);
 const id=[...db.staff.values()].find(x=>x.role==='driver').id;
 const good=await handle(patch('/api/admin/drivers/'+id,{status:'approved'},headers),env);
 assert.equal(good.status,200);
 assert.equal(db.staff.get(id).status,'approved');
 const login=await handle(json('/api/staff/login',{email:'driver@ejemplo.com',password:'ClaveChoferFuerte2026'}),env);
 assert.equal(login.status,200);
 const token=(await login.json()).token;
 assert.equal((await identity(get('/api/staff/me',{Authorization:'Bearer '+token}),env)).role,'driver');
 assert.equal((await handle(patch('/api/admin/settings',{publicEnabled:false},{Authorization:'Bearer '+token}),env)).status,403);
 const off=await handle(patch('/api/admin/settings',{publicEnabled:false},headers),env);
 assert.equal(off.status,200);
 assert.equal(await webEnabled(env),false);
 const block=await handle(patch('/api/admin/drivers/'+id,{status:'blocked'},headers),env);
 assert.equal(block.status,200);
 assert.equal(await identity(get('/api/staff/me',{Authorization:'Bearer '+token}),env),null);
 const on=await handle(patch('/api/admin/settings',{publicEnabled:true},headers),env);
 assert.equal(on.status,200);
 assert.equal(await webEnabled(env),true);
});
