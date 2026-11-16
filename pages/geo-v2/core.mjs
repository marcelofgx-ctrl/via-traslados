/**
 * Geolocalización v2 — lógica pura, sin UI ni red. No convierte puertas cercanas
 * en domicilios certificados. Uruguay no recibe excepciones por calle/localidad.
 */
const finite = v => typeof v === 'number' && Number.isFinite(v);
const text = v => String(v??'').trim().replace(/\s+/g,' ');

export function assessGpsFix(fix, now=Date.now()) {
 const coords=fix?.coords||fix||{};
 const lat=coords.latitude, lng=coords.longitude;
 const accuracyMeters=coords.accuracy;
 const timestamp=fix?.timestamp ?? now;
 if(!finite(lat)||!finite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)
  return {valid:false,quality:'invalid',reason:'invalid_coordinates'};
 if(!finite(accuracyMeters)||accuracyMeters<0)
  return {valid:false,quality:'invalid',reason:'missing_accuracy'};
 const ageMs=Math.max(0,now-timestamp);
 const quality=ageMs>30_000?'stale':accuracyMeters<=25?'good':accuracyMeters<=100?'approximate':'low';
 return {valid:true,lat,lng,accuracyMeters,ageMs,quality,
  needsRefinement:quality!=='good',
  reason:quality==='stale'?'old_fix':quality==='low'?'low_accuracy':null};
}

const houseNumber = s => /\b\d{1,6}[A-Za-z]?\s*$/.test(s);
const withoutNumber = s => text(s).replace(/\s+(?:N[º°o.]?\s*)?\d{1,6}[A-Za-z]?\s*$/i,'').trim();

export function evaluateReverseCandidates(rows=[],maxReferenceMeters=100){
 const candidates=rows.filter(row=>row && text(row.street) &&
  finite(row.distanceMeters) && row.distanceMeters>=0 && row.distanceMeters<=maxReferenceMeters)
  .sort((a,b)=>a.distanceMeters-b.distanceMeters);
 if(!candidates.length)return {status:'unknown',reference:null,reason:'no_nearby_street'};
 const closest=candidates[0];
 const key=x=>text(x.street).toLocaleLowerCase('es').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+(?:n[º°o.]?\s*)?\d{1,6}[a-z]?\s*$/,'');
 const conflict=candidates.slice(1).find(x=>x.distanceMeters-closest.distanceMeters<=25 &&
   key(x)!==key(closest));
 if(conflict)return {status:'ambiguous',reference:null,reason:'multiple_nearby_streets'};
 return {status:'suggested',reference:{
   street:withoutNumber(closest.street),
   nearbyPortal:houseNumber(text(closest.street))?text(closest.street):null,
   city:text(closest.city),department:text(closest.department),
   distanceMeters:closest.distanceMeters,source:text(closest.source)||'geocoder',
   confidence:'reference_only'
 },reason:null};
}

/** La respuesta inversa no tiene autoridad sobre una dirección elegida por usuario. */
export function buildPickupDisplay({point,postalAddress=null,reverseCandidates=[]}){
 if(!point||!finite(point.lat)||!finite(point.lng))throw Error('pickup_point_required');
 const confirmed=postalAddress?.status==='user_confirmed';
 if(confirmed){
  const line=text(postalAddress.street)+(postalAddress.number?' '+text(postalAddress.number):'');
  return {point:{...point},title:line,subtitle:[postalAddress.city,postalAddress.department].map(text).filter(Boolean).join(' · '),
   postalStatus:'user_confirmed',nearbyReference:null};
 }
 const nearby=evaluateReverseCandidates(reverseCandidates);
 if(nearby.status==='suggested'){
  return {point:{...point},title:'Cerca de '+nearby.reference.street,
   subtitle:[nearby.reference.city,nearby.reference.department,'Punto por confirmar'].filter(Boolean).join(' · '),
   postalStatus:'suggested',nearbyReference:nearby.reference};
 }
 return {point:{...point},title:'Punto de recogida sin dirección confirmada',
  subtitle:nearby.status==='ambiguous'?'Varias calles próximas · elegí en mapa':'Ajustá el punto en el mapa',
  postalStatus:'unknown',nearbyReference:null};
}
