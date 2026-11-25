# Incidencia: «Failed to fetch» al registrarse desde preview V29.1

Fecha: 19/11/2026. **Corregida exclusivamente en QA/preview; no se intentó enviar email personal ni se creó ninguna cuenta en D1 producción.**

## Reproducción
En el formulario «Crear tu cuenta» del dominio público `via-traslados-v291-rc1-stage.marcelof-gx.workers.dev`, al introducir datos personales y pulsar «Enviar código al correo», el navegador devolvía **«Failed to fetch»**.

## Causa raíz
- `config.js` del preview apunta deliberadamente a la API aislada `via-traslados-maestro-api-qa`. Esa API solo permitía CORS desde `via-traslados-maestro-web-qa`, y el preflight/responded origin del preview era rechazado.
- Además, la API QA es exclusivamente sintética: `POST /api/auth/start` solo admite correos `@qa.invalid` y devuelve un OTP ficticio `123456`. **No tiene función de envío de correos a personas reales.** Aunque CORS hubiera funcionado, un correo personal recibiría HTTP 403 y ningún mensaje.

## Resolución
- API MAESTRO QA: lista explícita de **dos** orígenes autorizados (MAESTRO QA anterior y preview V29.1). Preflight OPTIONS y respuestas POST reflejan únicamente el Origin exacto aprobado; un tercero sigue recibiendo HTTP 403. Los endpoints delegados del Worker original reciben Origin interno permitido y su respuesta vuelve al origen aprobado. No se incorpora wildcard `*` ni se modifica Worker prod.
- Stage **únicamente**: reescritura post-build de HTML y JS del preview para señalar «SIN CORREOS NI VIAJES REALES», sustituir «Enviar código al correo» por «Generar código de prueba», e impedir directamente desde el formulario que se envíen emails que no terminen en `@qa.invalid`, mostrando un mensaje claro en lugar de `Failed to fetch`. Se mantiene inalterado el paquete RC compilado destinado a producción.
- Stage solo para pruebas: feedback «Código ficticio de pruebas: 123456. No se envió ningún correo».
- Prueba de navegador real con un correo **ficticio** de otro dominio: se bloquea **antes de red**; con `@qa.invalid` se genera el OTP de prueba y se crea la cuenta **exclusivamente en D1 QA**. No se solicita traslado.

## Evidencia de ejecución
- Despliegue y pruebas API QA (CORS preflight, POST sintético, rechazo de correo real/origen no autorizado): [GitHub Actions #44547310606](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44547310606) — **success**.
- Preview público, HTTP 200, Chrome 320/360/390/412px, registro completo sintético y producción intacta: [GitHub Actions #44547714844](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44547714844) — **success**.
- URL pública validada: https://via-traslados-v291-rc1-stage.marcelof-gx.workers.dev/mis-reservas.html?accion=registro

## Pendiente antes de publicar V29.1 en producción
**No hay evidencia de entrega real de correo OTP ni Turnstile** en la API V35 productiva por estos ensayos. Preparar pruebas autorizadas con credenciales reales del servicio de correo y Turnstile correctamente restringidas a un entorno seguro, sin usar la D1 productiva para cuentas ficticias y sin exponer secretos en GitHub. Una vez validada entrega, verificar inicio, registro, restauración y límite antispam. **La corrección CORS QA no es un parche para llevar al API productivo**.

Rollback productivo web V29: `ec35bd52-b832-4cff-bcb2-6a6b84c34c79`. Ningún despliegue productivo se efectuó para esta incidencia.
