const enc=new TextEncoder();
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
export function normalizeEmail(s){if(typeof s!=='string')throw Error('Correo inválido');s=s.trim().toLowerCase();if(s.length>200||!/^[a-z0-9.!#$%&'*+/=?^`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(s))throw Error('Correo inválido');return s}
export const maskEmail=s=>{let [a,b]=s.split('@');return a.slice(0,2)+'•••@'+b};
export const emailOtpAvailable=e=>Boolean(e.DB&&e.PUBLIC_ORIGIN&&e.TURNSTILE_SECRET_KEY&&e.RESEND_API_KEY&&e.RESEND_FROM&&e.OTP_PEPPER?.length>=32);
async function read(req){if(Number(req.headers.get('Content-Length')||0)>3000)throw Error('Solicitud demasiado grande');const raw=await req.text();if(raw.length>3000)throw Error('Solicitud demasiado grande');const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Datos inválidos');return data}
async function rate(env,key,limit,seconds){const k=await sha(key);const r=await env.DB.prepare('INSERT INTO otp_rate_limits (rate_key,window_started,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(rate_key) DO UPDATE SET window_started=CASE WHEN unixepoch()-window_started>=? THEN unixepoch() ELSE window_started END,attempts=CASE WHEN unixepoch()-window_started>=? THEN 1 ELSE attempts+1 END RETURNING attempts').bind(k,seconds,seconds).first();return Number(r?.attempts||0)<=limit}
async function digest(pepper,email,code){const key=await crypto.subtle.importKey('raw',enc.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(email+':'+code)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
function code(){const b=new Uint32Array(1);crypto.getRandomValues(b);return String(100000+(b[0]%900000))}
export async function challenge(req,env,token){if(typeof token!=='string'||token.length<4||token.length>2048)return false;const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:req.headers.get('CF-Connecting-IP')||''})});if(!r.ok)return false;const j=await r.json();return j.success===true&&j.action==='otp'&&j.hostname===new URL(env.PUBLIC_ORIGIN).hostname}
const result=(data,status=200)=>({data,status});
export async function beginOtp(req,env,{captchaVerified=false}={}){
 if(!emailOtpAvailable(env))return result({error:'Verificación no habilitada'},503);
 let p,email;try{p=await read(req);email=normalizeEmail(p.email)}catch{return result({error:'Datos incorrectos'},400)}
 if(p.website)return result({error:'Solicitud rechazada'},400);
 if(!captchaVerified&&!await challenge(req,env,p.turnstileToken))return result({error:'Completá la comprobación de seguridad'},403);
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await rate(env,'start-email:'+email,3,900)||!await rate(env,'start-ip:'+ip,8,900)||!await rate(env,'start-global',25,86400))return result({error:'Límite de códigos alcanzado'},429);
 const otp=code(),hash=await digest(env.OTP_PEPPER,email,otp);
 await env.DB.prepare('INSERT INTO email_otp_codes (email,code_hash,expires_at,attempts,sent_at) VALUES (?,?,unixepoch()+600,0,unixepoch()) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at').bind(email,hash).run();
 let sent=false;try{
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'via-otp-'+crypto.randomUUID()},body:JSON.stringify({from:env.RESEND_FROM,to:[email],subject:'Tu código de Vía Traslados',text:'Tu código de verificación es: '+otp+'\n\nVence en 10 minutos. No lo compartas.'})});const body=await r.json();sent=r.ok&&Boolean(body.id)
 }catch{}
 if(!sent){await env.DB.prepare('DELETE FROM email_otp_codes WHERE email=? AND code_hash=?').bind(email,hash).run();return result({error:'No se pudo enviar el correo'},502)}
 return result({email,maskedEmail:maskEmail(email),sent:true})
}
export async function checkOtp(req,env){
 if(!emailOtpAvailable(env))return result({error:'Verificación no habilitada'},503);
 let p,email;try{p=await read(req);email=normalizeEmail(p.email)}catch{return result({error:'Datos incorrectos'},400)}
 const otp=String(p.code??'');if(!/^\d{6}$/.test(otp))return result({error:'Ingresá seis cifras'},400);
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(!await rate(env,'verify-email:'+email,10,900)||!await rate(env,'verify-ip:'+ip,30,900))return result({error:'Demasiados intentos'},429);
 const row=await env.DB.prepare('UPDATE email_otp_codes SET attempts=attempts+1 WHERE email=? AND attempts<5 AND expires_at>unixepoch() RETURNING code_hash').bind(email).first();
 const hash=await digest(env.OTP_PEPPER,email,otp);
 if(row?.code_hash!==hash||!row)return result({error:'Código incorrecto o vencido'},401);
 const deleted=await env.DB.prepare('DELETE FROM email_otp_codes WHERE email=? AND code_hash=? AND expires_at>unixepoch() RETURNING email').bind(email,hash).first();
 if(!deleted?.email)return result({error:'Código incorrecto o vencido'},401);
 const token=random();
 await env.DB.prepare('INSERT INTO email_verified_sessions (token_hash,email,expires_at) VALUES (?,?,unixepoch()+900)').bind(await sha(token),email).run();
 return result({email,verificationToken:token,verified:true})
}
export async function consumeVerifiedSession(req,env,email){
 const token=req.headers.get('X-Verification-Token')||'';if(!/^[a-f0-9]{64}$/.test(token))return false;
 const r=await env.DB.prepare('UPDATE email_verified_sessions SET consumed_at=unixepoch() WHERE token_hash=? AND email=? AND consumed_at IS NULL AND expires_at>unixepoch() RETURNING email').bind(await sha(token),email).first();
 return Boolean(r?.email)
}
