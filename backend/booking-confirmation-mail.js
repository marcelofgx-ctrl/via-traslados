/* Confirmation only. Provider acceptance is not proof of inbox delivery. */
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-UY').format(n);
const fmtDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.split('-').reverse().join('/'):String(s||'');
export function confirmationEmail(r,from){
 if(!r||!/^VIA-[A-Z0-9-]+$/.test(r.id)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)||!from||
 !Number.isInteger(r.price)||r.price<=0)throw Error('Invalid confirmation snapshot');
 const route=Number.isFinite(r.distance_m)&&r.distance_m>0&&Number.isFinite(r.duration_s)&&r.duration_s>0;
 const metrics=route?money(Math.round(r.distance_m/100)/10)+' km · '+Math.max(1,Math.round(r.duration_s/60))+' min (estimados, sin tránsito en vivo)':'Distancia y duración por confirmar';
 const fields=[['Reserva',r.id],['Origen',r.origin],['Destino',r.destination],['Fecha y hora',fmtDate(r.date)+' · '+r.time],['Pasajeros / valijas',r.passengers+' / '+r.bags],['Recorrido',metrics],['Importe acordado','$ '+money(r.price)+' UYU']];
 const url='https://viatraslados.com/mis-reservas.html';
 const text=['Vía Traslados','Tu traslado está confirmado','Hola, '+r.name+'.',...fields.map(([k,v])=>k+': '+v),'Pago al realizar el traslado.','Consultá tu reserva con tu acceso seguro: '+url].join('\n');
 const html='<div style="background:#edf4ef;padding:20px;font-family:Arial,sans-serif;color:#24463d"><table role="presentation" width="100%" style="max-width:560px;margin:auto;background:#fff;border:1px solid #dce8e0;border-radius:18px"><tr><td style="padding:24px"><p style="font-size:22px;color:#096459;font-weight:bold">Vía Traslados</p><h1 style="font-size:24px;color:#096459">Tu traslado está confirmado</h1><p>Hola, '+escape(r.name)+'. Ya está todo listo para tu viaje.</p><table role="presentation" width="100%" cellpadding="8" style="border-collapse:collapse">'+fields.map(([k,v])=>'<tr><td style="font-size:12px;color:#617b6f;border-bottom:1px solid #edf2ef">'+escape(k)+'</td><td style="font-size:14px;font-weight:600;border-bottom:1px solid #edf2ef">'+escape(v)+'</td></tr>').join('')+'</table><p>Pago al realizar el traslado.</p><p style="margin:24px 0"><a href="'+url+'" style="background:#096459;color:white;padding:13px 20px;border-radius:10px;text-decoration:none;display:inline-block">Consultar mi reserva</a></p><p style="color:#75877e;font-size:12px">Gracias por elegir Vía Traslados.</p></td></tr></table></div>';
 return {from,to:[r.email],subject:'Tu traslado está confirmado · '+r.id,text,html};
}
// No provider calls unless explicitly enabled. The DB trigger is atomic with confirmation.
// Stable provider key, immutable payload and a 23-hour retry window to avoid duplicate mail.
export async function drainConfirmationMail(env,{fetcher=fetch,limit=5}={}){
 if(env.VIA_CONFIRMATION_MAIL_ENABLED!=='true'||!env.RESEND_API_KEY||!env.RESEND_FROM)return 0;
 const db=env.DB;
 await db.prepare("UPDATE booking_confirmation_mail SET state='cancelled',payload='',lease=NULL,lease_until=NULL WHERE state IN ('pending','sending') AND EXISTS(SELECT 1 FROM bookings WHERE id=booking_id AND status='cancelled')").run();
 await db.prepare("UPDATE booking_confirmation_mail SET state='failed',payload='',lease=NULL,lease_until=NULL WHERE state IN ('pending','sending') AND (created_at<unixepoch()-82800 OR (attempts>=6 AND COALESCE(lease_until,0)<unixepoch()))").run();
 let count=0;
 for(let i=0;i<Math.min(10,Math.max(0,limit));i++){
  const lease=crypto.randomUUID();
  const row=await db.prepare("UPDATE booking_confirmation_mail SET state='sending',attempts=attempts+1,lease=?,lease_until=unixepoch()+120 WHERE booking_id=(SELECT m.booking_id FROM booking_confirmation_mail m JOIN bookings b ON b.id=m.booking_id WHERE b.status IN ('confirmed','en_route','arrived','in_progress','completed') AND m.attempts<6 AND m.created_at>=unixepoch()-82800 AND ((m.state='pending' AND m.next_at<=unixepoch()) OR (m.state='sending' AND m.lease_until<unixepoch())) ORDER BY m.created_at LIMIT 1) RETURNING booking_id,payload,attempts").bind(lease).first();
  if(!row)break;
  let providerId=null,permanent=false;
  try{
   const message=confirmationEmail(JSON.parse(row.payload),env.RESEND_FROM);
   const r=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'via-confirmation-v1-'+row.booking_id},body:JSON.stringify(message)});
   if(r.ok){const j=await r.json();if(typeof j.id==='string'&&j.id)providerId=j.id}
   else permanent=r.status>=400&&r.status<500&&![408,409,429].includes(r.status);
  }catch{/* No passenger info or provider body in logs. Retry bounded. */}
  if(providerId){
   await db.prepare("UPDATE booking_confirmation_mail SET state='sent',provider_id=?,sent_at=unixepoch(),payload='',lease=NULL,lease_until=NULL WHERE booking_id=? AND lease=?").bind(providerId,row.booking_id,lease).run();
   count++;
  }else{
   const terminal=permanent||row.attempts>=6;
   await db.prepare("UPDATE booking_confirmation_mail SET state=?,payload=CASE WHEN ?=1 THEN '' ELSE payload END,next_at=unixepoch()+?,lease=NULL,lease_until=NULL WHERE booking_id=? AND lease=?").bind(terminal?'failed':'pending',terminal?1:0,Math.min(3600,60*2**row.attempts),row.booking_id,lease).run();
  }
 }
 return count;
}
export function queueConfirmationDelivery(env,ctx){
 if(env.VIA_CONFIRMATION_MAIL_ENABLED!=='true'||!ctx?.waitUntil)return;
 ctx.waitUntil(drainConfirmationMail(env).catch(()=>console.error('via-confirmation-mail-drain-failed')));
}
