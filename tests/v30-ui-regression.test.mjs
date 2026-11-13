import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync('android-driver/app/src/main/java/uy/viatraslados/conductor/MainActivity.java','utf8');
const samples=readFileSync('android-driver/app/src/main/java/uy/viatraslados/conductor/ViaPreviewData.java','utf8');
const layout=ui.slice(ui.indexOf('private void details(JSONObject item)'),ui.indexOf('private void openMaps(JSONObject item)'));
const settings=ui.slice(ui.indexOf('private void settings(LinearLayout body)'),ui.indexOf('private void navigation()'));

test('importe ofrecido tiene dos componentes con ancho correctamente definido',()=>{
  assert.match(layout,/fare\.addView\(fareLabel,new LinearLayout\.LayoutParams\(0,-2,1\)\)/);
  assert.match(layout,/fare\.addView\(total,new LinearLayout\.LayoutParams\(-2,-2\)\)/);
  assert.doesNotMatch(layout,/addLine\(fare,/);
  assert.match(layout,/itinerary\.addView\(fare,new LinearLayout\.LayoutParams\(-1,-2\)\)/);
});
test('tomar viaje cotizando es primario, asignar otro conductor secundario',()=>{
  assert.match(layout,/if\(canQuote\)\s*\{\s*footer\.addView\(button\("Cotizar y tomar viaje/);
  assert.match(layout,/actionText\("Asignar otro conductor manualmente/);
});
test('ajustes preview no muestra ni ejecuta enrolamiento real',()=>{
  assert.match(settings,/if\(BuildConfig\.VIA_PREVIEW\)\s*\{/);
  const start=settings.indexOf('if(BuildConfig.VIA_PREVIEW)');
  const end=settings.indexOf('return;',start);
  const demoBlock=settings.slice(start,end);
  assert.doesNotMatch(demoBlock,/bootstrapAdmin|saveBiometric|linkExistingAdmin|Cerra?r sesi[oó]n/);
  assert.match(demoBlock,/sin cuentas reales/);
});
test('cotizaciones ficticias traen conductor adjudicado',()=>{
  assert.match(samples,/boolean alreadyQuoted="quoted"\.equals\(item\.optString\("status"\)\)/);
  assert.match(samples,/alreadyQuoted\?"Lucía Gómez":JSONObject\.NULL/);
});
