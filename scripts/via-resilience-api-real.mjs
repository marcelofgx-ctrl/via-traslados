import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {preview}=JSON.parse(readFileSync('via-resilience/candidate.json','utf8'));
const get=async (path)=>{const r=await fetch(preview+path,{signal:AbortSignal.timeout(12000)});return {r,j:await r.json()}};
assert((await get('/api/health')).r.ok);
assert.equal((await get('/api/via-forward?mode=suggest&q=x')).r.status,400);
let good=0;
for(const [tag,q] of [['street','Arenal Grande'],['number','Arenal Grande 2274, Montevideo'],['control','18 de Julio, Montevideo']]){
 const t=Date.now(),{r,j}=await get('/api/via-forward?'+new URLSearchParams({mode:'suggest',q}));
 const rows=j.results||[];console.log('VIA_FORWARD_REAL '+JSON.stringify({tag,status:r.status,ms:Date.now()-t,count:rows.length,portal:rows.filter(x=>x.accuracy==='portal').length,street:rows.filter(x=>x.accuracy!=='portal').length}));
 assert(r.ok,'Backup service failure');
 if(tag==='street'&&rows.length)good++;
 if(tag==='number'&&rows.length){assert(rows.every(x=>x.accuracy==='portal'||x.lat===null&&x.lng===null));good++}
}
assert(good>=1,'No real Arenal Grande coverage');
for(const [lat,lng] of [[-34.9061,-56.1999],[-34.83696,-56.01638]]){
 const {r,j}=await get('/api/via-reverse?lat='+lat+'&lng='+lng);assert(r.ok);console.log('VIA_REVERSE_REAL '+JSON.stringify({status:r.status,count:j.results?.length||0}));
}
