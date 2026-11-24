// Vía Traslados V30 — parche mínimo del autocomplete REAL, SOLO copia QA.
// No agrega estilos ni cambia eventos o la persistencia lat/lng.
// Se construye a partir del asset efectivo de producción y aborta si difiere.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const oldGate = String.raw`const isPlaceQuery=/\b(aeropuerto|shopping|hotel|hospital|sanatorio|terminal|estadio|universidad|costa urbana|centro comercial|plaza|teatro)\b/i.test(q);`;
const oldOrdering = "const results=(looksLikePlace&&!looksLikeAddress)?[...poiResults,...streetResults]:[...streetResults,...poiResults];";
const oldSelection = /else\s+chosen\s*=\s*\{\s*\.\.\.chosen\s*,\s*source\s*:\s*'address_search'\s*,\s*postalStatus\s*:\s*chosen\.accuracy\s*===\s*'portal'\s*\?\s*'user_confirmed'\s*:\s*'user_confirmed'\s*\}\s*;/g;
const oldUnique = String.raw`const unique=new Map();for(const p of results){const key=(p.label||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(!unique.has(key))unique.set(key,p)}`;
const newUnique = String.raw`const unique=new Map();for(const p of results){const label=(p.label||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');const coords=p.lat!=null&&p.lng!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))?Number(p.lat).toFixed(5)+','+Number(p.lng).toFixed(5):'';const key=p.kind==='place'&&coords?label+'|'+coords:label;if(!unique.has(key))unique.set(key,p)}`;
const newSelection = "else chosen=chosen.kind==='place'?{...chosen,source:chosen.source||'place_search',postalStatus:'unknown'}:{...chosen,source:'address_search',postalStatus:'user_confirmed'};";
const newGate = String.raw`const legacyPlaceQuery=/\b(aeropuerto|shopping|hotel|hospital|sanatorio|terminal|estadio|universidad|costa urbana|centro comercial|plaza|teatro)\b/i.test(q);
  // POI con nombre propio (Radisson, Hertz, La Perdiz), sin degradar calle/portal.
  const looksLikeStreetInput=/\b\d{3,5}\b/.test(q)||/^\s*(?:calle|avenida|av\.?|ruta|camino|pasaje|bulevar|blvr\.?|rambla)\b/i.test(q);
  const isPlaceQuery=legacyPlaceQuery||(q.length>=4&&!looksLikeStreetInput&&/[a-záéíóúüñ]/i.test(q));`;
const newOrdering = `// Mantener direcciones por delante si la búsqueda es ambigua, pero reservar
  // hasta cuatro sugerencias visibles para establecimientos con nombre.
  const poiSlots=Math.min(8,poiResults.length);
  const results=(looksLikePlace&&!looksLikeAddress)?[...poiResults,...streetResults]:
    [...streetResults.slice(0,12-poiSlots),...poiResults,...streetResults.slice(12-poiSlots)];`;
export function patchAutocompleteSource(source) {
  if(typeof source!=='string'||source.includes('looksLikeStreetInput')||
    source.split(oldGate).length!==2||source.split(oldOrdering).length!==2||source.split(oldUnique).length!==2||
    [...source.matchAll(oldSelection)].length!==1||
    !source.includes('mode=places')||!source.includes('const setMeta=(input,place)=>'))
    throw Error('Autocomplete efectivo distinto o ya parchado: abortar '+JSON.stringify({
      gate:source.split(oldGate).length-1,
      ordering:source.split(oldOrdering).length-1,
      selection:[...source.matchAll(oldSelection)].length,
      existsAlready:source.includes('looksLikeStreetInput'),
      places:source.includes('mode=places'),
      metadata:source.includes('const setMeta=(input,place)=>')
    }));
  return source.replace(oldGate,newGate).replace(oldOrdering,newOrdering).replace(oldSelection,newSelection).replace(oldUnique,newUnique);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [,,input,target]=process.argv;
  if(!input||!target||input===target)throw Error('Usar archivos de entrada y salida distintos');
  const source=await readFile(input,'utf8');
  await writeFile(target,patchAutocompleteSource(source),'utf8');
  console.log('VIA_POI_UI_PATCHED_LOCALLY_ONLY '+target);
}
