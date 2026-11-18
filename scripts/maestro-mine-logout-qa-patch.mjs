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
 " let mineDrawEpoch=0,authMode='choice',signupMode=false,signupEmail='',signupCaptchaToken='',signupCaptchaReady=false,signupGeneration=0;",
 " async function draw(){",
 "  const seq=++mineDrawEpoch,account=S.customer(),person=account?.profile;",
 "  login?.classList.toggle('hidden',!!person||authMode!=='login');",
 "  $('mine-signup-card')?.classList.toggle('hidden',!!person||authMode!=='signup');",
 "  welcome?.classList.toggle('hidden',!person);",
 "  $('mine-identity-choice')?.classList.toggle('hidden',!!person);",
 "  $('mine-entry-hero')?.classList.toggle('hidden',!!person||authMode!=='choice');",
 "  $('mine-existing')?.classList.toggle('is-selected',!person&&authMode==='login');",
 "  $('mine-new')?.classList.toggle('is-selected',!person&&authMode==='signup');",
 "  $('mine-existing')?.setAttribute('aria-pressed',String(!person&&authMode==='login'));",
 "  $('mine-new')?.setAttribute('aria-pressed',String(!person&&authMode==='signup'));",
 "  container.classList.toggle('hidden',!person);",
 "  if(!person){",
 "   mineRows=[];tabs?.classList.add('hidden');more?.classList.add('hidden');",
 "   $('mine-greeting').textContent='';",
 "   container.textContent='';",
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
 "  authMode='choice';signupMode=false;signupGeneration++;",
 "  const revoke=S.logout();",
 "  $('mine-login-phone').value='';",
 "  $('mine-login-code').value='';",
 "  $('mine-login-verify')?.classList.add('hidden');",
 "  $('mine-greeting').textContent='';",
 "  mineTab='active';mineLimit=5;mineRows=[];",
 "  await draw();",
 "  try{await revoke}finally{",
 "   note('');",
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
 " $('mine-existing')?.addEventListener('click',async()=>{authMode='login';signupMode=false;signupGeneration++;signupMessage('');note('');await draw();$('mine-login-phone')?.focus({preventScroll:true})});",
 " $('mine-new')?.addEventListener('click',async()=>{authMode='signup';signupMode=true;signupGeneration++;note('');await draw();signupCaptcha();});",
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
 "   signupMessage(window.VIA_QA_SYNTHETIC_OTP?'QA: no se envía correo. Usá el código de prueba 123456.':'Revisá el correo y escribí el código de seis cifras.');",
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
 "   $('mine-signup-code').value='';signupEmail='';authMode='choice';signupMode=false;signupGeneration++;",
 "   signupMessage('');await draw();",
 "  }catch(e){if(generation===signupGeneration)signupMessage(e.message||'El código no fue aceptado.');}",
 "  finally{button.disabled=false}",
 " });",
 " window.addEventListener('via-customer-session',()=>{if(S.customer()){authMode='choice';signupMode=false;}void draw()});",
 " window.addEventListener('storage',event=>{if(event.key==='via-customer-session-v1')void draw()});",
 ""].join('\n');
app=app.slice(0,handlerStart)+handlerNew+app.slice(handlerEnd);
// En QA el código de cuenta existente también es sintético; en PROD
// continúa siendo obligatoria la verificación Turnstile real.
app=once(app,
 "if(!S.isDemo()&&!captchaToken){note('Completá la comprobación de seguridad para enviar el correo.');return}",
 "if(!S.isDemo()&&!window.VIA_QA_SYNTHETIC_OTP&&!captchaToken){note('Completá la comprobación de seguridad para enviar el correo.');return}",
 'captcha: exigir Turnstile real salvo QA sintética');
app=once(app,
 "note(S.isDemo()?'DEMO: usá el código 123456. No se envió ningún correo.':'Código enviado a '+(result.maskedEmail||'tu correo asociado')+'.');",
 "note(window.VIA_QA_SYNTHETIC_OTP?'QA: no se envía correo. Usá el código de prueba 123456.':(S.isDemo()?'DEMO: usá el código 123456. No se envió ningún correo.':'Código enviado a '+(result.maskedEmail||'tu correo asociado')+'.'));",
 'aviso OTP solo QA');

const choice=[
 "<div id=\"mine-entry-hero\" class=\"via-mine-entry-hero\">",
 "<span class=\"via-mine-entry-hero__eyebrow\">ACCESO PERSONAL</span>",
 "<h2>Tus viajes, en un solo lugar.</h2>",
 "<p>Ingresá o creá tu cuenta para gestionar tus traslados.</p>",
 "</div>",
 "<nav id=\"mine-identity-choice\" class=\"via-mine-identity-choice hidden\" aria-label=\"Elegí cómo continuar\">",
 "<button id=\"mine-existing\" type=\"button\" class=\"via-mine-choice\" aria-pressed=\"false\" aria-controls=\"mine-login-card\"><span class=\"via-mine-choice__eyebrow\">YA VIAJASTE</span><strong>Ya tengo cuenta</strong><span class=\"via-mine-choice__hint\">Ingresar <span aria-hidden=\"true\">↗</span></span></button>",
 "<button id=\"mine-new\" type=\"button\" class=\"via-mine-choice\" aria-pressed=\"false\" aria-controls=\"mine-signup-card\"><span class=\"via-mine-choice__eyebrow\">PRIMERA VEZ</span><strong>Soy nuevo</strong><span class=\"via-mine-choice__hint\">Crear cuenta <span aria-hidden=\"true\">↗</span></span></button>",
 "</nav>",
 "<section id=\"mine-login-card\" class=\"mine-login-card hidden\""
].join('\n');
html=once(html,'<section id="mine-login-card" class="mine-login-card"',choice,'opciones A/B');
html=once(html,'<h2>Ingresá a tu cuenta</h2><p>Escribí tu celular. Si ya viajaste con nosotros, entrá con tu huella o con el código enviado a tu correo.</p>',
 '<h2>Bienvenido de nuevo</h2><p>Ingresá con tu celular para continuar.</p>','acceso compacto');
html=once(html,'<p class="mine-login-hint">¿Primera vez? <a href="./index.html">Solicitá tu primer traslado</a>. Te identificamos después de verificar tu correo.</p>','','quitar duplicado primera vez');
const signupSection=[
 '<section id="mine-signup-card" class="mine-login-card hidden" aria-label="Crear cuenta nueva">',
 '<h2>Crear tu cuenta</h2>',
 '<p>Completá tus datos y verificá tu correo. No necesitás reservar un viaje.</p>',
 '<label class="control"><span class="field-label">NOMBRE Y APELLIDO</span><input id="mine-signup-name" type="text" autocomplete="name" maxlength="100" placeholder="Nombre y apellido"></label>',
 '<label class="control"><span class="field-label">CELULAR</span><input id="mine-signup-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="099 123 456"></label>',
 '<label class="control"><span class="field-label">CORREO ELECTRÓNICO</span><input id="mine-signup-email" type="email" autocomplete="email" maxlength="160" placeholder="tu-correo@ejemplo.com"></label>',
 '<div id="mine-signup-turnstile" class="turnstile-container"></div>',
 '<button id="mine-signup-send" type="button" class="return-primary">Enviar código al correo</button>',
 '<div id="mine-signup-verify" class="hidden"><label class="control"><span class="field-label">CÓDIGO DEL CORREO</span><input id="mine-signup-code" type="text" autocomplete="one-time-code" inputmode="numeric" maxlength="6" placeholder="6 cifras"></label><button id="mine-signup-confirm" type="button" class="return-primary">Crear mi cuenta</button></div>',
 '<p id="mine-signup-feedback" role="status" aria-live="polite"></p>',
 '</section>'
].join('\n');
html=once(html,'</section><div id="mine-tabs"', '</section>'+signupSection+'<div id="mine-tabs"','nuevo registro independiente');
html=once(html,'id="mine-login-phone" type="tel" autocomplete="tel"','id="mine-login-phone" type="tel" autocomplete="off"','sin teléfono anterior');
html=once(html,'<script src="./app.js?v=29"></script>','<script src="./app.js?v=29-mineqa1"></script>','cache JS');
html=once(html,'</head><body data-page="mine">','<link rel="stylesheet" href="./mine-identity-qa.css?v=1"></head><body data-page="mine">','estilo QA');
const css="/* Mis reservas — Vía Traslados QA, estilo editorial petróleo.\n   Alcance limitado al acceso. No cambia tarjetas confirmed, mapa ni cotizaciones. */\nbody[data-page=\"mine\"] #mine-welcome.hidden,\nbody[data-page=\"mine\"] #mine-login-card.hidden,\nbody[data-page=\"mine\"] #mine-signup-card.hidden,\nbody[data-page=\"mine\"] #mine-signup-verify.hidden,\nbody[data-page=\"mine\"] #mine-entry-hero.hidden,\nbody[data-page=\"mine\"] #mine-identity-choice.hidden,\nbody[data-page=\"mine\"] #mine-tabs.hidden,\nbody[data-page=\"mine\"] #mine-list.hidden,\nbody[data-page=\"mine\"] #mine-more.hidden {display:none!important;}\n\nbody[data-page=\"mine\"] .via-mine-main {overflow:visible;}\nbody[data-page=\"mine\"] .via-mine-entry-hero {\n position:relative;isolation:isolate;overflow:hidden;\n margin:15px 0 14px;padding:20px 20px 21px;border-radius:17px;\n background:linear-gradient(132deg,#062c2c 0%,#06483f 68%,#096c61 100%);\n box-shadow:0 10px 24px rgba(4,55,50,.13);\n border:1px solid rgba(103,189,170,.25);color:#f6fffc;\n}\nbody[data-page=\"mine\"] .via-mine-entry-hero:after {\n content:\"\";position:absolute;z-index:-1;right:-48px;top:-85px;\n width:180px;height:180px;border-radius:50%;\n background:radial-gradient(circle,rgba(42,218,198,.22),transparent 67%);\n pointer-events:none;\n}\nbody[data-page=\"mine\"] .via-mine-entry-hero__eyebrow {\n display:block;font-size:9px;letter-spacing:1.9px;font-weight:760;\n color:#8bdbd0;margin-bottom:10px;\n}\nbody[data-page=\"mine\"] .via-mine-entry-hero h2 {\n color:#fff!important;margin:0 0 7px!important;\n font-size:clamp(19px,5vw,23px)!important;line-height:1.16;\n letter-spacing:-.7px;font-weight:720;\n}\nbody[data-page=\"mine\"] .via-mine-entry-hero p {\n margin:0;max-width:320px;color:#d0e4df!important;\n font-size:12px;line-height:1.5;\n}\nbody[data-page=\"mine\"] .via-mine-identity-choice {\n display:grid;grid-template-columns:repeat(2,minmax(0,1fr));\n gap:9px;margin:0 0 8px;\n}\nbody[data-page=\"mine\"] .via-mine-choice {\n appearance:none;display:flex;flex-direction:column;align-items:flex-start;\n justify-content:center;gap:6px;min-width:0;min-height:100px;width:100%;\n padding:13px 13px 12px;text-align:left;\n border:1px solid #dce9e3;border-radius:14px;\n background:#f8fbf9;color:#174a40;\n box-shadow:0 2px 9px rgba(21,70,55,.03);\n cursor:pointer;transition:background .16s,border-color .16s,box-shadow .16s,transform .16s;\n}\nbody[data-page=\"mine\"] .via-mine-choice:focus-visible {\n outline:3px solid #43baa7;outline-offset:3px;\n}\nbody[data-page=\"mine\"] .via-mine-choice:hover {border-color:#8abfb0;}\nbody[data-page=\"mine\"] .via-mine-choice__eyebrow {\n font-size:9px;line-height:1.2;letter-spacing:1.3px;\n color:#6f9688;font-weight:740;\n}\nbody[data-page=\"mine\"] .via-mine-choice strong {\n font-size:clamp(12px,3.3vw,14px);line-height:1.3;\n color:inherit;letter-spacing:-.18px;font-weight:770;\n}\nbody[data-page=\"mine\"] .via-mine-choice__hint {\n display:flex;gap:7px;align-items:center;font-size:11px;\n color:#55796d;line-height:1.2;\n}\nbody[data-page=\"mine\"] .via-mine-choice.is-selected {\n background:linear-gradient(135deg,#0b6459,#064940);\n color:#fff;border-color:#0a6257;box-shadow:0 5px 15px rgba(5,84,71,.13);\n}\nbody[data-page=\"mine\"] .via-mine-choice.is-selected .via-mine-choice__eyebrow {color:#9edacf;}\nbody[data-page=\"mine\"] .via-mine-choice.is-selected .via-mine-choice__hint {color:#d1eae5;}\n\nbody[data-page=\"mine\"] #mine-login-card,\nbody[data-page=\"mine\"] #mine-signup-card {\n margin:12px 0 0!important;padding:17px 16px 14px!important;\n background:#fff!important;\n border:1px solid #e2ebe5!important;border-radius:16px!important;\n box-shadow:0 5px 14px rgba(11,65,48,.035)!important;\n}\nbody[data-page=\"mine\"] #mine-login-card h2,\nbody[data-page=\"mine\"] #mine-signup-card h2 {\n font-size:19px!important;line-height:1.3;letter-spacing:-.5px;\n color:#153f36!important;margin:0 0 5px!important;\n}\nbody[data-page=\"mine\"] #mine-login-card > p,\nbody[data-page=\"mine\"] #mine-signup-card > p {\n font-size:12px!important;line-height:1.55!important;\n color:#637d71!important;margin:0 0 12px!important;\n}\nbody[data-page=\"mine\"] #mine-login-card input,\nbody[data-page=\"mine\"] #mine-signup-card input {\n box-sizing:border-box;max-width:100%;min-height:48px;\n border-radius:11px!important;border-color:#dae7df!important;\n background:#fcfefd!important;\n}\nbody[data-page=\"mine\"] #mine-login-card input:focus,\nbody[data-page=\"mine\"] #mine-signup-card input:focus {\n outline:2px solid rgba(17,152,130,.24);outline-offset:1px;\n border-color:#3b9c8b!important;\n}\nbody[data-page=\"mine\"] #mine-login-card button,\nbody[data-page=\"mine\"] #mine-signup-card button {\n min-height:45px;border-radius:11px!important;\n font-size:12px!important;font-weight:740!important;\n}\nbody[data-page=\"mine\"] #mine-signup-card .control {display:block;margin:11px 0;}\nbody[data-page=\"mine\"] #mine-signup-card button.return-primary {width:100%;margin:9px 0 4px;}\nbody[data-page=\"mine\"] #mine-signup-feedback {min-height:20px;font-size:12px;line-height:1.45;}\nbody[data-page=\"mine\"] #mine-qa-signup-instructions {\n padding:9px 10px!important;background:#edf8f5;border:1px solid #d7ede4;\n border-radius:10px;color:#276658!important;font-size:11px!important;\n}\nbody[data-page=\"mine\"] #mine-login-phone {scroll-margin-top:18px;}\n@media (max-width:359px){\n body[data-page=\"mine\"] .via-mine-entry-hero {padding:18px 15px;}\n body[data-page=\"mine\"] .via-mine-choice {padding:11px 9px;min-height:97px;}\n body[data-page=\"mine\"] .via-mine-choice__eyebrow {font-size:8px;letter-spacing:1px;}\n}\n@media (prefers-reduced-motion:reduce){\n body[data-page=\"mine\"] .via-mine-choice {transition:none;}\n}\n";
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
