// Capture public static assets verbatim from ACTUAL production to a private audit branch.
// GET ONLY: no API, D1, OTP, sessions, tokens, bookings or user data.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT='https://viatraslados.com/';
const paths=['index.html','reference.js','app.js','address-autocomplete.js','geo-v2/core.mjs',
 'wizard-ux.js','address-selected-preview.js','store.js','map-point-picker.js','config.js'];
const inventory={};
for(const path of paths){
 const url=ROOT+path;
 const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{Accept:'*/*'}});
 if(!r.ok)throw Error('GET '+path+' HTTP '+r.status);
 const text=await r.text();
 if(path.endsWith('.js')||path.endsWith('.mjs')){
  if(/^\s*<!doctype html/i.test(text))throw Error('Unexpected HTML for '+path);
 }
 if(path==='index.html'&&!text.includes('content="29.1.13"'))
  throw Error('Live index.html is not the approved V29.1.13');
 const local='audit/live-v29113/'+path;
 await mkdir(local.split('/').slice(0,-1).join('/'),{recursive:true});
 await writeFile(local,text);
 inventory[path]={bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};
}
await writeFile('audit/live-v29113/manifest.json',JSON.stringify({origin:ROOT,from:'production-v29.1.13',files:inventory},null,2)+'\n');
console.log('VIA_V29114_SNAPSHOT_VERIFIED '+JSON.stringify(inventory));
