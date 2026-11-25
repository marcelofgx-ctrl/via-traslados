// Pruebas de contrato de los límites de identidad Android.
// El build nativo y una prueba A→B con dos cuentas reales siguen siendo necesarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../android-driver/app/src/main/java/uy/viatraslados/conductor/MainActivity.java',import.meta.url),'utf8');
test('cada solicitud HTTP captura la generación e identidad que la originó',()=>{
 assert.match(source,/final long requestGeneration = sessionGeneration;/);
 assert.match(source,/final String requestToken = staffToken;/);
 assert.match(source,/final String requestOperatorKey = operatorKey;/);
 assert.match(source,/if \(!isLogout && requestGeneration != sessionGeneration\) return;/);
 assert.match(source,/if \(isFinishing\(\) \|\| requestGeneration != sessionGeneration\) return;/);
 assert.match(source,/!java\.util\.Objects\.equals\(requestToken, staffToken\)/);
});
test('logout invalida la generación y limpia reservas privadas de la APK',()=>{
 assert.match(source,/private void loginScreen\(\) \{\s*sessionGeneration\+\+;\s*clearPrivateSessionUi\(\);/);
 assert.match(source,/private void clearPrivateSessionUi\(\) \{[\s\S]*?bookings = new JSONArray\(\);/);
 for(const m of ['routeResults','routeStarted','routeFailures','routeCards','routeCardBookings']){
  assert.ok(source.includes(m+'.clear();'),m+' debe limpiarse al cambiar la cuenta');
 }
 assert.match(source,/managedAdmins = new JSONArray\(\);/);
 assert.match(source,/acceptanceDialog\.dismiss\(\);/);
 assert.match(source,/final boolean isLogout = "\/api\/staff\/logout-device"\.equals\(path\);/);
});
test('cambio de identidad autenticada invalida contexto anterior',()=>{
 assert.match(source,/private void replaceAuthenticatedIdentity\(\) \{\s*sessionGeneration\+\+;\s*clearPrivateSessionUi\(\);/);
 assert.ok(source.split('replaceAuthenticatedIdentity();').length>=6,'todos los ingresos deben invalidar el contexto');
 assert.match(source,/final long requestedGeneration=sessionGeneration;[\s\S]*?if\(requestedGeneration!=sessionGeneration\)return;/);
});
test('conflicto horario informa causa y mantiene vuelta/actualización',()=>{
 assert.match(source,/\.setTitle\("Conflicto de agenda"\)/);
 assert.match(source,/Ya tenés otro traslado asignado en ese horario/);
 assert.match(source,/\.setNegativeButton\("Volver",null\)/);
 assert.match(source,/\.setPositiveButton\("Actualizar"/);
});
