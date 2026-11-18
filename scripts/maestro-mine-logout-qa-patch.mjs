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
 " let mineDrawEpoch=0;",
 " async function draw(){",
 "  const seq=++mineDrawEpoch,account=S.customer(),person=account?.profile;",
 "  login?.classList.toggle('hidden',!!person);",
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
 " $('mine-existing')?.addEventListener('click',()=>{$('mine-login-phone')?.focus({preventScroll:true})});",
 " window.addEventListener('via-customer-session',()=>{void draw()});",
 " window.addEventListener('storage',event=>{if(event.key==='via-customer-session-v1')void draw()});",
 ""].join('\n');
app=app.slice(0,handlerStart)+handlerNew+app.slice(handlerEnd);
const choice=[
 '<nav id="mine-identity-choice" class="via-mine-identity-choice hidden" aria-label="Elegir cómo ingresar">',
 '<button id="mine-existing" type="button" class="via-mine-choice via-mine-choice--existing" aria-controls="mine-login-card">Ya tengo cuenta</button>',
 '<a id="mine-new" href="./index.html" class="via-mine-choice via-mine-choice--new">Soy nuevo · Registrarme</a>',
 '</nav>',
 '<section id="mine-login-card" class="mine-login-card"'
].join('\n');
html=once(html,'<section id="mine-login-card" class="mine-login-card"',choice,'opciones A/B');
html=once(html,'id="mine-login-phone" type="tel" autocomplete="tel"','id="mine-login-phone" type="tel" autocomplete="off"','sin teléfono anterior');
html=once(html,'<script src="./app.js?v=29"></script>','<script src="./app.js?v=29-mineqa1"></script>','cache JS');
html=once(html,'</head><body data-page="mine">','<link rel="stylesheet" href="./mine-identity-qa.css?v=1"></head><body data-page="mine">','estilo QA');
const css=[
 '/* Corrección local de visibilidad CSS: no afecta el resto del sitio. */',
 'body[data-page="mine"] #mine-welcome.hidden,',
 'body[data-page="mine"] #mine-login-card.hidden,',
 'body[data-page="mine"] #mine-identity-choice.hidden,',
 'body[data-page="mine"] #mine-tabs.hidden,',
 'body[data-page="mine"] #mine-more.hidden {display:none !important;}',
 'body[data-page="mine"] .via-mine-identity-choice {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0 14px;width:100%;}',
 'body[data-page="mine"] .via-mine-choice {display:flex;align-items:center;justify-content:center;min-width:0;min-height:45px;padding:8px 9px;border-radius:11px;font-size:12px;font-weight:700;line-height:1.3;text-decoration:none;text-align:center;border:1px solid #b6d3c7;color:#316956;background:#f7fcf9;box-sizing:border-box;cursor:pointer;}',
 'body[data-page="mine"] .via-mine-choice--existing {background:#006a59;color:#fff;border-color:#006a59;}',
 'body[data-page="mine"] #mine-login-phone {scroll-margin-top:18px;}',
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
