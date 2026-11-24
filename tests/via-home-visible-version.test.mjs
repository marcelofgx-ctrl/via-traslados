import test from 'node:test';
import assert from 'node:assert/strict';
import {moveVisibleVersionToHeader} from '../scripts/via-home-visible-version.mjs';

const source = (version='30.0') => [
  '<html><head><meta name="via-release-version" content="'+version+'"></head>',
  '<body><header class="premium-header design-header">',
  '<a class="premium-brand"><span class="wordmark">ía Traslados<small>TRASLADOS PRIVADOS</small></span></a>',
  '</header><main><button id="via-confirm">Confirmar</button></main>',
  '<footer><small id="via-release-indicator" aria-label="Versión de la aplicación" style="opacity:.55">v'+version+'</small></footer></body></html>'
].join('');
test('mantiene versión v30.0 visible en el header, fuera del footer',()=>{
  const out=moveVisibleVersionToHeader(source());
  assert.match(out,/<header[^>]*>[\s\S]*id="via-release-indicator"[\s\S]*<\/header>/);
  assert.match(out,/· v30\.0/);
  assert.equal((out.match(/id="via-release-indicator"/g)||[]).length,1);
  assert(!out.slice(out.indexOf('<footer>')).includes('via-release-indicator'));
  assert.match(out,/<button id="via-confirm">Confirmar<\/button>/);
});
test('deriva el texto del meta para futuras versiones sin retocar el parche',()=>{
  const out=moveVisibleVersionToHeader(source('30.1'));
  assert.match(out,/· v30\.1/);
});
test('bloquea HTML desconocido, versiones incoherentes y cambios dobles',()=>{
  assert.throws(()=>moveVisibleVersionToHeader('html'),/Contrato/);
  assert.throws(()=>moveVisibleVersionToHeader(source().replace('>v30.0</small>','>v29.9</small>')),/Versión/);
  assert.throws(()=>moveVisibleVersionToHeader(moveVisibleVersionToHeader(source())),/Contrato/);
});
