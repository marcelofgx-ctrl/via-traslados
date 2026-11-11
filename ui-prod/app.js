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
 async function loadTurnstile(){if(S.isDemo())return;if(!window.VIA_CONFIG?.turnstileSiteKey){showError('La verificación anti-bots aún no está configurada. No se pueden enviar solicitudes reales.');return}
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
  if(!S.isDemo()&&!turnstileToken)return showError('Completá la verificación anti-bots antes de continuar.');
  const button=$('send-code');button.disabled=true;button.textContent='Solicitando código…';
  try{
   const result=await S.startVerification(p.email,turnstileToken);
   verificationEmail=result.email;lastPayload={...p,email:result.email};
   $('verification-description').textContent=S.isDemo()?'Código de demostración. No se envía ningún correo.':'Enviamos un código al correo '+result.maskedEmail+'.';
   $('otp-guidance').textContent=S.isDemo()?'DEMO: ingresá 123456. Esto no verifica un correo real.':'El código vence en 10 minutos. No lo compartas con nadie.';
   changeStep(3);$('otp-code').focus();turnstileToken='';
  }catch(e){showError(e.message||'No fue posible enviar el código')}finally{button.disabled=false;button.innerHTML='Recibir código de verificación <span>→</span>'}
 }
 $('send-code').addEventListener('click',sendCode);
 $('resend-code').addEventListener('click',async()=>{changeStep(2);$('email').focus();showError('Revisá el correo y solicitá un código nuevo.')});
 form.addEventListener('submit',async e=>{e.preventDefault();if(step!==3)return;
  const code=$('otp-code').value.trim();if(!/^\d{4,10}$/.test(code))return showError('Ingresá el código numérico recibido.');
  const button=$('verify-and-book');button.disabled=true;button.textContent='Comprobando…';
  try{
   await S.verifyCode(verificationEmail,code);
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
async function initBooking(){const id=new URLSearchParams(location.search).get('id');if(!id){$('status-container').innerHTML='<p>Falta el código de reserva. Volvé a solicitar un viaje.</p>';return}async function render(){try{const b=await S.get(id);if(!b){$('status-container').innerHTML='<p>No se encontró la reserva en este dispositivo.</p>';return}const signature=JSON.stringify(b);if(signature===lastRender)return;lastRender=signature;$('status-container').innerHTML=statusHTML(b);$('accept-btn')?.addEventListener('click',async()=>{if(!confirm('¿Querés aceptar esta propuesta?'))return;try{await S.accept(id);lastRender='';await render()}catch(err){alert(err.message)}});$('cancel-btn')?.addEventListener('click',async()=>{if(!confirm('¿Querés cancelar esta solicitud?'))return;try{await S.cancel(id);lastRender='';await render()}catch(err){alert(err.message)}})}catch(err){$('status-container').innerHTML='<p class="error-text">'+esc(err.message)+'</p>'}}await render();window.addEventListener('storage',render);window.addEventListener('via-updated',render);setInterval(render,12000)}
let filter='all';let operatorKey='';function filtered(rows){return rows.filter(x=>filter==='all'||(filter==='pending'&&['requested','quoted'].includes(x.status))||(filter==='upcoming'&&['accepted','confirmed','en_route','arrived','in_progress'].includes(x.status))||(filter==='finished'&&['completed','cancelled'].includes(x.status)))}
function cardHTML(b){let actions='';if(b.status==='requested'){actions=`<form class="request-inline-form" data-action="quote" data-id="${esc(b.id)}"><label class="field-label" for="price-${esc(b.id)}">PRECIO $ UYU</label><input type="number" id="price-${esc(b.id)}" name="price" min="1" max="10000000" step="1" placeholder="Importe" required><button type="submit">Cotizar →</button></form>`}else if(b.status==='accepted'){actions=`<button class="secondary-btn" data-action="confirm" data-id="${esc(b.id)}">Confirmar reserva</button>`}else if(b.status==='confirmed'){actions=`<button class="secondary-btn" data-action="en_route" data-id="${esc(b.id)}">Salir a recoger</button>`}else if(b.status==='en_route'){actions=`<button class="secondary-btn" data-action="arrived" data-id="${esc(b.id)}">Llegué</button>`}else if(b.status==='arrived'){actions=`<button class="secondary-btn" data-action="in_progress" data-id="${esc(b.id)}">Iniciar viaje</button>`}else if(b.status==='in_progress'){actions=`<button class="secondary-btn" data-action="completed" data-id="${esc(b.id)}">Finalizar viaje</button>`}
const pill=['confirmed','accepted','en_route','arrived','in_progress'].includes(b.status)?'confirmed':['completed','cancelled'].includes(b.status)?'done':'';return `<article class="request-card"><div><div class="request-head"><span class="pill ${pill}">${esc(labels[b.status]||b.status)}</span><span>· ${esc(fmtDate(b.date))} ${esc(b.time)}</span></div><h3>${esc(b.origin)} → ${esc(b.destination)}</h3><p>Pasajero: <strong>${esc(b.name)}</strong> · ${esc(b.phone)} · ${esc(b.passengers)} persona(s) · ${esc(b.bags)} valija(s)</p>${b.notes?`<p>Nota: ${esc(b.notes)}</p>`:''}${b.price!=null?`<p><strong>Propuesta: $ ${Number(b.price).toLocaleString('es-UY')} UYU</strong></p>`:''}<p style="font-size:10px;color:#9daaa3">${esc(b.id)}</p></div><div class="request-actions">${actions}</div></article>`}
async function renderDriver(){try{const rows=await S.list(operatorKey);$('driver-error').classList.add('hidden');$('stat-total').textContent=rows.length;$('stat-pending').textContent=rows.filter(x=>x.status==='requested').length;$('stat-confirmed').textContent=rows.filter(x=>['accepted','confirmed','en_route','arrived','in_progress'].includes(x.status)).length;const rs=filtered(rows);$('requests-list').innerHTML=rs.length?rs.map(cardHTML).join(''):`<div class="empty"><span class="empty-icon">◇</span><h3>Sin solicitudes en esta vista</h3><p>Desde la PWA del pasajero podés crear una reserva de prueba y verla acá, en este mismo navegador.</p><a href="./index.html">Abrir PWA de pasajeros →</a></div>`}catch(err){if(/acceso|clave|auth|401/i.test(err.message)){$('driver-content').classList.add('hidden');$('driver-auth').classList.remove('hidden');sessionStorage.removeItem('via-operator-key')}else errorPlace('driver-error',err.message)}}
function initDriver(){$('today-chip').textContent=new Date().toLocaleDateString('es-UY',{weekday:'long',day:'numeric',month:'long'});if(!S.isDemo()){operatorKey=sessionStorage.getItem('via-operator-key')||'';if(!operatorKey){$('driver-content').classList.add('hidden');$('driver-auth').classList.remove('hidden')}}$('auth-form').addEventListener('submit',async(e)=>{e.preventDefault();operatorKey=$('driver-key').value.trim();sessionStorage.setItem('via-operator-key',operatorKey);$('driver-auth').classList.add('hidden');$('driver-content').classList.remove('hidden');await renderDriver()});$('refresh-btn').addEventListener('click',renderDriver);document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(c=>c.classList.toggle('active',b===c));renderDriver()}));$('requests-list').addEventListener('submit',async(e)=>{const form=e.target.closest('form[data-action="quote"]');if(!form)return;e.preventDefault();const price=Number(new FormData(form).get('price'));if(!Number.isInteger(price)||price<1)return;try{await S.operatorUpdate(form.dataset.id,{status:'quoted',price},operatorKey);await renderDriver()}catch(err){errorPlace('driver-error',err.message)}});$('requests-list').addEventListener('click',async(e)=>{const b=e.target.closest('button[data-action]');if(!b)return;const status=b.dataset.action;if(!['confirm','en_route','arrived','in_progress','completed'].includes(status))return;try{await S.operatorUpdate(b.dataset.id,{status:status==='confirm'?'confirmed':status},operatorKey);await renderDriver()}catch(err){errorPlace('driver-error',err.message)}});renderDriver();window.addEventListener('storage',renderDriver);window.addEventListener('via-updated',renderDriver)}
async function initMine(){const container=$('mine-list');if(!container)return;try{
 const rows=await S.mine();
 if(!rows.length){container.innerHTML='<div class="empty"><h3>Sin reservas en este navegador</h3><p>Cuando solicites un traslado, aparecerá acá para que puedas consultar su estado.</p><a href="./index.html">Solicitar un traslado →</a></div>';return}
 container.innerHTML=rows.map(b=>`<a class="mine-item" href="./reserva.html?id=${encodeURIComponent(b.id)}"><div><strong>${esc(b.origin)} → ${esc(b.destination)}</strong><p>${esc(fmtDate(b.date))} · ${esc(b.time)} · ${esc(labels[b.status]||b.status)}</p></div><span aria-hidden="true">→</span></a>`).join('');
 }catch(e){container.textContent='No fue posible consultar las reservas de este dispositivo.'}}
const page=document.body.dataset.page;if(page==='passenger')initPassenger();if(page==='booking')initBooking();if(page==='mine')initMine();if(page==='driver')initDriver();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
