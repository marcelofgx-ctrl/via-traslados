import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const prefix='gps-precision-build/assets/';
const reference=prefix+'reference.js',htmlFile=prefix+'index.html';
let s=await readFile(reference,'utf8');
const hash='a184e955c0d3d4f13c67f858093ae648cc54a60e218ecd6c6c84ab4d8b46868f';
assert.equal(sha(s),hash,'GPS source production changed; abort without deploying');
function watchForBestGpsFix(ok,bad,_options){
 let watchId=null,done=false,best=null,timeoutId=null,clearAfterRegister=false;
 const MAX_WAIT_MS=18000,GOOD_METERS=100;
 const accuracyOf=fix=>Number(fix?.coords?.accuracy);
 function cleanup(){
  if(timeoutId!==null)clearTimeout(timeoutId);
  if(watchId!==null){
   try{navigator.geolocation.clearWatch(watchId)}catch{}
  }else clearAfterRegister=true;
 }
 function finish(callback,value){
  if(done)return;
  done=true;cleanup();
  callback(value);
 }
 function onFix(fix){
  const lat=Number(fix?.coords?.latitude),lng=Number(fix?.coords?.longitude);
  const meters=accuracyOf(fix),age=Date.now()-(fix?.timestamp||Date.now());
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(meters)||
     meters<0||meters>100000||age>120000)return;
  if(!best||meters<accuracyOf(best))best=fix;
  if(meters<=GOOD_METERS){finish(ok,best);return}
  gpsMessage('GPS aproximado (±'+Math.round(meters)+' m). Mejorando precisión…');
 }
 function onError(error){
  if(error?.code===1){finish(bad,error);return}
  if(!best)gpsMessage('Esperando una señal GPS más precisa…');
 }
 timeoutId=setTimeout(()=>{
  if(best)finish(ok,best);
  else finish(bad,{code:3,message:'No se obtuvo posición GPS'});
 },MAX_WAIT_MS);
 try{
  watchId=navigator.geolocation.watchPosition(onFix,onError,{
   enableHighAccuracy:true,maximumAge:0,timeout:14000
  });
  if(clearAfterRegister){try{navigator.geolocation.clearWatch(watchId)}catch{}}
 }catch(error){finish(bad,error)}
}
const helper=watchForBestGpsFix.toString();
const anchor="gpsButton?.addEventListener('click',()=>{";
assert.equal(s.split(anchor).length,2,'GPS handler not uniquely found');
s=s.replace(anchor,helper+'\n'+anchor);
const old="navigator.geolocation.getCurrentPosition(async fix=>";
assert.equal(s.split(old).length,2,'Single initial GPS read expected');
s=s.replace(old,"watchForBestGpsFix(async fix=>");
const oldWarning="' m). Abrí el mapa y ajustá el punto de recogida.':'');";
assert.equal(s.split(oldWarning).length,2,'Expected GPS warning');
s=s.replace(oldWarning,"' m). Activá ubicación precisa o elegí el punto de recogida en el mapa.':'');");
assert(!s.includes('getCurrentPosition(async fix'),'Old one-shot GPS remains');
let html=await readFile(htmlFile,'utf8');
assert.equal(html.split('reference.js?v=26').length,2,'Live page reference version unexpected');
html=html.replace('reference.js?v=26','reference.js?v=27');
assert(html.includes('geo-v2/core.mjs?v=3'),'Core geometry version must remain');
await writeFile(reference,s);
await writeFile(htmlFile,html);
console.log('VIA_GPS_PATCH_DONE '+JSON.stringify({before:hash,after:sha(s),version:'V29.1.1-GPS-RC',geoUnchanged:true}));
