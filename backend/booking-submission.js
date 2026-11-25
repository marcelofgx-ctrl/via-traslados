// Vía Traslados — idempotencia opcional, compatible con clientes anteriores.
// La clave es una credencial aleatoria de 256 bits: no guardarla ni escribirla en logs.
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))))
  .map(x=>x.toString(16).padStart(2,'0')).join('');

export async function submissionFromRequest(req,booking) {
  if(!req.headers.has('Idempotency-Key'))return null;
  const key=(req.headers.get('Idempotency-Key')||'').trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(key))throw Error('Clave de envío inválida. Generá una nueva clave segura.');
  return {
    keyHash:await digest('via-booking-submit-key-v1:'+key),
    payloadHash:await digest('via-booking-submit-payload-v1:'+JSON.stringify(booking)),
    // Access token estable para recuperar la respuesta perdida, distinto de la clave HTTP.
    token:await digest('via-booking-recovery-v1:'+key+':'+booking.email),
    email:booking.email
  };
}

export async function findExistingSubmission(env,submission) {
  if(!submission)return null;
  const row=await env.DB.prepare(
    'SELECT s.payload_hash,s.email,s.booking_id,b.status '+
    'FROM booking_submission_keys s JOIN bookings b ON b.id=s.booking_id WHERE s.key_hash=?'
  ).bind(submission.keyHash).first();
  if(!row)return null;
  if(row.payload_hash!==submission.payloadHash||row.email!==submission.email)
    return {error:'La clave de envío ya corresponde a una solicitud diferente.',status:409};
  return {id:row.booking_id,access_token:submission.token,status:row.status,replayed:true};
}

export async function storeBookingAtomic(env,booking,id,tokenHash,submission) {
  // D1.batch garantiza una sola transacción: si falla un INSERT, se revierte todo.
  const statements=[
    env.DB.prepare(
      "INSERT INTO customers (email,name,phone) VALUES (?,?,?) "+
      "ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,updated_at=datetime('now')"
    ).bind(booking.email,booking.name,booking.phone),
    env.DB.prepare(
      'INSERT INTO bookings (id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,notes,access_token_hash,status) '+
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(id,booking.name,booking.phone,booking.email,booking.origin,booking.destination,booking.date,booking.time,booking.passengers,booking.bags,booking.notes,tokenHash,'requested'),
    env.DB.prepare('INSERT INTO booking_events (booking_id,old_status,new_status,actor) VALUES (?,?,?,?)')
      .bind(id,null,'requested','passenger')
  ];
  if(submission)statements.push(env.DB.prepare(
    'INSERT INTO booking_submission_keys (key_hash,payload_hash,email,booking_id) VALUES (?,?,?,?)'
  ).bind(submission.keyHash,submission.payloadHash,booking.email,id));
  const result=await env.DB.batch(statements);
  if(result.length!==statements.length || result.some(x=>x.success===false))
    throw Error('No se pudo confirmar la transacción completa de reserva');
}
