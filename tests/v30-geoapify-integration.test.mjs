import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patchWorkerSource} from '../scripts/v30-geoapify-integration.mjs';

const source = "const fold = x => x; export default {async fetch(request,env){"+
  "if(new URL(request.url).pathname==='/api/direcciones')"+
  "return new Response(JSON.stringify({results:[]}));"+
  "return env.ASSETS.fetch(request);}};";
const addon=await readFile('addons/v30-geoapify-places.mjs','utf8');

test('no cambia el Worker si no coincide el contrato del activo',()=>{
  assert.throws(()=>patchWorkerSource('export default {};',addon),/contrato/);
  assert.throws(()=>patchWorkerSource(source+' export default {};',addon),/contrato/);
});
test('impide aplicar dos veces la extensión',()=>{
  const once=patchWorkerSource(source,addon);
  assert.throws(()=>patchWorkerSource(once,addon));
});
test('genera un Worker ESM válido con símbolos originales aislados',async()=>{
  const combined=patchWorkerSource(source,addon);
  const worker=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(combined));
  const res=await worker.default.fetch(
    new Request('https://viatraslados.com/api/direcciones?mode=places&q=Radisson'),
    {},{});
  assert.deepEqual((await res.json()).results,[]);
});
