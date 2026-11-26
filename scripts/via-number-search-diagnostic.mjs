import assert from 'node:assert/strict';
const host='https://viatraslados.com';
const root=await fetch(host+'/?v=3041020',{headers:{'User-Agent':'ViaTrasladosV35SignedRelease'},signal:AbortSignal.timeout(15000)});
assert(root.ok);assert((await root.text()).includes('V30.4.10.20'));
const queries=[['street','Arenal Grande'],['street-lower','arenal grande'],...Array.from({length:3},(_,i)=>2272+2*i).flatMap(n=>[[n+'-raw','Arenal grande '+n],[n+'-city','Arenal Grande '+n+', Montevideo']])];
for(const [tag,q] of queries){
 for(const mode of /street/.test(tag)?['suggest']:['suggest','resolve']){
  try{
   const start=Date.now();const r=await fetch(host+'/api/direcciones?'+new URLSearchParams({mode,q}),{headers:{Accept:'application/json','User-Agent':'ViaTrasladosV35SignedRelease'},signal:AbortSignal.timeout(13000)});
   const j=await r.json(),rows=Array.isArray(j.results)?j.results:[];
   const number=q.match(/\b\d{3,5}\b/)?.[0];
   const match=rows.filter(x=>number&&x.accuracy==='portal'&&String(x.street||x.label||'').split(',')[0].trim().endsWith(' '+number));
   console.log('VIA_NUMBER_PROBE '+JSON.stringify({tag,mode,http:r.status,ms:Date.now()-start,count:rows.length,portals:rows.filter(x=>x.accuracy==='portal').length,exact:match.length,street:rows.filter(x=>/arenal grande/i.test(x.street||x.label||'')).length}));
  }catch(e){console.log('VIA_NUMBER_PROBE '+JSON.stringify({tag,mode,error:e.name}))}
 }
}
