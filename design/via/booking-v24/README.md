# Vía Traslados — Seguimiento compacto premium V24

**Dominio oficial:** https://viatraslados.com
**Estado:** Publicado y verificado el 12 de noviembre de 2026.
**Worker de producción:** `via-traslados-web-prod`
**Versión anterior (rollback):** `d10ed0df-5f7a-48a3-bc64-bc8410066fb0`
**Versión V24 activa:** `20606cd4-c5da-4d3d-a020-9ab4ae3ce947`

## Qué resuelve
Los botones enormes en el seguimiento eran una regresión CSS causada por la combinación de `flex-direction:column` para móvil con `flex:1` heredado. V24 usa `display:grid` y neutraliza explícitamente `flex`, altura y `min-height`: CTA principal **43px** y botones secundarios **36px**.

En `accepted`, la tarjeta **no** se presenta como reserva confirmada. Dice «Propuesta aceptada» y muestra un microindicador que pulsa suavemente cada 3,5 segundos, con fondo verde agua texturado, legibilidad alta y `prefers-reduced-motion` respetado. La confirmación final sigue reservada exclusivamente a `confirmed`.

La distancia real estimada por carretera, duración e importe de la propuesta se agrupan en una banda de 3 métricas. Si falta información del servidor, no se inventan kilómetros ni precio. Se preservan el código, las direcciones completas, la fecha y hora, la disponibilidad de «Aceptar propuesta», «Cancelar» (si corresponde) y «Actualizar estado».

## QA

- QA: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43194885480
- Publicación: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43195140369
- Verificados 9 estados y 4 viewports: 320×640, 360×740, 390×844, 1280×820. En las pruebas de datos típicos, el documento tenía exactamente la altura del viewport (sin scroll vertical), y ningún botón superaba 43px. Se verificó el pulso CSS en `accepted`, sus textos, los importes y el cambio a `confirmed`.
- Para direcciones excepcionalmente largas o contenido adicional, se permite desplazar antes que recortar información importante.
- Las pruebas usan GET simulados sin crear reservas ni mandar correos. Las comprobaciones de producción validaron archivos versionados, geocodificador, controles CORS, código del Worker y despliegue 100% a la nueva versión.
- No se modificaron D1, backend de la API, DNS, OTP, WebAuthn ni proyectos externos.

## Preservación

Esta carpeta archiva una copia de los 6 archivos de frontend publicados de V24. El Worker de producción se actualizó tomando como base su código **activo** y manteniendo los demás assets compatibles. `pages-release` y otros branches/QA pueden ser diferentes; no publicar un frontend viejo que pise `app.js?v=24`, `via-status-premium.css?v=24` o el service worker `via-traslados-status-compact-v24`. El código fuente de un Worker desplegado manualmente no debe asumirse equivalente al de Pages.

El Web Push y el correo de notificación proactiva al confirmar **no forman parte** de este ajuste visual.
