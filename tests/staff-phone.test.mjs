import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {staffPhoneRoutes,normalizeStaffPhone} from '../backend/staff-phone.js';
import {staffRoutes} from '../backend/staff.js';

const post=(path,p,headers={})=>new Request('https://via.example'+path,{
 method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.8',...headers},
 body:JSON.stringify(p)});
const patch=(path,p,headers={})=>new Request('https://via.example'+path,{
 method:'PATCH',headers:{'Content-Type':'application/json','CF-Connecting-IP':'198.51.100.8',...headers},
 body:JSON.stringify(p)});
const send=(body,status=200)=>new Response(JSON.stringify(body),{status});
const err=(message,status=400)=>send({error:message},status);
const request=async(req,env)=>{
 const path=new URL(req.url).pathname;
 return await staffPhoneRoutes(req,env,path,send,err)||await staffRoutes(req,env,path,send,err);
};
const now=()=>Math.floor(Date.now()/1000);
function db() {
 const users=new Map(),contacts=new Map(),codes=new Map(),sessions=new Map(),refresh=new Map(),limits=new Map(),audits=[];
 const DB={users,contacts,codes,sessions,refresh,limits,audits,
  prepare(sql){let args=[];const stm={
   bind(...values){args=values;return stm},
   async first() {
    if(sql.startsWith('INSERT INTO otp_rate_limits')){
      const old=limits.get(args[0])||{attempts:0};
      const attempts=old.attempts+1;limits.set(args[0],{attempts});return{attempts};
    }
    if(sql.startsWith("SELECT COUNT(*) AS n FROM staff_users")){
      return {n:[...users.values()].filter(u=>u.role==='admin').length};
    }
    if(sql.startsWith('SELECT u.id,c.email_verified_at FROM staff_users u JOIN staff_contacts')){
      const x=[...users.values()].find(x=>x.email===args[0]);const c=x&&contacts.get(x.id);
      return x&&c?{id:x.id,email_verified_at:c.email_verified_at}:null;
    }
    if(sql.startsWith('SELECT sent_at FROM staff_email_codes')){
      return codes.get(args[0])||null;
    }
    if(sql.startsWith('UPDATE staff_email_codes SET attempts=attempts+1')){
      const v=codes.get(args[0]);
      if(!v||v.attempts>=5||v.expires_at<=now())return null;
      v.attempts++;return{code_hash:v.code_hash};
    }
    if(sql.startsWith('SELECT u.*,c.phone,c.email_verified_at FROM staff_contacts')){
      for(const c of contacts.values())if(c.phone===args[0])return {...users.get(c.staff_id),...c};
      return null;
    }
    if(sql.startsWith('SELECT u.id,u.email,u.display_name,u.role,u.status,c.phone,c.email_verified_at FROM staff_refresh_tokens')){
      const r=refresh.get(args[0]);
      if(!r||r.revoked_at||r.expires_at<=now())return null;
      const u=users.get(r.staff_id),c=contacts.get(r.staff_id);
      return u?.status==='approved'&&c?.email_verified_at?{...u,...c}:null;
    }
    if(sql.startsWith('SELECT id,status FROM staff_users WHERE id='))return users.get(args[0])||null;
    if(sql.startsWith('SELECT email_verified_at FROM staff_contacts'))return contacts.get(args[0])||null;
    return null;
   },
   async run(){
    if(sql.startsWith('INSERT INTO staff_users(')){
      const [id,email,display_name,password_salt,password_hash,iterations,role,status]=args;
      if([...users.values()].some(u=>u.email===email))throw Error('UNIQUE constraint failed: email');
      users.set(id,{id,email,display_name,password_salt,password_hash,iterations,role,status,created_at:now(),updated_at:now()});
    }
    if(sql.startsWith('INSERT INTO staff_contacts(')){
      const [staff_id,phone]=args;
      if([...contacts.values()].some(c=>c.phone===phone))throw Error('UNIQUE constraint failed: phone');
      contacts.set(staff_id,{staff_id,phone,email_verified_at:null});
    }
    if(sql.startsWith('INSERT INTO admin_audit'))audits.push(args);
    if(sql.startsWith('INSERT INTO staff_email_codes(')){
      codes.set(args[0],{code_hash:args[1],expires_at:now()+600,attempts:0,sent_at:now()-100});
    }
    if(sql.startsWith('DELETE FROM staff_email_codes')){
      if(args.length===1)codes.delete(args[0]);
      else if(codes.get(args[0])?.code_hash===args[1])codes.delete(args[0]);
    }
    if(sql.startsWith('UPDATE staff_contacts SET email_verified_at=')){
      const c=contacts.get(args[0]);if(c)c.email_verified_at=now();
    }
    if(sql.startsWith('INSERT INTO staff_sessions(')){
      sessions.set(args[0],{staff_id:args[1],expires_at:args[2],revoked_at:null});
    }
    if(sql.startsWith('INSERT INTO staff_refresh_tokens(')){
      refresh.set(args[0],{staff_id:args[1],expires_at:args[2],revoked_at:null});
    }
    if(sql.startsWith('UPDATE staff_users SET status=')){
      const u=users.get(args[2]);u.status=args[0];
    }
    if(sql.startsWith('UPDATE staff_sessions SET revoked_at=')){
      for(const r of sessions.values())if(r.staff_id===args[0])r.revoked_at=now();
    }
    if(sql.startsWith('UPDATE staff_refresh_tokens SET revoked_at=')){
      if(sql.includes('WHERE staff_id=?'))for(const r of refresh.values())if(r.staff_id===args[0])r.revoked_at=now();
      else if(sql.includes('WHERE token_hash=?')){const r=refresh.get(args[0]);if(r)r.revoked_at=now();}
    }
    return{meta:{changes:1}};
   },
   async all(){
    if(sql.includes('FROM staff_users u LEFT JOIN staff_contacts c')){
      return{results:[...users.values()].filter(x=>x.role==='driver').map(u=>({...u,...(contacts.get(u.id)||{})}))};
    }
    return{results:[]};
   }
  };return stm},
  async batch(statements){const results=[];for(const s of statements)results.push(await s.run());return results;}
 };
 return DB;
}
const makeEnv=DB=>({DB,OTP_PEPPER:'A'.repeat(48),RESEND_API_KEY:'fake-key',RESEND_FROM:'Vía Traslados <reservas@viatraslados.com>'});
test('normalización uruguaya de celular y E.164',()=>{
 assert.equal(normalizeStaffPhone('099 123 456'),'+59899123456');
 assert.equal(normalizeStaffPhone('+598 99-123-456'),'+59899123456');
 assert.equal(normalizeStaffPhone('59899123456'),'+59899123456');
 assert.equal(normalizeStaffPhone('+5491123456789'),'+5491123456789');
 for(const value of ['099','hello','111111111','199123456','+0000000000'])assert.throws(()=>normalizeStaffPhone(value));
});
test('registro por teléfono, validación email, aprobación y revocación del ingreso biométrico',async()=>{
 const DB=db(),env=makeEnv(DB),oldFetch=globalThis.fetch;
 let otp='';
 globalThis.fetch=async(_url,options)=>{const msg=JSON.parse(options.body);otp=msg.text.match(/(\d{6})/)[1];return new Response(JSON.stringify({id:'fake-email-id'}),{status:200})};
 try {
  const fields={name:'Ana Conductora',phone:'099 123 456',email:'ana@example.com',password:'ContraseñaDePrueba2026',role:'admin',status:'approved'};
  const register=await request(post('/api/staff/register-phone',fields),env);
  assert.equal(register.status,201);assert.equal((await register.json()).emailSent,true);
  const u=[...DB.users.values()][0];assert.equal(u.role,'driver');assert.equal(u.status,'pending');
  assert.equal(DB.contacts.get(u.id).email_verified_at,null);
  assert.notEqual(u.password_hash,fields.password);
  const pre=await request(post('/api/staff/login-phone',{phone:'099123456',password:fields.password}),env);
  assert.equal(pre.status,403);
  assert.match((await pre.json()).error,/verificá tu correo/);
  const invalid=await request(post('/api/staff/verify-email',{email:fields.email,code:'000000'}),env);
  assert.equal(invalid.status,401);
  const verified=await request(post('/api/staff/verify-email',{email:fields.email,code:otp}),env);
  assert.equal(verified.status,200);
  assert.ok(DB.contacts.get(u.id).email_verified_at>0);
  const pending=await request(post('/api/staff/login-phone',{phone:fields.phone,password:fields.password}),env);
  assert.equal(pending.status,403);
  const master='clave-maestra-de-test-supervisor';
  env.OPERATOR_KEY_HASH=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(master)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const head={'X-Operator-Key':master};
  const approve=await request(patch('/api/admin/drivers/'+u.id,{status:'approved'},head),env);
  assert.equal(approve.status,200);
  const login=await request(post('/api/staff/login-phone',{phone:fields.phone,password:fields.password}),env);
  assert.equal(login.status,200);
  const data=await login.json();
  assert.match(data.token,/^[a-f0-9]{64}$/);
  assert.match(data.refreshToken,/^[a-f0-9]{64}$/);
  const newSession=await request(post('/api/staff/refresh',{refreshToken:data.refreshToken}),env);
  assert.equal(newSession.status,200);
  assert.ok((await newSession.json()).token);
  const block=await request(patch('/api/admin/drivers/'+u.id,{status:'blocked'},head),env);
  assert.equal(block.status,200);
  const rejected=await request(post('/api/staff/refresh',{refreshToken:data.refreshToken}),env);
  assert.equal(rejected.status,401);
 }finally{globalThis.fetch=oldFetch;}
});
test('rechazar alta con teléfono inválido y no permitir registro admin',async()=>{
 const DB=db(),env=makeEnv(DB);
 const bad=await request(post('/api/staff/register-phone',{name:'Jose Prueba',phone:'123',email:'jose@example.com',password:'UnaClaveLargaDeDoce'}),env);
 assert.equal(bad.status,400);assert.equal(DB.users.size,0);
 const anon=await request(post('/api/admin/bootstrap-phone',{name:'Admin Prueba',phone:'099123456',email:'admin@example.com',password:'UnaClaveLargaDeDoce'}),env);
 assert.equal(anon.status,403);
});
