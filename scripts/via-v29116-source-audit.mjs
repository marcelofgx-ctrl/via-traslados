// Read-only, byte-exact V29.1.15 public source inventory for safeguarded visual update.
// GET requests only; no API, D1, OTP, customer session or booking access.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT='https://viatraslados.com/';
const paths=[
 'index.html','map-point-picker.js','reference.js','app.js','via-v29115-map-ui.css',
 'map-point-picker.css','reference.css','geo-v2/core.mjs','address-autocomplete.js',
 'address-selected-preview.js'
];
const hashes={};
for(const path of paths){
 const response=await fetch(ROOT+path,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('GET '+path+' '+response.status);
 const body=await response.text();
 if(path==='index.html'&&!body.includes('content="29.1.15"'))throw Error('Production is not V29.1.15');
 if(path.endsWith('.js')&&body.trimStart().startsWith('<!doctype html'))throw Error('Unexpected HTML '+path);
 const local='audit/live-v29115/'+path;
 await mkdir(local.split('/').slice(0,-1).join('/'),{recursive:true});
 await writeFile(local,body);
 hashes[path]={sha256:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body)};
}
await writeFile('audit/live-v29115/manifest.json',JSON.stringify({source:'v29.1.15',origin:ROOT,files:hashes},null,2)+'\n');
console.log('VIA_V29116_VISUAL_SOURCE_SNAPSHOT '+JSON.stringify(hashes));
