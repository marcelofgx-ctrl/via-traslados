# Vía Traslados V25 · Diseño premium de pasajeros y notificaciones de aceptación

**Producción publicada:** https://viatraslados.com  
**Worker de producción:** `via-traslados-web-prod`  
**Versión antes del cambio:** `20606cd4-c5da-4d3d-a020-9ab4ae3ce947`  
**Versión nueva verificada:** `4b218c3b-7f38-4d74-be6c-d792c813484f`  
**Despliegue completo:** https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43203247919  
**QA completa:** https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43201791308

## Objetivos cumplidos

1. **Identidad recordada**: tarjeta refinada y botón compacto (44 px, ancho hasta 272 px) para continuar la reserva sin volver a pedir credenciales durante sesión válida. Mantener los accesos por PIN, correo y passkey cuando sea necesario autenticar.
2. **Mis reservas**: `/mis-reservas.html`, pestañas Activas e Historial, 5 registros por página y opción «Ver más». Primero las aceptadas y confirmadas; finalizadas y canceladas al historial. Dirección resumida en lista, original completa en detalle, chips visuales, fecha, importe y kilómetros cuando están presentes. La API `GET /api/customer/bookings` añade `route.distanceKm/durationMinutes` para cuentas verificadas mediante la tabla `booking_routes`, sin inventar distancia.
3. **Conductor web**: `/conductor.html`, hoja blanca desde abajo cuando una propuesta pasa a `accepted`, importe, ruta y botones «Ver reserva» / «Ir a confirmar». El aviso no confirma por sí mismo. Badge persistente de aceptación hasta confirmación; refresco cada 12 s mientras el panel está visible. Confirmación pasa de «Aceptadas» a «Próximas».
4. **Detalle**: se preservan los nueve estados oficiales, los botones compactos V24, la textura y el pulso discreto de `accepted`, y el estado final `confirmed` como único indicador de confirmación definitiva.
5. **Android conductor QA 0.2.0**: aviso nativo inferior, contador de aceptadas y sondeo cada 20 s en primer plano; APK de pruebas: https://github.com/marcelofgx-ctrl/via-traslados/releases/tag/via-conductor-qa-v0.2.0. Código fuente integrado a `android-driver/` de `main`.

## Límites y seguridad

- Las notificaciones locales de navegador requieren permiso y actividad del navegador. **Push remoto con navegador o APK cerrados todavía NO está implementado**; no prometerlo ni tratarlo como entrega garantizada.
- El usuario debe confirmar el viaje expresamente en la interfaz del conductor. `accepted` no equivale a `confirmed`.
- La revisión QA usó respuestas API simuladas, sin crear reservas reales, enviar correos ni alterar datos.
- El despliegue reconstituye el Worker actual y valida versión/rollback; solo modifica assets frontend de **Vía Traslados**. No toca DNS, Resend, D1, Quick Trip ni otros proyectos.

## Evitar regresiones

Este directorio conserva copia exacta de los siete archivos V25 publicados: `app.js`, `index.html`, `mis-reservas.html`, `conductor.html`, `reserva.html`, `sw.js`, `via-ux-v25.css`. No son un sitio desplegable por sí solos: existen otros assets y Worker real de producción. **No reemplazar** el V25 con un deploy antiguo de `pages-release` o de otro proyecto. Vigilar `app.js?v=25`, `via-ux-v25.css?v=25`, `via-status-premium.css?v=24` y el service worker `via-traslados-passenger-driver-ux-v25`.

El primer y segundo intento de publicación V25 fueron revertidos correctamente por chequeos de propagación CDN y comparación de HTML. El despliegue final **#43203247919** validó todas las pantallas, scripts versionados, CSS, geocodificador y versión activa del Worker; finalizó `success`.
