# Vía Traslados — APK conductores V35 RC · continuidad y pruebas

**Base de trabajo:** V34 original validada en la rama `via-registro-conductores-v33-qa-20261113` (commit `a7d93b8`) + backend V35 publicado e integrado a `main` (PR #31). Esta rama contiene SOLO la promoción de la aplicación Android desde las fuentes reales V34 y preserva el backend/web y el motor geográfico.

## Entornos sin confusión

| Componente | Identificador Android | API utilizada | Uso |
| --- | --- | --- | --- |
| V34 catálogo QA original | `uy.viatraslados.conductor.v34catalogqa` | `via-traslados-api-qa.marcelof-gx.workers.dev` | Pruebas con datos sintéticos en D1 QA |
| V35 candidato interno | `uy.viatraslados.conductor.productionrc` | `via-traslados-api.marcelof-gx.workers.dev` | Pruebas controladas con cuentas reales aprobadas; toca datos REALES |
| Futura V35 release firmada | `uy.viatraslados.conductor.production` | `via-traslados-api.marcelof-gx.workers.dev` | Pendiente de firma estable y validación Samsung |

**Nunca combinar `-PviaProduction=true` con `-PviaCatalogQa=true` u otra bandera QA/demo.** La compilación rechaza esa combinación. La versión candidata V35 lleva rótulo visible `PRODUCCIÓN`; no incluye botones públicos de administrador QA ni perfiles sintéticos. No reutilizar la contraseña de un conductor QA: iniciar con cuenta real aprobada por el fundador, celular y contraseña.

## Funcionalidad conectada

- Inicio con credenciales del personal autorizadas por `via-traslados-api`; se conserva recuperación de contraseña, inicio con huella del dispositivo y el flujo de aprobación normal.
- Bandejas `Nuevas`, `Con ofertas`, `Viajes`, `Historial` y administración existentes; clasificación según permisos que devuelve API V35.
- El socio habilitado puede recibir solicitudes nuevas; el contratado únicamente liberadas o asignadas, en función de su perfil comercial.
- Cotización manual en pesos, asignación automática con disparador transaccional en backend, aceptación explícita del pasajero y avance de estados.
- Consultas cada ~20 s **cuando la app está abierta**. NO existe todavía Web Push/FCM fiable cuando se cierra.
- Identidad visual, fichas de vehículos y catálogo de Geely EX5/Max conservados desde V34.
- La inscripción con fotografía y administrador *demo* de V34 queda en QA. **No** ha sido trasladada sin más al backend productivo: para fotos reales falta almacenamiento R2 privado, permisos y flujo de verificación/retención.

## Verificación actual

- API productiva desplegada y probada: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44213106545
- Prueba real de endpoints solicitud → cotización → aceptación → cierre en D1 STAGING aislada: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44212252331
- Compilación previa candidata V35 + preservación V34: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44210914460
- CI de esta rama `.github/workflows/via-v35-android-rc-clean.yml`: compila ambas variantes desde `main` actualizado y guarda los APK como **artefactos privados de Actions**. No instala por sí misma en Samsung ni publica instaladores públicos.

## Prueba Samsung pendiente

1. Instalar la RC **solo para uso interno** después de confirmar que el último job es `success`; no usarla como aplicación comercial definitiva. Su paquete `productionrc` permite coexistir con V34 QA.
2. Comprobar rótulo V35 RC, login con cuenta real verificada y aprobada, recuperación, sesión por huella, pestañas, reglas de permisos y consulta de reservas reales. No crear datos ficticios en D1 productiva.
3. Usar una solicitud real autorizada por pasajero de prueba o por un pasajero que consienta; cotización, aceptación desde web, confirmación, estados y auditoría. No probar con una reserva real de terceros sin permiso.
4. Verificar instalación limpia, estabilidad, teclado, retorno de segundo plano, botones, geolocalización no alterada, disponibilidad y lectura móvil compacta. La notificación al cerrar APK sigue siendo trabajo pendiente.

## Publicación definitiva

La RC es una **debug APK** firmada por GitHub Runner, no adecuada para distribuir ni actualizar una futura release. Para la APK final crear keystore de firma estable y segura, almacén privado de certificados y secreto de CI, configurar `assembleRelease`, habilitar `minify` si se valida, efectuar `apksigner verify`, prueba en Samsung y recién entonces publicar APK productiva con SHA-256 en web. Mantener V34 QA accesible y sin alteración. No emplear firma debug para el paquete final.
