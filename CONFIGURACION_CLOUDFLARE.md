# Configuración segura — Vía Traslados

El repositorio es exclusivamente para Vía Traslados. No reutilizar bases D1, Workers, tokens ni dominios de Quick Trip u otros proyectos.

## Recursos existentes, pendientes de conectar
- Worker: `via-traslados-api`
- D1: `via-traslados-db`
- Cuenta Resend: creada; correo real aún no operativo.

## GitHub Actions
Workflow QA: `.github/workflows/qa-tests.yml`, se activa por push/PR y requiere el código completo del backend.
Workflow producción: `.github/workflows/cloudflare-production.yml`, **solo manual** con `PUBLICAR-VIA` y protección de ambiente `production`.

### Variables de GitHub Actions, ambiente production
- `VIA_D1_DATABASE_ID`: UUID de la base D1 exclusiva.
- `VIA_PUBLIC_ORIGIN`: origen HTTPS de la web pública productiva de Vía Traslados.
- `VIA_RESEND_FROM`: nombre y remitente de un dominio *verificado* en Resend.

### Secretos de GitHub Actions, ambiente production
- `CLOUDFLARE_API_TOKEN`: token Cloudflare de alcance mínimo necesario.
- `CLOUDFLARE_ACCOUNT_ID`: identificador de cuenta; no es una clave por sí mismo.

### Secretos propios del Worker en Cloudflare
- `RESEND_API_KEY`: API key del proyecto Resend.
- `OTP_PEPPER`: secreto aleatorio fuerte para proteger hashes OTP.
- `TURNSTILE_SECRET_KEY`: clave de verificación de captcha del sitio.
- `OPERATOR_KEY_HASH`: hash del acceso privado del operador.

**Nunca** colocar estos valores en el repositorio, screenshots o mensajes de chat.

## Estado y restricciones
La presencia de workflows no implica una implementación desplegada. Por el momento no ejecutar el workflow de producción: backend y tests deben estar incorporados, conectados y revisados primero. El frontend aprobado de Vía Traslados en Vercel es QA; la publicación definitiva quedará en Cloudflare tras validación.
