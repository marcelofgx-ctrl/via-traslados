// Vía Traslados — extender exclusivamente el bundle API que está ACTIVO en Cloudflare.
// No sustituir el código V35/V30 de backend por archivos de una rama histórica.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function patchActiveApiSource(source,addon){
 const plain=source.match(/\bexport\s+default\b/g)||[];
 const bundled=[...source.matchAll(/\bexport\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?/g)];
 if(!((plain.length===1&&bundled.length===0)||(plain.length===0&&bundled.length===1))||
   !source.includes('/api/health')||!source.includes('env.DB')||
   !addon.includes('async function viaPoiHandle')||
   source.includes('viaPoiHandle')||source.includes('__viaActiveApiWorker'))
   throw Error('Bundle API activo no reconocido o ya integrado: NO desplegar');
 let base;
 if(bundled.length){
   base=source.replace(bundled[0][0], 'const __viaActiveApiWorker='+bundled[0][1]+';');
 }else{
   const a=source.match(/\bexport\s+default\s+(\{)/);
   const b=source.match(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?/);
   if(a)base=source.replace(/\bexport\s+default\s+/, 'const __viaActiveApiWorker=');
   else if(b)base=source.replace(b[0],'const __viaActiveApiWorker='+b[1]+';');
   else throw Error('Export API incompatible; NO desplegar');
 }
 return base+'\n'+addon.replace(/export\s*\{\s*viaPoiHandle\s*\}\s*;?/,'')+'\n'+
   'export default {...__viaActiveApiWorker,async fetch(request,env,ctx){'+
   'if(new URL(request.url).pathname==="/api/via-places")return viaPoiHandle(request,env);'+
   'return __viaActiveApiWorker.fetch.call(__viaActiveApiWorker,request,env,ctx);'+
   '}};\n';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,input,output]=process.argv;
 if(!input||!output||input===output)throw Error('Se exige fuente efectiva y archivo nuevo');
 const [worker,addon]=await Promise.all([readFile(input,'utf8'),
   readFile('addons/v30-poi-api-proxy.mjs','utf8')]);
 const merged=patchActiveApiSource(worker,addon);
 await writeFile(output,merged,'utf8');
 console.log('VIA_POI_ACTIVE_API_WRAPPED_LOCALLY '+merged.length);
}
