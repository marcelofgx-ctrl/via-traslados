# Vía Traslados

Proyecto independiente de Quick Trip, Mapa QT y Vuelos.

## Entornos
- **Vercel:** desarrollo y QA, no producción.
- **Cloudflare:** producción futura, sin despliegues automáticos.
- **Cloudflare Worker:** `via-traslados-api`.
- **Cloudflare D1:** `via-traslados-db`.
- **Resend:** envío de correos desde el backend Cloudflare, una vez verificado el dominio.

## Estado
Repositorio inicializado. **Aún no se ha desplegado el backend funcional ni la web en Cloudflare.**
La web existente en Vercel continúa siendo QA y no debe confundirse con un sistema de reservas real.

## Seguridad y aislamiento
- No reutilizar recursos de otros proyectos.
- No subir claves API, secretos, datos de pasajeros ni archivos .env.
- No ejecutar despliegues a producción sin pruebas y aprobación explícita.
- El código de la aplicación y las migraciones se incorporarán antes de habilitar despliegues.

## Próximos pasos
1. Incorporar código y pruebas revisadas desde el paquete de Vía Traslados.
2. Configurar GitHub Actions exclusivamente para este repositorio.
3. Conectar D1 y Resend con secretos almacenados en Cloudflare.
4. Verificar OTP y reservas entre dispositivos en QA.
5. Autorizar el despliegue a Cloudflare solo tras validación.
