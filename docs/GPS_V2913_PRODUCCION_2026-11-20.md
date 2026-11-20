# Vía Traslados — Web V29.1.3: no seleccionar una ubicación GPS de ±2.000 m

**Fecha de publicación:** 20/11/2026 (Uruguay). **Estado:** publicada y verificada en producción. **Rollback:** no ejecutado.

## Origen del cambio
El propietario comprobó en Chrome Android (Samsung) que la versión V29.1.2 sí obtenía una posición, pero con exactitud de ±2.000 m, y finalmente mostraba en Origen «Punto de recogida sin dirección confirmada». La captura física demuestra que la ubicación ya estaba autorizada, pero **no demuestra** precisión postal; tampoco demuestra que el hardware pueda obtener coordenadas de mayor precisión.

En el código productivo V29.1.2 se confirmó una debilidad: tras los 18 segundos de `watchForBestGpsFix`, el código podía aceptar la mejor lectura disponible aunque fuese de ±2.000 m, geocodificarla y guardarla en `ViaAddress` como origen GPS. No debe utilizarse semejante estimación como punto de recogida automático.

## Corrección mínima
- Web `29.1.2 → 29.1.3`; recurso `reference.js?v=28 → ?v=29`.
- Tras evaluar validez geográfica y precisión, **si `accuracyMeters > 250` o la precisión no es finita**: no se efectúa geocodificación inversa ni escritura de un origen GPS nuevo; se muestra «Ubicación demasiado aproximada» con el margen, «Reintentar GPS», «Elegir en el mapa» y recordatorio de activar ubicación precisa de Chrome y precisión de ubicación de Android.
- Un origen manual se preserva. Si ya existía un GPS anterior con precisión peor que 250 m se limpia únicamente esa selección anterior, sin borrar una elección manual/de mapa.
- Para una lectura de ±35 m se conserva intacta la ruta original `assessGpsFix → IDE Uruguay → buildPickupDisplay → ViaAddress`. Para precisiones >100 m y ≤250 m se mantiene la advertencia aproximada anterior.
- El máximo de búsqueda sigue siendo 18 segundos; el motor `geo-v2/core.mjs?v=3`, los flujos de reservas, cuentas y las herramientas del mapa no se modificaron.

## Evidencia de auditoría y pruebas
- Rama: `via-gps-lowaccuracy-qa-20261120`.
- Candidata construida desde el Worker V29.1.2 efectivamente activo. QA con origen aislado y endpoints de reservas deshabilitados; no se generaron reservas reales.
- Run QA **44668586087**: **success**. Se comprobó HTTP 200 y el contenido Web 29.1.3, `reference.js?v=29`; motor geo conservado. Se completaron **15 casos de Chrome** (permiso concedido, prompt, denegado, fallback mapa, error 2, error 3, lectura ±2.000 → ±35, ±2.000 persistente sin autocompletar, lectura manual previa preservada, entrada manual mientras GPS, pantalla oculta, doble pulsación). Viewports 320/360/390/412 sin desbordamiento horizontal.
- Run publicación **44668965762**: **success**. Preflight Cloudflare/Hashes → despliegue solo web → comprobación postdeploy → 15 pruebas Chrome sintético contra URL productiva → reversa pública IDE válida. **No equivale a un ensayo GPS físico en Samsung.**
- Commit autorizado publicado: `5b47e5a1a3eb09d07f3effae5cc31f138ae8d3b8`.
- Artefacto de evidencia privado: `via-gps-v2913-production-proof`, ID `14598872939`, retención hasta 18/02/2027.

## Estado exacto de producción

| Componente | Identificador antes | Identificador después |
|---|---|---|
| Worker web `via-traslados-web-prod` | V29.1.2 `f2575cba-3454-4181-b985-5c627a301384` | **V29.1.3 `ae77208c-2200-4a83-9411-c27170112009`** |
| Deployment web | `89bd1efb-2f9c-474c-88b5-dba2b17eb50a` | `82e36a36-71cf-46c6-b00a-f014420bdd91` |
| API | V35 `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079` | Sin cambios; health + OTP OK |
| APK | V35 | Sin cambios |
| D1 | Sin migraciones | Sin cambios |

**SHA-256 `reference.js`:** antes `0d406c29b3339e3f18a3c0fdc2155ca4cd2015e72b93e4ad8d28cc44c70ba0a5`; después `7e4841b60c7a9796673ed7ad41e54446cac3eded802bcb1cb37971cec61fd47b`.

**Hashes intactos, confirmados postdeploy:**
- Geo `geo-v2/core.mjs`: `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1`
- `config.js`: `51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273`
- APK V35: `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3`

## Rollback
Retorno inmediato preestablecido: Worker web `via-traslados-web-prod` a versión **V29.1.2 `f2575cba-3454-4181-b985-5c627a301384`**, 100 % tráfico. Script protector `scripts/via-gps-v2913-production-guard.mjs rollback`. Tras activar, verificar HTML `29.1.2`, `reference.js?v=28` y hash `0d406c...`; comprobar API, geo y APK. **Nunca restaurar D1 por una corrección GPS web**.

## Validación pendiente
Probar en Samsung Chrome real con permisos precisos de Android y Chrome, Servicios de ubicación/«Mejorar precisión» activados, y comparar lectura con Google Maps. El parche elimina el riesgo de autoselección desde una lectura de 2 km, pero **no puede forzar precisión física ni modificar permisos Android desde la web**.
