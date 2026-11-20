# Vía Traslados — Web V29.1.2 GPS y permisos Chrome/Android

**Publicación:** 20 de noviembre de 2026, 00:18 h Uruguay (03:18 UTC).  
**Estado:** PUBLICADA Y VERIFICADA en producción. **Rollback no ejecutado.**

## Alcance exacto

Se partió de los recursos *efectivamente publicados* en `https://viatraslados.com`, auditando primero Cloudflare y el contenido real del sitio. La nueva versión modifica únicamente el código GPS de `reference.js` y los marcadores de versión de `index.html`.

- `index.html`: versión web `29.1.1 → 29.1.2`, recurso `reference.js?v=27 → reference.js?v=28`.
- `reference.js`: panel contextual compacto que distingue permiso por solicitar, permiso bloqueado, código 1 (denegado), código 2 (posición no disponible), código 3 (timeout) y lectura imprecisa; botón de reintento y apertura del mapa original mediante `window.ViaMapPicker.openFor('home-origin')`.
- Conserva `watchPosition` de alta precisión, mejores lecturas durante máximo 18 segundos y fin anticipado a ≤100 m.
- Cancela lectura y descarta respuestas asíncronas tras entrada manual de origen, selección de dirección, abandono de página, ocultación de pestaña o cambio de navegación. Evita observadores concurrentes.
- Mantiene geocodificación inversa IDE Uruguay y `buildPickupDisplay` original del motor; no inventa números de puerta cuando el GPS es incierto.
- No pide ubicación automáticamente ni puede alterar los permisos de Android sin autorización del usuario.

## Versiones verificadas

| Componente | Antes | Después |
|---|---|---|
| Worker web `via-traslados-web-prod` | `0043d931-e3cc-444a-966c-7e760d13f792` | `f2575cba-3454-4181-b985-5c627a301384` |
| Deployment web Cloudflare | `b54dd824-9c87-4663-b7a0-dc779b91b835` | `89bd1efb-2f9c-474c-88b5-dba2b17eb50a` |
| API `via-traslados-api` | `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079` | Sin cambios, API saludable y OTP disponible |
| APK conductores | V35 | Sin cambios |
| D1 | Sin migraciones | Sin cambios |

**Hashes SHA-256:** `reference.js` anterior `ef28049b873c228284787f0865982a06ce562b93759a97dec5676e18f6166680`; nuevo `0d406c29b3339e3f18a3c0fdc2155ca4cd2015e72b93e4ad8d28cc44c70ba0a5`.

**Preservados byte a byte y verificados postdeploy:** `geo-v2/core.mjs` = `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1`; `config.js` = `51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273`; APK V35 = `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3`.

El manifiesto generado en el runner incluye inventario y hashes de los 41 activos de origen, el nuevo HTML y el nuevo JS, además del commit de publicación.

## Evidencia QA y producción

- Rama de trabajo aislada: `via-gps-v2912-qa-20261119`; commit autorizado: `124eebc8567bbeab4d2cd5dfd62f59de130ce292`.
- QA, GitHub Actions `44666465717`: **success**. Worker QA existente `https://via-traslados-gps-precision-qa.marcelof-gx.workers.dev/` verificado HTTP 200, versión `29.1.2`, API de reservas deshabilitada (HTTP 503) y configuración de API productiva ausente.
- 14 escenarios de navegador Chrome sintético: permiso granted/prompt/denied, API de permisos no disponible, apertura real del selector de mapa, error de posición y timeout separados, lecturas ±2.000 m → ±35 m, persistencia de imprecisión, protección de dirección manual, cancelación al salir, doble pulsación, dimensiones 320/360/390/412 px sin desplazamiento horizontal.
- Publicación productiva GitHub Actions `44666678841`: **success**. Preflight confirmado con V29.1.1 y API V35; Cloudflare activó V29.1.2. Postdeploy comprobó nueva versión, hashes de GPS/Geo/config/APK, salud API y 14 escenarios de Chrome nuevamente sobre la URL pública; geocodificación inversa de muestra respondió satisfactoriamente.
- Evidencia privada: artefacto `via-gps-v2912-production-proof`, ID `14598440559`, retenido hasta 18/02/2027. No incluye reservas ni otros datos sensibles de pasajeros.

## Rollback exacto

Si hay regresión funcional, restaurar en Worker `via-traslados-web-prod` la versión **V29.1.1 `0043d931-e3cc-444a-966c-7e760d13f792`** al 100 %; corroborar que `index.html` vuelve a `29.1.1`, `reference.js?v=27` y su hash `ef28049b...`; verificar motor geográfico, API V35 y APK V35. La automatización `scripts/via-gps-v2912-production-guard.mjs rollback` gestiona y verifica el retorno. **No** restaurar D1 ni modificar API/APK. No se requirió rollback durante la publicación.

## Limitaciones de la prueba

Las pruebas Chrome usan geolocalización **simulada** y no verifican la señal GPS física ni los diálogos de permisos de un Samsung real. La comprobación manual en Chrome Android queda como validación de campo. Los permisos previamente bloqueados se deben reactivar por el usuario desde Chrome/Android; la página solo puede orientar y volver a solicitar lo permitido por la plataforma.