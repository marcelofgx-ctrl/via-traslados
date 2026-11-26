# V30.4.9 — mantenimiento de sesión (candidato QA)
  
## Alcance
Incidencia observada el 25/11/2026 en producción V30.4.8: botón «Comprobando tu sesión…» persistente, indicador de número aproximado en origen vacío y versión no visible. En otra prueba física el cálculo 2,9 km/6 min y paso directo de 1 a 3 funcionaron. La causa exacta del estado del navegador físico no está reproducida.

Base congelada: web d29d5304-db8d-48bb-a082-44b336454ed6; API 5ad845a7-beeb-44e5-9e52-6459bd1fbb8b. No tocar rama estable ni rama de horas. Diagnóstico: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45741431499.

## Cambios
- Restauración de markup original y estado del botón; invalidación de intentos al volver o iniciar.
- Límite 8 s para la consulta de sesión, sin borrar sesión por error de red; no omitir identificación sin confirmación del servidor.
- Supresión visual de indicador aproximado con campo vacío; no modificar coordenadas.
- Versión discreta en portada y nueva clave de caché de service worker.
- Preservar bytes de config.js, address-autocomplete.js, reference.js, geo-v2/core.mjs, passkeys.js y map-point-picker.js.

## Ensayo y publicación
Candidato fuente: e8fe872c786a8af788a9665f693da231e1cc71fd. CI: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45742509326. Candidato construido desde 39 activos de la versión efectiva. Pruebas Chromium/WebKit con respuestas de red sintéticas, sin creación de reservas. Worker QA estático independiente únicamente si pasa la prueba; no D1 ni binding a API productiva. No confundir vista aislada con QA funcional. Estado de ejecución debe verificarse antes de dar por aprobado.
No se autoriza promoción productiva en este workflow. Requerir prueba específica de indicador al vaciar origen, navegación y reintento, regresión geográfica, contraste de paquete efectivo y aprobación de promoción. Rollback de web al identificador V30.4.8 arriba indicado; sin cambios de API ni D1.
