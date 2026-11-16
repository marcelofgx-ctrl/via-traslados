import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../pages/map-point-picker.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../pages/index.html',import.meta.url),'utf8');
function mount(){
 const controls=[],inputs={},containers={};
 for(const id of ['home-origin','home-destination','origin','destination']){
  containers[id]={appendChild(el){controls.push({id,button:el})}};
  inputs[id]={dataset:{},closest:()=>containers[id]};
 }
 const document={
  getElementById:id=>inputs[id],
  createElement:tag=>({type:tag,attributes:{},setAttribute(k,v){this.attributes[k]=v},
   addEventListener(type,callback){this['on_'+type]=callback}}),
  body:{appendChild(){}}
 };
 let gpsRequests=0;
 const navigator={geolocation:{getCurrentPosition(){gpsRequests++}}};
 const window={};
 runInNewContext(js,{document,window,navigator});
 return{controls,inputs,window,gpsRequests};
}
test('el mapa permite seleccionar tanto origen como destino en ambos formularios',()=>{
 const {controls}=mount();
 assert.deepEqual(controls.map(c=>c.id),['home-origin','home-destination','origin','destination']);
 for(const item of controls){
  assert.equal(item.button.type,'button');
  assert.match(item.button.attributes['aria-label'],/en el mapa/);
  assert.equal(typeof item.button.on_click,'function');
 }
});
test('la página no pide GPS por sí sola, solo cuando se pulsa el botón',()=>{
 const result=mount();assert.equal(result.gpsRequests,0);
});
test('el script y el estilo del selector se cargan en el inicio de reservas',()=>{
 assert.match(html,/map-point-picker\.css\?v=3/);
 assert.match(html,/map-point-picker\.js\?v=5/);
 assert.match(js,/accuracy:'map'/);
 assert.match(js,/dispatchEvent\(new CustomEvent\('via:address'/);
});

test('búsqueda integrada, recuperación manual de teselas y mapa GPS opcional',()=>{
 assert.match(js,/via-picker-query/);
 assert.match(js,/tileerror/);
 assert.match(js,/via-picker-retry/);
 assert.match(js,/getCurrentPosition/);
 assert.match(js,/accuracy:'map'/);
 assert.match(js,/lat:position.lat,lng:position.lng/);
});

test('mapa vectorial y presentación de la dirección sin prefijos artificiales',()=>{
 assert.match(js,/tiles\.openfreemap\.org\/styles\/liberty/);
 assert.match(js,/maplibregl\.Map/);
 assert.match(html,/maplibre-gl@6\.18\.0/);
 const before=js.indexOf("const label=nearby||'Punto elegido en el mapa'");
 assert.ok(before>0,'Se conserva la dirección en lugar del prefijo «Punto seleccionado»');
 const preview=readFileSync(new URL('../pages/address-selected-preview.js',import.meta.url),'utf8');
 assert.match(preview,/via-selected-street/);
 assert.match(preview,/via-selected-locality/);
 assert.match(html,/address-selected-preview\.js\?v=3/);
});

test('fallback móvil de bajo consumo e indicación del modo de mapa',()=>{
 assert.match(js,/tileSize:512,zoomOffset:-1/);
 assert.match(js,/Modo básico:/);
 assert.match(js,/vectorSupported/);
 assert.match(js,/Chrome desde el menú/);
});

test('MapLibre 6 se carga exclusivamente por importación ESM, sin script clásico inválido',()=>{
 assert.match(html,/await import\('https:\/\/unpkg\.com\/maplibre-gl@6\.18\.0\/dist\/maplibre-gl\.mjs'\)/);
 assert.doesNotMatch(html,/dist\/maplibre-gl\.js/);
 assert.match(html,/qa-stable-layout\.css\?v=1/);
});
