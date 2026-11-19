# Vía Traslados — Preview público verificado de V29.1.0-RC1

Fecha: 19/11/2026. **No es producción, ni una implementación sobre D1 real.**

## Enlaces para usuarios sin GitHub
- Portada pública V29.1.0-RC1: https://via-traslados-v291-rc1-stage.marcelof-gx.workers.dev/
- Mis reservas: https://via-traslados-v291-rc1-stage.marcelof-gx.workers.dev/mis-reservas.html
- No proporcionar GitHub como enlace principal: repositorio privado devuelve 404 a navegadores sin sesión.

## Evidencia y alcance
- Cloudflare Worker distinto: `via-traslados-v291-rc1-stage`. No se desplegó ni actualizó `via-traslados-web-prod`, `via-traslados-api`, D1 o APK V35.
- Compilación original sobre assets/hash de V29 publicado con ancla de Worker `ec35bd52-b832-4cff-bcb2-6a6b84c34c79`.
- **Solo en preview** se reemplaza `config.js` para apuntar a `via-traslados-maestro-api-qa`. Por ello no se pueden crear viajes reales; no equivalen a pruebas E2E de OTP o Geoapify productivos.
- Se muestra banner superior `V29.1 PREVISUALIZACIÓN — SIN VIAJES REALES`, con `X-Robots-Tag: noindex, nofollow`.
- HTTP 200 verificado en portada, `mis-reservas.html`, `app.js?v=29.1`, `store.js?v=19.1`, CSS y controlador de saludo.
- Chrome real en móviles simulados **320, 360, 390 y 412 px**: portada visible, CTA nuevo usuario, acceso existente exclusivo, ausencia de panel QA interno y scroll horizontal. Falló la primera prueba de 390 por carrera durante DOMContentLoaded, se corrigió para esperar la estabilización final. Ejecución [44544615621](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44544615621) **success**.
- Producción verificada después: raíz contiene todavía `app.js?v=29`, `store.js?v=19`, sin marca V29.1.

## Promoción a producción
Aún faltan pruebas de OTP/Turnstile reales, Geoapify de QA separado, compatibilidad PWA y revisión física en Android. La versión de rollback web que hay que re-verificar justo antes del lanzamiento es **`ec35bd52-b832-4cff-bcb2-6a6b84c34c79`**. No actualizar API V35, APK V35 ni D1 durante la primera fase.
