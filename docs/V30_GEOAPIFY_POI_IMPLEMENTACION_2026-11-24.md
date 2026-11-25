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


## Fase QA avanzada — 24/11/2026

### Implementación y pruebas concretas realizadas
- Corrigió la selección de POI en la copia del frontend V30 real: ahora conserva el origen `Geoapify Places` y `postalStatus=unknown`, sin etiquetar un hotel como domicilio postal de IDE ya confirmado.
- **18 pruebas unitarias aprobadas** sobre addons/integrador/frontend, incluida precisión y procedencia de POI.
  Evidencia: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45385117103
- **E2E Chrome Android y Safari WebKit iOS aprobados** con respuestas Geoapify/IDE **simuladas**: autocompletado por «Radisson» sin prefijo «hotel», elección del lugar, preservación de `lat/lng/source`, coordenadas entregadas al cálculo de ruta y regresión de una calle con número y `accuracy=portal`. Se intercepta toda llamada `/api` en ambas pestañas, no hay escrituras productivas. Evidencia: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45385576696

### Worker QA aislado
- Worker nuevo y diferente del productivo: `via-traslados-v30-poi-stage-20261124`.
- URL: https://via-traslados-v30-poi-stage-20261124.marcelof-gx.workers.dev
- Construido desde Worker y assets **efectivamente desplegados de V30**. Inventario de 38 assets; solo se alteraron en QA `index.html` (aviso evidente de pruebas), `config.js` (API dirigida a stage, NO producción) y `address-autocomplete.js` (criterio de búsqueda y procedencia POI); `worker-qa.mjs` envuelve la lógica original.
- Toda API excepto la lectura de `/api/direcciones` se rechaza con HTTP 503; sin binding D1. El flag `VIA_PLACES_ENABLED` permanece **false**; no se copió el secreto de Geoapify.
- El primer smoke recibió HTTP 403 transitorio en `workers.dev`. Una auditoría posterior comprobó HTTP 200 en la web, autocompletado y configuración QA; HTTP 503 en API de reservas; HTTP 200 y contrato `results[]` del catálogo IDE. No atribuir al 403 ninguna causa no confirmada. Evidencia: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45385626354
- Publicación de QA solamente. Sin despliegue a `via-traslados-web-prod`, sin writes a `via-traslados-api`, ni cambios D1.

### Bloqueo obligatorio para pruebas REALES del proveedor
La clave `VIA_GEOAPIFY_API_KEY` se encuentra como `secret_text` en `via-traslados-api` pero Cloudflare no expone su valor en la API o en GitHub Actions. No intentar extraerla a través de un endpoint, un script temporal o registros.

**Única acción de cuenta pendiente:** desde https://myprojects.geoapify.com obtener la clave autorizada del proyecto y configurarla como **Secret** con nombre `VIA_GEOAPIFY_API_KEY` en el Worker **QA**, nunca en repositorio ni chat. Primero conservar `VIA_PLACES_ENABLED=false`, verificar condiciones de uso/cupo y posteriormente activarlo **solamente en QA**. El flag actual de la configuración de Wrangler QA es false, de modo que una nueva publicación de stage lo mantendrá apagado hasta que el pipeline QA se actualice de forma controlada.

Después: búsquedas reales a Geoapify Places, comparación de ubicación de hoteles/rentadoras/restaurantes en varios departamentos, prueba E2E completa con Geoapify real y reservas simuladas en QA. Solo entonces preparar despliegue productivo protegido y rollback del Worker y asset, sin D1/API/APK.

### Estado al cierre de este bloque
- PR #55: sigue **draft**, no fusionado.
- Producción: V30 sin cambios de Places.
- Integración y frontend: desarrollados en QA.
- QA automático: 18 pruebas aprobadas.
- QA navegador Android + iOS con datos simulados: aprobado.
- Worker QA aislado: publicado y smoke público aprobado.
- Consulta real de Places: **pendiente de clave**.
- Publicación productiva Geoapify Places: **NO realizada**.


## Solicitud explícita de salida directa a producción — 24/11/2026

El titular autorizó **publicación directa en producción con rollback** debido a la necesidad turística de buscar hoteles, restaurantes y rentadoras. Se intentó avanzar directamente, **pero producción NO ha sido modificada** por esta fase.

### Impedimento técnico real

A partir de 11:54 UTC, GitHub Actions comenzó a completar **todos los nuevos jobs con conclusión failure y sin asignar un runner** (`runner_id=0`, `steps=[]`), incluidos workflows QA históricos que antes funcionaban. Se confirmó con:
- https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45388430210 (preflight API: 0 pasos)
- https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45388443497 (QA habitual: 0 pasos)
- https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45388443619 (QA habitual: 0 pasos).

**NO se conoce la causa exacta**: verificar en GitHub Actions la incidencia del repositorio, facturación/minutos y restricciones de cuenta. No afirmar «cuota agotada» sin confirmación. Sin runner no hay acceso a los secretos Cloudflare de CI ni posibilidad de publicar mediante el mecanismo disponible. No copiar Cloudflare tokens a GitHub ni al chat, no intentar leer el secreto Geoapify.

### Alternativa de arquitectura lista en el PR #55

Para evitar tener que volver a introducir el secreto Geoapify en el Worker web:

1. `addons/v30-poi-api-proxy.mjs`: proxy mínimo `GET /api/via-places?q=...` que consulta Geoapify Places usando **la clave ya existente en el Worker API**. No expone ni registra la clave, devuelve sólo nombres, ciudad, departamento, IDs y coordenadas de Uruguay. Límite compartido en tabla `otp_rate_limits` EXISTENTE: máximo 900 consultas/día global y 65/h por IP; estos límites escriben contadores operativos, **pero no alteran tablas de reservas ni usuarios y no requieren migración de D1**.
2. `scripts/v30-poi-api-bundle-wrapper.mjs`: envuelve la API efectivamente desplegada, no la copia histórica de GitHub, conservando las rutas originales.
3. `addons/v30-geoapify-places.mjs`: admite `env.VIA_POI_API.fetch(...)` como Cloudflare Service Binding, sin secreto en WEB. Conserva fallback IDE, flag de activación, coordenadas y búsqueda nacional. Permite modo directo con secreto para QA, pero **no es necesario en producción**.
4. `tests/v30-poi-api-service.test.mjs`: pruebas del proxy, clave no divulgada, filtro Uruguay, fallback y Service Binding.
5. `scripts/v30-poi-prod-package.py`: captura por GET **ambos Workers activos**, envuelve API y web, reconstruye inventario de assets V30, **modifica sólo `address-autocomplete.js`** y prepara dos configuraciones Wrangler con `--keep-vars` y el binding `VIA_POI_API` del web al API. Exige IDs de Worker activos V30/actual V35 y rechaza diferencias, código API inesperado, assets ausentes, modificaciones extra.
6. `scripts/v30-poi-prod-rollback.mjs`: restaura el 100 % de tráfico a dos IDs originales concretos, sin SQL y con confirmación de Cloudflare.
7. `.github/workflows/via-v30-poi-production-release.yml`: flujo de publicación **manual**, con aprobación explícita, pruebas, preflight, dry-run, API primero, consulta REAL a Geoapify con clave protegida, WEB después, smoke y rollback doble ante error. No es workflow de publicación por `push`; no puede empezar a publicar de forma diferida cuando GitHub recupere runners. Para ejecutarlo por `workflow_dispatch` puede ser necesario ubicar el workflow en rama por defecto, según las reglas de GitHub; verificar antes de intentar liberación.

**NO probado:** nuevo proxy contra proveedor real (CI bloqueada); bundle API activo real (CI bloqueada); build de despliegue completo; publicación. La sintaxis de los addons y wrappers fue evaluada localmente en un entorno JS, pero NO equivale a tests Node/Cloudflare ejecutados. La QA anterior de 18 tests y E2E Android/iOS corresponde a la versión de Geoapify antes de agregar Service Binding.

### Próximos pasos después de restablecer GitHub Actions

1. Revisar problema de arranque de jobs (runner_id 0) con el titular, sin inventar su causa.
2. Ejecutar suite de pruebas `via-v30-geoapify-places-qa.yml`, incluida prueba del API proxy.
3. Comprobar fuentes/versiones activas Cloudflare y secret de API por metadatos.
4. Hacer dry-run con paquete de producción.
5. Publicar API con wrapper, verificar salud/OTP/autorización, consultar Geoapify Places **con su clave real sin revelarla** y exigir al menos un hotel o comercio real.
6. Publicar Web V30 con binding y cambio único del autocomplete; verificar casos de nombres propios + IDE exacto.
7. Confirmar 100 % de tráfico nuevo y mantener IDs anteriores como rollback. Si falla, restaurar primero Web y luego API.
8. Registrar evidencia y declarar producción **solamente después del smoke público**.

### Invariantes de negocio

No tocar reglas de socios/administradores, asignación, OTP, D1 schema, usuarios, reservas, APK ni flujos de cotización. Backend utiliza rate counters existentes para limitar el consumo de Places, sin migraciones. Mantener V30 original hasta pasar las verificaciones. Evitar desplegar por sorpresa el workflow preparado si Actions se recupera.


## Resultado de publicación y rollback — 24/11/2026, verificado

- La conversión temporal a repositorio público desbloqueó GitHub Actions en runners estándar sin tarjeta. QA, sintaxis, empaquetado y Wrangler `--dry-run` pasaron:
  https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45412925782
- Se autorizó una publicación protegida mediante ejecución de un único marcador de CI.
  Ejecución https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45413339169.
- El Worker API llegó a desplegarse temporalmente, pero la prueba real de Geoapify Places devolvió HTTP 200 con **0** lugares para Radisson, Hyatt, Enjoy, Sofitel, Hertz y Hilton. No se publicó la web POI.
- **Rollback confirmado en logs:** `via-traslados-web-prod` versión `ac8e0a7e-a032-47f8-8328-bd7b716a4342` ya estaba activa; API restaurada y verificada `9349f01a-5824-4401-848f-edb4f3f7d5b0`.
- Comprobación Cloudflare solo lectura posterior: API `9349f01a-5824-4401-848f-edb4f3f7d5b0` atiende **100 %** del tráfico:
  https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45415704689.
- Se detectó una diferencia crucial: `GET /workers/scripts/{name}` puede devolver el **último código subido**, no la versión a la que un rollback devolvió el 100 % del tráfico. El último código API aún tiene `viaPoiHandle` mientras el despliegue activo es la API original. No reconstruir producción reutilizando ese archivo.
- `scripts/v30-poi-prod-package.py` ahora rechaza la publicación si la última versión subida difiere de la versión efectivamente activa. Esto es intencional; no desactivar el control para hacer pasar la prueba.
- El workflow de publicación se devolvió a **`workflow_dispatch` exclusivamente**; no hay un lanzamiento automático pendiente.
- La credencial de Geoapify sigue bajo secreto en Cloudflare API. No extraerla ni incorporarla al repositorio. No migrar D1 ni alterar reservas.

### Bloqueo real y decisión de arquitectura pendiente

1. Determinar si el proveedor realmente devuelve `features: []` o si `viaPoiNormalize` filtra todos los registros. Los contadores anónimos de respuesta están agregados al addon de QA, todavía no verificados con el proveedor real.
2. Para un release seguro se necesita reconstruir desde el código de la **versión activa** de Cloudflare, no del último upload. La API de metadatos de versión no expone directamente el source del Worker ejecutable. Evaluar web-only con secreto habilitado por el propietario y pruebas QA, o un proceso de entrega basado en fuente inmutable y empaquetado reproducible.
3. Mantener `viatraslados.com` V30 estable hasta una prueba viva con lugares reales, coordenadas válidas, fallback a IDE y rollback probado.
