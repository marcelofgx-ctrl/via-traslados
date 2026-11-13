# VÍA TRASLADOS · continuidad del registro de conductores V33 (QA)
Fecha: 2026-11-13

## Alcance
Exclusivamente proyecto `via-traslados`, rama `via-registro-conductores-v33-qa-20261113`.
No mezclar con Quick Trip ni APK Mapa. No modificar `main`,
producción de Cloudflare, web de pasajeros o datos personales reales.

## Implementado
- Inicio de la APK con `Ingresar` y `Solicitar inscripción`.
- Formulario con nombre, teléfono, correo, contraseña; vehículo con marca,
  modelo, año, matrícula, color, pasajeros, valijas y foto desde cámara/galería.
- Registro con estado `pending`; no permite login hasta aprobarse.
- Bandeja en administración: contador de pendientes, detalle, foto,
  aprobación o rechazo manual y nota de auditoría.
- Configuración del administrador QA: abrir/cerrar altas y exigir fotografía.
- Backend `backend/qa-driver-onboarding.js`, tabla aislada
  `backend/schema-qa-v33.sql`, DB `via-traslados-qa-db`.
- Pruebas E2E `scripts/v33-onboarding-e2e.mjs`; flujo CI
  `.github/workflows/via-v33-onboarding-qa.yml`.
- Carpeta de descarga `qa-apk-download/v33-registration-qa/` en
  rama `via-apk-descarga-qa-20261112`. Sitio:
  https://via-conductor-apk-qa.vercel.app/v33-registration-qa/

## Hallazgos y correcciones
- Ejecución GitHub Actions 43427443991: falló una aserción del circuito V32.
- Ejecución 43427642323: V32 pasó; falló el JPEG de prueba de la V33.
- El script actual usa un JPEG válido (632 bytes, FF D8 ... FF D9).
- 2026-11-13: se agregaron pruebas de formulario cerrado, foto requerida,
  JPEG inválido, doble inscripción, acceso indebido a cambios administrativos
  y doble aprobación; commit `adf5f37ae51fa3cd5f5cec6400f6d403a442dc61`.
- Se amplió el disparador del flujo CI a cambios en el módulo QA;
  commit `f33b3e51c24550db07e54a55076adaf8f4a72206`.
- Las comprobaciones generales `Via Traslados - QA funcional` y
  `Via Traslados - comprobaciones QA` sobre dicho commit informaron `success`.
  No confundir con confirmación de la ejecución completa específica V33.
- Proyecto Vercel `via-conductor-apk-qa` informado en estado `READY`
  al inspeccionarlo el 13/11/2026. Validar la descarga real desde el teléfono.

## Restricciones estrictas
La V33 tiene administrador de demostración, no privado. Aceptar **solo**
identidades sintéticas, teléfono 099000xxx, correo @qa.invalid, matrículas QA
y fotografías inventadas; NO realizar altas reales ni pruebas con datos reales.
No usar esta autenticación de prueba como credencial de producción.
Antes de incorporar personas reales: autenticación privada de administrador,
verificación real por correo/teléfono, almacenamiento privado de fotografías
(p. ej. R2 con permisos), políticas de acceso, controles de abuso y revisión
de protección de datos. No desplegar esta versión a producción.

## Próximos pasos
1. Verificar estado final del workflow `via-v33-onboarding-qa.yml`
   posterior al commit f33b3e51 (backend E2E + compilación APK).
2. Confirmar descarga del instalador V33 QA y probar en Android:
   registro ficticio, foto, espera de aprobación, bandeja administrativa,
   aprobación y login con permiso restringido.
3. Resolver defectos revelados por las pruebas; mantener fotos y usuarios QA.
4. Planificar sustitución del administrador público por autenticación
   privada **antes** de cualquier alta real.

Este documento es un checkpoint de continuidad, no prueba de que el
flujo V33 haya terminado exitosamente.

## Iteración siguiente: V34 QA, catálogo del vehículo (2026-11-13)
- Archivo nuevo `android-driver/app/src/main/java/uy/viatraslados/conductor/ViaVehicleCatalog.java`.
- 32 marcas de referencia, modelos asociados y colores habituales; también
  años ordenados (año actual + 2 hasta 1990).
- En la inscripción, marca/modelo/color/año tienen búsqueda y desplegable.
  Al cambiar la marca se limpia el modelo y se actualizan las sugerencias.
- La opción `Otro (escribir)` deja registrar marcas, modelos y colores no listados;
  el backend recibe los valores escritos, sin listas obligatorias.
- Se reutiliza el diseño del formulario V33, sin más pasos ni cambios en D1.
- Nueva variante `-PviaCatalogQa=true`: paquete Android separado
  `uy.viatraslados.conductor.v34catalogqa`, versión 34. Puede instalarse
  al lado de V33 para no interferir con APK QA anteriormente instalado.
- Prueba de catálogos Java pura: `tests/ViaVehicleCatalogTest.java`.
- El workflow `.github/workflows/via-v33-onboarding-qa.yml` fue adaptado
  para construir la V34 y publicarla en la rama de descargas, ruta
  `qa-apk-download/v34-catalogo-qa/` [corregir según ruta real abajo].
- Ruta real prevista: `qa-apk-download/v34-catalog-qa/` y URL
  https://via-conductor-apk-qa.vercel.app/v34-catalog-qa/
- Importante: el código y la automatización fueron guardados, pero confirmar
  que el nuevo flujo Android compiló, que se publicó el APK y que la
  descarga se abre en un teléfono antes de marcar V34 como probada.
