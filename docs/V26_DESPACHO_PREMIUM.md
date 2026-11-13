# Vía Traslados V26 QA — centro de operaciones premium

**Rama:** `via-despacho-premium-v26-qa-20261112`  
**PR:** `#23` (borrador, no fusionar automáticamente)  
**Estado:** Implementación QA. Ni Worker ni D1 de producción ni `viatraslados.com` se modificaron.

## Cambios implementados

- Android: reemplaza `AlertDialog` de detalle por `Dialog` de pantalla completa, con resumen compactado, recorrido, pasajero, estado, conductor y acciones contextualizadas.
- Selector de conductor: GET autenticado de opciones; solo muestra datos reales, conflictos de agenda y permiso de email. No muestra ubicaciones ni ETA ficticios.
- Paso de revisión + confirmación explícita de asignación, pantalla de éxito, cambio o retiro de conductor.
- Gestión administrativa: editar matrícula, marca, modelo y capacidades por conductor; los campos vacíos se indican como no registrados.
- API: GET `/api/admin/requests/:id/assignment-options`, POST `/api/admin/requests/:id/assign` con `expectedDriverId`, PATCH `/api/admin/drivers/:id/vehicle`.
- D1: tabla `driver_vehicle_profiles` idempotente; no se borran reservas.
- Reglas: se puede asignar en requested/quoted/accepted/confirmed; no se confirma la reserva automáticamente. Se excluyen viajes cancelados/finalizados de los conflictos. Cada servicio ocupa al menos 60 min y suma 30 min de margen de agenda (criterio QA configurable en futuro).
- Concurrencia: la asignación SQL comprueba estado, conductor aprobado, correo verificado, asignación previa y solapamientos en la misma operación. La retirada también requiere coincidencia de conductor previo.

## QA

Workflow `Via Traslados - V26 despacho premium QA` ejecuta `npm test`, `npm run check`, validación D1 con SQLite en memoria y `gradle :app:assembleDebug`, sin tocar Cloudflare.

**No publicar la APK debug como actualización directa:** puede haber firma distinta a la instalada. Antes de entregar una APK al conductor, configurar firma estable o compilar un paquete de pruebas aislado, y verificar inicio, flujo completo con datos de test y recuperación de acceso.

## Orden de publicación segura

1. Verificar éxito de la última ejecución QA; revisar UI en un Android físico.
2. Migrar solo D1 de `via-traslados-db` con `backend/schema.sql`, verificando que no se modifiquen registros existentes.
3. Publicar únicamente Worker `via-traslados-api` después de pruebas de los nuevos endpoints y observabilidad.
4. Publicar APK firmada compatible con el paquete previsto; probar asignación entre cuentas de QA, cotización, aceptación y confirmación.
5. Validar rollback y confirmar que las sesiones, notificaciones y web pública no hayan cambiado.
6. No mezclar esta rama con `via-actualizaciones-apk-qa-20261112` sin reconciliar `MainActivity.java` y el versionado Android.

## Pendientes para siguientes versiones

- Presencia del conductor, posición GPS con permisos y ETA real.
- Horarios de trabajo declarados, aceptación explícita del conductor de nuevas asignaciones, push remotas cuando APK cerrada.
- Prueba real de concurrencia con 2 administradores sobre D1 QA.
- Mejoras visuales finales de acuerdo con capturas de Android y accesibilidad.


## APK V26 Demo independiente, lista para evaluación visual

- **Página de descargas:** https://via-conductor-apk-qa.vercel.app/
- **Página de V26:** https://via-conductor-apk-qa.vercel.app/v26-preview/
- **APK directa:** https://via-conductor-apk-qa.vercel.app/v26-preview/via-conductor-v26-demo.apk
- **Identificador:** `uy.viatraslados.conductor.v26preview`, distinto de la aplicación operativa `uy.viatraslados.conductor.autoprecalcqa`.
- **Versión:** `0.26.0-preview`, `versionCode=26`.
- **SHA-256:** `a25bdb15008c42bba0bcee3f5680be3c73fdf31bdefc858c7e23cb2abf1e9af0`.
- **Contenido:** `ViaPreviewData.java` intercepta internamente las llamadas API y devuelve información ficticia. No crea ni edita reservas, conductores ni cuentas reales. La instalación se realiza junto a la versión anterior.
- **Validaciones:** compilación Android, `apksigner verify`, identificador de aplicación, versión, integridad del ZIP, comprobación anónima del portal y descarga pública con checksum SHA-256.
- **GitHub Actions:** publicación `43337294678` correcta, smoke público `43337900078` correcto.
- **Motor real:** prueba de D1/SQL `43337582146` correcta, después de corregir la conversión numérica en comparaciones de `strftime`. La demo se compiló antes de esta corrección porque usa el motor de datos local, no el backend.
- **Importante:** no confundir la demo con la aplicación operativa ni anunciarla en `latest.json` del actualizador. La clave debug es efímera y no debe usarse como cadena de actualizaciones permanente.

Siguiente integración: aplicar la tabla `driver_vehicle_profiles` en un entorno D1 QA aislado y ensayar asignación concurrente en el Worker QA, antes de publicar backend y APK operativos con firma persistente.
