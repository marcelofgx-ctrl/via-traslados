(function(){
'use strict';
const S=window.ViaStore, $=(id)=>document.getElementById(id);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={requested:'Nueva solicitud',quoted:'Cotización enviada',accepted:'Oferta aceptada',confirmed:'Reserva confirmada',en_route:'Conductor en camino',arrived:'Conductor llegó',in_progress:'Viaje en curso',completed:'Viaje finalizado',cancelled:'Cancelada'};
function fmtDate(s){try{return new Date(s+'T12:00:00').toLocaleDateString('es-UY',{weekday:'short',day:'numeric',month:'short'})}catch{return s}}
function errorPlace(id,msg){const el=$(id);if(!el)return;el.className='notice error';el.textContent=msg;el.classList.remove('hidden')}
function initPassenger(){
 const form=$('booking-form'),date=$('date'),hero=$('inicio'),wizard=$('solicitar');
 if(!form||!wizard)return;
 const localDate=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 date.min=localDate;date.value=localDate;
 let step=1,turnstileToken='',widgetId=null,grant='',selectedPhone='',verifiedEmail='',signupPayload=null;
 let registered=false,hasPin=false,needsPinReset=false,enrolled=false,tripLast='',routePending=0;
 const current=S.customer,hasSession=()=>!!current()?.profile;
 const hidden=(id,yes)=>$(id)?.classList.toggle('hidden',yes);
 const profile=()=>current()?.profile;
 const error=message=>{const node=$('form-result');node.textContent=message;node.className='notice error';node.scrollIntoView({block:'nearest',behavior:'smooth'})};
 const clearError=()=>hidden('form-result',true);
 function onBusy(id,busy,label){
  const button=$(id);if(!button)return;
  if(!button.dataset.originalText)button.dataset.originalText=button.textContent;
  button.disabled=busy;button.setAttribute('aria-busy',busy?'true':'false');
  if(label)button.textContent=busy?label:button.dataset.originalText;
 }
 function feedback(message,bad=false){
  const node=$('return-feedback');if(!node)return;
  node.textContent=message||'';node.classList.toggle('error',!!bad);node.classList.toggle('hidden',!message);
 }
 function routeFeedback(title,detail,retry=false){
  $('via-route-distance').textContent=title;
  $('via-route-eta').textContent=detail;
  hidden('via-route-retry',!retry);
 }
 function trip(){
  const d=new FormData(form),p=Object.fromEntries(d.entries());
  for(const k of ['origin','destination','name','phone','email','notes'])p[k]=String(p[k]||'').trim();
  p.passengers=Number(p.passengers);p.bags=Number(p.bags);
  p.originLocation=window.ViaAddress?.get('origin')||null;
  p.destinationLocation=window.ViaAddress?.get('destination')||null;
  if(profile()){p.name=profile().name;p.phone=profile().phone;p.email=profile().email}
  return p;
 }
 function validTrip(p){
  if(p.origin.length<4||p.destination.length<4||p.origin.toLocaleLowerCase('es-UY')===p.destination.toLocaleLowerCase('es-UY'))return 'Elegí dos direcciones distintas.';
  if(!p.date||p.date<localDate||!p.time)return 'Revisá la fecha y la hora de recogida.';
  if(!Number.isInteger(p.passengers)||p.passengers<1||p.passengers>8)return 'Revisá la cantidad de pasajeros.';
  return '';
 }
 async function previewRoute(force=false){
  const p=trip(),key=p.origin+'|'+p.destination;
  if(p.origin.length<5||p.destination.length<5||p.origin===p.destination){
   routeFeedback('Elegí origen y destino','Mostraremos los kilómetros por carretera.');return;
  }
  if(!force&&tripLast===key)return;
  tripLast=key;
  const pending=++routePending;
  routeFeedback('Calculando recorrido…','Buscando ruta por carretera, sin tráfico en vivo.');
  try{
   const res=await S.estimateRoute(p.origin,p.destination);
   if(pending!==routePending)return;
   if(!res){routeFeedback('Distancia no disponible','No hay un cálculo verificable para esta ruta.',true);return}
   const distance=Number(res.distanceKm),minutes=Number(res.durationMinutes);
   if(!(distance>0&&minutes>0))throw Error('Ruta no disponible');
   routeFeedback(distance.toLocaleString('es-UY',{maximumFractionDigits:1})+' km · '+minutes+' min aprox.',
     'Ruta estimada · Sin tránsito en vivo · © OpenStreetMap / Geoapify');
  }catch(ex){
   if(pending!==routePending)return;
   tripLast='';
   routeFeedback('Distancia no disponible',ex?.message||'Podés continuar sin kilometraje.',true);
  }
 }
 const reroute=()=>{tripLast='';previewRoute(true)};
 $('via-route-retry')?.addEventListener('click',reroute);
 for(const id of ['origin','destination']){
  const el=$(id);if(!el)continue;
  el.addEventListener('via:address',()=>setTimeout(reroute,220));
  el.addEventListener('change',()=>setTimeout(reroute,250));
 }
 function changeStep(n){
  clearError();step=n;document.body.classList.add('in-booking');
  document.body.classList.toggle('in-identity',n>1);
  document.querySelectorAll('.wizard-step').forEach(el=>el.classList.toggle('hidden',Number(el.dataset.step)!==n));
  $('wizard-progress-label').textContent='PASO '+n+' DE 3';
  $('progress-bar').style.width=(n/3*100)+'%';
  wizard.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function remembered(){
  const person=profile();
  hidden('known-customer',!person);
  if(person){
   $('name').value=person.name||'';$('phone').value=person.phone||'';$('email').value=person.email||'';
   $('known-customer-title').textContent='Hola, '+String(person.name||'').trim().split(/\s+/)[0]+'. Ya reconocimos tu cuenta.';
   hidden('phone-first',true);hidden('return-form',true);hidden('new-account',true);hidden('turnstile-box',true);
   $('identity-heading').textContent='Bienvenido de nuevo';
   $('identity-description').textContent='Tu cuenta sigue verificada en este dispositivo. No tenés que volver a ingresar tus datos.';
   if(!$('known-next')){
    const button=document.createElement('button');button.type='button';button.id='known-next';
    button.className='primary-btn wizard-next';button.textContent='Revisar y confirmar solicitud →';
    $('known-customer').appendChild(button);
    button.addEventListener('click',()=>openConfirmation(false));
   }
  }else{
   hidden('known-customer',true);hidden('phone-first',false);
   hidden('return-form',true);hidden('new-account',true);hidden('turnstile-box',false);
   $('identity-heading').textContent='Tu celular, tu cuenta';
   $('identity-description').textContent='Primero identificamos tu número. Si ya tenés cuenta, no volvés a registrarte.';
  }
 }
 function openConfirmation(reset){
  needsPinReset=!!reset;
  hidden('verification-group',true);hidden('booking-confirm',false);
  hidden('pin-create-group',!needsPinReset);
  $('verification-heading').textContent=needsPinReset?'Recuperá tu PIN':'Confirmá tu traslado';
  $('verification-description').textContent=needsPinReset?
   'Ya verificaste tu correo. Elegí un PIN nuevo y confirmá tu viaje.':
   'Tu cuenta está verificada. Solo falta confirmar la solicitud.';
  $('verify-and-book').textContent=needsPinReset?'Guardar PIN y solicitar traslado →':'Confirmar solicitud →';
  hidden('resend-code',true);
  changeStep(3);
 }
 function resetCaptcha(){
  turnstileToken='';
  try{if(window.turnstile&&widgetId!==null)window.turnstile.reset(widgetId)}catch{}
 }
 function loadCaptcha(){
  if(S.isDemo()||hasSession()||!window.VIA_CONFIG?.turnstileSiteKey)return;
  hidden('turnstile-box',false);
  const render=()=>{
   if(widgetId!==null||!window.turnstile)return;
   widgetId=window.turnstile.render('#turnstile-box',{
    sitekey:window.VIA_CONFIG.turnstileSiteKey,action:'otp',
    callback:t=>{turnstileToken=t;},'expired-callback':()=>{turnstileToken='';},
    'error-callback':()=>{turnstileToken='';}
   });
  };
  if(window.turnstile){render();return}
  if(document.getElementById('via-turnstile-lib'))return;
  const sc=document.createElement('script');sc.id='via-turnstile-lib';
  sc.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  sc.async=true;sc.onload=render;document.head.appendChild(sc);
 }
 function beginSignup(){
  registered=false;
  hidden('phone-first',true);hidden('return-form',true);hidden('new-account',false);
  $('phone').value=selectedPhone;
  $('identity-heading').textContent='Te damos la bienvenida';
  $('identity-description').textContent='Completá tu registro una sola vez y validá el correo.';
  resetCaptcha();loadCaptcha();
 }
 function beginReturning(data){
  registered=true;hasPin=!!data.hasPin;
  hidden('phone-first',true);hidden('new-account',true);hidden('return-form',false);
  // Primero ofrecé los tres métodos. El PIN requiere configuración previa; la huella, una passkey registrada.
  hidden('pin-login',true);hidden('return-otp',true);
  $('recognized-email').textContent=data.maskedEmail?'Correo vinculado: '+data.maskedEmail:
   'Elegí cómo querés ingresar.';
  $('identity-heading').textContent='Ya conocemos tu cuenta';
  $('identity-description').textContent='Elegí entre huella, PIN personal o código por correo. No repetís el registro.';
  $('return-pin-option').textContent=hasPin?'Ingresar con PIN personal':'Crear mi PIN personal';
  const supported=Boolean(window.ViaPasskeys?.available());
  const passkeyReady=supported&&Boolean(data.hasPasskey);
  const keyButton=$('return-passkey');
  keyButton.disabled=!passkeyReady;
  keyButton.setAttribute('aria-disabled',passkeyReady?'false':'true');
  keyButton.textContent=passkeyReady?'Huella o PIN del teléfono':'Huella: activar después';
  $('passkey-availability').textContent=!supported?
   (location.origin!=='https://viatraslados.com'?'La huella se activa únicamente en viatraslados.com.':'Este navegador no permite el acceso biométrico. Entrá con correo o PIN.'):
   (!data.hasPasskey?'Para activar la huella, primero ingresá por correo; te ofreceremos vincular este dispositivo al confirmar el viaje.':
    'Tu dispositivo ya tiene un acceso seguro registrado.');
  hidden('forgot-pin',!hasPin);
  hidden('turnstile-box',true);feedback('');
 }
 $('start-booking').addEventListener('click',()=>{
  hero.classList.add('hidden');wizard.classList.remove('hidden');changeStep(1);
  setTimeout(()=>previewRoute(),180);
 });
 $('wizard-back').addEventListener('click',()=>{
  if(step===1){
   ++routePending;wizard.classList.add('hidden');hero.classList.remove('hidden');
   document.body.classList.remove('in-booking','in-identity');
   hero.scrollIntoView({block:'start',behavior:'smooth'});
  }else changeStep(step-1);
 });
 $('to-contact').addEventListener('click',()=>{
  const p=trip(),v=validTrip(p);if(v)return error(v);
  remembered();changeStep(2);loadCaptcha();
 });
 S.resume().then(()=>{if(step===2)remembered()}).catch(()=>{});
 $('forget-customer')?.addEventListener('click',async()=>{
  await S.logout();selectedPhone='';grant='';$('account-phone').value='';
  remembered();loadCaptcha();
 });
 $('change-phone')?.addEventListener('click',()=>{grant='';hidden('return-form',true);hidden('phone-first',false);hidden('turnstile-box',false);loadCaptcha()});
 $('registration-change-phone')?.addEventListener('click',()=>{grant='';hidden('new-account',true);hidden('phone-first',false);resetCaptcha()});
 $('phone-lookup').addEventListener('click',async()=>{
  const phone=$('account-phone').value.trim();
  const digits=phone.replace(/\D/g,'');
  if(digits.length<8||digits.length>15)return error('Ingresá un número de celular válido.');
  if(!S.isDemo()&&!turnstileToken)return error('Completá la verificación de seguridad.');
  onBusy('phone-lookup',true,'Buscando tu cuenta…');
  try{
   const data=await S.identifyPhone(phone,turnstileToken);
   selectedPhone=phone;grant=data.grant;resetCaptcha();
   if(data.registered)beginReturning(data);else beginSignup();
  }catch(ex){error(ex.message||'No se pudo verificar el número');resetCaptcha()}
  finally{onBusy('phone-lookup',false)}
 });
 $('return-pin-option')?.addEventListener('click',()=>{
  feedback('');
  hidden('return-otp',true);
  if(hasPin){
   hidden('pin-login',false);
   $('return-pin').focus();
  }else{
   hidden('pin-login',true);
   emailForReturning(true); // Registro seguro del PIN luego de verificar el correo.
  }
 });
 $('return-pin-submit')?.addEventListener('click',async()=>{
  const pin=$('return-pin').value.trim();
  if(!/^\d{6}$/.test(pin))return feedback('Ingresá tu PIN de seis cifras.',true);
  onBusy('return-pin-submit',true,'Comprobando PIN…');
  try{
   await S.pinLogin(selectedPhone,pin,grant);remembered();
   openConfirmation(false);
  }catch(ex){feedback(ex.message||'PIN incorrecto. También podés ingresar por correo.',true)}
  finally{onBusy('return-pin-submit',false)}
 });
 $('return-passkey')?.addEventListener('click',async()=>{
  onBusy('return-passkey',true,'Verificando dispositivo…');
  try{await window.ViaPasskeys.signIn(selectedPhone);remembered();openConfirmation(false)}
  catch(ex){
   const message=ex.name==='NotAllowedError'?
    'Se canceló la identificación del teléfono. Podés ingresar con PIN personal o recibir un código por correo.':
    (ex.message||'No se pudo usar la huella. Podés ingresar por correo.');
   feedback(message,true);
  }
  finally{onBusy('return-passkey',false)}
 });
 async function emailForReturning(reset){
  needsPinReset=!!reset;
  onBusy('return-send-code',true,'Enviando código…');
  try{
   const res=await S.startPhoneLogin(selectedPhone,turnstileToken,grant);
   if(!res.sent){feedback('No encontramos una cuenta asociada. Podés registrarte con tu correo.',true);return}
   $('return-otp-info').textContent=S.isDemo()?'DEMO: utilizá 123456.':
    'Código enviado a '+(res.maskedEmail||'tu correo registrado')+'.';
   hidden('return-otp',false);
   if(S.isDemo())$('return-code').value='123456';
   feedback('');resetCaptcha();
  }catch(ex){feedback(ex.message||'No pudimos enviar el código.',true)}
  finally{onBusy('return-send-code',false)}
 }
 $('return-send-code')?.addEventListener('click',()=>emailForReturning(false));
 $('forgot-pin')?.addEventListener('click',()=>emailForReturning(true));
 $('return-verify')?.addEventListener('click',async()=>{
  const code=$('return-code').value.trim();
  if(!/^\d{6}$/.test(code))return feedback('Ingresá las seis cifras del correo.',true);
  onBusy('return-verify',true,'Validando código…');
  try{await S.finishPhoneLogin(selectedPhone,code);remembered();openConfirmation(needsPinReset)}
  catch(ex){feedback(ex.message||'El código es incorrecto o venció.',true)}
  finally{onBusy('return-verify',false)}
 });
 $('send-code').addEventListener('click',async()=>{
  const p=trip(),email=p.email;
  if(p.name.length<2||!email||email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
   return error('Completá nombre y correo electrónico válido.');
  if(!$('privacy-consent').checked)return error('Necesitamos tu consentimiento para gestionar la solicitud.');
  if(!S.isDemo()&&!turnstileToken)return error('Completá la verificación de seguridad.');
  onBusy('send-code',true,'Enviando verificación…');
  try{
   const result=await S.startVerification(email,turnstileToken);
   verifiedEmail=result.email;signupPayload={...p,email:result.email};enrolled=false;
   $('verification-heading').textContent='Validá tu correo';
   $('verification-description').textContent='Enviamos un código a '+result.maskedEmail+'.';
   $('otp-guidance').textContent=S.isDemo()?'DEMO: ingresá 123456.':'El código vence en diez minutos y es personal.';
   if(S.isDemo())$('otp-code').value='123456';
   hidden('verification-group',false);hidden('pin-create-group',false);
   hidden('booking-confirm',true);hidden('resend-code',false);
   $('verify-and-book').textContent='Crear cuenta y solicitar traslado →';
   resetCaptcha();changeStep(3);
  }catch(ex){error(ex.message||'No se pudo enviar el correo');resetCaptcha()}
  finally{onBusy('send-code',false)}
 });
 $('resend-code')?.addEventListener('click',()=>{changeStep(2);resetCaptcha();loadCaptcha()});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(step!==3)return;
  const p=trip(),v=validTrip(p);if(v)return error(v);
  const button=$('verify-and-book');
  onBusy('verify-and-book',true,'Confirmando solicitud…');
  try{
   if(!hasSession()&&!enrolled){
    const code=$('otp-code').value.trim(),pin=$('new-pin').value.trim();
    if(!/^\d{6}$/.test(code))throw Error('Ingresá las seis cifras del correo.');
    if(!/^\d{6}$/.test(pin))throw Error('Elegí un PIN de seis cifras para tu cuenta.');
    if(!signupPayload)throw Error('Revisá tu registro y pedí un código nuevo.');
    await S.verifyCode(verifiedEmail,code,{name:signupPayload.name,phone:signupPayload.phone});
    enrolled=true;
   }
   if(!hasSession())throw Error('Necesitamos verificar tu identidad antes de reservar.');
   if(enrolled||needsPinReset){
    const pin=$('new-pin').value.trim();
    if(!/^\d{6}$/.test(pin))throw Error('Ingresá un PIN nuevo de seis cifras.');
    await S.setPin(pin);
    needsPinReset=false;enrolled=false;
   }
   const result=await S.create(trip());
   location.href='./reserva.html?id='+encodeURIComponent(result.id);
  }catch(ex){error(ex.message||'No fue posible confirmar el viaje')}
  finally{onBusy('verify-and-book',false)}
 });
}

let lastRender='';
function statusHTML(b){const status=labels[b.status]||b.status;let statusCopy={requested:'El conductor revisará tu solicitud y te enviará una propuesta.',quoted:'Tu conductor envió una cotización. Revisala y confirmá si estás de acuerdo.',accepted:'Aceptaste la propuesta. El conductor confirmará la coordinación.',confirmed:'Todo listo. Tu traslado está confirmado.',en_route:'Tu conductor está en camino al punto de recogida.',arrived:'El conductor llegó al lugar acordado.',in_progress:'Tu traslado está en curso.',completed:'Tu viaje finalizó. ¡Gracias por elegirnos!',cancelled:'Esta solicitud está cancelada.'}[b.status]||'Estamos actualizando tu reserva.';
const routeMetrics=b.route&&Number(b.route.distanceKm)>0&&Number(b.route.durationMinutes)>0?
  '<div class="via-status-route"><div><small>DISTANCIA ESTIMADA</small><strong>'+esc(Number(b.route.distanceKm).toLocaleString('es-UY',{maximumFractionDigits:1}))+' km</strong></div><div><small>DURACIÓN ORIENTATIVA</small><strong>'+esc(b.route.durationMinutes)+' min</strong></div></div><p class="via-route-disclaimer">Ruta por carretera · Sin tránsito en vivo · © OpenStreetMap / Geoapify</p>':
  '<p class="via-route-disclaimer">Distancia y duración pendientes de calcular. Se actualizarán cuando haya una ruta confiable.</p>';
const price=b.price!=null?`<div class="status-box"><div class="field-label">IMPORTE PROPUESTO</div><div class="quote-value">$ ${Number(b.price).toLocaleString('es-UY')} UYU</div><p>Precio sujeto a las condiciones acordadas con el conductor.</p></div>`:'';
return `<div class="status-box"><div class="status-label">${esc(status)}</div><p>${esc(statusCopy)}</p></div><div class="summary-row"><span>Código</span><strong>${esc(b.id)}</strong></div><div class="summary-row"><span>Origen</span><strong>${esc(b.origin)}</strong></div><div class="summary-row"><span>Destino</span><strong>${esc(b.destination)}</strong></div>${routeMetrics}<div class="summary-row"><span>Fecha</span><strong>${esc(fmtDate(b.date))} · ${esc(b.time)}</strong></div><div class="summary-row"><span>Pasajeros / valijas</span><strong>${esc(b.passengers)} / ${esc(b.bags)}</strong></div>${price}<div class="status-actions">${b.status==='quoted'?'<button class="primary-btn" id="accept-btn">Aceptar cotización <span>→</span></button>':''}${['requested','quoted','accepted'].includes(b.status)?'<button class="secondary-btn" id="cancel-btn">Cancelar solicitud</button>':''}</div><p class="status-banner">Guardá esta página en este dispositivo para consultar cambios en tu reserva.</p>`}
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
