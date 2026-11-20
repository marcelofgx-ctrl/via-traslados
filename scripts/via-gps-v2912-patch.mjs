import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='gps-v2912-build/assets/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const file=root+'reference.js',home=root+'index.html';
const before=await readFile(file,'utf8');
assert.equal(sha(before),'ef28049b873c228284787f0865982a06ce562b93759a97dec5676e18f6166680',
 'La fuente productiva cambió: DETENER');
const marker='// El GPS es estrictamente opt-in:';
const start=before.indexOf(marker),end=before.indexOf('\n})();',start);
assert(start>100&&end>start,'No se encontró el bloque GPS exacto');
assert.equal(before.split(marker).length,2);
assert(before.slice(start,end).includes('watchForBestGpsFix'),'No está el watcher V29.1.1');
const gps=await readFile('scripts/via-gps-v2912-block.txt','utf8');
assert(gps.includes('window.ViaMapPicker')&&gps.includes('buildPickupDisplay'));
const after=before.slice(0,start)+gps+before.slice(end);
assert.equal(after.split('function watchForBestGpsFix').length,2,'Watcher duplicado');
assert(after.includes("window.ViaAddress?.set('home-origin'"));
let html=await readFile(home,'utf8');
for(const anchor of ['content="29.1.1"','reference.js?v=27','geo-v2/core.mjs?v=3',
 'app.js?v=29.1','store.js?v=19.1'])assert(html.includes(anchor),'Falta '+anchor);
assert.equal(html.split('content="29.1.1"').length,2);
assert.equal(html.split('reference.js?v=27').length,2);
html=html.replace('content="29.1.1"','content="29.1.2"')
 .replace('reference.js?v=27','reference.js?v=28');
await writeFile(file,after);
await writeFile(home,html);
console.log('VIA_GPS_V2912_PATCHED '+JSON.stringify({
 files:['reference.js','index.html'],previousReferenceSha:sha(before),
 newReferenceSha:sha(after),newIndexSha:sha(html),geoUnchanged:true}));
