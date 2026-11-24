// Integración del POI en el Worker real de V30, sin sustituir el motor anterior.
// Uso (sobre copia verificada, nunca GitHub viejo):
// node scripts/v30-geoapify-integration.mjs worker-v30-activo.mjs worker-v30-poi.mjs
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function patchWorkerSource(source,addon) {
  const matches=source.match(/\bexport\s+default\b/g)||[];
  if (matches.length!==1 || !source.includes('/api/direcciones') ||
      !source.includes('env.ASSETS.fetch(request)'))
    throw Error('El Worker activo no coincide con el contrato conocido: abortar');
  if (!addon.includes('export async function extendPlaceSearch') ||
      source.includes('__viaLegacyWorker') || source.includes('Geoapify Places'))
    throw Error('Complemento inesperado o ya integrado: abortar');
  const base=source.replace(/\bexport\s+default\b/,'const __viaLegacyWorker =');
  const plus=addon.replace('export async function extendPlaceSearch','async function extendPlaceSearch');
  return base+'\n\n'+plus+'\n\n'+
    'export default {async fetch(request,env,ctx){'+
    'const original=await __viaLegacyWorker.fetch(request,env,ctx);'+
    'return extendPlaceSearch(request,original,env);'+
    '}};\n';
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [, ,src,target]=process.argv;
  if (!src || !target || src===target) throw Error('Usar origen y salida distintos');
  const [worker,addon]=await Promise.all([
    readFile(src,'utf8'),readFile('addons/v30-geoapify-places.mjs','utf8')
  ]);
  const output=patchWorkerSource(worker,addon);
  await writeFile(target,output,'utf8');
  console.log('VIA_V30_POI_WORKER_PATCHED_LOCALLY_ONLY '+target);
}
