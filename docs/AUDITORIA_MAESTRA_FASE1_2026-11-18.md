# Vía Traslados — Fase 1, auditoría inicial de estabilización
Fecha: 2026-11-18 (Uruguay) · **Solo lectura sobre sistemas operativos** · base Git: `193fee54512870b1e530cc98baa6442be0f817d8`

## Alcance y fuentes
Se revisaron GitHub privado, código de `main`, PR #31, #32, #39, #45, #46 y #47, y logs de GitHub Actions. No se ejecutó SQL sobre producción desde esta auditoría, no se cambió la APK ni se publicó ningún Worker. El acceso directo externo al sitio desde el entorno del auditor no fue posible; la evidencia de respuestas reales proviene del runner de CI.

Entornos conocidos: web `via-traslados-web-prod`, API `via-traslados-api`, D1 `via-traslados-db`, APK de producción `uy.viatraslados.conductor.production` V35 firmada. **No equiparar automáticamente fuente de main con bytes en el Worker.**

## P0 — Diferencia no explicada en la cantidad de reservas

- Auditoría D1 2026-11-18 00:54 UTC: **24 reservas**, 22 tablas, `via-traslados-db`: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44211641193
- Auditoría D1 2026-11-18 18:46 UTC: **7 reservas**, desglose 4 `confirmed`, 2 `requested`, 1 `cancelled`: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44373243709
- La segunda consulta usa `SELECT status,COUNT(*) FROM bookings GROUP BY status`, sin filtro temporal. **No se puede atribuir la diferencia de 17 registros a una eliminación sin verificar UUID de base, migraciones/restauraciones y linaje temporal.**
- **Bloqueo recomendado:** no aplicar ninguna migración o restauración, no ejecutar limpieza ni crear pruebas destructivas hasta reconstruir la cronología. Capturar identificador de D1, marcadores Time Travel y conteos de eventos/rutas en una investigación estrictamente read-only. Una restauración a ciegas puede borrar reservas válidas posteriores.

## P1 — Envíos sin idempotencia

- Archivo: `backend/worker.js`, rama `main`, `POST /api/requests`.
- Evidencia: una vez autenticado/consumido el OTP, genera `VIA-${crypto.randomUUID()...}`, crea `customers`, `bookings`, `booking_events` en escrituras independientes y responde HTTP 201. No se observa almacenamiento de claves de idempotencia para solicitudes repetidas.
- Riesgo: pérdida de respuesta/reenviado o doble toque podrían crear más de una reserva; fallo intermedio puede dejar reserva sin evento.
- **No afirmar duplicación real:** auditoría de dos nuevas solicitudes de 19/11 10:00 reportó `sameCustomer=0`, `sameRoute=0`, `sameTime=1`; son distintas según esos indicadores.
- Cambio propuesto, **sin implementar**: clave idempotente por operación y cuenta; digest de payload, restricción única en D1, transacción atómica para creación/evento y recuperación segura de referencia para reintentos. Con sesión previa obligatoria o prueba criptográfica suficiente para recuperación, sin divulgar reservas por solo conocer email.
- Criterios QA: doble envío simultáneo, respuesta perdida, reintento desde otro dispositivo, falla parcial, mismo key con payload diferente, sesión expirada. No tocar D1 hasta tener migración aditiva reversible ensayada.

## P1 — Respuestas antiguas de APK al cambiar de identidad

- Archivo: `android-driver/app/src/main/java/uy/viatraslados/conductor/MainActivity.java`.
- Evidencia: `api()` captura el token al iniciar la llamada, pero `handler.post(() -> done.call(...))` no verifica generación/identidad de sesión; `fetchBookings()` asigna `bookings = next` con la respuesta. `Cerrar sesión` vacía `bookings`, pero no invalida callbacks de red aún pendientes.
- Riesgo: una respuesta correspondiente al conductor A puede repintar información tras ingresar el conductor B. Es un **riesgo confirmado por lectura del código**, no un incidente observado en dispositivo.
- Cambio propuesto, **sin implementar**: generación de sesión monotónica con invalidación de callbacks; cancelar o descartar fetches previos; limpiar `routeResults`, `routeFailures`, `loading`, permisos/roles y notificaciones de la sesión anterior; volver a validar roles con servidor. Añadir prueba automatizada A→logout→B con respuesta A retrasada.
- No alterar API, claves de firma ni motor geográfico por este arreglo.

## P1 — Auditoría de estados no totalmente atómica

- Archivo: `backend/worker.js` función `transition()`.
- Evidencia: se realiza `UPDATE bookings ... RETURNING` y después `INSERT INTO booking_events` por separado.
- Riesgo: si falla el segundo paso puede existir estado actualizado sin evento auditado.
- Cambio propuesto, **sin implementar**: transacción SQLite/D1 o trigger protegido con contrato compatible. Probar estados y rollback frente a falla inducida en QA.

## Protecciones que existen y NO se deben reemplazar

- `backend/schema.sql`: triggers `via_quote_guard` y `via_quote_commit` verifican estado, autorización, capacidad, solapamiento, asignación y evento dentro del INSERT de cotización. `backend/dispatch-ops.js` transforma errores SQL de conflicto a HTTP 409.
- `backend/staff.js`: la asignación administrativa también revalida disponibilidad con SQL condicionado.
- `backend/route-estimate.js`: cálculo de ruta vial IDE/Geoapify, caché de vista previa, persistencia por reserva. No hay indicio aquí que justifique reemplazar el motor.
- `backend/customer-auth.js`: listado de reservas filtrado por email de sesión y endpoint logout que revoca sesión; `backend/worker.js` ante sesión pasajero activa no prioriza token heredado de otro pasajero.
- Tests existentes `tests/passenger-booking-isolation.test.mjs`, `tests/assignment-rules.test.mjs`, `tests/route-estimate.test.mjs`. Estas pruebas no sustituyen ensayo real con dos teléfonos/cuentas.

## Estado web y APK realmente registrado

- APK V35: release productiva firmada, package `uy.viatraslados.conductor.production`, versionCode 35, SHA256 `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3`. Fuente: PR #39 y https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44217953017. Próxima versión debe usar la **misma** firma guardada de forma segura.
- Web V29 sigue siendo interfaz transaccional; `/avance-v30.html` es **demo visual estática** y no cotiza ni acepta reservas. Publicación PR #46, CI exitosa https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44345023848. La PR #45 de V30 QA sigue abierta.
- Guardia de producción PR #47 / CI https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44368769757: OTP configurado y CORS, ruta Shangrilá→Carrasco devuelve kilómetros y minutos válidos, geocodificación inversa, assets, web, APK 200. **No prueba entrega de correo, idempotencia, datos de usuarios A/B ni APK real en Samsung.**

## Matriz de estado y próximos pasos

| Tema | Evidencia disponible | Pendiente |
|---|---|---|
| Integridad D1 | Dos conteos read-only 24 y 7 | Investigación P0 de diferencia; congelar escrituras de mantenimiento |
| Reservas nuevas | Endpoint y test existentes | Idempotencia y transacción de evento con D1 QA |
| A→B pasajero | Filtro por email y test unitario | Navegador real, promesas antiguas, service worker y almacenamiento |
| A→B conductor | Posible carrera confirmada en código | Parche de generación de sesión y test Android QA |
| Conflicto de conductor | Guard SQL atómico existente | Explicación previa en APK y caso 19/11 10:00 con cuentas controladas |
| Geografía | Smoke CI verde para ruta de referencia | Matriz multimodal de direcciones y latencias; preservar motor |
| OTP | Health/config/CORS verde | Entrega real controlada, reintento, recuperación y rechazo proveedor |
| Web V30 | Demo publicada y QA aislada | Integración real de `quoted` con D1 QA antes de prod |
| Firma V35 | Hash/release CI | Confirmar backup offline de clave y prueba Samsung |

## Protocolo para cualquier corrección posterior
1. Congelar baseline: SHA Git, IDs de Worker, manifest y hashes de assets, package y firma Android, bookmark D1; sin secretos.
2. Corregir en rama aislada, sin tocar Cloudflare productivo. No realizar pruebas de envíos reales ni generar reservas en producción.
3. Tests unitarios + integración D1 QA + navegador 320/360/390/412 px + APK Android con dos cuentas.
4. Revisar contratos web/APK antiguos y plan de rollback de **código**; no restaurar D1 automáticamente.
5. Publicar sólo con evidencia y comparación post-publicación de reservas y servicios.

## Formato de entrega / estados
- **Problemas:** P0 integridad, P1 idempotencia, P1 callback Android, P1 eventos de estado.
- **Causa raíz:** confirmada en lectura de código para ausencia de idempotencia y falta de generación de sesión; origen del conteo 24→7 **no confirmado**.
- **Archivos:** listados arriba; no se editó ninguno.
- **Cambio realizado:** exclusivamente este informe, en rama aislada.
- **Riesgos y protecciones:** no se modificó lógica ni D1; PR sin merge automático.
- **Pruebas:** evidencia preexistente de GitHub Actions y revisión estática; ninguna prueba E2E nueva atribuida a este informe.
- **QA:** informe solamente, sin despliegue.
- **Producción:** intacta por este trabajo; tampoco se intentó rollback.
- **Rollback:** eliminar la rama/informe si se desea; no afecta producto ni datos.
- **Pendientes:** matriz anterior. **Ninguna corrección funcional se declara implementada.**
