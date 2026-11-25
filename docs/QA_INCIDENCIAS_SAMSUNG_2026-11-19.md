# Vía Traslados — incidencias observadas en Samsung, QA 19/11/2026

**Entorno:** `via-traslados-maestro-web-qa.marcelof-gx.workers.dev` y `via-traslados-maestro-api-qa`, con D1 completamente independiente de producción.

## 1. Panel de pruebas tapando la pantalla
- Evidencia: capturas del usuario con bloque `ENTORNO DE PRUEBAS · SIN VIAJES REALES` superpuesto a las acciones de portada y del wizard.
- Causa: `qa_access_script` de `scripts/maestro-web-qa-prepare.py` generaba un `aside` fijo de hasta 350px siempre abierto.
- Ajuste QA: panel **plegado por defecto**, pestaña compacta `QA · Cuentas`, accesible con `aria-expanded` y `aria-controls`; permite expandir, elegir A/B/Salir y se pliega al terminar. Se eliminó el espacio inferior de 145px destinado a la antigua superposición.

## 2. «Cuenta reconocida» y celular simultáneamente
- Evidencia: paso 2 exhibiendo `Cuenta reconocida` junto a `TU NÚMERO DE CELULAR` y alerta `Completá la verificación de seguridad`.
- Causa UI: CSS original V25 `body.premium-page.in-booking .known-customer.via-account-card {display:grid!important}` prevalecía sobre `.hidden`. En la QA se utiliza solo una identidad ficticia verificada; el cambio de cuenta hecho desde el panel no estaba conectado con `remembered()` del wizard.
- Ajuste QA: `scripts/qa-passenger-identity-fixes.css` respeta `#known-customer.hidden` y las etapas de formulario. El `app.js` QA generado por `scripts/maestro-mine-logout-qa-patch.mjs` escucha `via-customer-session` e invalida contexto anterior.
- La configuración QA no tiene clave Turnstile productiva. Si no hay sesión, el wizard explica **elegir Pasajero A o B desde el panel QA** y no pedir un código de seguridad inexistente. **No se desactivó Turnstile en producción ni se consultan celulares personales desde QA.**

## 3. Distancia no disponible: «Sesión QA requerida»
- Causa: el Worker `backend/qa-entry-maestro.js` exigía identidad de operador para `POST /api/public/route-preview`, aunque el endpoint es público en el producto real.
- Ajuste QA: mensaje y HTTP 503 estructurado con `reason: qa_geoapify_not_configured`, sin afirmar falsamente que falta la sesión.
- **Límite real:** el Worker MAESTRO QA **no tiene clave propia de Geoapify**, por lo que no se pueden validar kilómetros y minutos. **No se copiaron claves productivas ni se usó D1 producción como atajo.** Se debe obtener/configurar una clave válida exclusiva de QA y verificar el motor real antes de publicar.

## Evidencias de pruebas

- Build y despliegue únicamente web QA, sin modificar la web/APK/D1 prod ni V34 QA, GitHub Actions https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44449936983 (**success**).
- Backend y D1 QA, https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44449705916 (**success**).
- Chromium real a 320/360/390/412px: selector inicialmente plegado y sin scroll horizontal; cambio A→B→Salir; regresión de paso 2 `Cuenta reconocida` **sin** formulario de celular; aviso QA tras salir en vez de CAPTCHA inexistente. https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44450223052 (**success**).

## Estado de implementación

**Corregido y publicado SOLO en QA.** PR #53 permanece **DRAFT** y `main` no está fusionada. Quedan pendientes la prueba física manual con Samsung, verificar OTP/Turnstile reales de forma controlada, habilitar Geoapify con credenciales QA independientes y preparar rollback antes de promover a producción.
