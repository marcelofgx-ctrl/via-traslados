# Vía Traslados — mapa real de despliegues (11/11/2026)

Este documento evita confundir los entornos y reemplazar por error la web principal con una interfaz QA distinta.

## Producción activa

| Recurso | Función | Observaciones |
| --- | --- | --- |
| `https://viatraslados.com` | Web pública de pasajeros | Dominio personalizado conectado únicamente a `via-traslados-web-prod` |
| `via-traslados-web-prod` | Worker que entrega la web pública y `/api/direcciones` | Tiene solo binding `ASSETS`; NO está conectado a D1; conserva el cierre temporal del sitio y el diseño aprobado |
| `via-traslados-api` | API de reservas, autenticación, conductor y administración | Binding D1 `DB`; utiliza `PUBLIC_ORIGIN=https://viatraslados.com` |
| `via-traslados-db` | D1 exclusiva | No compartir con Quick Trip, Fila Digital ni otros proyectos |

## QA y otras implementaciones

- `via-traslados-pasajeros.pages.dev`: proyecto de Cloudflare Pages `via-traslados-pasajeros`, desplegado desde la rama GitHub `pages-release`. Tiene nuevas funciones de pasajeros que NO deben pasarse sin prueba sobre la web principal.
- `traslados-web`: Worker adicional que figura en la cuenta, pero la consulta de Cloudflare Worker Domains no lo asocia con `viatraslados.com`. Tiene otras variables; NO borrarlo ni reutilizar sus secretos sin auditoría específica.
- `via-traslados-web-prod` es Worker, no proyecto Pages. No asumir que `via-traslados-web-prod` y `via-traslados-pasajeros` son el mismo servicio.

## Incidencia corregida el 11/11/2026

La web principal ejecutaba un motor geocodificador anterior. En el ejemplo `Roque Sáenz Peña 1711`, devolvía Lagomar cuando el domicilio indicado correspondía a Shangrilá.

- El código de geocodificación más reciente estaba en `pages/_worker.js` de la rama `pages-release`.
- Se preparó una nueva versión del **mismo** Worker `via-traslados-web-prod`, preservando el binding ASSETS, el control de cierre temporal y la interfaz existente.
- Se verificó la versión preliminar y luego se desplegó sin modificar Worker API, D1, DNS, correo ni recursos de otros proyectos.
- Despliegue de Cloudflare: `02b98d15-97e7-44d3-8213-0d4fad3f29e0`.
- Versión anterior identificada para rollback: `1cbe867f-b409-47a1-82e4-e7a5a35b2c54`.
- Versión activada: `37bf21a4-37f2-42be-a473-4f0091319984`.
- Validación final: misma web, mismos JS/CSS, corrección del geocodificador activa en `viatraslados.com`, backend OTP activo.

**Importante:** la corrección solo afecta nuevas búsquedas y la respuesta del motor. Reservas ya guardadas con otra localidad no se reescribieron: alterar datos históricos necesita verificación.

## Evitar otra regresión

- Cambiar `pages-release` NO actualiza automáticamente `via-traslados-web-prod`. Ambos despliegues tienen ciclos distintos.
- `VIA_PAGES_DEPLOY_TOKEN` publica Pages, NO el Worker de producción.
- Para cambios futuros de geocodificación, partir de una sola fuente (`pages/_worker.js`), crear una versión de prueba del Worker y comprobar HTML/assets preservados, autenticación y búsquedas; activar la versión solo después.
- No sustituir toda la web principal por el artefacto Pages sin migración QA de funciones de clientes y diseño.
- El workflow `.github/workflows/via-deployment-audit.yml` verifica diariamente la búsqueda, el aeropuerto, el backend y la exclusión de caché API, sin crear reservas ni modificar datos.
- Se revisó el service worker público: las solicitudes a `/api/` no quedan cacheadas.
- No eliminar ni fusionar `traslados-web`, el Worker principal o la D1 solo por similitud de nombres.

## Seguridad

No guardar tokens, secretos de OTP, credenciales Resend, claves de operador ni datos personales en el repositorio. Los cambios operativos de Worker se ejecutan desde secretos de GitHub y deben permitir rollback.

## Auditoría de aislamiento D1

El 11/11/2026 se consultó por API únicamente el esquema de `via-traslados-db` (nombres de tablas, sin leer datos de usuarios). Se encontraron `bookings`, `customers`, `booking_events`, `booking_routes`, tablas de sesiones, conductores, OTP y administración. No se detectaron tablas con nombres de Quick Trip, Fila Digital ni otros proyectos. La prueba terminó correctamente. El Worker público principal no tiene binding D1; el backend `via-traslados-api` sí tiene binding `DB`.

Los workflows efímeros utilizados para preparar el hotfix, desplegarlo y auditar D1 se retiraron una vez validados. Los resultados permanecen en el historial de GitHub Actions; el control diario de regresión sigue disponible.

## Renovación premium de la interfaz — 11 de noviembre de 2026

El flujo visual completo fue aprobado por QA automatizado, incluyendo portada, los tres pasos de solicitud y la vista «Tu traslado». El sitio principal `https://viatraslados.com` se actualizó mediante Cloudflare Wrangler conservando el código **activo** del Worker geocodificador y todos los archivos funcionales de origen. Se mantuvieron los endpoints existentes, sin cambios en `via-traslados-api`, D1 ni DNS.

- **Worker de producción antes:** `37bf21a4-37f2-42be-a473-4f0091319984` (versión anterior para rollback).
- **Worker de producción después:** `17abbef4-8fbb-46cc-a8da-e1a6d72f090d`.
- **Ejecución registrada:** https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43082107178
- **Worker de QA aislado:** `via-traslados-web-premium-qa.marcelof-gx.workers.dev`.
- **Pages QA visual:** `visual-premium-qa.via-traslados-pasajeros.pages.dev`.
- **Fuentes visuales en main:** `design/via/flow-premium.css`, `design/via/flow-premium.js` y `design/via/via-refinement.css`.

La verificación posterior comprobó que la portada incorpora los estilos, que `reserva.html` carga el pulido de seguimiento, que `app.js`, `store.js`, `reference.js`, `address-autocomplete.js`, `styles.css`, `premium.css` y `reference.css` conservaron **sus bytes** previos, que las nuevas solicitudes de direcciones siguen devolviendo Shangrilá y que el backend responde.

La portada se verificó en navegadores simulados de 320×640, 360×740 y 390×844, con ampliación QA adicional a 1280px; se comprobó ausencia de desplazamiento horizontal. «Tu traslado» conserva las direcciones completas y compacta la tarjeta para usar la menor altura posible. En alturas muy reducidas puede haber desplazamiento vertical en vez de ocultar información.

**Precaución al actualizar:** el Worker de producción y Pages son despliegues independientes. No asumir que subir cambios a Pages modifica automáticamente la portada principal. Publicar nuevos activos visuales solamente a través de un paquete completo construido desde el Worker activo y conservar la última versión para revertir. Nunca modificar el backend, la D1 ni dominios de otros proyectos por un cambio exclusivamente visual.

## Acceso pasajeros V3 y motor de rutas (11/11/2026)

Backend API desplegado por el flujo [GitHub Actions / habilitar control administrativo API](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43094086737), probado sin nuevas reservas. Sólo se actualizaron el Worker `via-traslados-api` y la D1 exclusiva `via-traslados-db`.

- `POST /api/customer/phone/identify`: reconoce si un celular pertenece a una cuenta previa, tras Turnstile y límites por teléfono/IP. No crea sesión y devuelve comprobante HMAC efímero (5 min) para la siguiente acción.
- `POST /api/customer/pin/set`: crea o recupera PIN de seis cifras sólo para sesiones verificadas. Almacena sal y HMAC en `customer_pins`, nunca PIN ni huella en claro.
- `POST /api/customer/pin/login`: firma telefónica válida + PIN, límites, bloqueo; no autentica sólo por conocer el celular.
- Recuperación del PIN: correo con OTP existente y sesión autenticada, seguida de nueva definición; huella/PIN de Android mediante passkey WebAuthn existente, no almacenamiento de biometría en el servidor.
- `POST /api/public/route-preview`: distancia y minutos reales por carretera (Geoapify+IDE), con cupo y caché HMAC de 6 h en `route_preview_cache`, sin guardar direcciones en el caché, sin estimaciones inventadas.
- `GET /api/requests/:id` incluye ruta almacenada cuando esté disponible, sólo para su titular/su token de reserva. No divulga datos del resto.

Las pruebas en memoria, QA de rutas y controles de seguridad fueron aprobadas. La vista pública V3 se desarrolló en la rama `via-passenger-v3-pages` del repositorio, partiendo de `pages-release`, y se probó en el alias `visual-premium-qa.via-traslados-pasajeros.pages.dev`. Su publicación en el Worker público `via-traslados-web-prod` es un despliegue **independiente** y no debe confundirse con activar Pages ni con actualizar el backend.

## Estado visual de las reservas — confirmación premium (11/11/2026)

El seguimiento en `https://viatraslados.com/reserva.html` tiene presentación específica para los **nueve estados reales** de reserva. `confirmed` se muestra verde esmeralda, con confirmación explícita y símbolo de aprobación; `requested`, `quoted` y `accepted` nunca se presentan como confirmados. Rutas, datos y estados continúan viniendo de la API. Botón para comprobar novedades y refresco cada 12 segundos mientras la página está abierta.

- Fuentes del diseño archivadas en `design/via/booking-v23/` en `main`, incluyendo el `app.js` efectivamente publicado.
- QA 9 estados × 4 anchos, sin reservas ni correos: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43139167612
- Publicación y verificaciones de producción en verde: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43139522976
- Worker anterior para rollback: `d34fc7ae-33de-424c-96e5-400c0a6ce953`
- Worker nuevo: `d10ed0df-5f7a-48a3-bc64-bc8410066fb0`
- No se alteró D1, el backend, el dominio de correo ni otros proyectos; solo frontend del Worker público.
- Web Push, correo de confirmación automática y garantías de entrega **no se implementaron** mediante este cambio visual.

**En futuras actualizaciones del sitio público, preservar explícitamente este CSS y `app.js?v=23`; no sobrescribir con `pages-release` anterior.**

## Seguimiento compacto V24 — 12/11/2026

Se corrigió la regresión de los botones gigantes mediante `grid`, botones de 43/36 px y una tarjeta móvil más compacta. La propuesta `accepted` pulsa sutilmente pero NO implica confirmación definitiva; distancia, duración e importe aparecen juntos. Los nueve estados y cuatro resoluciones de QA fueron validados sin scroll con direcciones típicas, sin ocultar información en casos excepcionalmente largos.

- Publicación y verificación: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43195140369
- QA automatizada: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43194885480
- Worker antes: `d10ed0df-5f7a-48a3-bc64-bc8410066fb0`
- Worker después: `20606cd4-c5da-4d3d-a020-9ab4ae3ce947`
- Copia de archivos realmente publicados: `design/via/booking-v24/`

**IMPORTANTE:** v24 sustituye a v23 en producción. No desplegar de nuevo `app.js?v=23` ni `via-status-premium.css?v=1` sobre este Worker. No se cambió la D1, backend, CORS ni los DNS. Las notificaciones push/correo por cambio de estado siguen pendientes de implementación funcional.
