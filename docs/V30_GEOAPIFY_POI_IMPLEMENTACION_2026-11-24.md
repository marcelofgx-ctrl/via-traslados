# Vía Traslados V30 — búsqueda comercial Geoapify Places (24/11/2026)

## Estado
Complemento creado sobre `via-v30-mvp-operativo-20261123`; **sin publicación a producción**, sin modificaciones a D1, API, PWA o APK. No asumir que el Worker de GitHub es idéntico al Worker actualmente activo.

## Contrato
- Solo amplía el resultado original de `GET /api/direcciones?mode=places&q=...`.
- Calle, número de puerta, GPS, reversa, reservas y rutas siguen utilizando el código V30 efectivo.
- `VIA_PLACES_ENABLED` debe valer exactamente `true` para activar el añadido; de otro modo, la respuesta original permanece sin cambios.
- `VIA_GEOAPIFY_API_KEY` debe ser un **secret del Worker WEB**, no una variable JavaScript del cliente, y debe tener habilitado el servicio Places API. La clave existente en el Worker API puede no estar disponible en el Worker WEB.
- Solo se devuelven lugares con país `uy`, coordenadas válidas y nombre. La ubicación elegida debe conservar lat/lng hasta la reserva.
- Búsquedas por calle y número no generan consultas nuevas a Geoapify.
- Si Geoapify falla, da 429 o tarda demasiado, se sirve la respuesta original de IDE Uruguay.
- El límite de llamadas por IP y la caché son **locales a cada instancia Worker**, no una cuota global: monitorear uso real y límites del plan antes de activar masivamente. Para un límite global fuerte haría falta infraestructura adicional.
- La búsqueda por nombre depende de la cobertura de datos de Geoapify/OSM; no equivale a encontrar cualquier empresa comercial ni asegura la puerta vehicular de acceso.

## Fuentes oficiales
- https://apidocs.geoapify.com/docs/places/
- https://apidocs.geoapify.com/how-to/place-discovery/places-by-name-or-brand/

## QA sin publicar
```bash
node --check addons/v30-geoapify-places.mjs
node --check scripts/v30-geoapify-integration.mjs
node --test tests/v30-geoapify-places.test.mjs tests/v30-geoapify-integration.test.mjs
```
El workflow `.github/workflows/via-v30-geoapify-places-qa.yml` es **solo pruebas**, no despliega.

## Preparación de una release real (pendiente)
1. Consultar en Cloudflare el ID del Worker WEB `via-traslados-web-prod` que sirve exactamente V30.0 al 100% y almacenar dicho ID para rollback. Un archivo `main` o un Worker antiguo NO es fuente de verdad.
2. Descargar el **código ejecutable del Worker activo**, validar su hash y capturar TODOS los assets públicos activos. Guardar manifiesto con SHA256 y respaldo.
3. Sobre una copia local de ese Worker ejecutar `node scripts/v30-geoapify-integration.mjs worker-v30-activo.mjs worker-v30-poi.mjs`; aborta si no reconoce el contrato actual.
4. Ejecutar `node --check worker-v30-poi.mjs`; ejecutar pruebas unitarias y comparar SHA256 de **todos** los assets: diferencia esperada exclusivamente en el entrypoint del Worker.
5. Subir ese paquete a un Worker QA aislado, configurar secret y `VIA_PLACES_ENABLED=true` **solo en QA**. No exponer API productiva ni D1 a sesiones QA.
6. Validar hoteles, restaurantes, arrendadoras de autos y lugares específicos en Montevideo, Canelones, Maldonado y Colonia. Contrastar nombre, lat/lng, resultado seleccionado y continuación del flujo con ruta por carretera. Probar Chrome Android y Safari iOS; sin solicitudes reales en D1.
7. Verificar límites y coste del proveedor, GPS, portales, IDE, sesiones, OTP, fechas, nuevas reservas e interfaz.
8. Solo con pruebas verdes, realizar `wrangler deploy --dry-run`; verificar que la versión CF activa sigue siendo la del respaldo y desplegar **únicamente Worker WEB** con `--keep-vars` y el flag activado. No publicar API, D1, APK ni otros Worker.
9. Smoke de producción GET-only, Geoapify por nombre, GPS y rutas; si falla, asignar 100% al ID previo del Worker WEB y volver a comprobar. No alterar D1.
10. Registrar manifiesto, cambios permitidos, ID de rollback y evidencia. No declarar producción hasta comprobar la URL real.

## Advertencia
La activación productiva todavía necesita el paquete generado a partir de la versión **efectivamente desplegada** y que el secreto esté disponible en el Worker WEB. Esta rama por sí sola no publica la mejora.
