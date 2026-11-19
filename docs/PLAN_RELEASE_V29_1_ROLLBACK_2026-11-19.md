# Vía Traslados — manifiesto previo a producción y rollback

**Auditoría no destructiva realizada:** 19/11/2026, ~10:36 Uruguay. Ningún deploy ni operación D1 fue realizada en esta auditoría.

## 1. Estado efectivamente activo al tomar el punto de retorno

| Componente | Nombre / versión de producto | Deployment Cloudflare activo | Version ID activo (100% tráfico) |
|---|---|---|---|
| Web de pasajeros | `via-traslados-web-prod`, HTML con `app.js?v=29`, `store.js?v=19` | `31e8299a-76af-4981-a882-5822fcf07aca` | **`ec35bd52-b832-4cff-bcb2-6a6b84c34c79`** |
| API de pasajeros/conductor/admin | `via-traslados-api`, release funcional V35 | `0471d254-9740-4af5-b392-af7d96e87b13` | **`9f0db4cc-29b8-4d79-8ce8-8fb0588bd079`** |
| APK conductor | V35 `0.35.0`, `uy.viatraslados.conductor.production` | No aplica (APK Android) | SHA-256 APK `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3` |

**Web hashes SHA-256** (GET públicos, mismos bytes exactos):
- HTML raíz: `dbd30afa6ce6c9ad5b3935bcf5fae62970d40e66264d0fee0d5ee3f381ae8360`.
- `app.js?v=29`: `2801344d2589c045b272482967098c701cebbe7e0d6aa13ec48ea76593f7a3c3`.
- `store.js?v=19`: `4626099e71bf45a50bd02cdd4aa5eb1c8c7d03e09d97387ee27ca8e9801294ef`.
- `geo-v2/core.mjs?v=3`: `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1`.
- APK V35 bytes: 1.115.533.

**Trazabilidad:** [GitHub Actions, GET únicamente](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44535082803); artifact privado `via-prod-auditoria-readonly-versiones` con manifiesto JSON y 30 días de conservación. GitHub `main` en el instante de la auditoría: `193fee54512870b1e530cc98baa6442be0f817d8`; **no** asumir que ese commit equivale al Worker en producción. Rama de documentación `via-release-auditoria-readonly-20261119` independiente de las QA.

## 2. Versiones propuestas — NO publicadas

**Recomendación: lanzamiento por fases y con números de versión explícitos.**

**Primera entrega conservadora: Web pasajeros `V29.1.0-RC1` → `V29.1.0`.** Incluir únicamente mejoras visuales y funcionales de acceso y portada: «Hola, nombre» solo con sesión verificada, «Creá tu cuenta» sin sesión, registro autónomo con OTP real, ocultación correcta de usuario anterior, formularios exclusivos y vistas móviles. Antes de publicar extraer assets de la web **efectiva** y generar un paquete de producción que NO incluya `QA · Cuentas`, identidades ficticias, códigos OTP `123456`, QA bypass de CAPTCHA, host QA, descarga APK debug ni claves de prueba.

- API: conservar **V35** con el Worker actual y comprobación de compatibilidad de los endpoints reales de OTP, sesión, PIN/passkey, `/api/public/route-preview` e identidad por celular con Turnstile. **No llevar** los cambios de `store.js` que dependen de idempotencia D1 nueva sin publicar primero el backend/migración correspondiente.
- APK: conservar **V35 firmada productiva**. La V36 MAESTRO QA es debug, package distinto y **no** se puede distribuir como actualización de producción.
- D1: **sin migración ni alteración de datos** durante esta primera entrega, para que el rollback sea de un solo Worker.

**Segunda entrega más amplia, separada:** API `V36-RC1`, APK `V36-RC1` firmada con la misma clave que V35, y actualizaciones de la web que requieran idempotencia/cambios de contrato. No declarar aptas estas versiones ni asignar un ID Cloudflare de destino hasta compilar paquete real, ejecutar E2E completo y publicarlo como versión inmutable. La `V30` web ya está reservada en el roadmap para evolución de cotizaciones `quoted`; por eso la actualización de acceso se etiqueta **V29.1**, no se presenta como la V30 de cotizaciones terminada.

## 3. Bloqueos antes de publicar

1. **Contratos reales de acceso:** probar en un entorno controlado entrega OTP por Resend, protección Turnstile, usuario existente/nuevo, PIN/huella y recuperación, sin cuentas sintéticas ni datos inventados.
2. **Ruta vial:** QA MAESTRO a 19/11 respondió `routePreviewReady:false`. Configurar clave Geoapify QA separada y `OTP_PEPPER` QA; validar rutas reales con km/min positivos y nombres completos; jamás pasar un 503 como éxito de ruta.
3. **Base de datos:** reconciliar hallazgo previo de 24 reservas y posterior auditoría de 7, verificando UUID real de D1, políticas de copia y ausencia de resets accidentales. No restaurar datos a ciegas ni modificar migraciones incompatibles.
4. **Android:** si se incluye APK V36, prueba en Samsung real y firma release original, firma/paquete/versiónCode y distribución controlada. En web-only V29.1 se conserva V35.
5. **Web:** 320/360/390/412 y Android físico; QA de cambio de identidad (A→B), sesiones pendientes, reserva y presupuesto (quoted vs confirmed), cero scroll horizontal, compatibilidad PWA caché y recursos de versión anterior.
6. **Reversibilidad:** comprobar que la versión **activa en Cloudflare al instante de desplegar** sigue siendo la registrada aquí; si cambió, rehacer auditoría y sustituir marcador de rollback. Preservar HTML/JS/CSS y script geográfico fuente/sha desde el Worker activo.
7. **Gate operacional:** congelar versiones/commit de release; disponer de operador autorizado y plan de monitoreo inmediato. No ejecutar flujo `cloudflare-production.yml` indiscriminado: aplica `schema.sql` y despliega API, no corresponde a un parche solo de web.

## 4. Rollback: procedimiento y límites

Para la primera entrega **Web V29.1**, revertir exclusivamente `via-traslados-web-prod` a **versión `ec35bd52-b832-4cff-bcb2-6a6b84c34c79`**, siempre que siga siendo el checkpoint correcto. En Cloudflare Dashboard > Workers & Pages > Worker `via-traslados-web-prod` > Deployments, seleccionar versión conocida > menú ⋯ > Rollback. **No elegir «versión anterior» sin comprobar ID**: puede ser otro estado intermedio. Cloudflare crea un deployment nuevo con 100% del tráfico en la versión seleccionada.

Verificar después: `app.js?v=29`, `store.js?v=19`, hash de `geo-v2/core.mjs?v=3`, inicio de reservas, OTP, CORS y APK V35 200/sha. Cloudflare puede servir temporalmente HTML/assets de despliegues distintos durante propagación, incluso tras rollback: mantener versiones de activos/cache compatibles.

Para un futuro cambio de API V36, objetivo de rollback de referencia **`via-traslados-api` versión `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079`**. **Rollback de Worker no restaura D1**: D1 requerirá backup/Time Travel previo, esquema aditivo compatible e inspección de nuevas reservas antes de cualquier reversión de datos. Restaurar D1 completa podría borrar reservas auténticas creadas después del release.

**APK:** Android no permite normalmente instalar `versionCode=35` sobre un `versionCode=36` instalado como actualización. Para volver al código V35 tras distribuir V36, preparar un APK nuevo firmado **con la misma clave original** y `versionCode>36` que ejecute el código restaurado, o administrar cuidadosamente desinstalación/reinstalación con sus riesgos. No dar por válida la APK debug MAESTRO QA como candidata de producción.

## 5. Estado

**NO apto para despliegue directo de todo PR #53.** Rama PR #53 sigue en borrador y contiene cambios exclusivamente de QA. Primera entrega recomendada: construir Web V29.1 sobre bytes activos y validar contra API V35 y APK V35 antes de liberar. Una vez compilada la candidata, registrar su commit SHA, checksum, identificador Cloudflare versión de **destino** y versión exacta de **retorno** en un manifiesto final firmado/documentado. Un nombre de versión propuesto sin paquete generado no es todavía una versión instalada.

**No se ha modificado producción para crear este documento.**
