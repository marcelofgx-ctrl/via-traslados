// GET-only public HTML diagnostic. Never query customer endpoints or credentials.
import {createHash} from 'node:crypto';
const h=x=>createHash('sha256').update(x).digest('hex');
const roots={
 prod:'https://viatraslados.com',
 qa:'https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev'
};
const headers={'User-Agent':'ViaTrasladosV35SignedRelease','Cache-Control':'no-cache','Accept-Encoding':'identity'};
const clean=s=>s.replace(/<script\b[^>]*static\.cloudflareinsights\.com[^>]*>.*?<\/script>/gis,'');
async function load(name){const r=await fetch(roots[name]+'/reserva.html',{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(name+' HTTP '+r.status);return await r.text();}
let out={};
for(const [key] of Object.entries(roots)){
 const a=await load(key),b=await load(key);
 out[key]={
   raw1:{length:a.length,sha:h(a)},
   raw2:{length:b.length,sha:h(b)},
   clean1:{length:clean(a).length,sha:h(clean(a))},
   clean2:{length:clean(b).length,sha:h(clean(b))},
   stableClean:clean(a)===clean(b),
   canonicalScriptRefs:[...a.matchAll(/<script[^>]+src=["']([^"'?#]+)/gi)].map(x=>x[1]).filter(x=>!x.includes('cloudflareinsights')),
   doctype:a.slice(0,30).toLowerCase().startsWith('<!doctype html')
 };
}
const a=clean(await load('prod')),b=clean(await load('qa'));
let first=-1;
for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i]){first=i;break;}
if(first<0&&a.length!==b.length)first=Math.min(a.length,b.length);
console.log('VIA_RESV_HTML_READONLY_DIAG '+JSON.stringify({
 ...out,equalCanonical:a===b,firstDiffIndex:first,
 prodTagCount:(a.match(/</g)||[]).length,qaTagCount:(b.match(/</g)||[]).length,
 prodTextLength:a.length,qaTextLength:b.length,
 prodTail:a.slice(Math.max(0,first-28)),qaTail:b.slice(Math.max(0,first-28)),
 analyticsRemoved:{prod:a.length!==out.prod.raw1.length,qa:b.length!==out.qa.raw1.length}
}));
