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

## Auditoría efectiva del 24/11/2026
- **11/11 pruebas automatizadas aprobadas** con Node 22, incluida protección frente a desactivación, países fuera de Uruguay, direcciones con número y resultados IDE completos: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45377444093
- **Cloudflare Worker WEB en producción:** versión activa `ac8e0a7e-a032-47f8-8328-bd7b716a4342`, web visible v30.0 (consultado por GitHub Actions de solo lectura).
- El código real de producción tiene exportación ESM minificada (`export{worker_default as default}`). El wrapper se adaptó a este formato; pasó compilación `node --check` sobre una copia real: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45378170865
- **Bloqueo pendiente:** no existe binding `VIA_GEOAPIFY_API_KEY` en el Worker WEB; tampoco se detectó una clave `VIA_GEOAPIFY_API_KEY` / `GEOAPIFY_API_KEY` disponible como secreto de GitHub Actions. Verificación no destructiva: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45378430599
- Para activarlo, configurar la clave en Cloudflare, Worker `via-traslados-web-prod` → Settings → Variables and Secrets. Elegir **Secret** y nombre exacto `VIA_GEOAPIFY_API_KEY`. No compartir la clave por chat o repositorio.
- **No hubo publicación:** V30 permanece intacta. Es incorrecto anunciar Geoapify Places como habilitado hasta terminar pruebas reales de QA y publicación protegida.


## Continuación auditada del 24/11/2026 — contrato real, GPS nacional y frontend

### Evidencia nueva, siempre sin publicación
- **Contrato real del Worker web:** en producción GET `/api/direcciones?mode=places&q=...` devuelve `{results,mode,provider}`. Se verificó HTTP 200 y `results[]` reales, incluyendo aeropuerto con `label/street/city/department/lat/lng/accuracy/kind/source/detail`. Los nombres Radisson, Hyatt, Enjoy y búsquedas en Colonia no aparecieron con el catálogo heredado. Auditoría: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45380272068
- **Web activa:** versión `ac8e0a7e-a032-47f8-8328-bd7b716a4342` con 100 % del tráfico, sin despliegue de estas pruebas.
- **Secreto Geoapify existente:** el Worker **API** `via-traslados-api` sí tiene binding `VIA_GEOAPIFY_API_KEY` de tipo `secret_text`; el Worker **WEB** `via-traslados-web-prod` no lo tiene. Se comprobó la presencia por metadatos, **nunca se leyó ni imprimió el valor**. El secreto de un Worker no se obtiene de otro automáticamente. **No intentar recuperarlo/exponerlo mediante código ni copiarlo al repositorio**. Configurar una clave autorizada para el Worker QA desde un gestor seguro o el panel Geoapify, antes de pruebas vivas.
- **Frontend real:** `address-autocomplete.js` obtiene sugerencias de dos modos: `suggest` siempre y `places` solo cuando aparecen ciertas palabras como `hotel`, `shopping`, `aeropuerto`. Es insuficiente para `Hertz`, `La Perdiz` y `Radisson` sin descriptor. El mismo frontend almacena los campos `lat/lng` en `dataset` y `window.ViaAddress.get`; `app.js` incorpora `originLocation`/`destinationLocation` para rutas y solicitudes. Evidencia de análisis estático GET-only: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45380931184. No constituye E2E en navegador.
- **Documentación oficial Geoapify:** el parámetro `name` funciona por coincidencia textual en nombres; `bias=proximity` ordena sin limitar distancias. Usar categoría y filtro geográfico y respetar las atribuciones. URLs de referencia originales en este documento.

### Cambios QA preparados dentro del mismo PR
1. `addons/v30-geoapify-places.mjs`: reemplaza círculo rígido de 90 km por rectángulo aproximado nacional, conserva GPS como `bias`, mantiene filtro posterior `country_code=uy`; elimina encabezados HTTP obsoletos al cambiar JSON; omite prefijos genéricos `Hotel`/`Restaurante` para buscar nombres comerciales. No introduce dependencias adicionales ni cambia rutas/IDE.
2. `scripts/v30-poi-frontend-patch.mjs`: parche **local y con rechazo por contrato** del `address-autocomplete.js` efectivo. Activa `mode=places` también para nombres de empresas sin descriptor y reserva hasta 4 resultados POI en listas ambiguas sin quitar prioridad a direcciones con número. No cambia estilos ni persistencia de coordenadas. **No está instalado en producción ni agregado aún a un pipeline de despliegue**.
3. `tests/v30-poi-frontend-patch.test.mjs`: comprueba `Hertz`, `Radisson`, `La Perdiz`, `Hyatt Centric`, calles/puertas y reserva de espacios visibles.
4. `.github/workflows/via-v30-geoapify-live-contract-readonly.yml` y `via-v30-poi-frontend-contract-readonly.yml`: auditorías públicas/Cloudflare, nunca despliegan.
5. El workflow de pruebas `via-v30-geoapify-places-qa.yml` compila el parche del autocomplete real descargado por GET y hace `node --check` sobre la copia, sin sustituir el asset público.

**QA automático:** 17 pruebas unitarias aprobadas, 0 fallidas, más parche de autocomplete V30 REAL generado y validado localmente por Node. Evidencia: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45381445775

**Preflight posterior al cambio del addon:** Worker efectivo V30, 6 assets críticos verificados, integración sintáctica sobre código ESM real de Cloudflare, 14 pruebas del addon/integrador aprobadas y secreto WEB ausente. Sin publicaciones: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45380824561

### BLOQUEOS ANTES DE LA PUBLICACIÓN
- Falta una clave Geoapify Places habilitada y configurada **en un entorno WEB QA**. La clave del Worker API no es transferible desde la respuesta de la API de Cloudflare. **No configurar ni habilitar Places en producción sin superar QA vivo.**
- Falta demostrar con respuestas reales de Places la cobertura para hoteles/restaurantes/rentadoras en varios departamentos y su precisión de coordenadas.
- Falta instalar la extensión en **un Worker QA aislado con datos QA**, validar PWA Chrome Android + Safari/WebKit, GPS, puerta exacta, rutas viales y flujo de solicitud sin tocar D1 productiva.
- La publicación final deberá empaquetar, desde los **assets reales**, el Worker extendido **y el único cambio de comportamiento necesario en `address-autocomplete.js`**. Una comparación SHA256 debe permitir la diferencia prevista solo para este asset y el entrypoint del Worker; los demás assets deben conservar los hashes existentes. La regla previa de «todos los assets idénticos» debe adaptarse explícitamente a ese cambio mínimo justificado. Ningún workflow de publicación se ha autorizado ni creado.
- El apagado con flag en servidor mantiene el comportamiento de la API antigua; si el frontend modificado ya se sirvió, puede generar consultas adicionales al endpoint `mode=places` incluso estando apagado. Debe resolverse el plan de activación/desactivación y caché antes del despliegue. No prometer apagado 100 % idéntico sin esa verificación.
- Se mantiene intacta la V30 real; **el PR sigue draft y no se debe fusionar ni desplegar aún**.

### Próximo paso seguro
Provisionar QA Web aislado y configurar allí `VIA_GEOAPIFY_API_KEY` como secreto y `VIA_PLACES_ENABLED=true` solo en QA, con autorización y fuente de credenciales segura. Repetir pruebas vivas y E2E. Solo entonces diseñar la liberación protegida, rollback y prueba postproducción.
