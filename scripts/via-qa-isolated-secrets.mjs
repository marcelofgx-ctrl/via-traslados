// Solo agrega secretos a via-traslados-api-auth-qa-20261121, nunca a Workers productivos.
// Los secretos existentes no se leen ni se rotan. No imprimir ningún valor.
import {randomBytes} from 'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID||'',T=process.env.CLOUDFLARE_API_TOKEN||'';
const WORKER='via-traslados-api-auth-qa-20261121';
if(!/^[a-f0-9]{32}$/i.test(A)||T.length<20||!WORKER.endsWith('-qa-20261121'))throw Error('Guardia: configuración Cloudflare inválida');
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+A+'/workers/scripts/'+WORKER+'/secrets';
async function cf(method,payload){
 const response=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+T,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
 const data=await response.json();
 if(!response.ok||!data.success)throw Error('QA secrets API HTTP '+response.status+' '+(data.errors||[]).map(x=>x.code).join(','));
 return data.result;
}
const list=await cf('GET');
if(!Array.isArray(list))throw Error('No se pudo verificar la lista de secretos QA');
const existing=new Set(list.map(x=>x.name));
async function put(name,text){
 if(!text){console.log('QA_SECRET_MISSING',name);return}
 if(existing.has(name)){console.log('QA_SECRET_ALREADY_PRESENT',name);return}
 await cf('PUT',{name,text,type:'secret_text'});
 console.log('QA_SECRET_INSTALLED',name);
}
await put('OTP_PEPPER',existing.has('OTP_PEPPER')?'':randomBytes(64).toString('hex'));
for(const [name,key] of [
 ['RESEND_API_KEY','VIA_QA_RESEND_API_KEY'],
 ['TURNSTILE_SECRET_KEY','VIA_QA_TURNSTILE_SECRET_KEY'],
 ['VIA_GEOAPIFY_API_KEY','VIA_QA_GEOAPIFY_API_KEY'],
 ['VIA_QA_TEST_EMAILS','VIA_QA_TEST_EMAILS']
]){
 if(!existing.has(name))await put(name,(process.env[key]||'').trim());
}
console.log('QA_SECRET_STATUS',JSON.stringify({
 otpPepper:existing.has('OTP_PEPPER')?'existing':'new_if_missing',
 resend:existing.has('RESEND_API_KEY')||Boolean(process.env.VIA_QA_RESEND_API_KEY),
 turnstile:existing.has('TURNSTILE_SECRET_KEY')||Boolean(process.env.VIA_QA_TURNSTILE_SECRET_KEY),
 geoapify:existing.has('VIA_GEOAPIFY_API_KEY')||Boolean(process.env.VIA_QA_GEOAPIFY_API_KEY)
}));
