import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='gps-v2913-build/assets/';
const sha=data=>createHash('sha256').update(data).digest('hex');
const jsFile=root+'reference.js',htmlFile=root+'index.html';
const original=await readFile(jsFile,'utf8');
assert.equal(sha(original),'0d406c29b3339e3f18a3c0fdc2155ca4cd2015e72b93e4ad8d28cc44c70ba0a5','Reference productivo cambió');
const insertionPoint='   const controller=new AbortController();run.abort=controller;';
assert.equal(original.split(insertionPoint).length,2,'No hay punto único para la guarda');
const guard=`   // No asumir un punto de recogida si la única lectura es demasiado imprecisa.
   // El navegador puede entregar una ubicación general de la ciudad con permiso concedido.
   const meters=Number(pos.accuracyMeters);
   if(!Number.isFinite(meters)||meters>250){
    finishGps(run);
    // Limpiar exclusivamente una selección GPS antigua demasiado imprecisa.
    // Nunca borrar un origen manual o confirmado mediante el mapa.
    if(gpsInput?.dataset?.source==='gps'&&Number(gpsInput.dataset.gpsAccuracy)>250&&gpsInput.value===run.value){
     window.ViaAddress?.set('home-origin',null);
     gpsInput.dispatchEvent(new CustomEvent('via:address',{bubbles:true,detail:null}));
    }
    gpsPanel('Ubicación demasiado aproximada',
     Number.isFinite(meters)?
      'El teléfono solo consiguió una precisión de ±'+Math.round(meters)+' m. No usamos esa posición como punto de recogida.':
      'El teléfono no informó una precisión confiable. No usamos esa posición como punto de recogida.',
     [{label:'Reintentar GPS',go:startGps,primary:true},{label:'Elegir en el mapa',go:openGpsMap}],
     'Comprobá que Chrome tenga Ubicación precisa permitida y que Android tenga activada Mejorar precisión de ubicación.');
    return;
   }
`;
const revised=original.replace(insertionPoint,guard+'\n'+insertionPoint);
assert.equal(revised.split('Ubicación demasiado aproximada').length,2);
assert.equal(revised.split('watchForBestGpsFix').length,2,'No se debe alterar watcher');
assert(revised.includes('window.ViaMapPicker?.openFor'),'Selector de mapa debe preservarse');
let html=await readFile(htmlFile,'utf8');
assert.equal(html.split('content="29.1.2"').length,2);
assert.equal(html.split('reference.js?v=28').length,2);
html=html.replace('content="29.1.2"','content="29.1.3"').replace('reference.js?v=28','reference.js?v=29');
assert(html.includes('geo-v2/core.mjs?v=3'));
await writeFile(jsFile,revised);
await writeFile(htmlFile,html);
console.log('VIA_GPS_V2913_PATCHED '+JSON.stringify({changed:['reference.js','index.html'],before:sha(original),after:sha(revised),html:sha(html),thresholdMeters:250,geoUnchanged:true}));
