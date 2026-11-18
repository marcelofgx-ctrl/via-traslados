// Solo inspecciona assets PUBLICOS activos: no lee reservas, cookies ni usuarios.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root='https://viatraslados.com';
const out='v30-live-source-snapshot';
fs.mkdirSync(out,{recursive:true});
async function download(relative,mandatory=true){
 assert(/^\/[a-zA-Z0-9._/\-]+$/.test(relative),'Unexpected asset');
 const response=await fetch(root+relative,{
   headers:{Accept:'text/html,text/css,application/javascript,*/*','Cache-Control':'no-cache'},
   signal:AbortSignal.timeout(30000)});
 if(!response.ok){
  if(!mandatory && response.status===404)return null;
  throw Error('LIVE_ASSET_UNAVAILABLE '+relative+' '+response.status);
 }
 const body=Buffer.from(await response.arrayBuffer());
 assert(body.length>30&&body.length<4000000,'Asset not plausible '+relative);
 const relativeOut=relative.slice(1),dest=path.join(out,relativeOut);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,body);
 return {path:relative,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex'),
   body:body.toString('utf8')};
}
const homepage=await download('/index.html');
const booking=await download('/reserva.html');
assert(/status-container/.test(booking.body),'Booking mount missing');
const scripts=[...booking.body.matchAll(/<script\b[^>]*\bsrc=["'](.*?)["']/g)].map(x=>x[1]);
const css=[...booking.body.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["'](.*?)["']/g)].map(x=>x[1]);
const urls=[...new Set([...scripts,...css].map(s=>s.split('?')[0]).filter(s=>s.startsWith('./')).map(s=>'/'+s.slice(2)))];
const mandatory=['/app.js','/store.js','/config.js','/review-compact-v29.css'];
const selected=[...new Set([...urls,...mandatory])];
const assets=[];
for(const file of selected){
 if(file.includes('..'))continue;
 const got=await download(file, mandatory.includes(file)||urls.includes(file));
 if(got)assets.push(got);
}
const app=assets.find(x=>x.path==='/app.js')?.body||'';
assert(app.includes('quoted')&&app.includes('confirmed'),'Unexpected app.js statuses');
const excerpt=(word,length=250)=>{const i=app.indexOf(word);return i<0?'not found':app.slice(Math.max(0,i-95),i+length).replace(/\s+/g,' ')};
const matchAttr=booking.body.includes('status-container')&&scripts.some(x=>x.includes('app.js'));
assert(matchAttr,'No se reconoce la vista de reserva ACTIVA: detener');
// La portada puede ser V29 y la vista de reserva usar otros querystrings; registrar lo ACTIVO en lugar de adivinar.
const report={
 checkedAt:new Date().toISOString(),
 origin:root,
 activeBookingV29:matchAttr,
 confirmedViewMustRemainUnchanged:true,
 htmlSourceReferences:{scripts,styles:css},
 assets:assets.map(({path,bytes,sha256})=>({path,bytes,sha256})),
 appSource:{length:app.length,quotedCount:(app.match(/quoted/g)||[]).length,
  confirmedCount:(app.match(/confirmed/g)||[]).length,
  offerPreview:excerpt('quoted:{'),acceptancePreview:excerpt('accept-btn'),
  bookingRenderPreview:excerpt('status-container')
 },
 summary:'Audit only. Never writes production. No customer records accessed.'
};
fs.writeFileSync(path.join(out,'V30_READONLY_REPORT.json'),JSON.stringify(report,null,2));
console.log('V30_LIVE_SOURCE_AUDIT '+JSON.stringify({
 checkedAt:report.checkedAt,activeBookingV29:report.activeBookingV29,scriptCount:scripts.length,
 stylesCount:css.length,assetCount:assets.length,appSource:report.appSource,
 paths:assets.map(x=>x.path)
}));
console.log('V30_SOURCE_SNAPSHOT_COMPLETE_NO_PRODUCTION_WRITES');
