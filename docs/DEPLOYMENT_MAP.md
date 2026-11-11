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
