// Dedicated QA signing credential. No production keys, no Worker binding, no public artifacts.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.CLOUDFLARE_API_TOKEN||'';
const name='via-traslados-qa-signing-vault';
if(!token||!/^[a-f0-9]{32}$/i.test(account)||!process.env.RUNNER_TEMP||!process.env.GITHUB_ENV)throw Error('QA signing environment missing');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
async function cf(url,body){
 const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const j=await r.json().catch(()=>null);
 if(!r.ok||!j?.success)throw Error('QA vault API failed: HTTP '+r.status);
 return j.result;
}
const matches=(await cf(base+'?name='+name)).filter(x=>x.name===name);
if(matches.length>1)throw Error('Duplicate vault');
let db=matches[0];const bootstrap=process.env.VIA_QA_ALLOW_BOOTSTRAP==='1';
if(!db){if(!bootstrap)throw Error('Signing vault missing; refuse new certificate');db=await cf(base,{name});}
if(db.name!==name||!/^[a-f0-9-]{36}$/i.test(db.uuid)||['dfc6a732-4817-4c49-8f2b-16ecaff3ecc0','146017ce-09a7-4457-abd2-694a5a5b3e92'].includes(db.uuid))throw Error('Unexpected signing vault');
async function query(sql,params=[]){
 const result=await cf(base+'/'+db.uuid+'/query',{sql,params});
 if(!result[0]?.success)throw Error('QA signing query failed');
 return result[0].results||[];
}
await query("CREATE TABLE IF NOT EXISTS qa_signing_key (id INTEGER PRIMARY KEY CHECK(id=1), p12 TEXT NOT NULL, password TEXT NOT NULL)");
let rows=await query('SELECT p12,password FROM qa_signing_key WHERE id=1');
const dir=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'via-qa-sign-'));fs.chmodSync(dir,0o700);
const file=path.join(dir,'qa.p12');
if(!rows.length){
 if(!bootstrap)throw Error('No prior QA key; do not regenerate');
 const pw=randomBytes(32).toString('hex');
 const run=spawnSync('keytool',['-genkeypair','-alias','via-qa','-keyalg','RSA','-keysize','3072','-validity','10000','-storetype','PKCS12','-keystore',file,'-storepass:env','VIA_QA_KEY_PASS','-keypass:env','VIA_QA_KEY_PASS','-dname','CN=Via Traslados QA, O=Via Traslados, C=UY','-noprompt'],{env:{...process.env,VIA_QA_KEY_PASS:pw},stdio:'ignore'});
 if(run.status!==0)throw Error('QA signing key creation failed');
 await query('INSERT OR IGNORE INTO qa_signing_key(id,p12,password) VALUES(1,?,?)',[fs.readFileSync(file).toString('base64'),pw]);
 rows=await query('SELECT p12,password FROM qa_signing_key WHERE id=1');
}
if(rows.length!==1||!/^[a-f0-9]{64}$/.test(rows[0].password)||typeof rows[0].p12!=='string'||rows[0].p12.length<1000)throw Error('Invalid QA credential');
fs.writeFileSync(file,Buffer.from(rows[0].p12,'base64'),{mode:0o600});fs.chmodSync(file,0o600);
console.log('::add-mask::'+rows[0].password);
fs.appendFileSync(process.env.GITHUB_ENV,'VIA_QA_KEYSTORE='+file+'\nVIA_QA_KEY_PASS='+rows[0].password+'\n');
console.log('QA signing key available in private runner directory.');
