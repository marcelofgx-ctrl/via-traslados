import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../backend/worker.js';
import {jpegSize,normalizePlate,validateProfile} from '../backend/driver-identity.js';
import '../addons/via-driver-confirmation.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const tokens=['1'.repeat(64),'2'.repeat(64),'3'.repeat(64)];
const customerTokens=['a'.repeat(64),'b'.repeat(64)];
const names=['Conductor QA','Administrador QA','Otro conductor QA'];
// Synthetic JPEG headers only, no real faces, vehicles, or personal data.
const jpeg=n=>Buffer.from([255,216,255,192,0,11,8,1,224,2,128,1,1,17,n,255,218,0,8,1,1,0,0,63,0,2,255,217]).toString('base64');
const payload=()=>({consent:true,plate:'abc 1234',make:'Marca QA',model:'Modelo QA',color:'Blanco',photos:{driver:jpeg(1),front:jpeg(2),rear:jpeg(3)},recognition:{face:'pass',front:'pass',rear:'review',frontPlate:'ABC 1234',rearPlate:'ABC1234'}});
function environment(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 const prepare=sql=>{let args=[];return {bind(...a){args=a;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}}},execute(){return /RETURNING/i.test(sql)?{results:db.prepare(sql).all(...args)}:{success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}}};
 const env={VIA_DRIVER_IDENTITY_ENABLED:'true',PUBLIC_ORIGIN:'https://qa.example.invalid',DB:{prepare,async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s.execute());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}}};
 for(let i=0;i<3;i++){
  db.prepare("INSERT INTO staff_users(id,email,display_name,password_salt,password_hash,iterations,role,status) VALUES(?,?,?,?,?,100000,?,'approved')").run(ids[i],'staff'+i+'@qa.invalid',names[i],'synthetic','synthetic',i===1?'admin':'driver');
  db.prepare('INSERT INTO staff_sessions(token_hash,staff_id,expires_at) VALUES(?,?,unixepoch()+3600)').run(hash(tokens[i]),ids[i]);
 }
 for(let i=0;i<2;i++){
  const email='p'+i+'@qa.invalid';db.prepare('INSERT INTO customers(email,name,phone) VALUES(?,?,?)').run(email,'QA passenger','000000000');
  db.prepare('INSERT INTO customer_sessions(token_hash,email,expires_at) VALUES(?,?,unixepoch()+3600)').run(hash(customerTokens[i]),email);
 }
 db.prepare("INSERT INTO bookings(id,customer_name,phone,email,origin,destination,trip_date,trip_time,passengers,bags,access_token_hash,status) VALUES('VIA-QA-0001','QA','000000000','p0@qa.invalid','Origen QA','Destino QA','2027-01-01','12:00',1,0,?,'requested')").run(hash('legacy-qa'));
 db.prepare('INSERT INTO driver_assignments(booking_id,driver_id,assigned_by) VALUES(?,?,?)').run('VIA-QA-0001',ids[0],ids[1]);
 db.prepare("INSERT INTO driver_vehicle_profiles(staff_id,license_plate,make,model,passenger_capacity,luggage_capacity) VALUES(?,'ABC1234','Marca QA','Modelo QA',4,3)").run(ids[0]);
 const call=async(path,method='GET',token='',data,legacy='')=>{
  const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;if(legacy)headers['X-Booking-Token']=legacy;
  const r=await worker.fetch(new Request('https://qa.example.invalid'+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})}),env,{});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
 };
 return {db,env,call};
}
test('validate bounded JPEG, unique photos, consent and explicit plate',()=>{
 assert.deepEqual(jpegSize(jpeg(1)),{w:640,h:480});assert.equal(jpegSize('not-a-jpeg'),null);assert.equal(normalizePlate('abc-1234'),'ABC1234');
 assert.equal(validateProfile(payload()).recognition.plateMatch,true);
 assert.throws(()=>validateProfile({...payload(),consent:false}));
 assert.throws(()=>validateProfile({...payload(),photos:{driver:jpeg(1),front:jpeg(1),rear:jpeg(3)}}));
 assert.throws(()=>validateProfile({...payload(),plate:'ABC'}));
 const p=payload();p.recognition.rearPlate='XYZ9999';assert.equal(validateProfile(p).recognition.plateMatch,false);
});
test('full authorized lifecycle; no photos before confirmation, after cancellation or for wrong passenger',async()=>{
 const {db,env,call}=environment();const own='/api/staff/driver-profile',admin='/api/admin/driver-profiles',booking='/api/requests/VIA-QA-0001';
 assert.equal((await call(own)).status,401);
 assert.equal((await call(own,'GET',tokens[0])).body.state,'missing');
 assert.equal((await call(own,'POST',tokens[0],payload())).status,201);
 const ownResult=await call(own,'GET',tokens[0]);const rev=ownResult.body.revision;assert.equal(ownResult.body.state,'pending');assert(!('photos' in ownResult.body));
 assert.equal((await call(admin,'GET',tokens[2])).status,403);
 assert.equal((await call(admin+'/'+ids[0],'GET',tokens[2])).status,403);
 assert.equal((await call(admin+'/'+ids[0],'GET',tokens[1])).body.photos.driver,jpeg(1));
 assert.equal((await call(booking,'GET',customerTokens[0])).body.driverProfile,null);
 assert.equal((await call(admin+'/'+ids[0],'PATCH',tokens[1],{state:'approved',revision:rev})).status,200);
 assert.equal(db.prepare('SELECT passenger_capacity AS n FROM driver_vehicle_profiles WHERE staff_id=?').get(ids[0]).n,4);
 assert.equal((await call(booking,'GET',customerTokens[0])).body.driverProfile,null);
 db.prepare("UPDATE bookings SET status='confirmed' WHERE id='VIA-QA-0001'").run();
 const confirmed=await call(booking,'GET',customerTokens[0]);assert.equal(confirmed.status,200);assert.equal(confirmed.cache,'no-store');assert.equal(confirmed.body.driverProfile.plate,'ABC1234');assert.equal(confirmed.body.driverProfile.photos.front,jpeg(2));
 assert.equal((await call(booking,'GET',customerTokens[1],undefined,'legacy-qa')).status,404);
 assert.equal((await call(booking)).status,404);
 assert.equal((await call(booking,'GET',customerTokens[0])).body.driverProfile.reviewed,true);
 db.prepare("UPDATE driver_vehicle_profiles SET license_plate='XYZ9999' WHERE staff_id=?").run(ids[0]);
 assert.equal((await call(own,'GET',tokens[0])).body.state,'vehicle_changed');
 assert.equal((await call(booking,'GET',customerTokens[0])).body.driverProfile,null);
 assert.equal((await call(admin+'/'+ids[0],'PATCH',tokens[1],{state:'approved',revision:rev})).status,409);
 assert.equal(db.prepare('SELECT license_plate AS p FROM driver_vehicle_profiles WHERE staff_id=?').get(ids[0]).p,'XYZ9999');
 assert.equal((await call(own,'POST',tokens[0],payload())).status,201);
 const next=(await call(own,'GET',tokens[0])).body.revision;assert.notEqual(next,rev);
 assert.equal((await call(admin+'/'+ids[0],'PATCH',tokens[1],{state:'approved',revision:rev})).status,409);
 assert.equal((await call(booking,'GET',customerTokens[0])).body.driverProfile,null);
 assert.equal((await call(admin+'/'+ids[0],'PATCH',tokens[1],{state:'approved',revision:next})).status,200);
 db.prepare("UPDATE bookings SET status='cancelled' WHERE id='VIA-QA-0001'").run();
 assert.equal((await call(booking,'GET',customerTokens[0])).body.driverProfile,null);
 env.VIA_DRIVER_IDENTITY_ENABLED='false';assert.equal((await call(own,'GET',tokens[0])).status,404);assert(!('driverProfile' in (await call(booking,'GET',customerTokens[0])).body));
 db.close();
});
test('web presentation never uses arbitrary URLs or unescaped name, only active confirmed status',()=>{
 const b={status:'confirmed',driverProfile:{reviewed:true,name:'<script>evil</script>',plate:'ABC1234',make:'QA',model:'QA',color:'Blanco',photos:payload().photos}};
 const render=globalThis.ViaDriverConfirmation.render;
 assert.match(render(b),/ABC 1234/);assert.match(render(b),/&lt;script&gt;/);assert(!render(b).includes('<script>'));
 assert.equal(render({...b,status:'cancelled'}),'');assert.equal(render({...b,status:'accepted'}),'');
 assert(!render({...b,driverProfile:{...b.driverProfile,photos:{...b.driverProfile.photos,front:'https://example.com/photo'}}}).includes('<img'));
});
