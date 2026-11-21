// Vía Traslados — targeted, authorized customer telephone repair in production D1.
// This preserves email identity, WebAuthn passkeys, sessions, and bookings.
// No Worker or website deployment, no OTP email, no customer/booking creation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
assert(/^[a-f0-9]{32}$/i.test(account)&&token,'Cloudflare credentials missing');
const root='https://api.cloudflare.com/client/v4/accounts/'+account;
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const expectedDb='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0';
const sha=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
const canonical=value=>{
 const digits=String(value??'').replace(/[^\d]/g,'');
 assert(/^\d{8,15}$/.test(digits),'Invalid phone format');
 if(digits.startsWith('598')&&digits.length===11)return '0'+digits.slice(3);
 if(digits.length===8&&digits.startsWith('9'))return '0'+digits;
 return digits;
};
async function cfGet(path){
 const r=await fetch(root+path,{headers,signal:AbortSignal.timeout(25000)});
 const j=await r.json().catch(()=>({}));
 assert(r.ok&&j.success===true,'Cloudflare read-only GET failed: '+path+' HTTP '+r.status);
 return j.result;
}
async function liveVersion(worker){
 const d=(await cfGet('/workers/scripts/'+worker+'/deployments'))?.deployments||[];
 assert(d[0]?.versions?.length===1&&Number(d[0].versions[0].percentage)===100,'Ambiguous Worker version for '+worker);
 return d[0].versions[0].version_id;
}
const dbs=await cfGet('/d1/database?name=via-traslados-db');
const db=dbs.filter(v=>v.name==='via-traslados-db');
assert(db.length===1&&db[0].uuid===expectedDb,'Production D1 identity mismatch');
const endpoint=root+'/d1/database/'+expectedDb+'/query';
async function query(sql,params=[]){
 assert(/^(SELECT|UPDATE)\s/i.test(sql.trim()),'Unexpected SQL method');
 const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(27000)});
 const j=await r.json().catch(()=>({}));
 assert(r.ok&&j.success===true&&j.result?.length===1&&j.result[0].success===true,
  'D1 query error HTTP '+r.status+' '+JSON.stringify(j.errors||[]).slice(0,160));
 return j.result[0];
}
const beforeWeb=await liveVersion('via-traslados-web-prod');
const beforeApi=await liveVersion('via-traslados-api');
const admins=(await query("SELECT u.email,sc.phone FROM staff_users u JOIN staff_contacts sc ON sc.staff_id=u.id WHERE u.role='admin' AND u.status='approved' AND sc.email_verified_at IS NOT NULL")).results||[];
assert(admins.length===1,'More than one or no verified approved admin; refuse to choose identity');
const founder=admins[0];
const all=(await query('SELECT email,name,phone,created_at FROM customers')).results||[];
const customer=all.filter(x=>String(x.email).toLowerCase()===String(founder.email).toLowerCase());
assert(customer.length===1,'Exactly one passenger account must match verified admin email');
const current=customer[0];
const target=canonical(founder.phone);
const existing=all.filter(c=>canonical(c.phone)===target);
assert(existing.every(c=>c.email===current.email),'Phone is already used by another passenger');
const oldTargetMatches=existing.length;
const credentials=(await query('SELECT credential_id,public_key,counter,transports,created_at,last_used_at FROM customer_passkeys WHERE email=? ORDER BY credential_id',[current.email])).results||[];
assert(credentials.length===1,'Unexpected passkey count; refuse to alter an unverified account');
const passkeyFingerprint=sha(credentials);
const bookingCount=(await query('SELECT COUNT(*) AS n FROM bookings WHERE lower(email)=lower(?)',[current.email])).results?.[0]?.n;
const customerCount=all.length;
const originalName=current.name;
const originalCreated=current.created_at;
const existingPhone=current.phone;
const targetPhone=founder.phone;
const already=canonical(existingPhone)===target;
assert(already||oldTargetMatches===0,'Unexpected existing passenger phone mapping');
const bookmark=await cfGet('/d1/database/'+expectedDb+'/time_travel/bookmark');
assert(/^[a-z0-9-]{30,100}$/i.test(bookmark?.bookmark||''),'D1 recovery point unavailable');
await writeFile('via-passkey-phone-rollback-private.json',JSON.stringify({
  d1_database:'via-traslados-db',
  captured_utc:new Date().toISOString(),
  previous_passenger_phone:existingPhone,
  d1_prechange_bookmark:bookmark.bookmark,
  status:already?'already_correct':'pre_update_snapshot'
},null,2)+'\n',{mode:0o600});
console.log('VIA_PASSKEY_REPAIR_PREFLIGHT_OK '+JSON.stringify({
 verified_admin:1,matched_passenger:1,passkeys_preserved:credentials.length,
 other_accounts_using_phone:existing.filter(c=>c.email!==current.email).length,
 bookings_present:Number(bookingCount||0),bookmark_recorded:true,already_correct:already
}));
if(!already){
 const clean="replace(replace(replace(replace(replace(other.phone,' ',''),'-',''),'+',''),'(',''),')','')";
 const sql="UPDATE customers SET phone=?,updated_at=datetime('now') "+
 "WHERE email=? AND phone=? "+
 "AND (SELECT COUNT(*) FROM staff_users u JOIN staff_contacts s ON s.staff_id=u.id "+
 "WHERE lower(u.email)=lower(customers.email) AND u.role='admin' AND u.status='approved' "+
 "AND s.email_verified_at IS NOT NULL AND s.phone=?)=1 "+
 "AND (SELECT COUNT(*) FROM customer_passkeys p WHERE p.email=customers.email)=? "+
 "AND NOT EXISTS (SELECT 1 FROM customers other WHERE other.email<>customers.email AND "+
 clean+" IN (?,?,?))";
 const numeric=target.replace(/^0/,'598');
 const short=target.startsWith('0')?target.slice(1):target;
 const result=await query(sql,[targetPhone,current.email,existingPhone,targetPhone,credentials.length,target,numeric,short]);
 assert.equal(Number(result.meta?.changes),1,'No exactly-one-row update; investigate before retry');
 console.log('VIA_PASSKEY_REPAIR_CUSTOMER_PHONE_UPDATED one customer row; no credentials changed');
}
const after=(await query('SELECT email,name,phone,created_at FROM customers')).results||[];
const same=after.filter(c=>canonical(c.phone)===target);
assert(same.length===1&&same[0].email===current.email,'Postcheck: phone maps to wrong passenger');
const result=after.find(c=>c.email===current.email);
assert(result.name===originalName&&result.created_at===originalCreated,'Postcheck: passenger identity was altered');
assert(canonical(result.phone)===target,'Postcheck: phone is not matching staff');
const credentialsAfter=(await query('SELECT credential_id,public_key,counter,transports,created_at,last_used_at FROM customer_passkeys WHERE email=? ORDER BY credential_id',[current.email])).results||[];
assert(sha(credentialsAfter)===passkeyFingerprint,'Postcheck: passkey changed');
const bookingsAfter=(await query('SELECT COUNT(*) AS n FROM bookings WHERE lower(email)=lower(?)',[current.email])).results?.[0]?.n;
assert(Number(bookingsAfter)===Number(bookingCount),'Postcheck: booking count changed');
assert(after.length===customerCount,'Postcheck: customer count changed');
const compact="replace(replace(replace(replace(replace(phone,' ',''),'-',''),'+',''),'(',''),')','')";
const checkRows=(await query('SELECT email,phone FROM customers WHERE length(phone) BETWEEN 7 AND 30 AND ('+
 compact+' LIKE ? OR '+compact+' LIKE ?) LIMIT 8',
 ['%'+target+'%','%'+target.replace(/^0/,'598')+'%'])).results||[];
const liveLookup=checkRows.filter(v=>canonical(v.phone)===target);
assert(liveLookup.length===1&&liveLookup[0].email===current.email,'Postcheck: live backend lookup does not resolve uniquely');
assert(await liveVersion('via-traslados-web-prod')===beforeWeb,'Web version changed during repair');
assert(await liveVersion('via-traslados-api')===beforeApi,'API version changed during repair');
console.log('VIA_PASSKEY_REPAIR_VERIFIED '+JSON.stringify({
 phone_search:'one unique passenger',passkey_count:credentialsAfter.length,
 profile:'unchanged',bookings:'unchanged',customers:'unchanged',
 web_worker:'unchanged',api_worker:'unchanged',d1:'targeted only',
 user_action:'try Entrar con huella in viatraslados.com'
}));
