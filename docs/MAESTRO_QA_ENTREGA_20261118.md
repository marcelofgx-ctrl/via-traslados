# Vía Traslados — Entrega integrada MAESTRO QA · 18/11/2026

**Ámbito exclusivo:** no se modifican `via-traslados-web-prod`, `via-traslados-api`, `via-traslados-db`, V34 QA preexistente ni clave de firma productiva V35.

## URLs comprobadas
- Web QA: https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev/
- API QA: https://via-traslados-maestro-api-qa.marcelof-gx.workers.dev/api/health
- APK Android **debug QA**, paquete independiente `uy.viatraslados.conductor.maestroqa`, `versionCode=36`: https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev/descargas/via-traslados-conductor-maestro-qa-v36.apk
- Base D1 solo sintética: `via-traslados-maestro-qa-db` y Worker `via-traslados-maestro-api-qa`. No guardar datos reales.

## Qué se comprobó
- Backend + SQLite: 75/75 pruebas, migración aditiva idempotente.
- API y D1 QA reales: solicitud, HTTP 201, replay con igual clave y misma referencia, 409 con payload distinto, privacidad, cotización/autorización, asignación, aceptación, cinco estados posteriores, comisión de contratado 25 %, limpieza de solicitud sintética. Referencia: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44393048198
- Dos pasajeros ficticios A y B: la cuenta B no puede consultar ni aceptar reserva A; token A revocado no permite acceder; referencia: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44393561632
- APK Android V36 QA compilada y verificada con versión, paquete y firma debug, Android V34 y variante V35 RC también compilan: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44393242088
- Web QA: copia byte a byte de 37+ assets públicos V29/V19, Worker geográfico activo recuperado en forma read-only, `store.js` parcheado únicamente en staging con idempotencia y bloqueo de doble clic, `config.js` apuntando a QA, barra de pasajeros A/B y APK QA; smoke de motor y archivos. Verificación en https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44394255447
- APK pública QA descargada y cotejada byte a byte con artefacto firmado debug de CI; producción y V34 siguen respondendo: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44394669334
- QA real en Chromium móvil: **320, 360, 390 y 412 px**, cada ancho con login sintético A, cambio a B, logout, sin scroll horizontal ni errores JS. Run reejecutada correctamente: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44394923313
- Corrección de CORS en respuestas de sesión sintética A/B, verificada en API E2E después del cambio: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44395078135

## Para pruebas manuales en Samsung
1. Abrir web QA; seleccionar **Pasajero A** en panel inferior; probar una solicitud con datos ficticios. No utilizar matrícula, teléfono o correo reales.
2. Seleccionar **Pasajero B** en el mismo navegador: verificar que no ve la reserva de A. Volver a A si se desea recuperarla.
3. Descargar e instalar APK V36 QA desde enlace arriba, confirmar que aparece **MAESTRO QA** y que **no** reemplaza la V35. Seleccionar roles de ensayo disponibles y comprobar cotización/agenda.
4. Probar rechazo de doble toque y cambio de cuenta tras operación pendiente.
5. Enviar captura del comportamiento anómalo con nombre de pantalla y operación; nunca enviar códigos OTP ni credenciales.

## Importante
- La barra de pasajeros A/B genera sesiones exclusivamente ficticias. No representa validación del correo real, PIN o passkeys; esos siguen pendientes de ensayos controlados.
- El Worker QA no dispone necesariamente del secreto Geoapify de producción, por lo que **no se declara completa la prueba del cálculo de kilómetros en todos los recorridos**; el motor web copiado conserva el código geográfico, pero no sustituye la validación de proveedor en QA.
- APK V36 QA es una build debug separada, **no** una APK release firmada ni actualización de V35 productiva.
- **No fusionar** ramas QA con main sin garantizar antes compatibilidad, pruebas en Android físico, migración en QA y rollback/contadores productivos.
- Las reservas actuales de producción no se deben usar para hacer limpieza ni para pruebas destructivas.

## Integración y rollback
- Rama: `via-maestro-integracion-real-qa-20261118` basada en candidato #51, incorpora guardia Android de #50 y parche de navegador de #52.
- QA Workers y D1 tienen nombres exclusivos; desactivar su publicación no requiere restaurar ninguna base.
- Para rollback de producción no hace falta intervenir: **no hubo publicación productiva**.

## Estado de la entrega (cierre de QA automática)
**QA automatizada integrada: aprobada.** La API + D1, las reservas A/B, el navegador Chromium en cuatro anchos, el Worker geográfico y la descarga QA binaria superaron sus pruebas. **Pendientes de cierre:** ensayo APK en Samsung real; recuperación OTP/PIN/passkey con personas controladas, distancias con proveedor Geoapify QA; pruebas desconectado/caché PWA en dispositivo y estrategia de rollout para producción. Por eso este paquete sigue **NO APTO PARA PUBLICACIÓN PRODUCTIVA**.
