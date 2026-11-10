(function(){
'use strict';
const S=window.ViaStore, $=(id)=>document.getElementById(id);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={requested:'Nueva solicitud',quoted:'Cotización enviada',accepted:'Oferta aceptada',confirmed:'Reserva confirmada',en_route:'Conductor en camino',arrived:'Conductor llegó',in_progress:'Viaje en curso',completed:'Viaje finalizado',cancelled:'Cancelada'};
function fmtDate(s){try{return new Date(s+'T12:00:00').toLocaleDateString('es-UY',{weekday:'short',day:'numeric',month:'short'})}catch{return s}}
function errorPlace(id,msg){const el=$(id);if(!el)return;el.className='notice error';el.textContent=msg;el.classList.remove('hidden')}
function initPassenger(){
 const form=$('booking-form'),date=$('date'),hero=$('inicio'),wizard=$('solicitar');
 const localDate=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 date.min=localDate;date.value=localDate;
 let step=1,verificationEmail='',lastPayload=null,turnstileToken='';
 const known=$('known-customer'),login=$('return-form'),feedback=$('return-feedback');
 const shownName=profile=>String(profile.name||'').trim().split(/\s+/)[0]||'';
 function showAccount(){
  const user=S.customer()?.profile;
  if(known)known.classList.toggle('hidden',!user);
  if(user){
   $('name').value=user.name||'';
   $('phone').value=user.phone||'';
   $('email').value=user.email||'';
   $('known-customer-title').textContent='Hola, '+shownName(user)+'. Ya te reconocimos.';
   $('identity-description').textContent='Solo confirmá tus datos y enviá la solicitud. No necesitás otro código.';
   $('send-code').innerHTML='Confirmar solicitud <span>→</span>';
   $('return-toggle').classList.add('hidden');
   login?.classList.add('hidden');
  }else{
   $('identity-description').textContent='Verificá tu correo una vez; después te reconoceremos en este dispositivo.';
   $('send-code').innerHTML=S.isDemo()?'Continuar con código de prueba <span>→</span>':'Recibir código de verificación <span>→</span>';
   $('return-toggle').classList.remove('hidden');
  }
 }
 if(S.isDemo()){
  const thumb=$('return-passkey');
  if(thumb)thumb.hidden=true;
  const row=document.querySelector('.return-actions');
  if(row)row.style.gridTemplateColumns='1fr';
 }
 showAccount();S.resume().then(showAccount).catch(()=>{});
 $('forget-customer')?.addEventListener('click',async()=>{
  await S.logout();$('name').value='';$('phone').value='';$('email').value='';
  showAccount();
 });
 function loginInfo(message,isError=false){
  if(!feedback)return;
  feedback.textContent=message;
  feedback.classList.toggle('error',isError);
  feedback.classList.toggle('hidden',!message);
 }
 $('return-toggle')?.addEventListener('click',()=>{
  login?.classList.toggle('hidden');
  $('return-phone').value=$('phone').value||'';
  if(!login?.classList.contains('hidden'))$('return-phone').focus();
 });
 $('return-passkey')?.addEventListener('click',async()=>{
  const button=$('return-passkey');
  button.disabled=true;loginInfo('Abriendo acceso seguro del teléfono…');
  try{
   const result=await window.ViaPasskeys.signIn($('return-phone').value);
   showAccount();loginInfo('');
   if(result.profile) $('identity-heading').textContent='¡Bienvenido de nuevo!';
  }catch(e){loginInfo(e.message||'No fue posible utilizar la huella. Podés recibir un código por correo.',true)}
  finally{button.disabled=false}
 });
 $('return-send-code')?.addEventListener('click',async()=>{
  const button=$('return-send-code');
  if(!S.isDemo()&&!turnstileToken){loginInfo('Completá la comprobación de seguridad que aparece más abajo.',true);return}
  button.disabled=true;loginInfo('Enviando código al correo asociado…');
  try{
   const result=await S.startPhoneLogin($('return-phone').value,turnstileToken);
   if(!result.sent){loginInfo(result.message||'No encontramos la cuenta. Completá tu nombre, celular y correo.',true);return}
   $('return-otp').classList.remove('hidden');
   $('return-otp-info').textContent=S.isDemo()?'DEMO: usá 123456. No se envía correo.':
    'Enviamos un código a '+(result.maskedEmail||'tu correo registrado')+'.';
   if(S.isDemo())$('return-code').value='123456';
   loginInfo('');turnstileToken='';
  }catch(e){loginInfo(e.message||'No se pudo enviar el código.',true)}
  finally{button.disabled=false}
 });
 $('return-verify')?.addEventListener('click',async()=>{
  const code=$('return-code').value.trim();
  if(!/^\d{6}$/.test(code)){loginInfo('Ingresá las seis cifras del correo.',true);return}
  const button=$('return-verify');button.disabled=true;
  try{
   await S.finishPhoneLogin($('return-phone').value,code);
   showAccount();loginInfo('');
   $('identity-heading').textContent='¡Bienvenido de nuevo!';
  }catch(e){loginInfo(e.message||'El código es incorrecto o venció.',true)}
  finally{button.disabled=false}
 });
 const showError=msg=>{errorPlace('form-result',msg);$('form-result').scrollIntoView({behavior:'smooth',block:'nearest'})};
 const clearError=()=>{$('form-result').classList.add('hidden')};
 const changeStep=n=>{
  clearError();step=n;document.body.classList.toggle('in-booking',true);document.body.classList.toggle('in-identity',n>1);document.querySelectorAll('.wizard-step').forEach(el=>el.classList.toggle('hidden',Number(el.dataset.step)!==n));
  $('wizard-progress-label').textContent=`PASO ${n} DE 3`;$('progress-bar').style.width=(n/3*100)+'%';
  wizard.scrollIntoView({behavior:'smooth',block:'start'});
 };
 $('start-booking').addEventListener('click',()=>{hero.classList.add('hidden');wizard.classList.remove('hidden');changeStep(1)});
 $('wizard-back').addEventListener('click',()=>{if(step===1){wizard.classList.add('hidden');hero.classList.remove('hidden');document.body.classList.remove('in-booking','in-identity');hero.scrollIntoView({behavior:'smooth'})}else changeStep(step-1)});
 function tripPayload(){const d=new FormData(form);const p=Object.fromEntries(d.entries());
  for(const k of ['origin','destination','name','phone','email','notes'])p[k]=String(p[k]||'').trim();
  p.passengers=Number(p.passengers);p.bags=Number(p.bags);
  p.originLocation=window.ViaAddress?.get('origin')||null;p.destinationLocation=window.ViaAddress?.get('destination')||null;return p;
 }
 function validateTrip(p){if(p.origin.length<4||p.destination.length<4||p.origin.toLocaleLowerCase('es')===p.destination.toLocaleLowerCase('es'))return 'Ingresá un origen y un destino diferentes.';
  if(!p.date||p.date<localDate||!p.time)return 'Revisá la fecha y hora de recogida.';
  if(!Number.isInteger(p.passengers)||p.passengers<1||p.passengers>8)return 'Cantidad de pasajeros incorrecta.';
  return ''}
 $('to-contact').addEventListener('click',()=>{const e=validateTrip(tripPayload());if(e)return showError(e);changeStep(2)});
 async function loadTurnstile(){if(S.isDemo()||S.customer())return;if(!window.VIA_CONFIG?.turnstileSiteKey){showError('La verificación anti-bots aún no está configurada. No se pueden enviar solicitudes reales.');return}
  const box=$('turnstile-box');box.classList.remove('hidden');
  if(window.turnstile)return;
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
  script.onload=()=>window.turnstile?.render('#turnstile-box',{sitekey:window.VIA_CONFIG.turnstileSiteKey,action:'otp',callback:token=>{turnstileToken=token},'expired-callback':()=>{turnstileToken=''}});
  document.head.appendChild(script);
 }
 $('to-contact').addEventListener('click',loadTurnstile);
 async function sendCode(){
  const p=tripPayload();const digits=p.phone.replace(/\D/g,'');
  if(p.name.length<2||digits.length<8||digits.length>15)return showError('Completá nombre y un número de celular válido.');
  if(!(p.email.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)))return showError('Ingresá un correo electrónico válido.');
  if(!$('privacy-consent').checked)return showError('Necesitamos tu consentimiento para gestionar la solicitud.');
  const remembered=S.customer()?.profile;
  const sessionMatches=!!remembered&&remembered.email.toLowerCase()===p.email.toLowerCase();
  if(!S.isDemo()&&!turnstileToken&&!sessionMatches)return showError('Completá la verificación anti-bots antes de continuar.');
  const button=$('send-code');button.disabled=true;
  button.textContent=sessionMatches?'Confirmando solicitud…':'Solicitando código…';
  try{
   if(sessionMatches){
    const result=await S.create(p);
    location.href='./reserva.html?id='+encodeURIComponent(result.id);
    return;
   }
   const result=await S.startVerification(p.email,turnstileToken);
   verificationEmail=result.email;lastPayload={...p,email:result.email};
   $('verification-description').textContent=S.isDemo()?'Código de demostración. No se envía ningún correo.':'Enviamos un código al correo '+result.maskedEmail+'.';
   $('otp-guidance').textContent=S.isDemo()?'DEMO: utilizá 123456. No se envía un correo.':'El código vence en 10 minutos. No lo compartas con nadie.';
   if(S.isDemo())$('otp-code').value='123456';
   changeStep(3);if(!S.isDemo())$('otp-code').focus();turnstileToken='';
  }catch(e){showError(e.message||'No fue posible enviar el código')}finally{button.disabled=false;showAccount()}
 }
 $('send-code').addEventListener('click',sendCode);
 $('resend-code').addEventListener('click',async()=>{changeStep(2);$('email').focus();showError('Revisá el correo y solicitá un código nuevo.')});
 form.addEventListener('submit',async e=>{e.preventDefault();if(step!==3)return;
  const code=$('otp-code').value.trim();if(!/^\d{4,10}$/.test(code))return showError('Ingresá el código numérico recibido.');
  const button=$('verify-and-book');button.disabled=true;button.textContent='Comprobando…';
  try{
   await S.verifyCode(verificationEmail,code,{name:lastPayload?.name,phone:lastPayload?.phone});
   if(!lastPayload)throw new Error('Volvé a cargar los datos del viaje.');
   const result=await S.create(lastPayload);
   location.href='./reserva.html?id='+encodeURIComponent(result.id);
  }catch(err){showError(err.message||'No se pudo verificar y registrar la solicitud');button.disabled=false;button.innerHTML='Verificar y enviar solicitud <span>→</span>'}
 });
}
let lastRender='';
function statusHTML(b){const status=labels[b.status]||b.status;let statusCopy={requested:'El conductor revisará tu solicitud y te enviará una propuesta.',quoted:'Tu conductor envió una cotización. Revisala y confirmá si estás de acuerdo.',accepted:'Aceptaste la propuesta. El conductor confirmará la coordinación.',confirmed:'Todo listo. Tu traslado está confirmado.',en_route:'Tu conductor está en camino al punto de recogida.',arrived:'El conductor llegó al lugar acordado.',in_progress:'Tu traslado está en curso.',completed:'Tu viaje finalizó. ¡Gracias por elegirnos!',cancelled:'Esta solicitud está cancelada.'}[b.status]||'Estamos actualizando tu reserva.';
const price=b.price!=null?`<div class="status-box"><div class="field-label">IMPORTE PROPUESTO</div><div class="quote-value">$ ${Number(b.price).toLocaleString('es-UY')} UYU</div><p>Precio sujeto a las condiciones acordadas con el conductor.</p></div>`:'';
return `<div class="status-box"><div class="status-label">${esc(status)}</div><p>${esc(statusCopy)}</p></div><div class="summary-row"><span>Código</span><strong>${esc(b.id)}</strong></div><div class="summary-row"><span>Origen</span><strong>${esc(b.origin)}</strong></div><div class="summary-row"><span>Destino</span><strong>${esc(b.destination)}</strong></div><div class="summary-row"><span>Fecha</span><strong>${esc(fmtDate(b.date))} · ${esc(b.time)}</strong></div><div class="summary-row"><span>Pasajeros / valijas</span><strong>${esc(b.passengers)} / ${esc(b.bags)}</strong></div>${price}<div class="status-actions">${b.status==='quoted'?'<button class="primary-btn" id="accept-btn">Aceptar cotización <span>→</span></button>':''}${['requested','quoted','accepted'].includes(b.status)?'<button class="secondary-btn" id="cancel-btn">Cancelar solicitud</button>':''}</div><p class="status-banner">Guardá esta página en este dispositivo para consultar cambios en tu reserva.</p>`}
async function initBooking(){const id=new URLSearchParams(location.search).get('id');if(!id){$('status-container').innerHTML='<p>Falta el código de reserva. Volvé a solicitar un viaje.</p>';return}async function render(){try{const b=await S.get(id);if(!b){$('status-container').innerHTML='<p>No se encontró la reserva en este dispositivo.</p>';return}const signature=JSON.stringify(b);if(signature===lastRender)return;lastRender=signature;$('status-container').innerHTML=statusHTML(b);$('accept-btn')?.addEventListener('click',async()=>{if(!confirm('¿Querés aceptar esta propuesta?'))return;try{await S.accept(id);lastRender='';await render()}catch(err){alert(err.message)}});$('cancel-btn')?.addEventListener('click',async()=>{if(!confirm('¿Querés cancelar esta solicitud?'))return;try{await S.cancel(id);lastRender='';await render()}catch(err){alert(err.message)}})}catch(err){$('status-container').innerHTML='<p class="error-text">'+esc(err.message)+'</p>'}}await render();
 const passkeyBox=$('passkey-setup'),passkeyButton=$('enable-passkey'),passkeyStatus=$('passkey-status');
 const session=S.customer();
 if(passkeyBox&&session&&!S.isDemo()&&window.ViaPasskeys?.available()&&!(session.passkeys>0)){
  passkeyBox.classList.remove('hidden');
  passkeyButton?.addEventListener('click',async()=>{
   passkeyButton.disabled=true;
   passkeyStatus.textContent='Abriendo el acceso seguro del teléfono…';
   try{
    await window.ViaPasskeys.enable();
    passkeyStatus.textContent='Listo. En próximos ingresos podrás usar tu huella o PIN.';
    passkeyButton.classList.add('hidden');
   }catch(e){
    passkeyStatus.textContent=e.name==='NotAllowedError'?
      'No se activó. Podés seguir reservando con tu correo, sin ningún problema.':
      (e.message||'No se pudo activar la huella.');
   }finally{passkeyButton.disabled=false}
  });
 }
 window.addEventListener('storage',render);window.addEventListener('via-updated',render);setInterval(render,12000)}
let filter='all';let operatorKey='';function filtered(rows){return rows.filter(x=>filter==='all'||(filter==='pending'&&['requested','quoted'].includes(x.status))||(filter==='upcoming'&&['accepted','confirmed','en_route','arrived','in_progress'].includes(x.status))||(filter==='finished'&&['completed','cancelled'].includes(x.status)))}
function cardHTML(b){let actions='';if(b.status==='requested'){actions=`<form class="request-inline-form" data-action="quote" data-id="${esc(b.id)}"><label class="field-label" for="price-${esc(b.id)}">PRECIO $ UYU</label><input type="number" id="price-${esc(b.id)}" name="price" min="1" max="10000000" step="1" placeholder="Importe" required><button type="submit">Cotizar →</button></form>`}else if(b.status==='accepted'){actions=`<button class="secondary-btn" data-action="confirm" data-id="${esc(b.id)}">Confirmar reserva</button>`}else if(b.status==='confirmed'){actions=`<button class="secondary-btn" data-action="en_route" data-id="${esc(b.id)}">Salir a recoger</button>`}else if(b.status==='en_route'){actions=`<button class="secondary-btn" data-action="arrived" data-id="${esc(b.id)}">Llegué</button>`}else if(b.status==='arrived'){actions=`<button class="secondary-btn" data-action="in_progress" data-id="${esc(b.id)}">Iniciar viaje</button>`}else if(b.status==='in_progress'){actions=`<button class="secondary-btn" data-action="completed" data-id="${esc(b.id)}">Finalizar viaje</button>`}
const pill=['confirmed','accepted','en_route','arrived','in_progress'].includes(b.status)?'confirmed':['completed','cancelled'].includes(b.status)?'done':'';return `<article class="request-card"><div><div class="request-head"><span class="pill ${pill}">${esc(labels[b.status]||b.status)}</span><span>· ${esc(fmtDate(b.date))} ${esc(b.time)}</span></div><h3>${esc(b.origin)} → ${esc(b.destination)}</h3><p>Pasajero: <strong>${esc(b.name)}</strong> · ${esc(b.phone)} · ${esc(b.passengers)} persona(s) · ${esc(b.bags)} valija(s)</p>${b.notes?`<p>Nota: ${esc(b.notes)}</p>`:''}${b.price!=null?`<p><strong>Propuesta: $ ${Number(b.price).toLocaleString('es-UY')} UYU</strong></p>`:''}<p style="font-size:10px;color:#9daaa3">${esc(b.id)}</p></div><div class="request-actions">${actions}</div></article>`}
async function renderDriver(){try{const rows=await S.list(operatorKey);$('driver-error').classList.add('hidden');$('stat-total').textContent=rows.length;$('stat-pending').textContent=rows.filter(x=>x.status==='requested').length;$('stat-confirmed').textContent=rows.filter(x=>['accepted','confirmed','en_route','arrived','in_progress'].includes(x.status)).length;const rs=filtered(rows);$('requests-list').innerHTML=rs.length?rs.map(cardHTML).join(''):`<div class="empty"><span class="empty-icon">◇</span><h3>Sin solicitudes en esta vista</h3><p>Desde la PWA del pasajero podés crear una reserva de prueba y verla acá, en este mismo navegador.</p><a href="./index.html">Abrir PWA de pasajeros →</a></div>`}catch(err){if(/acceso|clave|auth|401/i.test(err.message)){$('driver-content').classList.add('hidden');$('driver-auth').classList.remove('hidden');sessionStorage.removeItem('via-operator-key')}else errorPlace('driver-error',err.message)}}
function initDriver(){$('today-chip').textContent=new Date().toLocaleDateString('es-UY',{weekday:'long',day:'numeric',month:'long'});if(!S.isDemo()){operatorKey=sessionStorage.getItem('via-operator-key')||'';if(!operatorKey){$('driver-content').classList.add('hidden');$('driver-auth').classList.remove('hidden')}}$('auth-form').addEventListener('submit',async(e)=>{e.preventDefault();operatorKey=$('driver-key').value.trim();sessionStorage.setItem('via-operator-key',operatorKey);$('driver-auth').classList.add('hidden');$('driver-content').classList.remove('hidden');await renderDriver()});$('refresh-btn').addEventListener('click',renderDriver);document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(c=>c.classList.toggle('active',b===c));renderDriver()}));$('requests-list').addEventListener('submit',async(e)=>{const form=e.target.closest('form[data-action="quote"]');if(!form)return;e.preventDefault();const price=Number(new FormData(form).get('price'));if(!Number.isInteger(price)||price<1)return;try{await S.operatorUpdate(form.dataset.id,{status:'quoted',price},operatorKey);await renderDriver()}catch(err){errorPlace('driver-error',err.message)}});$('requests-list').addEventListener('click',async(e)=>{const b=e.target.closest('button[data-action]');if(!b)return;const status=b.dataset.action;if(!['confirm','en_route','arrived','in_progress','completed'].includes(status))return;try{await S.operatorUpdate(b.dataset.id,{status:status==='confirm'?'confirmed':status},operatorKey);await renderDriver()}catch(err){errorPlace('driver-error',err.message)}});renderDriver();window.addEventListener('storage',renderDriver);window.addEventListener('via-updated',renderDriver)}
async function initMine(){
 const container=$('mine-list'),login=$('mine-login-card'),welcome=$('mine-welcome');
 if(S.isDemo()){
  const thumb=$('mine-login-passkey');
  if(thumb)thumb.hidden=true;
  const row=document.querySelector('.mine-login-actions');
  if(row)row.style.gridTemplateColumns='1fr';
 }
 if(!container)return;
 let captchaToken='',turnstileLoaded=false;
 const note=message=>{const el=$('mine-login-feedback');if(el)el.textContent=message||''};
 async function draw(){
  const person=S.customer()?.profile;
  login?.classList.toggle('hidden',!!person);
  welcome?.classList.toggle('hidden',!person);
  if(person){
   const first=String(person.name||'').trim().split(/\s+/)[0];
   $('mine-greeting').textContent='Hola, '+first+'. Tus viajes están aquí.';
  }
  try{
   const rows=await S.mine();
   if(!rows.length){
    container.innerHTML='<div class="empty"><h3>Todavía no tenés reservas</h3><p>Cuando solicites un traslado, aparecerá aquí. Podrás consultarlo desde tus dispositivos una vez que ingreses a tu cuenta.</p><a href="./index.html">Solicitar un traslado →</a></div>';
    return;
   }
   container.innerHTML=rows.map(b=>'<a class="mine-item" href="./reserva.html?id='+encodeURIComponent(b.id)+'"><div><strong>'+esc(b.origin)+' → '+esc(b.destination)+'</strong><p>'+esc(fmtDate(b.date))+' · '+esc(b.time)+' · '+esc(labels[b.status]||b.status)+'</p></div><span aria-hidden="true">→</span></a>').join('');
  }catch(e){container.textContent='No pudimos consultar tus viajes. Revisá tu conexión e intentá entrar nuevamente.'}
 }
 function turnstile(){
  if(S.isDemo()||S.customer()||turnstileLoaded||!window.VIA_CONFIG?.turnstileSiteKey)return;
  turnstileLoaded=true;
  const box=$('mine-turnstile');box?.classList.remove('hidden');
  const show=()=>{
   if(!window.turnstile||!box)return;
   window.turnstile.render('#mine-turnstile',{sitekey:window.VIA_CONFIG.turnstileSiteKey,
    action:'otp',callback:value=>{captchaToken=value},'expired-callback':()=>{captchaToken=''}});
  };
  if(window.turnstile){show();return}
  const js=document.createElement('script');
  js.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  js.async=true;js.defer=true;js.onload=show;document.head.appendChild(js);
 }
 $('mine-login-passkey')?.addEventListener('click',async()=>{
  const button=$('mine-login-passkey');button.disabled=true;note('Abriendo la identificación del teléfono…');
  try{
   await window.ViaPasskeys.signIn($('mine-login-phone').value);
   note('');await draw();
  }catch(e){note(e.message||'No pudimos identificarte con huella. Podés recibir el código por correo.')}
  finally{button.disabled=false}
 });
 $('mine-login-send')?.addEventListener('click',async()=>{
  if(!S.isDemo()&&!captchaToken){note('Completá la comprobación de seguridad para enviar el correo.');return}
  const button=$('mine-login-send');button.disabled=true;note('Verificando tu celular…');
  try{
   const result=await S.startPhoneLogin($('mine-login-phone').value,captchaToken);
   if(!result.sent){note(result.message||'Si es tu primera visita, solicitá un traslado y verificá tu correo.');return}
   $('mine-login-verify').classList.remove('hidden');
   if(S.isDemo())$('mine-login-code').value='123456';
   note(S.isDemo()?'DEMO: usá el código 123456. No se envió ningún correo.':'Código enviado a '+(result.maskedEmail||'tu correo asociado')+'.');
   captchaToken='';
  }catch(e){note(e.message||'No pudimos enviar el código.')}
  finally{button.disabled=false}
 });
 $('mine-login-confirm')?.addEventListener('click',async()=>{
  const button=$('mine-login-confirm');button.disabled=true;note('Verificando…');
  try{
   await S.finishPhoneLogin($('mine-login-phone').value,$('mine-login-code').value.trim());
   note('');await draw();
  }catch(e){note(e.message||'Código inválido o vencido.')}
  finally{button.disabled=false}
 });
 $('mine-logout')?.addEventListener('click',async()=>{
  await S.logout();note('Sesión cerrada. Podés ingresar nuevamente con tu celular.');
  await draw();turnstileLoaded=false;turnstile();
 });
 await draw();
 await S.resume();
 await draw();
 turnstile();
}

const page=document.body.dataset.page;if(page==='passenger')initPassenger();if(page==='booking')initBooking();if(page==='mine')initMine();if(page==='driver')initDriver();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
