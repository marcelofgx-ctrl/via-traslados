/* Vía Traslados V29.1.14 — isolated trip/route lifecycle reset; customer session preserved. */
(function(){
'use strict';
const S=window.ViaStore, $=(id)=>document.getElementById(id);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Solo cambia lo visible. Las direcciones y coordenadas originales permanecen en la reserva.
const displayAddress=v=>String(v??'').replace(/^\s*(?:Cerca de|Punto en mapa cerca de)\s+/i,'');
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
 const current=S.customer;
 let validatedToken=null,identityEpoch=0,observedToken=current()?.sessionToken||null;
 // Nunca confundir una cuenta recordada con una sesión validada por la API.
 const authenticated=()=>{
  const account=current();
  return account?.sessionToken&&account.sessionToken===validatedToken&&account.profile?account:null;
 };
 const hasSession=()=>!!authenticated();
 const profile=()=>authenticated()?.profile||null;
 async function revalidateIdentity(){
  const before=current(),token=before?.sessionToken;
  if(!token){validatedToken=null;return null}
  const confirmed=await S.resume(); // Consulta /api/customer/me
  const after=current();
  if(!confirmed||after?.sessionToken!==token||
     !after.profile?.name||!after.profile?.phone||!after.profile?.email){
   if(validatedToken===token)validatedToken=null;
   return null;
  }
  validatedToken=token;
  return after.profile;
 }
 const hidden=(id,yes)=>$(id)?.classList.toggle('hidden',yes);
 const error=message=>{const node=$('form-result');node.textContent=message;node.className='notice error';node.scrollIntoView({block:'nearest',behavior:'smooth'})};
 const clearError=()=>{const node=$('form-result');if(node){node.classList.add('hidden');node.textContent=''}};
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
   $('known-customer-title').textContent='Hola, '+String(person.name||'').trim().split(/\s+/)[0];
   hidden('phone-first',true);hidden('return-form',true);hidden('new-account',true);hidden('turnstile-box',true);
   $('identity-heading').textContent='Bienvenido de nuevo';
   $('identity-description').textContent='Tu cuenta sigue verificada. Continuá sin repetir tus datos.';
   if(!$('known-next')){
    const button=document.createElement('button');button.type='button';button.id='known-next';
    button.className='primary-btn wizard-next';button.textContent='Continuar con la reserva →';
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
   const summary=$('booking-confirm'),person=profile();
   summary.replaceChildren();
   if(person){
    const first=String(person.name||'').trim().split(/\s+/)[0].slice(0,40);
    const heading=document.createElement('strong');
    heading.textContent='Hola, '+first+'. Tu cuenta está verificada.';
    heading.style.display='block';
    const contact=document.createElement('small');
    contact.textContent=[person.phone,person.email].filter(Boolean).join(' · ');
    contact.style.display='block';contact.style.marginTop='4px';contact.style.overflowWrap='anywhere';
    summary.append(heading,contact);
   }else summary.textContent='Cuenta verificada. Confirmá los detalles del traslado.';
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
  clearError();registered=false;
  hidden('phone-first',true);hidden('return-form',true);hidden('new-account',false);
  $('phone').value=selectedPhone;
  $('identity-heading').textContent='Te damos la bienvenida';
  $('identity-description').textContent='Completá tu registro una sola vez y validá el correo.';
  resetCaptcha();loadCaptcha();
 }
 function beginReturning(data){
  clearError();registered=true;hasPin=!!data.hasPin;
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
  // Ignore late route estimates from the previous draft and clear cached route key.
  // Do NOT change the verified passenger session or identity.
  ++routePending;tripLast='';
  routeFeedback('Elegí origen y destino','Mostraremos los kilómetros por carretera.');
  hero.classList.add('hidden');wizard.classList.remove('hidden');changeStep(1);
  setTimeout(()=>previewRoute(),180);
 });
  $('wizard-back').addEventListener('click',()=>{
   ++identityEpoch; // Nunca navegar luego de una validación obsoleta.
   if(step===1){
    ++routePending;wizard.classList.add('hidden');hero.classList.remove('hidden');
    document.body.classList.remove('in-booking','in-identity');
    hero.scrollIntoView({block:'start',behavior:'smooth'});
   }else changeStep(step===3&&hasSession()?1:step-1);
  });
  $('to-contact').addEventListener('click',async()=>{
   const p=trip(),v=validTrip(p);if(v)return error(v);
   const epoch=++identityEpoch,before=current()?.sessionToken||null;
   onBusy('to-contact',true,'Comprobando tu sesión…');
   try{
    if(before){
     const verified=await revalidateIdentity();
     if(epoch!==identityEpoch||current()?.sessionToken!==before)return;
     if(verified){
      $('name').value=verified.name;
      $('phone').value=verified.phone;
      $('email').value=verified.email;
      remembered();
      openConfirmation(false); // Paso 2 omitido: el servidor ya validó la sesión.
      return;
     }
    }
    if(epoch!==identityEpoch)return;
    remembered();changeStep(2);loadCaptcha();
   }catch{
    if(epoch===identityEpoch){validatedToken=null;remembered();changeStep(2);loadCaptcha()}
   }finally{onBusy('to-contact',false)}
  });
  void revalidateIdentity().then(()=>{if(step===2)remembered()}).catch(()=>{});
  window.addEventListener('via-customer-session',()=>{
   const next=current()?.sessionToken||null,changed=observedToken!==next;
   const hadVerified=!!validatedToken;
   if(changed){observedToken=next;validatedToken=null;++identityEpoch}
   selectedPhone='';grant='';turnstileToken='';
   if(changed&&hadVerified&&step===3){
    $('booking-confirm')?.replaceChildren();
    remembered();changeStep(2);loadCaptcha();
    return;
   }
   if(step===2)remembered();
  });
  window.addEventListener('storage',event=>{
   if(event.key!=='via-customer-session-v1')return;
   const next=current()?.sessionToken||null;
   if(next===observedToken)return;
   observedToken=next;validatedToken=null;++identityEpoch;
   if(step===3){$('booking-confirm')?.replaceChildren();remembered();changeStep(2);loadCaptcha()}
   else if(step===2)remembered();
  });
 $('forget-customer')?.addEventListener('click',async()=>{
   ++identityEpoch;validatedToken=null;
  await S.logout();selectedPhone='';grant='';$('account-phone').value='';
  remembered();loadCaptcha();
 });
 $('change-phone')?.addEventListener('click',()=>{grant='';clearError();hidden('return-form',true);hidden('phone-first',false);hidden('turnstile-box',false);resetCaptcha();loadCaptcha()});
 $('registration-change-phone')?.addEventListener('click',()=>{grant='';clearError();hidden('new-account',true);hidden('phone-first',false);hidden('turnstile-box',false);resetCaptcha();loadCaptcha()});
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
   await S.pinLogin(selectedPhone,pin,grant);validatedToken=current()?.sessionToken||null;remembered();
   openConfirmation(false);
  }catch(ex){feedback(ex.message||'PIN incorrecto. También podés ingresar por correo.',true)}
  finally{onBusy('return-pin-submit',false)}
 });
 $('return-passkey')?.addEventListener('click',async()=>{
  onBusy('return-passkey',true,'Verificando dispositivo…');
  try{await window.ViaPasskeys.signIn(selectedPhone);validatedToken=current()?.sessionToken||null;remembered();openConfirmation(false)}
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
  try{await S.finishPhoneLogin(selectedPhone,code);validatedToken=current()?.sessionToken||null;remembered();openConfirmation(needsPinReset)}
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
     validatedToken=current()?.sessionToken||null;
    enrolled=true;
   }
   if(!hasSession())throw Error('Necesitamos verificar tu identidad antes de reservar.');
   if(enrolled||needsPinReset){
    const pin=$('new-pin').value.trim();
    if(!/^\d{6}$/.test(pin))throw Error('Ingresá un PIN nuevo de seis cifras.');
    await S.setPin(pin);
    needsPinReset=false;enrolled=false;
   }
    // La sesión pudo vencer durante la confirmación: revalidar antes de POST.
    if(hasSession()){
     const token=current()?.sessionToken;
     if(!await revalidateIdentity()||current()?.sessionToken!==token){
      validatedToken=null;
      remembered();changeStep(2);loadCaptcha();
      throw Error('Tu sesión no pudo verificarse. Volvé a ingresar antes de solicitar el traslado.');
     }
    }
   const result=await S.create(trip());
   location.href='./reserva.html?id='+encodeURIComponent(result.id);
  }catch(ex){error(ex.message||'No fue posible confirmar el viaje')}
  finally{onBusy('verify-and-book',false)}
 });
}

let lastRender='';
const bookingPresentation={
 requested:{kind:'waiting',symbol:'clock',flag:'SIN CONFIRMAR',title:'Recibimos tu solicitud',description:'El conductor está revisando los datos de tu viaje.',next:'Todavía no es una reserva confirmada. Volvé a consultar esta página para ver novedades.'},
 quoted:{kind:'offer',symbol:'document',flag:'ACCIÓN NECESARIA',title:'Tenés una propuesta',description:'El conductor te envió una cotización para este traslado.',next:'Revisá el precio y, si estás de acuerdo, tocá «Aceptar propuesta».'},
 accepted:{kind:'accepted',symbol:'clock',flag:'ACEPTADA · POR CONFIRMAR',title:'Propuesta aceptada',description:'Aceptaste el importe. Esperamos la confirmación final del conductor.',next:'No tenés que hacer nada más. Te mostraremos aquí cuando el viaje quede confirmado.'},
 confirmed:{kind:'success',symbol:'check',flag:'CONFIRMADA',title:'¡Tu reserva está confirmada!',description:'El conductor confirmó tu traslado. Ya tenés tu viaje coordinado.',next:'¡Todo listo! Guardá este enlace para revisar los detalles y cualquier cambio.'},
 en_route:{kind:'moving',symbol:'car',flag:'EN CAMINO',title:'Tu conductor está en camino',description:'El conductor salió hacia el punto de recogida.',next:'Tené tu celular a mano y preparate para el encuentro.'},
 arrived:{kind:'moving',symbol:'pin',flag:'YA LLEGÓ',title:'Tu conductor llegó',description:'El conductor indicó que llegó al lugar acordado.',next:'Dirigite al punto de encuentro indicado en tu reserva.'},
 in_progress:{kind:'moving',symbol:'car',flag:'EN CURSO',title:'Tu traslado está en curso',description:'El viaje ya comenzó.',next:'Podés volver a esta pantalla para consultar el estado.'},
 completed:{kind:'finished',symbol:'check',flag:'FINALIZADO',title:'Tu viaje finalizó',description:'¡Gracias por viajar con Vía Traslados!',next:'Tu traslado está completado. Podés hacer una nueva solicitud cuando quieras.'},
 cancelled:{kind:'cancelled',symbol:'cross',flag:'CANCELADA',title:'Reserva cancelada',description:'Esta solicitud fue cancelada y ya no está activa.',next:'Si todavía necesitás un traslado, podés solicitar uno nuevo.'}
};
const bookingSymbols={
 check:'<path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
 clock:'<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
 document:'<rect x="5" y="3" width="14" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9h6M9 13h6M9 17h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
 car:'<path d="M5 11 7 6h10l2 5M4 11h16v7H4zM7 18v2m10-2v2M7.5 14.5h.01m9 0h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
 pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
 cross:'<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
};
function statusHTML(b){
 const presentation=bookingPresentation[b.status]||bookingPresentation.requested;
 const symbol='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">'+bookingSymbols[presentation.symbol]+'</svg>';
 const isRoute=Number(b.route?.distanceKm)>0&&Number(b.route?.durationMinutes)>0;
 const hasPrice=b.price!=null&&Number.isFinite(Number(b.price));
 const metrics=[];
 if(isRoute){
  metrics.push('<div class="via-metric"><small>DISTANCIA</small><strong>'+esc(Number(b.route.distanceKm).toLocaleString('es-UY',{maximumFractionDigits:1}))+' <em>km</em></strong></div>');
  metrics.push('<div class="via-metric"><small>DURACIÓN</small><strong>'+esc(Math.ceil(Number(b.route.durationMinutes)))+' <em>min</em></strong></div>');
 }
 if(hasPrice){
  const priceLabel=b.status==='quoted'?'PROPUESTA':b.status==='accepted'?'ACEPTADO':'IMPORTE';
  metrics.push('<div class="via-metric via-metric--price"><small>'+priceLabel+'</small><strong>$ '+esc(Number(b.price).toLocaleString('es-UY',{maximumFractionDigits:0}))+'</strong><em>UYU</em></div>');
 }
 const metricBlock=metrics.length?
  '<div class="via-trip-metrics" data-metrics="'+metrics.length+'" aria-label="Distancia, duración e importe del viaje">'+metrics.join('')+'</div>'+
  (isRoute?'<p class="via-route-disclaimer">Distancia y tiempo estimados por carretera · Sin tránsito en vivo.</p>':''):
  '<p class="via-route-disclaimer">Distancia y duración pendientes de calcular.</p>';
 const actions=(b.status==='quoted'?'<button type="button" class="primary-btn" id="accept-btn">Aceptar propuesta <span aria-hidden="true">→</span></button>':'')+
  (['requested','quoted','accepted'].includes(b.status)?'<button type="button" class="secondary-btn via-cancel-action" id="cancel-btn">Cancelar</button>':'')+
  '<button type="button" class="secondary-btn via-refresh-action" id="refresh-status">Actualizar estado <span aria-hidden="true">↻</span></button>';
 return '<section class="via-state via-state--'+presentation.kind+'" data-booking-status="'+esc(b.status||'requested')+'" role="status" aria-live="polite" aria-atomic="true">'+
  '<div class="via-state__hero"><span class="via-state__icon">'+symbol+'</span><div class="via-state__heading"><span class="via-state__eyebrow">ESTADO DE TU VIAJE</span><h2>'+esc(presentation.title)+'</h2><p>'+esc(presentation.description)+'</p></div></div>'+
  '<div class="via-state__bottom"><span class="via-state__flag">'+esc(presentation.flag)+'</span><p>'+esc(presentation.next)+'</p></div></section>'+
  '<div class="via-trip-summary" aria-label="Detalles de tu reserva">'+
  '<div class="via-trip-code"><span>RESERVA</span><strong>'+esc(b.id)+'</strong></div>'+
  metricBlock+
  '<div class="via-trip-journey">'+
  '<div class="via-trip-stop via-trip-stop--from"><span class="via-trip-stop__dot" aria-hidden="true"></span><div><small>ORIGEN</small><strong>'+esc(displayAddress(b.origin))+'</strong></div></div>'+
  '<div class="via-trip-stop via-trip-stop--to"><span class="via-trip-stop__dot" aria-hidden="true"></span><div><small>DESTINO</small><strong>'+esc(displayAddress(b.destination))+'</strong></div></div>'+
  '</div>'+
  '<div class="via-trip-facts"><div><small>FECHA Y HORA</small><strong>'+esc(fmtDate(b.date))+' · '+esc(b.time)+'</strong></div>'+
  '<div><small>PERSONAS / VALIJAS</small><strong>'+esc(b.passengers)+' / '+esc(b.bags)+'</strong></div></div>'+
  '<div class="status-actions">'+actions+'</div>'+
  '<p class="status-banner">Este enlace se actualiza mientras está abierto.</p></div>';
}

async function initBooking(){const id=new URLSearchParams(location.search).get('id');if(!id){$('status-container').innerHTML='<p>Falta el código de reserva. Volvé a solicitar un viaje.</p>';return}async function render(){try{const b=await S.get(id);if(!b){$('status-container').innerHTML='<p>No se encontró la reserva en este dispositivo.</p>';return}const signature=JSON.stringify(b);if(signature===lastRender)return;lastRender=signature;document.querySelector('.status-card')?.setAttribute('data-current-status',Object.hasOwn(bookingPresentation,b.status)?b.status:'requested');$('status-container').innerHTML=statusHTML(b);$('refresh-status')?.addEventListener('click',async()=>{lastRender='';await render()});$('accept-btn')?.addEventListener('click',async()=>{if(!confirm('¿Querés aceptar esta propuesta?'))return;try{await S.accept(id);lastRender='';await render()}catch(err){alert(err.message)}});$('cancel-btn')?.addEventListener('click',async()=>{if(!confirm('¿Querés cancelar esta solicitud?'))return;try{await S.cancel(id);lastRender='';await render()}catch(err){alert(err.message)}})}catch(err){$('status-container').innerHTML='<p class="error-text">'+esc(err.message)+'</p>'}}await render();
 const passkeyBox=$('passkey-setup'),passkeyButton=$('enable-passkey'),passkeyStatus=$('passkey-status');
 // Al abrir el seguimiento, el número de passkeys en localStorage puede estar
 // desactualizado. Consultar la API antes de ofrecer crear otra credencial.
 // Si falla la consulta, NO pedir una nueva clave hasta verificar la sesión.
 if(passkeyBox&&!S.isDemo()&&window.ViaPasskeys?.available()&&S.customer()){
  let refreshed=false;
  try{refreshed=Boolean(await S.resume())}catch{}
  const session=refreshed?S.customer():null;
  if(session&&Number(session.passkeys)>0){
   passkeyBox.classList.remove('hidden');
   const heading=passkeyBox.querySelector('h3'),note=passkeyBox.querySelector('p');
   if(heading)heading.textContent='Tu acceso seguro ya está activo';
   if(note)note.textContent='Tu cuenta ya tiene una clave de acceso. Para ingresar la próxima vez elegí Huella o PIN del teléfono.';
   passkeyButton?.classList.add('hidden');
  }else if(session&&Number(session.passkeys)===0){
   passkeyBox.classList.remove('hidden');
   passkeyButton?.addEventListener('click',async()=>{
    passkeyButton.disabled=true;
    passkeyStatus.textContent='Comprobando tu acceso seguro…';
    try{
     // Revalidar justo antes de invocar el registro WebAuthn.
     if(!await S.resume())throw Error('Tu sesión venció. Volvé a ingresar con tu correo o PIN.');
     if(Number(S.customer()?.passkeys)>0){
      throw Object.assign(new Error('Tu cuenta ya tiene una clave de acceso. Usala al ingresar, sin crear otra.'),{name:'AlreadyRegisteredError'});
     }
     passkeyStatus.textContent='Abriendo el acceso seguro del teléfono…';
     await window.ViaPasskeys.enable();
     passkeyStatus.textContent='Listo. En próximos ingresos podés usar tu huella o PIN.';
     passkeyButton.classList.add('hidden');
    }catch(e){
     const already=e.name==='AlreadyRegisteredError'||e.name==='InvalidStateError'||/ya (tiene|tenés)|already registered|already exists/i.test(e.message||'');
     passkeyStatus.textContent=already?
       'Ya existe una clave de acceso para Vía Traslados. No hace falta crear otra; elegí Huella o PIN al ingresar.':
       e.name==='NotAllowedError'?
       'No se activó. Podés seguir reservando con tu correo o PIN.':
       (e.message||'No se pudo activar la huella.');
     if(already)passkeyButton.classList.add('hidden');
    }finally{passkeyButton.disabled=false}
   });
  }
 }
 window.addEventListener('storage',render);window.addEventListener('via-updated',render);setInterval(render,12000)}
let filter='all',operatorKey='',driverFetchInProgress=false,driverRefreshPending=false;
let driverSnapshots=new Map(),driverFirstLoad=true,driverAlertBooking=null,driverAlertTrigger=null;
const notifiedKey='via-acceptance-notified-v25';
function filtered(rows){
 return rows.filter(x=>filter==='all'||
  (filter==='pending'&&['requested','quoted'].includes(x.status))||
  (filter==='accepted'&&x.status==='accepted')||
  (filter==='upcoming'&&['accepted','confirmed','en_route','arrived','in_progress'].includes(x.status))||
  (filter==='finished'&&['completed','cancelled'].includes(x.status)));
}
function cardHTML(b){
 let actions='';
 if(b.status==='requested'){
  actions='<form class="request-inline-form" data-action="quote" data-id="'+esc(b.id)+'"><label class="field-label" for="price-'+esc(b.id)+'">PRECIO $ UYU</label><input type="number" id="price-'+esc(b.id)+'" name="price" min="1" max="10000000" step="1" placeholder="Importe" required><button type="submit">Cotizar →</button></form>';
 }else{
  const action={accepted:['confirm','Confirmar reserva'],confirmed:['en_route','Salir a recoger'],
   en_route:['arrived','Llegué'],arrived:['in_progress','Iniciar viaje'],in_progress:['completed','Finalizar viaje']}[b.status];
  if(action)actions='<button type="button" class="secondary-btn" data-action="'+action[0]+'" data-id="'+esc(b.id)+'">'+action[1]+'</button>';
 }
 const pill=['confirmed','accepted','en_route','arrived','in_progress'].includes(b.status)?'confirmed':
  ['completed','cancelled'].includes(b.status)?'done':'';
 const price=b.price!=null&&Number.isFinite(Number(b.price))?'<p><strong>Propuesta: $ '+esc(Number(b.price).toLocaleString('es-UY'))+' UYU</strong></p>':'';
 const km=Number(b.route?.distanceKm);
 return '<article class="request-card" id="driver-booking-'+esc(b.id)+'" data-booking-id="'+esc(b.id)+'" data-status="'+esc(b.status)+'">'+
  '<div><div class="request-head"><span class="pill '+pill+'">'+esc(labels[b.status]||b.status)+'</span><span>· '+esc(fmtDate(b.date))+' '+esc(b.time)+'</span></div>'+
  '<h3>'+esc(displayAddress(b.origin))+' → '+esc(displayAddress(b.destination))+'</h3>'+
  '<p>Pasajero: <strong>'+esc(b.name)+'</strong> · '+esc(b.phone)+' · '+esc(b.passengers)+' persona(s) · '+esc(b.bags)+' valija(s)</p>'+
  (b.notes?'<p>Nota: '+esc(b.notes)+'</p>':'')+price+
  (Number.isFinite(km)&&km>0?'<p>'+esc(km.toLocaleString('es-UY',{maximumFractionDigits:1}))+' km estimados</p>':'')+
  '<p style="font-size:10px;color:#9daaa3">'+esc(b.id)+'</p></div><div class="request-actions">'+actions+'</div></article>';
}
function driverAcknowledged(){
 try{const arr=JSON.parse(localStorage.getItem(notifiedKey)||'[]');return new Set(Array.isArray(arr)?arr.slice(-120):[])}
 catch{return new Set()}
}
function rememberDriverAlert(id){
 try{const ids=driverAcknowledged();ids.add(String(id));localStorage.setItem(notifiedKey,JSON.stringify([...ids].slice(-120)))}catch{}
}
function closeDriverSheet(){
 $('driver-accept-alert')?.classList.add('hidden');
 driverAlertBooking=null;
 if(driverAlertTrigger?.isConnected)driverAlertTrigger.focus({preventScroll:true});
 driverAlertTrigger=null;
}
function focusAcceptedBooking(){
 const b=driverAlertBooking;
 closeDriverSheet();
 if(!b)return;
 filter='accepted';
 document.querySelectorAll('.filter').forEach(btn=>btn.classList.toggle('active',btn.dataset.filter==='accepted'));
 renderDriver().then(()=>{
  const card=[...document.querySelectorAll('.request-card')].find(node=>node.dataset.bookingId===b.id);
  if(card){card.scrollIntoView({block:'center',behavior:'smooth'});card.setAttribute('tabindex','-1');card.focus({preventScroll:true})}
 });
}
function displayAcceptedSheet(b){
 if(!b||b.status!=='accepted'||!$('driver-accept-alert'))return;
 driverAlertBooking=b;
 driverAlertTrigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const first=String(b.name||'El pasajero').trim().split(/\s+/)[0]||'El pasajero';
 $('driver-alert-description').textContent=first+' aceptó tu propuesta.';
 const origin=String(b.origin||'').split(',')[0].trim(),dest=String(b.destination||'').split(',')[0].trim();
 $('driver-alert-route').textContent=origin+' → '+dest;
 $('driver-alert-price').textContent=b.price!=null&&Number.isFinite(Number(b.price))?
  '$ '+Number(b.price).toLocaleString('es-UY')+' UYU':'';
 $('driver-accept-alert').classList.remove('hidden');
 $('driver-accept-alert').querySelector('.via-driver-sheet')?.focus({preventScroll:true});
 if(document.hidden&&'Notification' in window&&Notification.permission==='granted'){
  try{
   const notice=new Notification('Vía Traslados · Presupuesto aceptado',{
    body:'El pasajero aceptó una propuesta. Falta tu confirmación.',
    tag:'via-accepted-'+b.id,icon:'./icon.svg'});
   notice.onclick=()=>{window.focus();notice.close();focusAcceptedBooking()};
  }catch{}
 }
}
function updateDriverAcceptance(rows){
 const accepted=rows.filter(b=>b.status==='accepted');
 const badge=$('driver-new-acceptances');
 badge?.classList.toggle('hidden',accepted.length===0);
 if(badge)badge.textContent=accepted.length===1?'1 aceptación pendiente':accepted.length+' aceptaciones pendientes';
 const permission=$('driver-enable-alerts');
 if(permission)permission.classList.toggle('hidden',S.isDemo()||!('Notification'in window)||Notification.permission!=='default');
 const acknowledged=driverAcknowledged();
 const fresh=accepted.filter(b=>{
  if(acknowledged.has(String(b.id)))return false;
  const previous=driverSnapshots.get(b.id);
  if(previous&&previous!=='accepted')return true;
  if(driverFirstLoad){
   const raw=String(b.updated_at||'').trim();
   const timestamp=Date.parse(raw.includes('T')||raw.endsWith('Z')?raw:raw.replace(' ','T')+'Z');
   return Number.isFinite(timestamp)&&Date.now()-timestamp<4*3600000&&Date.now()>=timestamp-120000;
  }
  return !previous;
 }).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
 for(const b of rows)driverSnapshots.set(b.id,b.status);
 driverFirstLoad=false;
 if(fresh.length){
  const next=fresh[0];
  rememberDriverAlert(next.id);
  if(!driverAlertBooking)displayAcceptedSheet(next);
 }
 if(driverAlertBooking&&!accepted.some(x=>x.id===driverAlertBooking.id))closeDriverSheet();
}
async function renderDriver(){
 if(driverFetchInProgress){driverRefreshPending=true;return}
 driverFetchInProgress=true;
 try{
  const rows=await S.list(operatorKey);
  $('driver-error').classList.add('hidden');
  $('stat-total').textContent=rows.length;
  $('stat-pending').textContent=rows.filter(x=>x.status==='requested').length;
  $('stat-confirmed').textContent=rows.filter(x=>['confirmed','en_route','arrived','in_progress'].includes(x.status)).length;
  updateDriverAcceptance(rows);
  const rs=filtered(rows);
  $('requests-list').innerHTML=rs.length?rs.map(cardHTML).join(''):
   '<div class="empty"><span class="empty-icon">◇</span><h3>Sin solicitudes en esta vista</h3><p>Las reservas aparecerán aquí cuando haya novedades.</p></div>';
 }catch(err){
  if(/acceso|clave|auth|401/i.test(err.message)){
   $('driver-content').classList.add('hidden');$('driver-auth').classList.remove('hidden');
   sessionStorage.removeItem('via-operator-key');operatorKey='';closeDriverSheet();
  }else errorPlace('driver-error',err.message);
 }finally{
  driverFetchInProgress=false;
  if(driverRefreshPending){driverRefreshPending=false;queueMicrotask(renderDriver)}
 }
}
function initDriver(){
 $('today-chip').textContent=new Date().toLocaleDateString('es-UY',{weekday:'long',day:'numeric',month:'long'});
 if(!S.isDemo()){
  operatorKey=sessionStorage.getItem('via-operator-key')||'';
  if(!operatorKey){$('driver-content').classList.add('hidden');$('driver-auth').classList.remove('hidden')}
 }
 $('auth-form').addEventListener('submit',async e=>{
  e.preventDefault();operatorKey=$('driver-key').value.trim();
  sessionStorage.setItem('via-operator-key',operatorKey);
  driverFirstLoad=true;driverSnapshots=new Map();
  $('driver-auth').classList.add('hidden');$('driver-content').classList.remove('hidden');
  await renderDriver();
 });
 $('refresh-btn').addEventListener('click',renderDriver);
 document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{
  filter=b.dataset.filter;
  document.querySelectorAll('.filter').forEach(c=>c.classList.toggle('active',b===c));
  renderDriver();
 }));
 $('driver-new-acceptances')?.addEventListener('click',()=>{
  filter='accepted';
  document.querySelectorAll('.filter').forEach(c=>c.classList.toggle('active',c.dataset.filter==='accepted'));
  renderDriver();
  $('requests-list').scrollIntoView({behavior:'smooth',block:'start'});
 });
 $('driver-enable-alerts')?.addEventListener('click',async()=>{
  if(!('Notification'in window))return;
  const state=await Notification.requestPermission();
  $('driver-enable-alerts').classList.toggle('hidden',state!=='default');
 });
 $('driver-alert-close')?.addEventListener('click',closeDriverSheet);
 $('driver-accept-alert')?.addEventListener('click',e=>{
  if(e.target===$('driver-accept-alert'))closeDriverSheet();
 });
 $('driver-alert-open')?.addEventListener('click',focusAcceptedBooking);
 $('driver-alert-confirm')?.addEventListener('click',()=>{
  const id=driverAlertBooking?.id;
  focusAcceptedBooking();
  if(!id)return;
  setTimeout(()=>{
   const card=[...document.querySelectorAll('.request-card')].find(node=>node.dataset.bookingId===id);
   const button=card?.querySelector('button[data-action="confirm"]');
   if(button){button.focus({preventScroll:true});button.scrollIntoView({behavior:'smooth',block:'center'})}
  },180);
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('driver-accept-alert')?.classList.contains('hidden'))closeDriverSheet();
 });
 $('requests-list').addEventListener('submit',async e=>{
  const form=e.target.closest('form[data-action="quote"]');if(!form)return;
  e.preventDefault();
  const price=Number(new FormData(form).get('price'));
  if(!Number.isInteger(price)||price<1)return;
  try{await S.operatorUpdate(form.dataset.id,{status:'quoted',price},operatorKey);await renderDriver()}
  catch(err){errorPlace('driver-error',err.message)}
 });
 $('requests-list').addEventListener('click',async e=>{
  const button=e.target.closest('button[data-action]');if(!button)return;
  const status=button.dataset.action;
  if(!['confirm','en_route','arrived','in_progress','completed'].includes(status))return;
  try{
   await S.operatorUpdate(button.dataset.id,{status:status==='confirm'?'confirmed':status},operatorKey);
   // Una reserva confirmada deja de pertenecer a «Aceptadas». Mostrarla en «Próximas»,
   // para que no parezca que desapareció tras confirmar el conductor.
   if(status==='confirm'&&filter==='accepted'){
    filter='upcoming';
    document.querySelectorAll('.filter').forEach(item=>item.classList.toggle('active',item.dataset.filter==='upcoming'));
   }
   await renderDriver();
  }catch(err){errorPlace('driver-error',err.message)}
 });
 if(S.isDemo()||operatorKey)renderDriver();
 window.addEventListener('storage',()=>{if(S.isDemo()||operatorKey)renderDriver()});
 window.addEventListener('via-updated',()=>{if(S.isDemo()||operatorKey)renderDriver()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(S.isDemo()||operatorKey))renderDriver()});
 setInterval(()=>{if((S.isDemo()||operatorKey)&&!document.hidden)renderDriver()},12000);
}
async function initMine(){
 const container=$('mine-list'),login=$('mine-login-card'),welcome=$('mine-welcome');
 const tabs=$('mine-tabs'),more=$('mine-more');
 if(S.isDemo()){
  const thumb=$('mine-login-passkey');if(thumb)thumb.hidden=true;
  const row=document.querySelector('.mine-login-actions');if(row)row.style.gridTemplateColumns='1fr';
 }
 if(!container)return;
 let captchaToken='',turnstileLoaded=false,mineTab='active',mineLimit=5,mineRows=[];
 const note=message=>{const el=$('mine-login-feedback');if(el)el.textContent=message||''};
 const archived=new Set(['completed','cancelled']);
 const shortPlace=value=>{
  const full=String(value||'').trim();
  if(/aeropuerto internacional de carrasco/i.test(full))return 'Aeropuerto de Carrasco';
  const parts=full.split(',').map(x=>x.trim()).filter(Boolean);
  if(parts.length<2)return full;
  const street=parts[0].replace(/^(?:AVENIDA|AV\.)\s+/i,'Av. ');
  const locality=parts[1].replace(/^MONTEVIDEO$/i,'Montevideo');
  return street+', '+locality;
 };
 const palette=status=>status==='accepted'?'accepted':
  status==='confirmed'?'confirmed':
  ['en_route','arrived','in_progress'].includes(status)?'moving':
  status==='completed'?'finished':status==='cancelled'?'cancelled':'quoted';
 const item=b=>{
  const historic=archived.has(b.status);
  const origin=String(b.origin||''),destination=String(b.destination||'');
  const price=Number(b.price),hasPrice=b.price!=null&&Number.isFinite(price);
  const km=Number(b.route?.distanceKm);
  const label=b.status==='accepted'?'Oferta aceptada':b.status==='confirmed'?'Reserva confirmada':
   (labels[b.status]||'Solicitud recibida');
  return '<a class="via-booking-card '+(historic?'via-booking-card--history':'')+'" href="./reserva.html?id='+encodeURIComponent(String(b.id||''))+'" aria-label="'+esc(label+' · '+origin+' a '+destination)+'">'+
   '<div class="via-booking-card__top"><span class="via-status-chip via-status-chip--'+palette(b.status)+'">'+esc(label)+'</span><span class="via-booking-card__arrow" aria-hidden="true">→</span></div>'+
   '<div class="via-booking-card__route"><span class="via-booking-card__location" title="'+esc(origin)+'">'+esc(shortPlace(origin))+'</span><span class="via-booking-card__route-symbol" aria-hidden="true">→</span><span class="via-booking-card__location" title="'+esc(destination)+'">'+esc(shortPlace(destination))+'</span></div>'+
   '<div class="via-booking-card__bottom"><span>'+esc(fmtDate(b.date))+' · '+esc(b.time)+
   (Number.isFinite(km)&&km>0?' · '+esc(km.toLocaleString('es-UY',{maximumFractionDigits:1}))+' km':'')+
   '</span>'+(hasPrice?'<strong class="via-booking-card__price">$ '+esc(price.toLocaleString('es-UY',{maximumFractionDigits:0}))+'</strong>':'')+'</div></a>';
 };
 const displayRows=()=>{
  const active=mineRows.filter(b=>!archived.has(b.status));
  const history=mineRows.filter(b=>archived.has(b.status));
  $('mine-count-active').textContent=active.length;
  $('mine-count-history').textContent=history.length;
  const priority=s=>({accepted:0,confirmed:1,quoted:2,requested:3,en_route:4,arrived:5,in_progress:6})[s]??7;
  active.sort((a,b)=>priority(a.status)-priority(b.status)||
   String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||'')));
  history.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||'')));
  const selected=mineTab==='active'?active:history;
  const page=selected.slice(0,mineLimit);
  container.innerHTML=page.length?page.map(item).join(''):
    '<div class="via-mine-empty"><strong>'+(mineTab==='active'?'No tenés reservas activas':'Todavía no hay historial')+'</strong><span>'+
    (mineTab==='active'?'Cuando solicites un nuevo viaje, aparecerá aquí.':'Las reservas finalizadas o canceladas aparecerán aquí.')+'</span></div>';
  more?.classList.toggle('hidden',selected.length<=mineLimit);
  for(const name of ['active','history']){
   const tab=$('mine-tab-'+name);
   tab?.classList.toggle('is-active',mineTab===name);
   tab?.setAttribute('aria-pressed',String(mineTab===name));
  }
 };
 for(const name of ['active','history'])$('mine-tab-'+name)?.addEventListener('click',()=>{
  mineTab=name;mineLimit=5;displayRows();
 });
 more?.addEventListener('click',()=>{mineLimit+=5;displayRows()});
 let mineDrawEpoch=0,authMode=(new URLSearchParams(window.location.search).get('accion')==='registro'?'signup':'choice'),signupMode=authMode==='signup',signupEmail='',signupCaptchaToken='',signupCaptchaReady=false,signupGeneration=0;
 let mineVerifiedToken=null,mineValidatingToken=null,mineAuthEpoch=0,mineChecking=false;
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
  if(state)state.textContent=mineChecking?'Comprobando tu sesión…':'';
  login?.classList.toggle('hidden',mineChecking||!!person||authMode!=='login');
  $('mine-signup-card')?.classList.toggle('hidden',mineChecking||!!person||authMode!=='signup');
  welcome?.classList.toggle('hidden',!person);
  $('mine-identity-choice')?.classList.toggle('hidden',mineChecking||!!person);
  $('mine-entry-hero')?.classList.toggle('hidden',mineChecking||!!person||authMode!=='choice');
  $('mine-existing')?.classList.toggle('is-selected',!person&&authMode==='login');
  $('mine-new')?.classList.toggle('is-selected',!person&&authMode==='signup');
  $('mine-existing')?.setAttribute('aria-pressed',String(!person&&authMode==='login'));
  $('mine-new')?.setAttribute('aria-pressed',String(!person&&authMode==='signup'));
  container.classList.toggle('hidden',!person);
  if(!person){
   mineRows=[];tabs?.classList.add('hidden');more?.classList.add('hidden');
   $('mine-greeting').textContent='';
   container.textContent='';
   return;
  }
  const first=String(person.name||'').trim().split(/\s+/)[0]||'';
  $('mine-greeting').textContent=first?'Hola, '+first:'Tu cuenta';
  try{
   const rows=await S.mine();
   if(seq!==mineDrawEpoch)return;
   if(S.customer()?.sessionToken!==account.sessionToken){void refreshMineIdentity();return}
   mineRows=Array.isArray(rows)?rows:[];
   tabs?.classList.remove('hidden');displayRows();
  }catch(e){
   if(seq===mineDrawEpoch&&S.customer()?.sessionToken===account.sessionToken)
    container.textContent='No pudimos consultar tus viajes. Revisá tu conexión e intentá ingresar de nuevo.';
  }
 }
 function turnstile(){
  if(S.isDemo()||mineVerifiedToken||mineChecking||turnstileLoaded||!window.VIA_CONFIG?.turnstileSiteKey)return;
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
  const button=$('mine-logout');button.disabled=true;
  authMode='choice';signupMode=false;signupGeneration++;
  const revoke=S.logout();
  $('mine-login-phone').value='';
  $('mine-login-code').value='';
  $('mine-login-verify')?.classList.add('hidden');
  $('mine-greeting').textContent='';
  mineTab='active';mineLimit=5;mineRows=[];
  await draw();
  try{await revoke}finally{
   note('');
   turnstileLoaded=false;turnstile();button.disabled=false;
  }
 });
 function signupMessage(message){$('mine-signup-feedback').textContent=message||'';}
 function signupCaptcha(){
  const key=window.VIA_CONFIG?.turnstileSiteKey;
  if(!key||signupCaptchaReady||S.isDemo())return;
  signupCaptchaReady=true;
  const render=()=>{if(!window.turnstile)return;window.turnstile.render('#mine-signup-turnstile',{sitekey:key,action:'otp',callback:t=>{signupCaptchaToken=t},'expired-callback':()=>{signupCaptchaToken=''}})};
  if(window.turnstile){render();return}
  const js=document.createElement('script');js.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  js.async=true;js.defer=true;js.onload=render;document.head.appendChild(js);
 }
 $('mine-existing')?.addEventListener('click',async()=>{authMode='login';signupMode=false;signupGeneration++;signupMessage('');note('');await draw();$('mine-login-phone')?.focus({preventScroll:true})});
 $('mine-new')?.addEventListener('click',async()=>{authMode='signup';signupMode=true;signupGeneration++;note('');await draw();signupCaptcha();});
 $('mine-signup-send')?.addEventListener('click',async()=>{
  const name=$('mine-signup-name').value.trim(),phone=$('mine-signup-phone').value.trim(),email=$('mine-signup-email').value.trim().toLowerCase();
  if(name.length<2||!/^\+?[\d\s()\-]{7,30}$/.test(phone)||!/^\S+@\S+\.\S+$/.test(email)){signupMessage('Completá nombre, celular y correo válidos.');return;}
  if(window.VIA_CONFIG?.turnstileSiteKey&&!signupCaptchaToken){signupMessage('Completá la verificación de seguridad.');return;}
  const generation=++signupGeneration,button=$('mine-signup-send');button.disabled=true;
  signupMessage('Enviando el código de verificación…');
  try{
   const result=await S.startVerification(email,signupCaptchaToken);
   if(generation!==signupGeneration||!signupMode)return;
   signupEmail=(result.email||email).toLowerCase();
   $('mine-signup-verify').classList.remove('hidden');
   signupMessage('Revisá el correo y escribí el código de seis cifras.');
  }catch(e){if(generation===signupGeneration)signupMessage(e.message||'No se pudo enviar el código.');}
  finally{button.disabled=false}
 });
 $('mine-signup-confirm')?.addEventListener('click',async()=>{
  const code=$('mine-signup-code').value.trim();
  if(!/^\d{6}$/.test(code)){signupMessage('Ingresá las seis cifras del correo.');return}
  const generation=signupGeneration,button=$('mine-signup-confirm');button.disabled=true;
  const profile={name:$('mine-signup-name').value.trim(),phone:$('mine-signup-phone').value.trim()};
  signupMessage('Verificando tu nueva cuenta…');
  try{
   await S.verifyCode(signupEmail,code,profile);
   if(generation!==signupGeneration||!signupMode)return;
   if(!S.customer())throw Error('No se pudo completar el registro.');
   $('mine-signup-code').value='';signupEmail='';authMode='choice';signupMode=false;signupGeneration++;
   signupMessage('');await draw();
  }catch(e){if(generation===signupGeneration)signupMessage(e.message||'El código no fue aceptado.');}
  finally{button.disabled=false}
 });
 window.addEventListener('via-customer-session',()=>{
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
 await refreshMineIdentity();
 turnstile();
}

const page=document.body.dataset.page;if(page==='passenger')initPassenger();if(page==='booking')initBooking();if(page==='mine')initMine();if(page==='driver')initDriver();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
