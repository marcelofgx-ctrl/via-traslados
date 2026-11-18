// QA-only. Partir de bytes publicados V29; abortar si cambian los hashes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='https://viatraslados.com/';
const sources={
 'app.js?v=29':'2801344d2589c045b272482967098c701cebbe7e0d6aa13ec48ea76593f7a3c3',
 'mis-reservas.html':'ca8cb66fbf09a45fb2262eaf04ca0e8a89f53b81d8d269ac1ac2b38f9333e089'
};
const sha=v=>createHash('sha256').update(v).digest('hex');
async function get(path){
 const response=await fetch(origin+path,{signal:AbortSignal.timeout(25000)});
 assert.equal(response.status,200,path+' HTTP '+response.status);
 const body=await response.text();
 assert.equal(sha(body),sources[path],'Cambió la fuente real '+path);
 return body;
}
let app=await get('app.js?v=29'),html=await get('mis-reservas.html');
function once(subject,needle,replacement,why){
 assert.equal(subject.split(needle).length,2,'Ancla V29 no única: '+why);
 return subject.replace(needle,replacement);
}
const drawStart=app.indexOf(' async function draw(){');
const drawEnd=app.indexOf(' function turnstile(){',drawStart);
assert(drawStart>0&&drawEnd>drawStart,'Sin función draw de Mis reservas');
const oldDraw=app.slice(drawStart,drawEnd);
assert(oldDraw.includes("welcome?.classList.toggle('hidden',!person)")&&oldDraw.includes('mineRows=await S.mine()'),'Se modificó la vista original');
const drawNew=[
 " let mineDrawEpoch=0,signupMode=false,signupEmail='',signupCaptchaToken='',signupCaptchaReady=false,signupGeneration=0;",
 " async function draw(){",
 "  const seq=++mineDrawEpoch,account=S.customer(),person=account?.profile;",
 "  login?.classList.toggle('hidden',!!person||signupMode);",
 "  $('mine-signup-card')?.classList.toggle('hidden',!!person||!signupMode);",
 "  welcome?.classList.toggle('hidden',!person);",
 "  $('mine-identity-choice')?.classList.toggle('hidden',!!person);",
 "  if(!person){",
 "   mineRows=[];tabs?.classList.add('hidden');more?.classList.add('hidden');",
 "   $('mine-greeting').textContent='';",
 "   container.textContent='Ingresá con otra cuenta o registrate para consultar tus viajes.';",
 "   return;",
 "  }",
 "  const first=String(person.name||'').trim().split(/\\s+/)[0]||'';",
 "  $('mine-greeting').textContent='Hola, '+first;",
 "  try{",
 "   const rows=await S.mine();",
 "   if(seq!==mineDrawEpoch||S.customer()?.sessionToken!==account.sessionToken)return;",
 "   mineRows=Array.isArray(rows)?rows:[];",
 "   tabs?.classList.remove('hidden');displayRows();",
 "  }catch(e){",
 "   if(seq===mineDrawEpoch&&S.customer()?.sessionToken===account.sessionToken)",
 "    container.textContent='No pudimos consultar tus viajes. Revisá tu conexión e intentá ingresar de nuevo.';",
 "  }",
 " }",
 ""].join('\n');
app=app.slice(0,drawStart)+drawNew+app.slice(drawEnd);
const handlerStart=app.indexOf(" $('mine-logout')?.addEventListener('click',async()=>{");
const handlerEnd=app.indexOf(' await draw();\n await S.resume();',handlerStart);
assert(handlerStart>0&&handlerEnd>handlerStart,'Falta handler logout original');
const handlerOld=app.slice(handlerStart,handlerEnd);
assert(handlerOld.includes("await S.logout();note('Sesión cerrada."),'Logout anterior distinto');
const handlerNew=[
 " $('mine-logout')?.addEventListener('click',async()=>{",
 "  const button=$('mine-logout');button.disabled=true;",
 "  signupMode=false;signupGeneration++;",
 "  const revoke=S.logout();",
 "  $('mine-login-phone').value='';",
 "  $('mine-login-code').value='';",
 "  $('mine-login-verify')?.classList.add('hidden');",
 "  $('mine-greeting').textContent='';",
 "  mineTab='active';mineLimit=5;mineRows=[];",
 "  await draw();",
 "  try{await revoke}finally{",
 "   note('Sesión cerrada. Elegí una cuenta existente o registrate como nuevo usuario.');",
 "   turnstileLoaded=false;turnstile();button.disabled=false;",
 "  }",
 " });",
 " function signupMessage(message){$('mine-signup-feedback').textContent=message||'';}",
 " function signupCaptcha(){",
 "  const key=window.VIA_CONFIG?.turnstileSiteKey;",
 "  if(!key||signupCaptchaReady||S.isDemo())return;",
 "  signupCaptchaReady=true;",
 "  const render=()=>{if(!window.turnstile)return;window.turnstile.render('#mine-signup-turnstile',{sitekey:key,action:'otp',callback:t=>{signupCaptchaToken=t},'expired-callback':()=>{signupCaptchaToken=''}})};",
 "  if(window.turnstile){render();return}",
 "  const js=document.createElement('script');js.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';",
 "  js.async=true;js.defer=true;js.onload=render;document.head.appendChild(js);",
 " }",
 " $('mine-existing')?.addEventListener('click',async()=>{signupMode=false;signupGeneration++;signupMessage('');await draw();$('mine-login-phone')?.focus({preventScroll:true})});",
 " $('mine-new')?.addEventListener('click',async()=>{signupMode=true;signupGeneration++;note('');await draw();signupCaptcha();});",
 " $('mine-signup-send')?.addEventListener('click',async()=>{",
 "  const name=$('mine-signup-name').value.trim(),phone=$('mine-signup-phone').value.trim(),email=$('mine-signup-email').value.trim().toLowerCase();",
 "  if(name.length<2||!/^\\+?[\\d\\s()\\-]{7,30}$/.test(phone)||!/^\\S+@\\S+\\.\\S+$/.test(email)){signupMessage('Completá nombre, celular y correo válidos.');return;}",
 "  if(window.VIA_CONFIG?.turnstileSiteKey&&!signupCaptchaToken){signupMessage('Completá la verificación de seguridad.');return;}",
 "  const generation=++signupGeneration,button=$('mine-signup-send');button.disabled=true;",
 "  signupMessage('Enviando el código de verificación…');",
 "  try{",
 "   const result=await S.startVerification(email,signupCaptchaToken);",
 "   if(generation!==signupGeneration||!signupMode)return;",
 "   signupEmail=(result.email||email).toLowerCase();",
 "   $('mine-signup-verify').classList.remove('hidden');",
 "   signupMessage('Revisá el correo y escribí el código de seis cifras.');",
 "  }catch(e){if(generation===signupGeneration)signupMessage(e.message||'No se pudo enviar el código.');}",
 "  finally{button.disabled=false}",
 " });",
 " $('mine-signup-confirm')?.addEventListener('click',async()=>{",
 "  const code=$('mine-signup-code').value.trim();",
 "  if(!/^\\d{6}$/.test(code)){signupMessage('Ingresá las seis cifras del correo.');return}",
 "  const generation=signupGeneration,button=$('mine-signup-confirm');button.disabled=true;",
 "  const profile={name:$('mine-signup-name').value.trim(),phone:$('mine-signup-phone').value.trim()};",
 "  signupMessage('Verificando tu nueva cuenta…');",
 "  try{",
 "   await S.verifyCode(signupEmail,code,profile);",
 "   if(generation!==signupGeneration||!signupMode)return;",
 "   if(!S.customer())throw Error('No se pudo completar el registro.');",
 "   $('mine-signup-code').value='';signupEmail='';signupMode=false;signupGeneration++;",
 "   signupMessage('');await draw();",
 "  }catch(e){if(generation===signupGeneration)signupMessage(e.message||'El código no fue aceptado.');}",
 "  finally{button.disabled=false}",
 " });",
 " window.addEventListener('via-customer-session',()=>{void draw()});",
 " window.addEventListener('storage',event=>{if(event.key==='via-customer-session-v1')void draw()});",
 ""].join('\n');
app=app.slice(0,handlerStart)+handlerNew+app.slice(handlerEnd);
const choice=[
 '<nav id="mine-identity-choice" class="via-mine-identity-choice hidden" aria-label="Elegir cómo ingresar">',
 '<button id="mine-existing" type="button" class="via-mine-choice via-mine-choice--existing" aria-controls="mine-login-card">Ya tengo cuenta</button>',
 '<button id="mine-new" type="button" aria-controls="mine-signup-card" class="via-mine-choice via-mine-choice--new">Soy nuevo · Registrarme</button>',
 '</nav>',
 '<section id="mine-login-card" class="mine-login-card"'
].join('\n');
html=once(html,'<section id="mine-login-card" class="mine-login-card"',choice,'opciones A/B');
const signupSection=[
 '<section id="mine-signup-card" class="mine-login-card hidden" aria-label="Crear cuenta nueva">',
 '<h2>Crear cuenta nueva</h2>',
 '<p>Registrate una sola vez. Después vas a poder iniciar sesión con tu celular y el código del correo, sin pedir un viaje ahora.</p>',
 '<label class="control"><span class="field-label">NOMBRE Y APELLIDO</span><input id="mine-signup-name" type="text" autocomplete="name" maxlength="100" placeholder="Nombre y apellido"></label>',
 '<label class="control"><span class="field-label">CELULAR</span><input id="mine-signup-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="099 123 456"></label>',
 '<label class="control"><span class="field-label">CORREO ELECTRÓNICO</span><input id="mine-signup-email" type="email" autocomplete="email" maxlength="160" placeholder="tu-correo@ejemplo.com"></label>',
 '<div id="mine-signup-turnstile" class="turnstile-container"></div>',
 '<button id="mine-signup-send" type="button" class="return-primary">Enviar código al correo</button>',
 '<div id="mine-signup-verify" class="hidden"><label class="control"><span class="field-label">CÓDIGO DEL CORREO</span><input id="mine-signup-code" type="text" autocomplete="one-time-code" inputmode="numeric" maxlength="6" placeholder="6 cifras"></label><button id="mine-signup-confirm" type="button" class="return-primary">Crear mi cuenta</button></div>',
 '<p id="mine-signup-feedback" role="status" aria-live="polite"></p>',
 '</section>'
].join('\\n');
html=once(html,'</section><div id="mine-tabs"', '</section>'+signupSection+'<div id="mine-tabs"','nuevo registro independiente');
html=once(html,'id="mine-login-phone" type="tel" autocomplete="tel"','id="mine-login-phone" type="tel" autocomplete="off"','sin teléfono anterior');
html=once(html,'<script src="./app.js?v=29"></script>','<script src="./app.js?v=29-mineqa1"></script>','cache JS');
html=once(html,'</head><body data-page="mine">','<link rel="stylesheet" href="./mine-identity-qa.css?v=1"></head><body data-page="mine">','estilo QA');
const css=[
 '/* Corrección local de visibilidad CSS: no afecta el resto del sitio. */',
 'body[data-page="mine"] #mine-welcome.hidden,',
 'body[data-page="mine"] #mine-login-card.hidden,',
 'body[data-page="mine"] #mine-signup-card.hidden,',
 'body[data-page="mine"] #mine-signup-verify.hidden,',
 'body[data-page="mine"] #mine-identity-choice.hidden,',
 'body[data-page="mine"] #mine-tabs.hidden,',
 'body[data-page="mine"] #mine-more.hidden {display:none !important;}',
 'body[data-page="mine"] .via-mine-identity-choice {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0 14px;width:100%;}',
 'body[data-page="mine"] .via-mine-choice {display:flex;align-items:center;justify-content:center;min-width:0;min-height:45px;padding:8px 9px;border-radius:11px;font-size:12px;font-weight:700;line-height:1.3;text-decoration:none;text-align:center;border:1px solid #b6d3c7;color:#316956;background:#f7fcf9;box-sizing:border-box;cursor:pointer;}',
 'body[data-page="mine"] .via-mine-choice--existing {background:#006a59;color:#fff;border-color:#006a59;}',
 'body[data-page="mine"] #mine-login-phone {scroll-margin-top:18px;}',
 'body[data-page="mine"] #mine-signup-card .control {display:block;margin:10px 0;}',
 'body[data-page="mine"] #mine-signup-card button.return-primary {min-height:45px;width:100%;margin:8px 0;}',
 'body[data-page="mine"] #mine-signup-feedback {min-height:20px;font-size:12px;line-height:1.45;}',
 ''].join('\n');
await mkdir('dist',{recursive:true});
await Promise.all([
 writeFile('dist/via-mine-app-qa.js',app),
 writeFile('dist/via-mine-html-qa.html',html),
 writeFile('dist/via-mine-css-qa.css',css)
]);
console.log('MINE_SESSION_QA_PATCH_READY '+JSON.stringify({
 appOriginal:sources['app.js?v=29'],appNew:sha(app),htmlOriginal:sources['mis-reservas.html'],
 htmlNew:sha(html),cssNew:sha(css),stage:'QA_ONLY'
}));
