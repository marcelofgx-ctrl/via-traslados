import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=process.env.MINE_ASSETS||'mine-v2916-build/assets';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Ancla no única: '+a.slice(0,100));return s.replace(a,b)};
let html=await readFile(root+'/mis-reservas.html','utf8');
let app=await readFile(root+'/app.js','utf8');
assert(html.includes('mine-identity-v291.css?v=1'));
html=once(html,'mine-identity-v291.css?v=1','mine-identity-v291.css?v=2');
html=once(html,'app.js?v=29.1','app.js?v=29.3');
html=once(html,'<span class="via-mine-entry-hero__eyebrow">ACCESO PERSONAL</span>\n<h2>Tus viajes, en un solo lugar.</h2>\n<p>Ingresá o creá tu cuenta para gestionar tus traslados.</p>',
 '<p>Ingresá para consultar tus reservas.</p>');
for(const [id,label] of [['mine-existing','Ingresar'],['mine-new','Crear cuenta']]){
 const pattern=new RegExp('(<button id="'+id+'"[^>]*>).*?(</button>)');
 assert.equal([...html.matchAll(new RegExp(pattern.source,'g'))].length,1);
 html=html.replace(pattern,'$1<strong>'+label+'</strong>$2');
}
html=once(html,'Completá tus datos y verificá tu correo. No necesitás reservar un viaje.',
 'Completá tus datos y verificá tu correo.');
html=once(html,'<div id="mine-welcome"',
 '<p id="mine-session-status" class="hidden" role="status" aria-live="polite"></p>\n<div id="mine-welcome"');
// Solo initMine: no modificar wizard, reservas, tarifas, GPS, OTP ni Store.
const start=app.indexOf('async function initMine(){'),end=app.indexOf('\nconst page=document.body.dataset.page;',start);
assert(start>0&&end>start);
let mine=app.slice(start,end);
mine=once(mine,' async function draw(){\n  const seq=++mineDrawEpoch,account=S.customer(),person=account?.profile;',
` let mineVerifiedToken=null,mineValidatingToken=null,mineAuthEpoch=0,mineChecking=false;
 async function refreshMineIdentity(){
  const epoch=++mineAuthEpoch,token=S.customer()?.sessionToken||null;
  mineVerifiedToken=null;mineValidatingToken=token;mineChecking=!!token;
  // Vaciar datos de la cuenta anterior antes de esperar una respuesta.
  mineRows=[];container.textContent='';tabs?.classList.add('hidden');more?.classList.add('hidden');
  await draw();
  if(epoch!==mineAuthEpoch||!token)return;
  let profile=null;
  try{profile=await S.resume()}catch{}
  if(epoch!==mineAuthEpoch)return;
  mineValidatingToken=null;mineChecking=false;
  if(profile&&S.customer()?.sessionToken===token)mineVerifiedToken=token;
  await draw();
  if(!mineVerifiedToken)turnstile();
 }
 async function draw(){
  const seq=++mineDrawEpoch,account=S.customer();
  const person=account?.sessionToken===mineVerifiedToken?account.profile:null;
  const state=$('mine-session-status');
  state?.classList.toggle('hidden',!mineChecking);
  if(state)state.textContent=mineChecking?'Comprobando tu sesión…':'';`);
mine=once(mine,"login?.classList.toggle('hidden',!!person||authMode!=='login');", "login?.classList.toggle('hidden',mineChecking||!!person||authMode!=='login');");
mine=once(mine,"$('mine-signup-card')?.classList.toggle('hidden',!!person||authMode!=='signup');", "$('mine-signup-card')?.classList.toggle('hidden',mineChecking||!!person||authMode!=='signup');");
mine=once(mine,"$('mine-identity-choice')?.classList.toggle('hidden',!!person);", "$('mine-identity-choice')?.classList.toggle('hidden',mineChecking||!!person);");
mine=once(mine,"$('mine-entry-hero')?.classList.toggle('hidden',!!person||authMode!=='choice');", "$('mine-entry-hero')?.classList.toggle('hidden',mineChecking||!!person||authMode!=='choice');");
mine=once(mine,"$('mine-greeting').textContent='Hola, '+first;", "$('mine-greeting').textContent=first?'Hola, '+first:'Tu cuenta';");
mine=once(mine,"if(S.isDemo()||S.customer()||turnstileLoaded||!window.VIA_CONFIG?.turnstileSiteKey)return;",
 "if(S.isDemo()||mineVerifiedToken||mineChecking||turnstileLoaded||!window.VIA_CONFIG?.turnstileSiteKey)return;");
mine=once(mine,"if(seq!==mineDrawEpoch||S.customer()?.sessionToken!==account.sessionToken)return;",
 "if(seq!==mineDrawEpoch)return;\n   if(S.customer()?.sessionToken!==account.sessionToken){void refreshMineIdentity();return}");
mine=once(mine,"window.addEventListener('via-customer-session',()=>{if(S.customer()){authMode='choice';signupMode=false;}void draw()});\n window.addEventListener('storage',event=>{if(event.key==='via-customer-session-v1')void draw()});\n await draw();\n await S.resume();\n await draw();",
`window.addEventListener('via-customer-session',()=>{
  const token=S.customer()?.sessionToken||null;
  if(token){authMode='choice';signupMode=false;}
  // resume actualiza el perfil y emite este mismo evento: evitar recursión.
  if(token&&token===mineValidatingToken)return;
  if(token&&token===mineVerifiedToken){void draw();return}
  void refreshMineIdentity();
 });
 window.addEventListener('storage',event=>{
  if(event.key===null||event.key==='via-customer-session-v1')void refreshMineIdentity();
 });
 await refreshMineIdentity();`);
assert.equal(app.slice(0,start).includes('mineVerifiedToken'),false);
app=app.slice(0,start)+mine+app.slice(end);
await mkdir(root,{recursive:true});
await writeFile(root+'/app.js',app);
await writeFile(root+'/mis-reservas.html',html);
await writeFile(root+'/mine-identity-v291.css',await readFile('scripts/via-mine-v2916.css'));
console.log('MINE_V2916_PATCHED_ONLY_APP_MINE_HTML_CSS');
