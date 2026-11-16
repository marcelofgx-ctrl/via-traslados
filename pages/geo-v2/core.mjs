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
 const near=candidates.filter(x=>x.distanceMeters-closest.distanceMeters<=25);
 const conflict=near.find(x=>key(x)!==key(closest));
 if(conflict)return {status:'ambiguous',reference:null,reason:'multiple_nearby_streets'};
 const fold=v=>text(v).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const distinctCities=new Set(near.map(x=>fold(x.city)).filter(Boolean));
 const distinctDepartments=new Set(near.map(x=>fold(x.department)).filter(Boolean));
 const ambiguousCity=distinctCities.size>1;
 const ambiguousDepartment=distinctDepartments.size>1;
 return {status:'suggested',reference:{
   street:withoutNumber(closest.street),
   nearbyPortal:houseNumber(text(closest.street))?text(closest.street):null,
   city:ambiguousCity?'':text(closest.city),
   department:ambiguousDepartment?'':text(closest.department),
   distanceMeters:closest.distanceMeters,source:text(closest.source)||'geocoder',
   confidence:'reference_only'
 },reason:ambiguousCity?'locality_ambiguous':ambiguousDepartment?'department_ambiguous':null};
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
  // El número es una referencia del portal cercano, NUNCA la puerta exacta
  // del GPS. Mostrarlo resulta útil, pero siempre con "Cerca de" y distancia.
  const ref=nearby.reference;
  const numbered=ref.nearbyPortal && ref.distanceMeters<=35;
  const title='Cerca de '+(numbered?ref.nearbyPortal:ref.street);
  const places=[ref.city,ref.department].filter(Boolean);
  const distance=Number.isFinite(ref.distanceMeters)?'Referencia aprox. a '+Math.round(ref.distanceMeters)+' m':'Punto por confirmar';
  return {point:{...point},title,
   subtitle:[...places,distance].join(' · '),
   postalStatus:'suggested',nearbyReference:ref,numberIsApproximate:!!numbered};
 }
 return {point:{...point},title:'Punto de recogida sin dirección confirmada',
  subtitle:nearby.status==='ambiguous'?'Varias calles próximas · elegí en mapa':'Ajustá el punto en el mapa',
  postalStatus:'unknown',nearbyReference:null};
}
