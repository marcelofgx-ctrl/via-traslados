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

## Consolidación V30.4.9 — 25/11/2026 UY
- Validación geográfica exacta: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45743548096. Chromium y WebKit: búsqueda real, recorrido vial y caché; 40 activos verificados. Candidato inmutable b23d68ea-5aae-4827-b808-3c4c3504a959.
- Incidencia física precisada: paso 1 → paso 3 → Volver → texto Comprobando tu sesión… persistente. Reproducción automatizada de V30.4.8 y corrección confirmada con el candidato existente; no hizo falta V30.4.9.1. Sesiones sintéticas interceptadas sin enviar credenciales ni crear reservas; Chromium/WebKit en claro/oscuro, repetición y regreso durante verificación. Código de pruebas: b90a9dbf561616510086eef3458ad52149066752. Primera ejecución 45744511882 falló por sintaxis YAML antes de ejecutar jobs; corregida.
- Promoción autorizada de la WEB V30.4.9: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45744549705. Pasos de promoción, prueba de navegación productiva, geografía real y comparación exacta de activos + API sin cambios completados satisfactoriamente. Rollback automático no necesario. Web activa b23d68ea-5aae-4827-b808-3c4c3504a959; rollback inmediato d29d5304-db8d-48bb-a082-44b336454ed6. API prod 5ad845a7-beeb-44e5-9e52-6459bd1fbb8b; sin migraciones, APK V35 sin cambios. La confirmación de la sesión real en el teléfono y el flujo comercial completo no son parte de las pruebas sintéticas.
- Mantener la rama horaria independiente y QA V31.1 activa. Próximo paso: integración web/APK y proveedores QA auténticos.
