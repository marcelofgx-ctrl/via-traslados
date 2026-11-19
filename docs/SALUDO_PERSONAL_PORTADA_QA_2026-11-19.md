# Vía Traslados — «Hola, Nombre» contextual en portada (QA)

**Fecha:** 19 de noviembre de 2026. Entorno: `via-traslados-maestro-web-qa`, API/D1 MAESTRO QA aisladas.

## Objetivo y apariencia

El usuario pidió reconocer a quien está conectado en la pantalla principal mediante un saludo discreto arriba, sin ocupar espacio importante del formulario.

Se incorporó `#via-home-user-greeting`, inicialmente oculto, inmediatamente antes del título de la portada «Reservá tu traslado». Una píldora suave verde petróleo, punto de sesión validada y texto **«Hola, [primer nombre]»**. El nombre se imprime con `textContent`, nunca como HTML.

La invitación anterior «¿Primera vez en Vía? / Creá tu cuenta» queda visible solo cuando NO hay sesión válida; ambos estados son excluyentes.

## Comportamiento de seguridad

- No se intenta reconocer usuarios por el celular, IP ni geolocalización.
- El nombre aparece únicamente cuando `ViaStore.resume()` confirma la sesión en la API MAESTRO QA y el token todavía coincide con la cuenta local.
- Al entrar en otra cuenta, salir, cambiar de pestaña o regresar a la portada se vuelve a comprobar el estado. Se invalidan resultados anteriores mediante una secuencia/epoch; el nombre desaparece al cerrar sesión.
- `resume()` ejecuta `setCustomer` y emite `via-customer-session`. Se identificó y corrigió la retroalimentación que disparaba verificaciones en bucle: el controlador ignora exclusivamente el evento de la misma sesión mientras se verifica.
- Se descubrió otra carrera importante en el `request()` V19 publicado: una respuesta tardía HTTP 401 de la cuenta A eliminaba `ACCOUNT` aun cuando B acababa de entrar. El parche QA ahora elimina la sesión solo cuando el token enviado en aquella solicitud es el token actualmente activo; se conserva la guarda previa en `resume()`. No se modificó el `store.js` productivo.
- No se alteraron rutas de reservas, motor IDE/Geoapify, API productiva, D1 productiva, APK ni diseño de reservas confirmadas.

## Archivos de la rama QA

- `scripts/maestro-web-qa-prepare.py`: inserta el saludo sobre la portada V29 real y versiona assets JS/CSS, aborta si cambia el encabezado efectivo.
- `scripts/qa-home-account-invite.js`: controla en conjunto invitación y saludo; obtiene y muestra exclusivamente nombre validado, corrige bucle de eventos.
- `scripts/qa-home-account-invite.css`: estilo compacto adaptado a móviles de 320px o más.
- `scripts/via-v29-store-idempotency-qa.mjs`: protección adicional frente a 401 tardío de una identidad anterior.
- `scripts/maestro-browser-mobile-qa.mjs`: pruebas en Chromium de inicio sin sesión, saludo A, saludo B, salir, alta autónoma QA y ausencia de scroll horizontal.

## Evidencia

- Compilación y despliegue web QA: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44512501147 — **success**, verificó producción y V34 QA intactas.
- Pruebas de navegador con saludo A/B y logout, en 320/360/390/412px, inscripción ficticia sin reservar viaje y paso 2 de identidad: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44511849157 — **success (intento 3)**.
- Web QA pública: https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev/

## Estado y límites

**Publicado exclusivamente en QA, no en producción.** El saludo «Hola, Marcelo» es un ejemplo visual; la cuenta de prueba A muestra «Hola, Ana» y la B «Hola, Bruno». En producción se tomaría el nombre real del usuario autenticado, pero aún no se realizó ese despliegue.

PR #53 permanece borrador. Falta la revisión visual del usuario en su móvil y el plan de despliegue/rollback antes de cambiar `viatraslados.com`.
