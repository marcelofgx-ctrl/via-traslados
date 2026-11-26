import assert from 'node:assert/strict';
const root='https://viatraslados.com';
for(let i=0;i<12;i++){
 try{
  const h=await fetch(root+'/?v=3041024&verify='+Date.now(),{signal:AbortSignal.timeout(10000),headers:{'Cache-Control':'no-cache','User-Agent':'ViaTrasladosV35SignedRelease'}});
  const html=await h.text();
  const u=new URL(root+'/api/direcciones');u.search=new URLSearchParams({mode:'suggest',q:'Arenal Grande 2274, Montevideo',verify:String(Date.now())});
  const r=await fetch(u,{headers:{'Cache-Control':'no-cache','User-Agent':'ViaTrasladosV35SignedRelease'},signal:AbortSignal.timeout(15000)});
  const j=await r.json();const source=r.headers.get('X-Via-Address-Source');
  const exact=(j.results||[]).some(x=>x.accuracy==='portal'&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)&&/arenal grande\s+2274/i.test(x.street||''));
  const visible=html.includes('V30.4.10.24');
  console.log('VIA_PROPAGATION_CHECK '+JSON.stringify({attempt:i+1,visible,source,status:r.status,exact}));
  if(visible&&source==='cache'&&r.ok&&exact){console.log('VIA_PUBLIC_VERSION_CONFIRMED');process.exit(0)}
 }catch(e){console.log('VIA_PROPAGATION_CHECK_RETRY '+e.name)}
 await new Promise(r=>setTimeout(r,3000));
}
throw Error('Public domain has not converged to validated candidate');
