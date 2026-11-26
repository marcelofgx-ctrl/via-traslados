import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmationEmail,drainConfirmationMail} from '../backend/booking-confirmation-mail.js';
const row={id:'VIA-DEMO-001',email:'test@example.invalid',name:'<Invitado>',origin:'Origen & calle',destination:'Aeropuerto',date:'2026-11-27',time:'10:00',passengers:1,bags:1,price:1000,distance_m:3400,duration_s:300};
test('confirmed mail uses exact facts, escapes HTML and never includes bearer token',()=>{
 const m=confirmationEmail(row,'Vía Traslados <test@example.invalid>');
 assert.equal(m.to[0],row.email);assert.match(m.text,/3,4 km · 5 min/);assert.match(m.text,/27\/11\/2026/);
 assert.match(m.html,/&lt;Invitado&gt;/);assert.match(m.html,/Origen &amp; calle/);
 assert.match(m.html,/https:\/\/viatraslados.com\/mis-reservas.html/);
 assert(!m.html.includes('<Invitado>'));assert(!m.html.includes('access_token'));
});
test('missing route stays unconfirmed and no missing price is invented',()=>{
 assert.match(confirmationEmail({...row,distance_m:null,duration_s:null},'test@example.invalid').text,/por confirmar/);
 assert.throws(()=>confirmationEmail({...row,price:null},'test@example.invalid'));
});
test('off switch avoids DB and provider',async()=>{
 assert.equal(await drainConfirmationMail({DB:{prepare(){throw Error('unexpected DB')} }},{fetcher(){throw Error('unexpected provider')}}),0);
});
test('stable idempotency and provider acceptance recorded',async()=>{
 let taken=false,record=null,key=null;
 const env={VIA_CONFIRMATION_MAIL_ENABLED:'true',RESEND_API_KEY:'test-only',RESEND_FROM:'test@example.invalid',DB:{prepare(sql){return{bind(...args){this.args=args;return this},async first(){if(taken)return null;taken=true;return{booking_id:row.id,payload:JSON.stringify(row),attempts:1}},async run(){if(sql.includes("state='sent'"))record=this.args;return{success:true}}}}}};
 assert.equal(await drainConfirmationMail(env,{fetcher:async(u,o)=>{key=o.headers['Idempotency-Key'];assert.equal(JSON.parse(o.body).to[0],row.email);return Response.json({id:'synthetic-provider-id'})}}),1);
 assert.equal(key,'via-confirmation-v1-'+row.id);assert.equal(record[0],'synthetic-provider-id');
});
