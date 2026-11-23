# Vía Traslados — Consolidación arquitectónica e integridad funcional (ADR-001)
**Fecha:** 23/11/2026 · **Estado:** propuesta técnica con auditoría iniciada · **Producción actual:** web v29.1.16, sin intervención.

## Decisión

Congelar temporalmente los retoques estéticos no urgentes y eliminar la fractura entre ubicación, cálculo de ruta, reserva, despacho y visualización. No habrá una nueva publicación productiva funcional basada solo en pruebas visuales. Se reanudan los cambios normales cuando un único circuito real de QA, con base aislada y motor de rutas probado, complete toda la secuencia sin contradicciones.

**No significa rediseñar ni reemplazar toda la aplicación.** Se conserva lo existente y se cambia su arquitectura de forma aditiva y compatible con reservas anteriores.

## Auditoría preliminar de fuentes (no confundir tests verdes con integración completa)

1. La web efectiva v29.1.16 proviene de una rama de publicación y activos Cloudflare; `main` no contiene una copia única y actualizada de esos mismos activos web. Los cambios vienen de reconstrucciones de Worker y ramas versionadas. Esto exige una reconciliación de fuentes antes de refactorizar.
2. `app.js` arma un pedido con `originLocation` y `destinationLocation`, pero `ViaStore.estimateRoute(origin,destination)` publica solamente texto a `/api/public/route-preview`.
3. `backend/route-estimate.js` vuelve a geocodificar los dos textos y exige precisión de puerta. Si un origen está marcado en mapa sin número, puede devolver 422 aunque las coordenadas seleccionadas sean válidas.
4. `backend/worker.js` valida y persiste `origin` y `destination` como texto; la persistencia actual de esas coordenadas **no está implementada en el flujo de creación de reserva del repositorio**. No inferir el esquema real de D1 sin auditoría `PRAGMA table_info`.
5. Las pruebas de producción actuales verifican una ruta con dos direcciones conocidas y disponibilidad de API/OTP. No incluyen la secuencia real `mapa → preview → reserva → persistencia → cotización → nueva solicitud` con la misma localización.
6. `.github/workflows/via-ui-visual-boundary.yml` se activa en PR hacia `main`; los despliegues particulares desde ramas de versión no quedan cubiertos automáticamente por esa regla. Las pruebas con API interceptada en navegador tampoco validan el contrato de la API real.

## Arquitectura objetivo: coordenadas como dato, texto como presentación

Crear un **único contrato versionado** `LocationV1`:

```json
{
  "label": "Cerca de Avenida Italia, Montevideo",
  "point": {"lat": -34.854271, "lng": -56.003157},
  "source": "map",
  "accuracy": "point_selected",
  "postalStatus": "unknown",
  "numberIsApproximate": false,
  "userConfirmed": true
}
```

*Ejemplo de estructura, no representa necesariamente la dirección asociada a esas coordenadas.*

Reglas:
- La **latitud/longitud del punto seleccionado** es la identidad geográfica. Se usa para enrutar, presupuestar y posteriormente despachar. No se vuelve a geocodificar el texto si ya existe un punto explícitamente confirmado.
- El **label** sirve para lectura humana; si no se conoce la puerta, jamás se presenta como certificada. `Ruta 8` no implica número de puerta 8.
- `origin` y `destination` deben usar el mismo `LocationV1` en portada, wizard, `route-preview`, `bookings`, presupuesto, asignación, panel admin y conductor.
- Para usuarios que escriben direcciones sin seleccionar un punto: resolver y **confirmar** el resultado antes de fijar coordenadas; no inventar rutas, ni sustituir unilateralmente el punto.
- Validar Uruguay, rangos lat/lng y precisión; prevenir atributos arbitrarios y serialización de datos sensibles en logs.

`TripDraftV1` mantiene esas dos ubicaciones y fecha/hora/pasajeros/valijas/notas. Una nueva solicitud crea un nuevo borrador; nunca conserva lat/lng, validaciones ni cálculos del pedido anterior por error. La sesión del cliente no se borra.

## API y D1: evolución aditiva, en dos etapas

- `POST /api/public/route-preview`: conservar temporalmente el contrato antiguo `{origin:string,destination:string}`; agregar un contrato versionado con objetos `originLocation` y `destinationLocation` con coordenadas verificadas. En este contrato, validar estructura y enviar los puntos directamente a routing. No confiar en datos geográficos inferidos a partir de palabras.
- Usar **una misma función de cálculo** para `preview`, creación/consulta de reserva y cotización, con caché por puntos normalizados y versión de algoritmo. Los kilómetros del preview y los kilómetros de la reserva deben corresponder al mismo trayecto (o indicar explícitamente que cambiaron los puntos/algoritmo).
- D1: migración **aditiva** y reversible operativamente (no destructiva) para puntos de origen/destino, estado postal y fuente; elegir tabla `booking_locations` asociada a `bookings` o columnas nuevas luego de verificar el esquema efectivo. Mantener registros viejos sin puntos como `legacy`, con un fallback conservador. No completar coordenadas de reservas antiguas por suposición.
- Guardar la pareja texto + coordenadas **atómicamente** al crear la reserva e incluirla en respuesta autenticada para usuario, panel, chofer y demás consumidores según permisos; todo con control de acceso y sin exponer datos de otro pasajero.
- Compatibilidad con la APK actual: no retirar campos existentes, versionar contratos; primero API compatible, después web, luego APK si se justifica.
- D1 real: snapshot/bookmark previo a cualquier migración; nunca ejecutar pruebas de escritura sobre D1 prod. El rollback de código no debe requerir deshacer datos válidos.

## Fuente única, despliegues únicos, no más ramas de parche como verdad productiva

1. Auditar por separado los Workers **web** y **API** realmente activos, sus fuentes, variables y hashes, sin copiar secretos. Definir un commit/artefacto reproducible y etiquetarlo como baseline, reconciliándolo con `main`.
2. Estructura objetivo: `web/`, `api/`, `shared/contracts/`, `db/migrations/`, `tests/`, sin que una edición de CSS toque funciones de ruta.
3. Un solo *pipeline* autorizado de promoción `dev → QA real → producción`. Publicar web y API por separado cuando sean compatibles; para un contrato nuevo aplicar primero API aditiva y luego la web.
4. El pipeline debe verificar por sí mismo los **checks del commit exacto**, manifiesto de versiones, fingerprints de activos y versión de esquema. Si faltan/están rojos, **no despliega**. Los PR deben exigir checks y revisión de código mediante reglas de protección administradas en GitHub; un workflow informativo no sustituye una regla obligatoria.
5. Bloquear despliegues directos/legados que esquiven el pipeline una vez migrados todos los productores; realizar inventario de workflows y permisos antes de deshabilitarlos.

## QA auténtica (sin tocar prod)

- Web real en QA, API real desplegada contra **D1 QA físicamente separada**, OTP y avisos usando cuentas/destinatarios de prueba aislados. Proveedores geográficos simulados para casos deterministas, y un conjunto limitado de pruebas reales del proveedor en modo lectura.
- Prueba E2E mínima obligatoria:
  1. GPS en Android/WebKit, localizar una **calle sin número** y confirmar la chincheta.
  2. Elegir el aeropuerto, obtener distancia por carretera o error de proveedor **identificable**.
  3. Crear exactamente una reserva; consultar por la sesión correcta; comprobar que se guardaron **las mismas coordenadas**.
  4. Administrador cotiza, conductor autorizado gestiona, pasajero acepta y se confirma el estado.
  5. Volver a Inicio y crear un pedido nuevo; demostrar que no heredó puntos, fecha ni validaciones.
  6. Test con servicio externo caído/429/timeout, y test de búsqueda postal fallida; no inventar datos ni bloquear definitivamente el formulario.
  7. Tests de regresión de «Mis reservas», historial, paginación, teclado, passkey/OTP y APK.
- Capturar evidencia en Android Chrome, iOS WebKit y distintos anchos; no basta con snapshots visuales ni `200 OK` de API.
- Datos de prueba idempotentes, reiniciables en **D1 QA**; nunca borrar D1 prod para testear.
- Métricas por trazas de operación (ID aleatorio no sensible, etapa y código de error): `gps_acquired`, `origin_confirmed`, `route_preview_ok`/fallo, `booking_persisted`, `quote_accepted`. No guardar OTP, PIN, tokens ni datos personales en logs.

## Puertas de salida y orden de trabajo

**Fase 0 — Inventario y congelamiento.** Revisar Workers reales, esquema D1 read-only y workflows. Congelar mejoras estéticas; no tocar producción; establecer baseline reproducible y reversión.

**Fase 1 — Contrato y API.** Definir `LocationV1`, migración aditiva a QA, rutas por coordenadas, compatibilidad de reservas viejas; tests unitarios/de integración.

**Fase 2 — Web y consumidores.** Modificar solo adaptadores de entrada/salida: el formulario, preview y creación utilizan `LocationV1` sin geocodificar por segunda vez. Conservar las pantallas ya aprobadas.

**Fase 3 — QA real y despacho.** E2E contra API + D1 QA de origen/destino/quote/accept/confirm/nuevo pedido; matrices Android+iOS y APK.

**Fase 4 — Promoción controlada.** Snapshot D1/rollback Worker y migración compatible, verificación de API aditiva, despliegue web por commit probado, telemetría y chequeo posterior con no-escritura.

**Fase 5 — Bloqueo permanente.** Activar protecciones obligatorias y retirar workflows de publicación antigua, consolidando un único canal de despliegue.

**Criterio para afirmar «solución consolidada»:** todas las fases 0–5 completadas, E2E verde real con D1 QA y una publicación comprobada. El paso de un test visual o la sola creación de este documento NO permiten esa afirmación.

## Seguridad operativa

Ninguna fase de este ADR autoriza alterar producción, borrar datos o disparar emails reales por cuenta propia. Los primeros pasos son de solo lectura. Todas las modificaciones se harán de modo gradual y con rollback específico de web y API, sin revertir la base de datos a ciegas.
