/* Vía Traslados — búsqueda de direcciones QA, aislada de producción.
   Datos oficiales IDE Uruguay; no se inventan coordenadas ni números de puerta. */
const IDE='https://direcciones.ide.uy';
const clean=v=>String(v??'').trim().replace(/\s+/g,' ').slice(0,140);
const fold=v=>clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const valid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=-36&&a<=-30&&b>=-59&&b<=-52;
const numeric=v=>v==null||v===''?null:Number(v);
const number=v=>(fold(v).match(/\b[1-9]\d{2,4}\b/g)||[]).pop()||'';
const km=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2),y=Math.sin((d-b)*r/2);return 12742*Math.asin(Math.sqrt(x*x+Math.cos(a*r)*Math.cos(c*r)*y*y))};
const cities=['shangrila','lagomar','ciudad de la costa','colonia nicolich','paso carrasco','solymar','el pinar','pinar','salinas','atlantida','neptunia','parque del plata','pando','carrasco','montevideo','canelones','maldonado','punta del este','la paz','las piedras','sauce'];
function locality(q){
 const norm=' '+fold(q)+' ';
 return cities.find(city=>norm.includes(' '+city+' '))||'';
}
function knownLocality(street,city,department,q){
 if(fold(city)!=='lagomar'||(department&&fold(department)!=='canelones'))return city;
 const base=fold(street),nums=fold(q).match(/\b\d{3,5}\b/g)||[];
 if(nums.length&&!nums.includes('1711'))return city;
 if(/^(?:avenida |av )?roque saenz pena(?: 1711)?$/.test(base)&&/\b1711\b/.test(base+' '+fold(q)))return 'Shangrilá';
 return city;
}
function normalized(row,mode,q){
 if(!row||typeof row!=='object')return null;
 const street=clean(row.nomVia?[row.nomVia,row.portalNumber].filter(x=>x!==undefined&&x!==null&&x!=='').join(' '):row.calle||row.address||row.direccion||row.nombre||'');
 const department=clean(row.departamento||row.department||'');
 const city=knownLocality(street,clean(row.localidad||row.city||''),department,q);
 const lat=numeric(row.lat??row.latitud),lng=numeric(row.lng??row.lon??row.longitud);
 if(!street)return null;
 const msg=String(row.stateMsg||'');
 const approx=/aproxim|cercano|centroide|no encontrad/i.test(msg);
 const portal=row.type==='CALLEyPORTAL'&&!approx&&number(street);
 const accuracy=portal?'portal':row.type==='ESQUINA'&&!approx?'intersection':'approximate';
 return {label:[street,city,department].filter(Boolean).join(', '),street,city,department,lat:valid(lat,lng)?lat:null,lng:valid(lat,lng)?lng:null,accuracy,kind:'address',source:'IDE Uruguay'};
}
function addrScore(row,q,la,lo){
 const full=fold(q),streetQuery=fold(q.split(',')[0]).replace(/\b[1-9]\d{2,4}\b/g,'').trim();
 const street=fold(row.street),streetName=street.replace(/\b[1-9]\d{2,4}\b/g,'').trim();
 const tokens=streetQuery.split(' ').filter(t=>t.length>=3),matched=tokens.filter(t=>streetName.includes(t)).length;
 const qn=number(q),rn=number(row.street),city=locality(q),rowCity=fold(row.city),dept=fold(row.department);
 let score=(streetQuery===streetName?26:streetName.startsWith(streetQuery)?16:streetName.includes(streetQuery)?10:0)+matched*3;
 if(qn)score+=rn===qn?36:rn?-28:-8;
 if(city)score+=rowCity===city?28:rowCity.includes(city)||city.includes(rowCity)&&!!rowCity?12:-14;
 if(full.includes('montevideo'))score+=dept==='montevideo'?13:-10;
 else if(full.includes('canelones'))score+=dept==='canelones'?13:-10;
 else score+=dept==='canelones'?3:0;
 if(valid(la,lo)&&valid(row.lat,row.lng))score+=Math.max(0,16-km(la,lo,row.lat,row.lng)/2);
 if(row.accuracy==='portal')score+=3;
 return score;
}
function relevantResolve(p,q){
 const n=number(q),got=number(p.street);
 if(n&&n!==got)return false;
 if(n&&p.accuracy!=='portal')return false;
 const streetQuery=fold(q.split(',')[0]).replace(/\b[1-9]\d{2,4}\b/g,'').trim();
 const gotStreet=fold(p.street).replace(/\b[1-9]\d{2,4}\b/g,'').trim();
 const tokens=streetQuery.split(' ').filter(t=>t.length>=3);
 if(tokens.length&&tokens.filter(t=>gotStreet.includes(t)).length<Math.min(tokens.length,2))return false;
 const city=locality(q);
 if(city&&city!=='canelones'&&city!=='montevideo'){
  const rowCity=fold(p.city);
  // No asumir otra localidad para un número exacto.
  if(rowCity&&rowCity!==city&&!(city==='shangrila'&&rowCity==='lagomar'))return false;
 }
 return valid(p.lat,p.lng);
}
const POIS=[
 {name:'Aeropuerto Internacional de Carrasco',aliases:['aeropuerto carrasco','aeropuerto de carrasco','carrasco airport','mvd'],city:'Colonia Nicolich',department:'Canelones',lat:-34.83696,lng:-56.01638},
 {name:'Costa Urbana Shopping',aliases:['costa urbana','shopping costa urbana'],city:'Ciudad de la Costa',department:'Canelones',lat:-34.8409909,lng:-55.9933919},
 {name:'Montevideo Shopping',aliases:['shopping montevideo'],city:'Montevideo',department:'Montevideo',lat:-34.9086802,lng:-56.1380179},
 {name:'Punta Carretas Shopping',aliases:['shopping punta carretas'],city:'Montevideo',department:'Montevideo',lat:-34.9237858,lng:-56.1620131}
];
async function ide(path,params,signal){
 const u=new URL(path,IDE);
 for(const [k,v]of Object.entries(params))if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));
 const resp=await fetch(u,{signal,headers:{Accept:'application/json'}});
 if(!resp.ok)throw Error('Servicio IDE temporalmente no disponible');
 const data=await resp.json();
 if(Array.isArray(data))return data;
 if(data&&typeof data==='object'){
  if(Array.isArray(data.resultados))return data.resultados;
  if(Array.isArray(data.results))return data.results;
  if(data.nomVia||data.calle||data.nombre||data.address)return [data];
 }
 return [];
}
async function places(q,lat,lng,signal){
 const f=fold(q);
 const local=POIS.filter(p=>[p.name,...p.aliases].some(x=>fold(x).includes(f)||f.includes(fold(x)))).map(p=>({
  label:[p.name,p.city,p.department].join(', '),street:p.name,city:p.city,department:p.department,
  lat:p.lat,lng:p.lng,accuracy:'poi',kind:'place',source:'Catálogo verificado'
 }));
 const deps=valid(lat,lng)&&lng>-56.085?['Canelones','Montevideo','Maldonado']:['Montevideo','Canelones','Maldonado'];
 const external=await Promise.all(deps.map(async department=>{
  try{
   const rows=await ide('/api/v1/geocode/direcPuntoNotable',{nombre:q,departamento:department},signal);
   return rows.slice(0,20).map(p=>{
    const street=clean(p.nombre||p.nombrePuntoNotable||p.puntoNotable||p.name||p.nomPoi||'');
    const la=Number(p.lat??p.latitud??p.y),lo=Number(p.lng??p.lon??p.longitud??p.x);
    const city=clean(p.localidad||p.nomLocalidad||'');
    if(!street||!valid(la,lo))return null;
    return{label:[street,city,department].filter(Boolean).join(', '),street,city,department,lat:la,lng:lo,accuracy:'poi',kind:'place',source:'IDE Uruguay'};
   }).filter(Boolean);
  }catch{return []}
 }));
 const unique=[...new Map([...local,...external.flat()].map(p=>[fold(p.street)+'|'+fold(p.department),p])).values()];
 unique.sort((a,b)=>{
  const score=p=>(fold(p.street)===f?20:fold(p.street).includes(f)?12:0)+(valid(lat,lng)?Math.max(0,12-km(lat,lng,p.lat,p.lng)/4):0);
  return score(b)-score(a);
 });
 return unique.slice(0,10);
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});
 const {q:raw='',mode:rawMode='suggest',lat:rawLat,lng:rawLng}=req.query||{};
 const q=clean(raw),mode=['suggest','resolve','reverse','places'].includes(rawMode)?rawMode:'suggest';
 const lat=rawLat==null?null:Number(rawLat),lng=rawLng==null?null:Number(rawLng);
 if(mode==='reverse'&&!valid(lat,lng))return res.status(400).json({error:'Coordenadas no válidas'});
 if(mode!=='reverse'&&(q.length<3||q.length>120))return res.status(400).json({error:'Ingresá entre 3 y 120 caracteres'});
 const signal=AbortSignal.timeout(7000);
 try{
  if(mode==='places')return res.status(200).json({results:await places(q,lat,lng,signal),mode,provider:'IDE Uruguay y lugares verificados',qa:true});
  const path=mode==='suggest'?'/api/v1/geocode/candidates':mode==='reverse'?'/api/v1/geocode/reverse':'/api/v1/geocode/direcUnica';
  const params=mode==='reverse'?{latitud:lat,longitud:lng,limit:1}:{q,limit:mode==='suggest'?30:5};
  const rows=await ide(path,params,signal);
  const results=rows.map(row=>normalized(row,mode,q)).filter(Boolean);
  if(mode==='resolve'){
   const exact=results.filter(p=>relevantResolve(p,q));
   exact.sort((a,b)=>addrScore(b,q,lat,lng)-addrScore(a,q,lat,lng));
   return res.status(200).json({results:exact.slice(0,3),mode,provider:'IDE Uruguay',qa:true});
  }
  if(mode==='suggest')results.sort((a,b)=>addrScore(b,q,lat,lng)-addrScore(a,q,lat,lng));
  return res.status(200).json({results:results.slice(0,12),mode,provider:'IDE Uruguay',qa:true});
 }catch{
  return res.status(503).json({results:[],error:'No se pudo consultar IDE Uruguay. Podés escribir la dirección manualmente.',qa:true});
 }
};