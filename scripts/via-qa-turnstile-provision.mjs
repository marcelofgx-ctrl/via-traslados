// Creates exactly one Cloudflare Turnstile widget for the isolated QA hostname.
// NEVER reads, changes or rotates production widgets or production Worker secrets.
import fs from 'node:fs';
const account=(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const host='via-traslados-current-prod-qa.marcelof-gx.workers.dev';
const name='Via Traslados Real Auth QA 20261121';
const worker='via-traslados-api-auth-qa-20261121';
if(!/^[a-f0-9]{32}$/i.test(account)||!token)throw Error('Cloudflare account/token not available');
const root='https://api.cloudflare.com/client/v4/accounts/'+account;
async function api(method,path,body){
 const resp=await fetch(root+path,{
  method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const value=await resp.json();
 if(resp.status===403)throw Error('QA_TURNSTILE_PERMISSION_REQUIRED: add Account Turnstile Edit to token or provide separate QA Turnstile keys');
 if(!resp.ok||!value.success)throw Error('Cloudflare QA Turnstile HTTP '+resp.status+' '+(value.errors||[]).map(x=>x.code).join(','));
 return value.result;
}
const items=await api('GET','/challenges/widgets');
if(!Array.isArray(items))throw Error('Turnstile widget list unexpected: abort without changes');
const matches=items.filter(x=>x.name===name);
if(matches.length>1)throw Error('QA Turnstile name is not unique');
let widget=matches[0];
let freshlyCreated=false;
if(!widget){
 widget=await api('POST','/challenges/widgets',{name,domains:[host],mode:'managed'});
 freshlyCreated=true;
 console.log('QA_TURNSTILE_WIDGET_CREATED');
}else{
 if(!Array.isArray(widget.domains)||!widget.domains.includes(host))throw Error('Existing QA widget hostname mismatch: refusing change');
 console.log('QA_TURNSTILE_WIDGET_REUSED');
}
const sitekey=widget.sitekey;
if(!/^0x[a-zA-Z0-9]{15,100}$/.test(sitekey||''))throw Error('Cloudflare did not return QA site key');
const secrets=await api('GET','/workers/scripts/'+worker+'/secrets');
if(!Array.isArray(secrets))throw Error('Cannot inspect QA Worker secret names');
if(!secrets.some(x=>x.name==='TURNSTILE_SECRET_KEY')){
 const secret=widget.secret;
 if(!freshlyCreated||typeof secret!=='string'||secret.length<10)
  throw Error('QA widget exists but its secret cannot be recovered: provide VIA_QA_TURNSTILE_SECRET_KEY');
 await api('PUT','/workers/scripts/'+worker+'/secrets',{name:'TURNSTILE_SECRET_KEY',type:'secret_text',text:secret});
 console.log('QA_TURNSTILE_SECRET_INSTALLED');
}else console.log('QA_TURNSTILE_SECRET_ALREADY_CONFIGURED');
fs.mkdirSync('.qa',{recursive:true});
fs.writeFileSync('.qa/qa-sitekey.txt',sitekey+'\n');
console.log('QA_TURNSTILE_SITE_KEY',sitekey);
console.log('QA_TURNSTILE_HOST_ALLOWED',host);
