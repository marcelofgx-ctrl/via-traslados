import test from 'node:test';
import assert from 'node:assert/strict';
import {patchActiveApiSource} from '../scripts/v30-poi-api-bundle-wrapper.mjs';
const addon='async function viaPoiHandle(){return new Response("poi")}\nexport {viaPoiHandle};';
const source='const worker_default={fetch:async()=>new Response("original")};\n'+
  'const validTransition=()=>true,validateBooking=()=>true;\n'+
  '// /api/health env.DB\n'+
  'export{worker_default as default,validTransition,validateBooking};';
test('Worker API de Cloudflare con exports auxiliares mantiene todos los símbolos',()=>{
 const out=patchActiveApiSource(source,addon);
 assert.match(out,/export\{validTransition,validateBooking\}/);
 assert.match(out,/const __viaActiveApiWorker=worker_default/);
 assert.match(out,/export default/);
 assert.match(out,/viaPoiHandle\(request,env\)/);
 assert(!out.includes('export{worker_default as default'));
});
test('rechaza Worker distinto y doble integración para proteger V30',()=>{
 assert.throws(()=>patchActiveApiSource('export default {}',addon),/NO desplegar/);
 const transformed=patchActiveApiSource(source,addon);
 assert.throws(()=>patchActiveApiSource(transformed,addon),/NO desplegar/);
});
test('export default sencillo también se conserva',()=>{
 const simple='// /api/health env.DB\nconst original={fetch(){return new Response("ok")}};\nexport default original;';
 assert.match(patchActiveApiSource(simple,addon),/const __viaActiveApiWorker=original/);
});
