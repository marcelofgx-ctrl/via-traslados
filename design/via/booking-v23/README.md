# Vía Traslados — Booking states premium v23

**Producción:** https://viatraslados.com
**Publicación confirmada:** 11 de noviembre de 2026 (Uruguay)
**Worker:** `via-traslados-web-prod`
**Versión anterior para rollback:** `d34fc7ae-33de-424c-96e5-400c0a6ce953`
**Versión nueva:** `d10ed0df-5f7a-48a3-bc64-bc8410066fb0`
**Deploy:** https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43139522976
**QA:** https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43139167612

Esta carpeta contiene una copia exacta del frontend publicado en esta entrega:
`app.js`, `via-status-premium.css`, `reserva.html`, `index.html`, `mis-reservas.html` y `sw.js`.
El resto de los archivos del sitio y el Worker se preservaron desde la versión activa. No copiar únicamente esta carpeta como si fuera un proyecto publicable independiente.

## UX y reglas

- Los nueve estados se muestran con mensajes y gamas distintas: `requested` solicitud sin confirmar, `quoted` propuesta que necesita respuesta, `accepted` aceptación en espera, `confirmed` **reserva confirmada** con tarjeta verde, `en_route`, `arrived`, `in_progress`, `completed`, `cancelled`.
- El estado viene **exclusivamente** de la API; jamás mostrar confirmado solo porque el pasajero acepta la propuesta.
- Direcciones completas, kilometraje y duración orientativos cuando hay ruta fiable. Mantener los botones de aceptar propuesta y cancelar solicitud únicamente en estados permitidos por el frontend existente.
- Incluye botón «Ver si hay novedades»; el estado también se consulta automáticamente cada 12 segundos mientras la pestaña está abierta.
- No se implementó Web Push en esta entrega. No prometer entrega de notificaciones push/correo sin una integración probada.
- El rediseño respeta la UI de producción, passkeys, CORS, OTP, dirección conocida Shangrilá y transacciones existentes; **no se cambian D1, API ni DNS**.

## Prevención de sobrescrituras

`pages-release`, la vista previa Pages y el Worker de producción son despliegues distintos. Actualizar solo una rama Pages no modifica necesariamente `viatraslados.com`; desplegar assets antiguos sobre el Worker **sí puede borrar cambios recientes**. Para la próxima publicación, construir un paquete a partir de la versión activa de `via-traslados-web-prod`, actualizar los archivos pertinentes desde estos fuentes y ejecutar validaciones con guardia de versión y rollback. Nunca desplegar a ciegas desde otro proyecto.

## Evidencia

La ejecución QA `43139167612` aprobó 9 estados en 4 tamaños (320×640, 360×740, 390×844, 1280×820), con datos simulados, sin crear reservas reales ni enviar correos. La ejecución de producción `43139522976` terminó en verde, comprobando archivos, versión Worker y geocodificador. La publicación anterior que falló por un assert incorrecto de CSS se revirtió automáticamente: `43139333033`.
