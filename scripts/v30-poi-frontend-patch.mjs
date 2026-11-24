// Vía Traslados V30 — parche mínimo del autocomplete REAL, SOLO copia QA.
// No agrega estilos ni cambia eventos o la persistencia lat/lng.
// Se construye a partir del asset efectivo de producción y aborta si difiere.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const oldGate = String.raw`const isPlaceQuery=/\b(aeropuerto|shopping|hotel|hospital|sanatorio|terminal|estadio|universidad|costa urbana|centro comercial|plaza|teatro)\b/i.test(q);`;
const oldOrdering = "const results=(looksLikePlace&&!looksLikeAddress)?[...poiResults,...streetResults]:[...streetResults,...poiResults];";
const newGate = String.raw`const legacyPlaceQuery=/\b(aeropuerto|shopping|hotel|hospital|sanatorio|terminal|estadio|universidad|costa urbana|centro comercial|plaza|teatro)\b/i.test(q);
  // POI con nombre propio (Radisson, Hertz, La Perdiz), sin degradar calle/portal.
  const looksLikeStreetInput=/\b\d{3,5}\b/.test(q)||/^\s*(?:calle|avenida|av\.?|ruta|camino|pasaje|bulevar|blvr\.?|rambla)\b/i.test(q);
  const isPlaceQuery=legacyPlaceQuery||(q.length>=4&&!looksLikeStreetInput&&/[a-záéíóúüñ]/i.test(q));`;
const newOrdering = `// Mantener direcciones por delante si la búsqueda es ambigua, pero reservar
  // hasta cuatro sugerencias visibles para establecimientos con nombre.
  const poiSlots=Math.min(4,poiResults.length);
  const results=(looksLikePlace&&!looksLikeAddress)?[...poiResults,...streetResults]:
    [...streetResults.slice(0,12-poiSlots),...poiResults.slice(0,poiSlots),...streetResults.slice(12-poiSlots)];`;
export function patchAutocompleteSource(source) {
  if(typeof source!=='string'||source.includes('looksLikeStreetInput')||
    source.split(oldGate).length!==2||source.split(oldOrdering).length!==2||
    !source.includes('mode=places')||!source.includes('setMeta(input,place)'))
    throw Error('Autocomplete efectivo distinto o ya parchado: abortar');
  return source.replace(oldGate,newGate).replace(oldOrdering,newOrdering);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [,,input,target]=process.argv;
  if(!input||!target||input===target)throw Error('Usar archivos de entrada y salida distintos');
  const source=await readFile(input,'utf8');
  await writeFile(target,patchAutocompleteSource(source),'utf8');
  console.log('VIA_POI_UI_PATCHED_LOCALLY_ONLY '+target);
}
