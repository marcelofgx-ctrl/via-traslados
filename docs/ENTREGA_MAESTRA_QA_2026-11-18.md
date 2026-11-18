# Vía Traslados — Entrega auditada de Fase 1 (18/11/2026)

**Prioridad:** preservar producción, evitar regresiones, proteger datos.
**Baseline de producción:** repo `main` commit `193fee54512870b1e530cc98baa6442be0f817d8` en el instante de la auditoría.
**Alcance real:** cambios exclusivos de ramas QA/draft; **ningún despliegue de Worker, D1, APK o web productiva realizado en esta iteración.**

## 1. Incidente de integridad D1 — explicado, sin restauración
- Problema: primera auditoría de 18/11 00:54 UTC registraba 24 reservas; auditoría 18:46 UTC registraba 7.
- Causa confirmada: hubo 25 reservas antes de la limpieza; GitHub Actions ejecutó **reset D1 PROD remoto** a las 02:08 UTC del 18/11 en el run https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44220990983. La verificación posterior al reset reportó 0 reservas y 1 administrador intacto. Las 7 reservas actuales fueron creadas después.
- Respaldo: backup SQL previo completo y comprobado offline, 25 reservas, artefacto privado `VIA_TRASLADOS_D1_PROD_FULL_BACKUP_BEFORE_RESET_PRIVATE` en https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44220512329, expiración 2027-02-16. Contiene datos personales/tokens: **no compartir ni adjuntar a PR**.
- Auditoría forense: 7 actuales, D1 distinta de QA, Time Travel disponible, https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44379538618.
- Estado: **diagnóstico cerrado**. No se recuperaron registros antiguos; no se puede determinar la voluntad/autoridad de quien inició el workflow solo por el registro de ejecución. Restauración ciega es insegura para las 7 reservas posteriores.
- Rollback: no aplicó a la auditoría.

## 2. Android QA — aislamiento A→B y conflictos horarios
- Causa raíz: `MainActivity.api` capturaba token para la petición pero ejecutaba callback sin verificar que la sesión siguiese siendo la misma. Un fetch antiguo podía actualizar reservas/roles de nuevo usuario.
- Archivos: `android-driver/app/src/main/java/uy/viatraslados/conductor/MainActivity.java`, `tests/android-session-generation.test.mjs`, `.github/workflows/via-maestro-android-session-qa.yml`.
- Cambios: generación de contexto y filtrado de respuestas/calls antiguos; limpieza privada al salir/ingresar; protección biométrica; error 409 de agenda mostrado con diálogo accionable. No alterar reglas SQL de agenda.
- Rama `via-maestro-android-identidad-qa-20261118`. PR #50: https://github.com/marcelofgx-ctrl/via-traslados/pull/50 (**DRAFT**).
- Pruebas: suite de regresión Node y compilación Android V35 RC y V34 QA **verdes** https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44380164545. Artefacto privado de APK debug aislada.
- QA: **compilado, no validado físicamente**. Producción: **sin cambios**.
- Pendientes: Samsung Android real, cuenta A→B, respuesta tardía, revocación, OTP conductor, biometría, notificaciones.
- Rollback: descartar rama, sin tocar D1 ni APK firmada existente.

## 3. API de reservas — idempotencia y transacciones (candidata QA)
- Causa raíz: `POST /api/requests` generaba ID aleatorio y emitía escrituras independientes sin idempotencia.
- Archivos: `backend/worker.js`, `backend/booking-submission.js`, `backend/schema.sql`, `backend/migrations/20261118_booking_submission_keys.sql`, `tests/booking-submission.test.mjs`, `tests/route-autoprecompute.test.mjs`, `scripts/booking-submission-qa-sqlite.py`, `.github/workflows/via-maestro-booking-idempotency-qa.yml`.
- Cambios: `Idempotency-Key` opcional con 64 hex aleatorios; digest por payload y email; token de recuperación estable, claves en tabla aditiva; batch D1 cliente/reserva/evento/clave; 409 si payload distinto; CORS ampliado. Cliente sin cabecera sigue aceptado (no se garantiza idempotencia para clientes viejos).
- Rama `via-maestro-idempotencia-qa-20261118`. PR #51: https://github.com/marcelofgx-ctrl/via-traslados/pull/51 (**DRAFT**).
- Pruebas: **75/75** Node y migración idempotente en SQLite aislado; https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44380876476.
- QA: **simulada, sin D1 QA remota ni OTP E2E**. Producción: **sin cambios**.
- Pendientes: D1 QA real, token OTP un solo uso en reintento, tráfico concurrente real, navegación, cache, compatibilidad de clientes previos.
- Rollback: abandonar rama. Cuando llegue release, revertir Worker sin borrar tabla ni reservas nuevas.

## 4. Web V29 — envío protegido sobre fuente real
- Inventario de web *activa* vía runner: `/store.js?v=19` contiene `POST /api/requests` y SHA-256 `4626099e71bf45a50bd02cdd4aa5eb1c8c7d03e09d97387ee27ca8e9801294ef`; `/app.js?v=29` es presentación y no debe reemplazarse. Auditoría: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44381484507.
- Código QA de parche: `scripts/via-v29-store-idempotency-qa.mjs`; verificación `tests/via-store-idempotency-qa.test.mjs` y workflow `.github/workflows/via-maestro-web-store-qa.yml`.
- Cambio: solo `store.js` generado a partir de bytes V19 activos, exigiendo match de SHA. Misma clave aleatoria al reintentar, persiste en `sessionStorage` hasta confirmación, bloqueo de doble toque, respuesta de A descartada al ingresar B. Se verificó que `logout()` de V19 ya limpiaba referencias de reservas y que `setCustomer()` limpiaba tokens al cambiar correo; conservar esa protección.
- Rama `via-maestro-web-idempotencia-qa-20261118`. PR #52: https://github.com/marcelofgx-ctrl/via-traslados/pull/52 (**DRAFT**).
- Pruebas: **4/4** en contexto JavaScript simulado + sintaxis, usando JS público activo como fuente: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44382245471; salida en artefacto privado GitHub Actions.
- QA: **artefacto construido, NO web QA desplegada**. Producción: **sin cambios**.
- Dependencias: requiere API/migración #51 y workflow de despliegue del Worker web desde asset prod validado; pruebas de navegador móvil real; service worker/caché.

## 5. Elementos protegidos, no modificados
- Motor geográfico IDE Uruguay/Geoapify y caché `booking_routes`; assets públicos actuales y reservas.
- `confirmed` visual existente; `quoted` V30 sigue siendo demo y su integración queda pendiente.
- Trigger `via_quote_guard`/`via_quote_commit` con chequeo atómico de conflicto/agendas.
- Firma y paquete productivos Android V35 (`uy.viatraslados.conductor.production`), QA en `.productionrc` separado.
- D1 original, clave Resend, OTP reales, web/API Cloudflare, claves y secretos.

## 6. Gates para producción (TODOS pendientes)
1. Recuperar identificador real de Worker web/API actuales, backup/manifest SHA de todos los assets, bookmark D1, restauración ensayada con datos sintéticos.
2. Desplegar Worker/API de PR #51 + migración solo en D1 QA exclusiva; no reemplazar V34 QA funcional.
3. Conectar store QA #52 a web QA copia idéntica de producción, probar OTP real con destinatario controlado, 201 perdido, doble toque, A→B, sesión vencida, confirmación `quoted→accepted`, geocodificación, kilómetros persistidos.
4. Pruebas de navegador 320/360/390/412px, PWA service worker y pestaña antigua.
5. Pruebas Android reales en Samsung con A/B y los conflictos de agenda del 19/11 a las 10:00, respetando autorización y sin tocar reservas productivas.
6. Inspección de regresiones (pruebas positivas y negativas), compatibilidad APK V35 firmada, rollback seguro de código, verificación conteos previos/posteriores D1.
7. Recién entonces revisión/aprobación de PR y publicación controlada.

**Estado general:** causa de reset D1 explicada; correcciones QA aisladas disponibles con pruebas automatizadas; ninguna de las nuevas mejoras se considera publicada o lista para producción.
