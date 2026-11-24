// Vía Traslados — etiqueta de versión en encabezado, mínima, sin tocar lógica.
// Toma el número del meta via-release-version y mueve el indicador hoy enterrado
// en el pie de página. Fallar si cambia el contrato HTML evita cambios accidentales.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function moveVisibleVersionToHeader(source) {
  const html=String(source);
  const meta=[...html.matchAll(/<meta\s+name="via-release-version"\s+content="([0-9][a-zA-Z0-9.-]*)"\s*\/?\s*>/g)];
  const indicators=[...html.matchAll(/<small\s+id="via-release-indicator"[^>]*>v[0-9][a-zA-Z0-9.-]*<\/small>/g)];
  const anchor='<small>TRASLADOS PRIVADOS</small>';
  if(meta.length!==1||indicators.length!==1||html.split(anchor).length!==2)
    throw Error('Contrato de versión o encabezado distinto; no modificar producción');
  const version=meta[0][1];
  const actual=indicators[0][0].match(/>v([^<]+)<\/small>$/)?.[1];
  if(actual!==version)
    throw Error('Versión del footer diferente al meta; corregir antes del despliegue');
  const headerEnd=html.indexOf('</header>');
  const brand=html.indexOf('class="premium-brand"');
  if(headerEnd<0||brand<0||brand>headerEnd||html.indexOf(anchor)<brand||html.indexOf(anchor)>headerEnd)
    throw Error('No está el encabezado original premium; no modificar');
  const marker='<small>TRASLADOS PRIVADOS <span id="via-release-indicator" aria-label="Versión de la aplicación" style="font:500 9px/1.1 system-ui,sans-serif;letter-spacing:0;opacity:.7;white-space:nowrap">· v'+version+'</span></small>';
  const next=html.replace(indicators[0][0],'').replace(anchor,marker);
  if(next.split('id="via-release-indicator"').length!==2||next.indexOf('id="via-release-indicator"')>next.indexOf('</header>'))
    throw Error('El distintivo no quedó dentro del encabezado');
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [,,input,output]=process.argv;
  if(!input||!output||input===output)throw Error('Indicar HTML original y HTML nuevo distintos');
  const html=await readFile(input,'utf8');
  const updated=moveVisibleVersionToHeader(html);
  await writeFile(output,updated,'utf8');
  console.log('VIA_VISIBLE_VERSION_READY version='+updated.match(/name="via-release-version" content="([^"]+)"/)?.[1]);
}
