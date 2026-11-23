// Snapshot exact effective public V29.1.14 passenger assets; GET only, never API or D1.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT='https://viatraslados.com/';
const paths=['index.html','reference.js','app.js','map-point-picker.js','map-point-picker.css',
 'review-compact-v29.css','geo-v2-stable-layout.css','reference.css',
 'geo-v2/core.mjs','address-selected-preview.js','address-autocomplete.js'];
const inventory={};
for(const path of paths){
 const r=await fetch(ROOT+path,{signal:AbortSignal.timeout(30000),headers:{Accept:'*/*'}});
 if(!r.ok)throw Error('GET '+path+' HTTP '+r.status);
 const code=await r.text();
 if(path==='index.html'&&!code.includes('content="29.1.14"'))
  throw Error('Live index.html is NOT V29.1.14, cannot proceed');
 if(path.endsWith('.js')&&/^\s*<!doctype html/i.test(code))throw Error('Unexpected HTML resource '+path);
 const target='audit/live-v29114/'+path;
 await mkdir(target.split('/').slice(0,-1).join('/'),{recursive:true});
 await writeFile(target,code);
 inventory[path]={bytes:Buffer.byteLength(code),sha256:createHash('sha256').update(code).digest('hex')};
}
await writeFile('audit/live-v29114/manifest.json',JSON.stringify({origin:ROOT,source:'prod-v29.1.14',files:inventory},null,2)+'\n');
console.log('VIA_V29115_SOURCE_SNAPSHOT_VERIFIED '+JSON.stringify(inventory));
