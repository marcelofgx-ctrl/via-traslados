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
 const users=new Map(),contacts=new Map(),codes=new Map(),resets=new Map(),sessions=new Map(),refresh=new Map(),limits=new Map(),audits=[];
 const DB={users,contacts,codes,resets,sessions,refresh,limits,audits,
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
    if(sql.startsWith('SELECT u.id,u.email,u.role,u.status,c.phone,c.email_verified_at FROM staff_users u JOIN staff_contacts')){
      const u=[...users.values()].find(x=>x.email===args[0]),c=u&&contacts.get(u.id);
      return u&&c?{id:u.id,email:u.email,role:u.role,status:u.status,phone:c.phone,email_verified_at:c.email_verified_at}:null;
    }
    if(sql.startsWith('SELECT u.id,c.email_verified_at FROM staff_users u JOIN staff_contacts')){
      const x=[...users.values()].find(x=>x.email===args[0]);const c=x&&contacts.get(x.id);
      return x&&c?{id:x.id,email_verified_at:c.email_verified_at}:null;
    }
    if(sql.startsWith('SELECT u.id,u.email,c.email_verified_at FROM staff_contacts c JOIN staff_users')) {
      for(const c of contacts.values())if(c.phone===args[0]) {
        const u=users.get(c.staff_id);return {id:u.id,email:u.email,email_verified_at:c.email_verified_at};
      }
      return null;
    }
    if(sql.startsWith('SELECT u.id,c.email_verified_at FROM staff_contacts c JOIN staff_users')) {
      for(const c of contacts.values())if(c.phone===args[0]){
        const u=users.get(c.staff_id);return{id:u.id,email_verified_at:c.email_verified_at};
      }
      return null;
    }
    if(sql.startsWith('SELECT sent_at FROM staff_password_resets')){
      return resets.get(args[0])||null;
    }
    if(sql.startsWith('UPDATE staff_password_resets SET attempts=attempts+1')) {
      const v=resets.get(args[0]);
      if(!v||v.attempts>=5||v.expires_at<=now())return null;
      v.attempts++;return{code_hash:v.code_hash};
    }
    if(sql.startsWith('DELETE FROM staff_password_resets WHERE staff_id=? AND code_hash=? AND expires_at>')) {
      const v=resets.get(args[0]);
      if(!v||v.code_hash!==args[1]||v.expires_at<=now())return null;
      resets.delete(args[0]);return{staff_id:args[0]};
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
    if(sql.startsWith('SELECT u.id,u.email,u.display_name,u.role,u.status FROM staff_sessions s')) {
      const session=sessions.get(args[0]);
      const u=session&&users.get(session.staff_id);
      if(!u||u.status!=='approved'||session.revoked_at||session.expires_at<=now())return null;
      return {id:u.id,email:u.email,display_name:u.display_name,role:u.role,status:u.status};
    }
    if(sql.startsWith('SELECT phone,email_verified_at FROM staff_contacts'))return contacts.get(args[0])||null;
    if(sql.startsWith('SELECT u.id,u.role,u.status,c.email_verified_at FROM staff_users u LEFT JOIN')){
      const u=users.get(args[0]),c=u&&contacts.get(u.id);
      return u?{id:u.id,role:u.role,status:u.status,email_verified_at:c?.email_verified_at}:null;
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
    if(sql.startsWith('INSERT INTO staff_password_resets(')){
      resets.set(args[0],{code_hash:args[1],expires_at:now()+600,attempts:0,sent_at:now()});
    }
    if(sql.startsWith('DELETE FROM staff_password_resets WHERE staff_id=? AND code_hash=?')){
      if(resets.get(args[0])?.code_hash===args[1])resets.delete(args[0]);
    }
    if(sql.startsWith('UPDATE staff_users SET password_salt=')){
      const u=users.get(args[3]);if(u){u.password_salt=args[0];u.password_hash=args[1];u.iterations=args[2];}
    }
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
    if(sql.startsWith("UPDATE staff_users SET role='admin',status='approved'")) {
      const u=users.get(args[0]);
      if(u&&u.role==='driver'&&['pending','approved'].includes(u.status)){
        u.role='admin';u.status='approved';return{meta:{changes:1}};
      }
      return{meta:{changes:0}};
    }
    if(sql.startsWith('UPDATE staff_users SET role=?')){
      const u=users.get(args[1]);
      if(u&&u.role===args[2]&&u.status===args[3]){u.role=args[0];return{meta:{changes:1}};}
      return{meta:{changes:0}};
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
      const role=sql.includes("WHERE u.role='admin'")?'admin':'driver';
      return{results:[...users.values()].filter(x=>x.role===role).map(u=>({...u,...(contacts.get(u.id)||{})}))};
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

const get=(path,headers={})=>new Request('https://via.example'+path,{
 method:'GET',headers:{'CF-Connecting-IP':'198.51.100.8',...headers}
});
test('solo el teléfono y correo fundadores verificados activan administración automática',async()=>{
 const DB=db(),env={...makeEnv(db()),DB,
   VIA_FOUNDER_PHONE:'099 123 456',VIA_FOUNDER_EMAIL:'fundador@example.com'};
 const previous=globalThis.fetch;
 let otp='';
 globalThis.fetch=async(_url,opt)=>{
   otp=JSON.parse(opt.body).text.match(/(\d{6})/)[1];
   return new Response(JSON.stringify({id:'mail-otp'}),{status:200});
 };
 try {
  const owner={name:'Fundador del Servicio',phone:'099123456',email:'fundador@example.com',password:'ContraseñaFundadora2026'};
  const response=await request(post('/api/staff/register-phone',owner),env);
  assert.equal(response.status,201);
  const user=[...DB.users.values()][0];
  assert.equal(user.role,'driver');assert.equal(user.status,'pending');
  const invalid=await request(post('/api/staff/verify-email',{email:owner.email,code:'111111'}),env);
  assert.equal(invalid.status,401);assert.equal(user.role,'driver');
  const verified=await request(post('/api/staff/verify-email',{email:owner.email,code:otp}),env);
  assert.equal(verified.status,200);
  assert.deepEqual((await verified.json()).accountReady,true);
  assert.equal(user.role,'admin');assert.equal(user.status,'approved');
  const login=await request(post('/api/staff/login-phone',{phone:owner.phone,password:owner.password}),env);
  assert.equal(login.status,200);
  const session=await login.json();
  assert.equal(session.user.role,'admin');
  const founderHeaders={Authorization:'Bearer '+session.token};
  const team=await request(get('/api/admin/team',founderHeaders),env);
  assert.equal(team.status,200);
  assert.equal((await team.json()).admins.length,1);
  const selfDemote=await request(patch('/api/admin/team/'+user.id+'/role',{role:'driver'},founderHeaders),env);
  assert.equal(selfDemote.status,409);
 }finally{globalThis.fetch=previous}
});
test('conocer solo el celular del fundador nunca concede permisos administrativos',async()=>{
 const DB=db(),env={...makeEnv(DB),VIA_FOUNDER_PHONE:'099 123 456',VIA_FOUNDER_EMAIL:'fundador@example.com'};
 const previous=globalThis.fetch;let otp='';
 globalThis.fetch=async(_url,opt)=>{
   otp=JSON.parse(opt.body).text.match(/(\d{6})/)[1];
   return new Response(JSON.stringify({id:'mail-otp'}),{status:200});
 };
 try{
  const user={name:'Persona de Prueba',phone:'099 123 456',email:'otro@example.com',password:'ContraseñaDePrueba2026'};
  assert.equal((await request(post('/api/staff/register-phone',user),env)).status,201);
  const verified=await request(post('/api/staff/verify-email',{email:user.email,code:otp}),env);
  assert.equal((await verified.json()).approvalRequired,true);
  assert.equal([...DB.users.values()][0].role,'driver');
  assert.equal([...DB.users.values()][0].status,'pending');
 }finally{globalThis.fetch=previous}
});
test('el fundador puede designar administradores y revocar sus sesiones; otros administradores no',async()=>{
 const DB=db(),env={...makeEnv(DB),VIA_FOUNDER_PHONE:'099 123 456',VIA_FOUNDER_EMAIL:'fundador@example.com'};
 const previous=globalThis.fetch;let otp='';
 globalThis.fetch=async(_url,opt)=>{
   otp=JSON.parse(opt.body).text.match(/(\d{6})/)[1];
   return new Response(JSON.stringify({id:'mail-otp'}),{status:200});
 };
 try{
  const founder={name:'Administradora Fundadora',phone:'099123456',email:'fundador@example.com',password:'ContraseñaFundadora2026'};
  assert.equal((await request(post('/api/staff/register-phone',founder),env)).status,201);
  assert.equal((await request(post('/api/staff/verify-email',{email:founder.email,code:otp}),env)).status,200);
  const founderLogin=await (await request(post('/api/staff/login-phone',{phone:founder.phone,password:founder.password}),env)).json();
  const founderHeader={Authorization:'Bearer '+founderLogin.token};
  const other={name:'Conductora Delegada',phone:'099555555',email:'delegada@example.com',password:'ContraseñaDelegada2026'};
  assert.equal((await request(post('/api/staff/register-phone',other),env)).status,201);
  assert.equal((await request(post('/api/staff/verify-email',{email:other.email,code:otp}),env)).status,200);
  const driver=[...DB.users.values()].find(u=>u.email===other.email);
  const notApproved=await request(patch('/api/admin/team/'+driver.id+'/role',{role:'admin'},founderHeader),env);
  assert.equal(notApproved.status,409);
  const approved=await request(patch('/api/admin/drivers/'+driver.id,{status:'approved'},founderHeader),env);
  assert.equal(approved.status,200);
  const driverLogin=await (await request(post('/api/staff/login-phone',{phone:other.phone,password:other.password}),env)).json();
  assert.equal(driverLogin.user.role,'driver');
  const delegate=await request(patch('/api/admin/team/'+driver.id+'/role',{role:'admin'},founderHeader),env);
  assert.equal(delegate.status,200);
  assert.equal(driver.role,'admin');
  const stale=await request(get('/api/admin/team',{Authorization:'Bearer '+driverLogin.token}),env);
  assert.equal(stale.status,403);
  const delegatedLogin=await (await request(post('/api/staff/login-phone',{phone:other.phone,password:other.password}),env)).json();
  assert.equal(delegatedLogin.user.role,'admin');
  const unauthorized=await request(patch('/api/admin/team/'+driver.id+'/role',{role:'driver'},{Authorization:'Bearer '+delegatedLogin.token}),env);
  assert.equal(unauthorized.status,403);
  const demote=await request(patch('/api/admin/team/'+driver.id+'/role',{role:'driver'},founderHeader),env);
  assert.equal(demote.status,200);assert.equal(driver.role,'driver');
 }finally{globalThis.fetch=previous}
});

test('cuenta fundadora ya verificada pasa de pendiente a admin al iniciar sesión',async()=>{
 const DB=db(),env=makeEnv(DB),previous=globalThis.fetch;let otp='';
 globalThis.fetch=async(_url,opt)=>{
   otp=JSON.parse(opt.body).text.match(/(\d{6})/)[1];
   return new Response(JSON.stringify({id:'test-email'}),{status:200});
 };
 try {
  const fields={name:'Titular Fundador',phone:'099123456',email:'fundador@example.com',password:'ContraseñaFundadora2026'};
  const reg=await request(post('/api/staff/register-phone',fields),env);
  assert.equal(reg.status,201);
  const verified=await request(post('/api/staff/verify-email',{email:fields.email,code:otp}),env);
  assert.equal(verified.status,200);
  const before=await request(post('/api/staff/login-phone',{phone:fields.phone,password:fields.password}),env);
  assert.equal(before.status,403);
  assert.match((await before.json()).error,/pendiente/);
  env.VIA_FOUNDER_PHONE=fields.phone;
  env.VIA_FOUNDER_EMAIL=fields.email;
  const after=await request(post('/api/staff/login-phone',{phone:fields.phone,password:fields.password}),env);
  assert.equal(after.status,200);
  assert.equal((await after.json()).user.role,'admin');
  const u=[...DB.users.values()][0];
  assert.equal(u.status,'approved');
  assert.equal(u.role,'admin');
 }finally{globalThis.fetch=previous}
});

test('una llamada anónima al correo ya verificado no revela ni promueve al fundador',async()=>{
 const DB=db(),env=makeEnv(DB),original=globalThis.fetch;
 let otp='';
 globalThis.fetch=async(_url,opt)=>{
   otp=JSON.parse(opt.body).text.match(/(\d{6})/)[1];
   return new Response(JSON.stringify({id:'test-email'}),{status:200});
 };
 try{
  const data={name:'Titular QA',phone:'099123456',email:'titular-test@example.com',password:'ClaveFicticiaSegura2026'};
  const created=await request(post('/api/staff/register-phone',data),env);
  assert.equal(created.status,201);
  const confirmed=await request(post('/api/staff/verify-email',{email:data.email,code:otp}),env);
  assert.equal(confirmed.status,200);
  const row=[...DB.users.values()][0];
  assert.equal(row.status,'pending');
  env.VIA_FOUNDER_PHONE=data.phone;
  env.VIA_FOUNDER_EMAIL=data.email;
  const noProof=await request(post('/api/staff/verify-email',{email:data.email,code:'000000'}),env);
  assert.equal(noProof.status,200);
  const anon=await noProof.json();
  assert.equal(anon.accountReady,undefined);
  assert.equal(anon.role,undefined);
  assert.equal(row.role,'driver');
  assert.equal(row.status,'pending');
  const signed=await request(post('/api/staff/login-phone',{phone:data.phone,password:data.password}),env);
  assert.equal(signed.status,200);
  assert.equal((await signed.json()).user.role,'admin');
 }finally{globalThis.fetch=original}
});

test('recuperación de contraseña usa código separado, sin revelar cuentas y revoca sesiones',async()=>{
 const DB=db(),env={...makeEnv(DB),VIA_FOUNDER_PHONE:'099123456',VIA_FOUNDER_EMAIL:'owner@example.com'};
 const previous=globalThis.fetch;let otp='';
 globalThis.fetch=async(_url,opt)=>{
  const mail=JSON.parse(opt.body);
  otp=mail.text.match(/(\d{6})/)[1];
  return new Response(JSON.stringify({id:'test-email'}),{status:200});
 };
 try{
  const owner={name:'Dueño Prueba',email:'owner@example.com',phone:'099123456',password:'PrimeraClaveLarga2026'};
  assert.equal((await request(post('/api/staff/register-phone',owner),env)).status,201);
  assert.equal((await request(post('/api/staff/verify-email',{email:owner.email,code:otp}),env)).status,200);
  const login=await (await request(post('/api/staff/login-phone',{phone:owner.phone,password:owner.password}),env)).json();
  assert.equal(login.user.role,'admin');
  otp='';
  const requestUnknown=await request(post('/api/staff/password-reset/request',{phone:'099999999'}),env);
  assert.equal(requestUnknown.status,200);
  const req=await request(post('/api/staff/password-reset/request',{phone:owner.phone}),env);
  assert.equal(req.status,200);
  assert.deepEqual(await req.json(),await requestUnknown.json());
  assert.match(otp,/^\d{6}$/);
  const row=[...DB.users.values()][0];
  assert.ok(DB.resets.has(row.id));
  const bad=await request(post('/api/staff/password-reset/confirm',{
   phone:owner.phone,code:'000000',newPassword:'NuevaClaveSegura2026'
  }),env);
  assert.equal(bad.status,401);
  const short=await request(post('/api/staff/password-reset/confirm',{
   phone:owner.phone,code:otp,newPassword:'corta'
  }),env);
  assert.equal(short.status,400);
  const success=await request(post('/api/staff/password-reset/confirm',{
   phone:owner.phone,code:otp,newPassword:'NuevaClaveSegura2026'
  }),env);
  assert.equal(success.status,200);
  assert.equal((await success.json()).passwordReset,true);
  assert.equal(DB.resets.has(row.id),false);
  assert.notEqual(row.password_hash,'NuevaClaveSegura2026');
  const reused=await request(post('/api/staff/password-reset/confirm',{
   phone:owner.phone,code:otp,newPassword:'OtraClaveSegura2026'
  }),env);
  assert.equal(reused.status,401);
  const old=await request(post('/api/staff/login-phone',{phone:owner.phone,password:owner.password}),env);
  assert.equal(old.status,401);
  const newLogin=await request(post('/api/staff/login-phone',{phone:owner.phone,password:'NuevaClaveSegura2026'}),env);
  assert.equal(newLogin.status,200);
  assert.equal((await newLogin.json()).user.role,'admin');
  const oldSession=await request(post('/api/staff/refresh',{refreshToken:login.refreshToken}),env);
  assert.equal(oldSession.status,401);
 }finally{globalThis.fetch=previous}
});
test('un correo no verificado no permite restablecimiento de contraseña',async()=>{
 const DB=db(),env=makeEnv(DB),previous=globalThis.fetch;let sent=0;
 globalThis.fetch=async()=>{sent++;return new Response(JSON.stringify({id:'ok'}),{status:200})};
 try{
  const u={name:'Prueba Sin Verificar',phone:'099444444',email:'unverified@example.com',password:'ClaveInicialSegura2026'};
  assert.equal((await request(post('/api/staff/register-phone',u),env)).status,201);
  const before=sent;
  const requested=await request(post('/api/staff/password-reset/request',{phone:u.phone}),env);
  assert.equal(requested.status,200);
  assert.equal(sent,before);
  const denied=await request(post('/api/staff/password-reset/confirm',{
   phone:u.phone,code:'000000',newPassword:'ClaveNuevaSegura2026'
  }),env);
  assert.equal(denied.status,401);
 }finally{globalThis.fetch=previous}
});
