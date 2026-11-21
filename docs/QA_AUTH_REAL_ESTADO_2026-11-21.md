# Vía Traslados — QA real e independiente · 21/11/2026

## Estado verificado
- Rama: `via-real-auth-qa-isolated-20261121`.
- Backend QA: `via-traslados-api-auth-qa-20261121`.
- Base D1 QA: `via-traslados-db-auth-qa-20261121`.
- Creación de D1, esquema idempotente y Worker verificados en GitHub Actions `44910036865`.
- 70 pruebas de código superadas. `/api/health` responde `qaIsolated:true` y `otpAvailable:false`.
- Los orígenes `https://viatraslados.com` están bloqueados para acceder al Worker QA.
- OTP Pepper QA generado, almacenado solo como secreto de Cloudflare.
- **No se ha desplegado el frontend de autenticación real. Producción y la web QA v29.1.12 siguen intactas.**

## Credenciales y acciones pendientes (sin poner secretos en Git)
1. Cloudflare Turnstile: crear un widget exclusivo para `via-traslados-current-prod-qa.marcelof-gx.workers.dev` (modalidad Managed).
2. Crear Secret de GitHub `VIA_QA_TURNSTILE_SECRET_KEY` con el secreto del widget.
3. Crear Variable de GitHub `VIA_QA_TURNSTILE_SITE_KEY` con su clave pública.
4. Resend: crear una clave de envío restringida a Vía Traslados y guardarla como Secret de GitHub `VIA_QA_RESEND_API_KEY`.
5. Secret GitHub `VIA_QA_TEST_EMAILS`: correos permitidos para las pruebas, separados por comas (solamente cuentas del equipo).
6. Secret GitHub `VIA_QA_GEOAPIFY_API_KEY`: clave de Geoapify de QA. Necesaria para persistir distancias viales según el contrato productivo.

El API token de Cloudflare actualmente no tiene permisos `Account:Turnstile:Edit`; se intentó crear el widget automáticamente sin éxito en la ejecución `44910193266`. No se modificaron widgets productivos.

## Links operativos
- Cloudflare: https://dash.cloudflare.com/
- Resend API Keys: https://resend.com/api-keys
- Secretos GitHub: https://github.com/marcelofgx-ctrl/via-traslados/settings/secrets/actions
- Variables GitHub: https://github.com/marcelofgx-ctrl/via-traslados/settings/variables/actions
- Ejecución backend QA aprobada: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44910036865
- Workflow backend QA para re-ejecutar: https://github.com/marcelofgx-ctrl/via-traslados/actions/workflows/via-real-auth-qa-isolated.yml
- Workflow frontend QA con rollback: https://github.com/marcelofgx-ctrl/via-traslados/actions/workflows/via-real-auth-qa-frontend.yml

## Paso siguiente y criterios de salida
1. Reejecutar backend QA después de guardar las credenciales; exigir `otpAvailable:true` e `identityTestEnabled:true`.
2. Probar Turnstile auténtico con hostname QA. Enviar OTP solamente al correo permitido, validar código recibido y crear sesión.
3. Verificar PIN, WebAuthn/passkey y aislamiento entre identidades en QA.
4. Verificar Geoapify contra D1 QA con kilómetros y minutos reales.
5. Con los secretos configurados y verificaciones en verde, activar el frontend desde la rama QA mediante un commit de señal `.ci/VIA_REAL_AUTH_QA_ACTIVATE` con mensaje `[QA_REAL_AUTH_ACTIVATE]`. El job permanece **omitido** en cualquier push normal; para evitar activaciones accidentales conserva las comprobaciones de OTP real, ruta Geoapify, rollback exclusivo QA y aislamiento de D1. GitHub `workflow_dispatch` se usa solamente cuando esté disponible en la rama por la interfaz.
6. Recorrer el ciclo de reserva real desde pasajero hasta conductor/admin sobre datos QA, contrastar seguridad y UX.
7. Solo después planificar una promoción protegida a producción, con backup, rollback y sin cambiar el motor geográfico.

**Evidencia del gatillo protegido:** GitHub Actions 44910695351 figura `skipped` en el commit que añadió la regla, confirmando que no se activó el corte de QA.

## Barreras de seguridad
- Prohibido desplegar sobre Workers `via-traslados-api` o web productiva.
- Prohibido aplicar migraciones a `via-traslados-db`.
- No usar códigos de OTP fijos ni copiar sesiones productivas.
- Los secretos nunca deben aparecer en scripts, comentarios, chats o artefactos.
