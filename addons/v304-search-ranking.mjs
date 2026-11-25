// Pure client ranking: no network, no mutation of address records.
export function viaFold(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
export function viaPoint(p){
 if(!p||p.lat==null||p.lng==null||String(p.lat).trim()===''||String(p.lng).trim()==='')return null;
 const lat=Number(p.lat),lng=Number(p.lng);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52?{lat,lng}:null;
}
export function viaKm(a,b){
 a=viaPoint(a);b=viaPoint(b);if(!a||!b)return null;
 const r=Math.PI/180,dp=(b.lat-a.lat)*r,dl=(b.lng-a.lng)*r;
 const h=Math.sin(dp/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dl/2)**2;
 return 12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function viaRank(q,rows,point,address=false){
 const needle=viaFold(q),compact=s=>s.replace(/ /g,''),root=s=>s.replace(/^(?:shopping|hotel|restaurante|centro comercial) +| +(?:shopping|hotel|restaurante|centro comercial)$/g,'').trim()||s;
 const words=root(needle).split(' ').filter(Boolean);
 const score=p=>{
  const n=viaFold(p.name||String(p.street||p.label||'').split(' · ')[0]);
  const a=compact(needle),b=compact(n),c=compact(root(needle)),d=compact(root(n));
  if(!a||!b)return 9;
  if(a===b||c===d)return 0;
  if(b.includes(a)||d.includes(c)||words.every(w=>n.split(' ').some(x=>x.startsWith(w))))return 1;
  if(words.some(w=>w.length>=3&&n.split(' ').some(x=>x.startsWith(w))))return 3;
  return 9;
 };
 const items=rows.map((p,i)=>({p,i,score:score(p),km:viaKm(point,p)}));
 // Preserve IDE street/portal ordering for explicitly entered addresses.
 if(address)return items.sort((a,b)=>Number(a.p.kind==='place')-Number(b.p.kind==='place')||a.i-b.i).map(x=>x.p);
 const strong=items.some(x=>x.score<=1);
 return items.filter(x=>!strong||x.score<=1).sort((a,b)=>a.score-b.score||
  ((a.km??Infinity)===(b.km??Infinity)?0:(a.km??Infinity)<(b.km??Infinity)?-1:1)||a.i-b.i).map(x=>x.p);
}
export function viaDistanceLabel(km){
 if(km==null||!Number.isFinite(km)||km<0)return '';
 if(km<1)return '≈ '+Math.round(km*1000/10)*10+' m';
 return '≈ '+km.toLocaleString('es-UY',{minimumFractionDigits:1,maximumFractionDigits:1})+' km';
}
