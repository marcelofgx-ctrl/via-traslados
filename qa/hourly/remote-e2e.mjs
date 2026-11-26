// Real remote D1 and Worker; synthetic fixtures only. No OTP bypass in API, no fake provider keys.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const a=process.env.CLOUDFLARE_ACCOUNT_ID,t=process.env.CLOUDFLARE_API_TOKEN;
assert(/^[a-f0-9]{32}$/i.test(a||'')&&t);
const qa='146017ce-09a7-4457-abd2-694a5a5b3e92';
const root='https://api.cloudflare.com/client/v4/accounts/'+a;
const db=root+'/d1/database/'+qa;
const apiRoot='https://via-traslados-api-qa.marcelof-gx.workers.dev';
const origin='https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev';
const hdr={Authorization:'Bearer '+t,'Content-Type':'application/json'};
const sha=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const run=process.env.GITHUB_RUN_ID||randomUUID();
const email='hourly-qa-'+run+'@example.invalid',customerToken=token();
const drivers=[0,1,2].map(n=>({id:randomUUID(),email:'driver-'+n+'-'+run+'@example.invalid',token:token(),all:n!==2}));
const created=new Set();
async function sql(statement,params=[]){
 const r=await fetch(db+'/query',{method:'POST',headers:hdr,body:JSON.stringify({sql:statement,params}),signal:AbortSignal.timeout(25000)});
 const j=await r.json().catch(()=>({}));assert(r.ok&&j.success&&j.result?.[0]?.success,'QA D1 test query failed: '+statement.slice(0,42)+' HTTP '+r.status);return j.result[0].results||[]
}
async function call(path,session,method='GET',body){
 const r=await fetch(apiRoot+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
 const j=await r.json().catch(()=>({}));return {status:r.status,body:j}
}
function expect(r,status,stage){assert.equal(r.status,status,stage+' HTTP '+r.status)}
const future=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
const hourly={serviceType:'hourly',requestId:randomUUID(),origin:'Costa Urbana Shopping (QA)',originLocation:{lat:-34.819,lng:-55.956,source:'map'},date:future,time:'10:00',requestedDurationMinutes:240,passengers:2,bags:1,itineraryNotes:'Datos sintéticos QA',notes:'QA '+run};
const offer={status:'quoted',price:4000,includedDurationMinutes:240,includedKm:80,extraTimeTerms:'A convenir',extraKmTerms:'A convenir',quoteNotes:'QA'};
try{
 const dbInfo=await fetch(db,{headers:hdr});const d=await dbInfo.json();assert(dbInfo.ok&&d.result?.name==='via-traslados-qa-db');
 const health=await call('/api/health');expect(health,200,'health');assert(health.body.backendVersion==='31.1-qa');
 // Only new synthetic accounts; random unusable password hashes; ordinary verified session records.
 await sql('INSERT INTO customers(email,name,phone) VALUES(?,?,?)',[email,'Pasajero QA '+run,'099000000']);
 await sql('INSERT INTO customer_sessions(token_hash,email,expires_at) VALUES(?,?,unixepoch()+900)',[sha(customerToken),email]);
 for(const [i,d] of drivers.entries()){
  await sql("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status) VALUES(?,?,?,?,?,100000,'driver','approved')",[d.id,d.email,'Conductor QA '+i,randomBytes(16).toString('hex'),randomBytes(32).toString('hex')]);
  // Unique synthetic contact, not an actual login credential.
  await sql('INSERT INTO staff_contacts(staff_id,phone,email_verified_at) VALUES(?,?,unixepoch())',[d.id,'qa-'+d.id]);
  await sql("INSERT INTO driver_commercial_profiles(staff_id,mode,can_quote_all,commission_bps) VALUES(?,'contractor',?,2500)",[d.id,d.all?1:0]);
  await sql('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+900)',[sha(d.token),d.id]);
 }
 expect(await call('/api/requests',null,'POST',hourly),401,'anonymous denied');
 const rs=await Promise.all([call('/api/requests',customerToken,'POST',hourly),call('/api/requests',customerToken,'POST',hourly)]);
 for(const r of rs)if(r.status===201||r.status===200)created.add(r.body.id);
 assert.deepEqual(rs.map(r=>r.status).sort(),[200,201],'Concurrent create must deduplicate');
 assert.equal(rs[0].body.id,rs[1].body.id);
 const id=rs[0].body.id, path='/api/requests/'+id, op='/api/operator/requests/'+id;
 const item=await call(path,customerToken);expect(item,200,'passenger read');assert(item.body.destination===null&&item.body.requestedDurationMinutes===240&&item.body.route===null);
 const list=await call('/api/operator/requests',drivers[0].token);expect(list,200,'driver list');assert(list.body.some(x=>x.id===id&&x.serviceType==='hourly'&&x.email===null));
 expect(await call(op,drivers[2].token,'PATCH',offer),403,'unauthorized driver quote');
 const quotes=await Promise.all(drivers.slice(0,2).map(d=>call(op,d.token,'PATCH',offer)));
 assert.deepEqual(quotes.map(r=>r.status).sort(),[200,409],'Concurrent quotes must have one winner');
 const winner=drivers[quotes.findIndex(r=>r.status===200)];
 expect(await call(op,winner.token,'PATCH',offer),200,'quote replay');
 const q=await sql('SELECT q.driver_id,q.price_uyu,q.commission_bps,q.included_duration_minutes,a.driver_id AS assigned FROM booking_quotes q JOIN driver_assignments a ON a.booking_id=q.booking_id WHERE q.booking_id=?',[id]);
 assert.equal(q.length,1);assert.equal(q[0].driver_id,winner.id);assert.equal(q[0].assigned,winner.id);assert.equal(q[0].commission_bps,2500);assert.equal(q[0].included_duration_minutes,240);
 const passenger=await call(path,customerToken);expect(passenger,200,'read quote');assert.equal(passenger.body.hourlyQuote.includedKm,80);
 const history=await call('/api/customer/bookings',customerToken);expect(history,200,'history');assert(history.body.some(x=>x.id===id&&x.hourlyQuote?.priceUyu===4000));
 expect(await call(path+'/accept',customerToken,'POST',{}),200,'accept');expect(await call(path+'/accept',customerToken,'POST',{}),200,'accept replay');
 const legacy={name:'Pasajero QA '+run,phone:'099000000',email,origin:'Costa Urbana Shopping (QA)',destination:'Aeropuerto Internacional de Carrasco (QA)',date:future,time:'13:00',passengers:2,bags:1,notes:'QA '+run};
 const normal=await call('/api/requests',customerToken,'POST',legacy);expect(normal,201,'legacy booking');created.add(normal.body.id);
 const normalOp='/api/operator/requests/'+normal.body.id;
 expect(await call(normalOp,winner.token,'PATCH',{status:'quoted',price:1000}),409,'mixed-mode collision');
 expect(await call(path+'/cancel',customerToken,'POST',{}),200,'cancel hourly');
 expect(await call(normalOp,winner.token,'PATCH',{status:'quoted',price:1000}),200,'agenda released');
 assert.equal((await sql("SELECT count(*) n FROM booking_routes WHERE booking_id=?",[id]))[0].n,0);
 expect(await call('/api/requests/'+normal.body.id+'/cancel',customerToken,'POST',{}),200,'cancel legacy');
 console.log('VIA_V311_REMOTE_QA_E2E_PASS '+JSON.stringify({concurrentCreate:true,concurrentQuote:true,assignment:true,history:true,acceptance:true,mixedOverlap:true,cancellation:true,legacyBooking:true,otpEmailTested:false,syntheticSessions:true}));
}finally{
 // Only cancel the fixtures created by this run; retain audit history, revoke their sessions.
 for(const id of created)try{await call('/api/requests/'+id+'/cancel',customerToken,'POST',{})}catch{}
 await sql('UPDATE customer_sessions SET revoked_at=unixepoch() WHERE token_hash=? AND email=?',[sha(customerToken),email]);
 for(const d of drivers)await sql('UPDATE staff_sessions SET revoked_at=unixepoch() WHERE token_hash=? AND staff_id=?',[sha(d.token),d.id]);
 console.log('QA synthetic sessions revoked; no records deleted');
}
