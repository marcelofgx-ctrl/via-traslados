// Passkeys WebAuthn para pasajeros; huellas/PIN quedan en el teléfono.
// Verificación criptográfica en el Worker con SimpleWebAuthn; ninguna clave privada se almacena.
import {accountByPhone,customerSession,createCustomerSession} from './customer-auth.js';

const now=()=>Math.floor(Date.now()/1000);
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64=str=>Uint8Array.from(atob(String(str).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-String(str).length%4)%4)),c=>c.charCodeAt(0));
const err=(error,status=400)=>({data:{error},status});
const ok=(data,status=200)=>({data,status});
const urlOrigin=env=>new URL(env.PUBLIC_ORIGIN).origin;
const rpId=env=>new URL(env.PUBLIC_ORIGIN).hostname;
function validCredentialShape(obj){
 return obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 typeof obj.id==='string'&&obj.id.length>16&&obj.id.length<1000&&
 obj.type==='public-key'&&obj.response&&typeof obj.response==='object'&&
 typeof obj.response.clientDataJSON==='string'&&obj.response.clientDataJSON.length<8192;
}
async function parse(req){
 if(Number(req.headers.get('Content-Length')||0)>24000)throw Error('Solicitud demasiado grande');
 const raw=await req.text();
 if(raw.length>24000)throw Error('Solicitud demasiado grande');
 const j=JSON.parse(raw);
 if(!j||typeof j!=='object'||Array.isArray(j))throw Error('Solicitud inválida');
 return j;
}
async function lease(env,id,email,purpose,challenge){
 await env.DB.prepare("INSERT INTO customer_passkey_challenges(id,email,challenge,purpose,expires_at) VALUES (?,?,?,?,unixepoch()+300)").bind(id,email,challenge,purpose).run();
}
async function consume(env,id,email,purpose){
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return null;
 return env.DB.prepare("UPDATE customer_passkey_challenges SET consumed_at=unixepoch() WHERE id=? AND email=? AND purpose=? AND consumed_at IS NULL AND expires_at>unixepoch() RETURNING challenge").bind(id,email,purpose).first();
}
async function limited(env,ip,account){
 const bytes=new TextEncoder().encode('via-passkey:'+ip+':'+account);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(c=>c.toString(16).padStart(2,'0')).join('');
 const row=await env.DB.prepare('INSERT INTO otp_rate_limits(rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(hash,600,600).first();
 return Number(row?.attempts||0)<=10;
}
async function passkeyRoutesImpl(req,env,path){
 let p;try{p=await parse(req)}catch{return err('Datos incorrectos')}
 const origin=urlOrigin(env),rpID=rpId(env);
 if(!origin.startsWith('https://'))return err('Las passkeys requieren HTTPS',503);
 if(path==='/api/customer/passkeys/register/options'){
  const session=await customerSession(req,env);
  if(!session)return err('Iniciá sesión para activar la huella',401);
  const {generateRegistrationOptions}=await import('@simplewebauthn/server');
  const current=await env.DB.prepare('SELECT credential_id,transports FROM customer_passkeys WHERE email=? LIMIT 12').bind(session.email).all();
  const keys=(current.results||[]).map(k=>({id:k.credential_id,transports:JSON.parse(k.transports||'[]')}));
  if(keys.length>=10)return err('Ya hay demasiados dispositivos vinculados',409);
  const userID=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('via-passenger:'+session.email)));
  const options=await generateRegistrationOptions({
   rpName:'Vía Traslados',rpID,userName:session.email,userDisplayName:session.name,
   userID,attestationType:'none',supportedAlgorithmIDs:[-7,-257],
   authenticatorSelection:{residentKey:'required',userVerification:'required'},
   excludeCredentials:keys
  });
  const challengeId=crypto.randomUUID();
  await lease(env,challengeId,session.email,'registration',options.challenge);
  return ok({challengeId,options});
 }
 if(path==='/api/customer/passkeys/register/verify'){
  const session=await customerSession(req,env);
  if(!session)return err('Iniciá sesión para activar la huella',401);
  if(!validCredentialShape(p.credential))return err('Credencial inválida');
  const challenge=await consume(env,p.challengeId,session.email,'registration');
  if(!challenge)return err('Solicitud vencida. Volvé a intentarlo.',401);
  const {verifyRegistrationResponse}=await import('@simplewebauthn/server');
  let result;
  try{
   result=await verifyRegistrationResponse({response:p.credential,expectedChallenge:challenge.challenge,
    expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});
  }catch{return err('El teléfono no pudo validar la huella. Podés continuar por correo.',401)}
  if(!result.verified||!result.registrationInfo?.credential)return err('La huella no se pudo verificar',401);
  const c=result.registrationInfo.credential;
  try{
   await env.DB.prepare('INSERT INTO customer_passkeys(credential_id,email,public_key,counter,transports) VALUES (?,?,?,?,?)')
    .bind(c.id,session.email,b64url(c.publicKey),Number(c.counter)||0,JSON.stringify(c.transports||[])).run();
  }catch{return err('Ese dispositivo ya está registrado',409)}
  return ok({registered:true,method:'passkey'});
 }
 if(path==='/api/customer/passkeys/login/options'){
  const ip=req.headers.get('CF-Connecting-IP')||'unknown';
  if(!await limited(env,ip,String(p.phone||'')))return err('Demasiados intentos. Probá más tarde.',429);
  let person;try{person=await accountByPhone(env,p.phone)}catch{return err('Ingresá un celular válido')}
  if(!person)return err('No hay una passkey vinculada a ese teléfono. Podés entrar por correo.',404);
  const keys=await env.DB.prepare('SELECT credential_id,transports FROM customer_passkeys WHERE email=? LIMIT 10').bind(person.email).all();
  if(!(keys.results||[]).length)return err('Todavía no activaste la huella. Entrá con un código por correo.',404);
  const {generateAuthenticationOptions}=await import('@simplewebauthn/server');
  const options=await generateAuthenticationOptions({
   rpID,userVerification:'required',
   allowCredentials:keys.results.map(k=>({id:k.credential_id,transports:JSON.parse(k.transports||'[]')}))
  });
  const challengeId=crypto.randomUUID();
  await lease(env,challengeId,person.email,'authentication',options.challenge);
  return ok({challengeId,options});
 }
 if(path==='/api/customer/passkeys/login/verify'){
  if(!validCredentialShape(p.credential))return err('Credencial inválida');
  if(typeof p.challengeId!=='string'||!p.challengeId.match(/^[a-f0-9-]{36}$/))return err('Solicitud vencida',401);
  // El identificador del desafío liga la passkey a un email sin confiar en el teléfono.
  const stored=await env.DB.prepare('SELECT email FROM customer_passkey_challenges WHERE id=? AND purpose=? AND consumed_at IS NULL AND expires_at>unixepoch()').bind(p.challengeId,'authentication').first();
  if(!stored)return err('Solicitud vencida',401);
  const challenge=await consume(env,p.challengeId,stored.email,'authentication');
  if(!challenge)return err('Solicitud vencida',401);
  const passkey=await env.DB.prepare('SELECT credential_id,public_key,counter,transports FROM customer_passkeys WHERE credential_id=? AND email=?').bind(p.credential.id,stored.email).first();
  if(!passkey)return err('Dispositivo no reconocido',401);
  const {verifyAuthenticationResponse}=await import('@simplewebauthn/server');
  let result;
  try{
   result=await verifyAuthenticationResponse({
    response:p.credential,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,
    requireUserVerification:true,
    credential:{id:passkey.credential_id,publicKey:from64(passkey.public_key),
     counter:Number(passkey.counter)||0,transports:JSON.parse(passkey.transports||'[]')}
   });
  }catch{return err('No pudimos comprobar la huella. Usá el código por correo.',401)}
  if(!result.verified)return err('No se pudo validar la identidad',401);
  await env.DB.prepare('UPDATE customer_passkeys SET counter=?,last_used_at=unixepoch() WHERE credential_id=? AND email=?')
   .bind(result.authenticationInfo.newCounter,passkey.credential_id,stored.email).run();
  const user=await env.DB.prepare('SELECT email,name,phone FROM customers WHERE email=?').bind(stored.email).first();
  if(!user)return err('Cuenta no encontrada',404);
  const session=await createCustomerSession(env,user.email);
  return ok({sessionToken:session.token,expiresAt:session.expiresAt,
   profile:{email:user.email,name:user.name,phone:user.phone},method:'passkey'});
 }
 if(path==='/api/customer/passkeys/delete'){
  const session=await customerSession(req,env);
  if(!session)return err('Iniciá sesión',401);
  if(typeof p.credentialId!=='string')return err('Elegí el dispositivo');
  await env.DB.prepare('DELETE FROM customer_passkeys WHERE credential_id=? AND email=?').bind(p.credentialId,session.email).run();
  return ok({removed:true});
 }
 return null;
}
export async function customerPasskeyRoutes(req,env,path,send){
 if(!path.startsWith('/api/customer/passkeys/'))return null;
 if(req.method!=='POST')return send({error:'Método no permitido'},405);
 try{
  const result=await passkeyRoutesImpl(req,env,path);
  return result?send(result.data,result.status):null;
 }catch{
  return send({error:'No se pudo completar la autenticación. Podés ingresar con tu correo.'},503);
 }
}
