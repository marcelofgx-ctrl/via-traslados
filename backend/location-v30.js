// Vía Traslados V30: explicit geographic coordinates are the source of truth.
// Browser-controlled values are untrusted: validate ranges and numeric types.
// Human-readable street/door labels remain separate and may be approximate.
const inside=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&
 lat>=-36&&lat<=-30&&lng>=-59&&lng<=-52;
const safeText=(value,max=36)=>typeof value==='string'?value.trim().slice(0,max):'';
export function locationPoint(raw){
 if(raw===null||raw===undefined)return null;
 if(typeof raw!=='object'||Array.isArray(raw))return null;
 const point=raw.point&&typeof raw.point==='object'?raw.point:raw;
 // Do NOT accept null, empty string or true as numeric zero.
 const ln=point?.lat,gn=point?.lng??point?.lon;
 if(typeof ln!=='number'||typeof gn!=='number'||!inside(ln,gn))return null;
 return {lat:Number(ln.toFixed(7)),lon:Number(gn.toFixed(7)),
  source:safeText(raw.source||point.source,28)||'selected',
  postalStatus:safeText(raw.postalStatus,30)||'unknown',
  numberIsApproximate:raw.numberIsApproximate===true};
}
export const asLocationResponse=(row,which)=>{
 if(!row)return null;
 const prefix=which==='destination'?'destination':'origin';
 const lat=row[prefix+'_lat'],lng=row[prefix+'_lng'];
 if(lat===null||lng===null||lat===undefined||lng===undefined)return null;
 const point={lat:Number(lat),lon:Number(lng)};
 if(!inside(point.lat,point.lon))return null;
 return {lat:point.lat,lng:point.lon,source:row[prefix+'_source']||'selected',
  postalStatus:row[prefix+'_postal_status']||'unknown',
  numberIsApproximate:Boolean(row[prefix+'_number_approximate'])};
};
