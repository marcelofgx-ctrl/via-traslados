# Auditoría Fase 0 — fuente real de producción, D1 y contratos
**Fecha:** 23/11/2026 · **Modo:** EXCLUSIVAMENTE lectura de metadatos y revisión de código. **Workflow:** [45184898004](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45184898004) — `success`.

## Resultado verificado (Cloudflare en producción)

- Worker web activo: `f46757df-8ff2-4653-bec3-e15b8394a99a` (v29.1.16).
- Worker API activo: `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079`.
- D1 `via-traslados-db`, `bookings`: **16 columnas**.
- `bookings` contiene `origin` y `destination` como etiquetas.
- **No** contiene `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`.
- No existe tabla `booking_locations`.
- Sí existe `booking_routes` para distancias calculadas, pero no resuelve la falta de puntos asociados a cada solicitud.
- **No se consultaron filas ni datos personales; solo PRAGMA table_info y metadatos Worker. No se enviaron correos ni se insertaron pedidos.**

## Resultado verificado (código del repositorio)

- `backend/worker.js:validateBooking` descarta los objetos de ubicación; conserva únicamente los nombres de origen y destino.
- `backend/route-estimate.js:publicPreview` recibe `origin`/`destination` como strings y ejecuta una geocodificación propia.
- `store.js:estimateRoute` recibe también únicamente dos strings.
- `tests/prod-core-invariants.mjs` prueba una ruta conocida, no la ruta desde un punto confirmado sin número postal.
- `.github/workflows/via-ui-visual-boundary.yml` revisa PR a `main`, pero no impide por sí solo despliegues manuales desde ramas ajenas a `main`.

## Implicación

La ruta marcada con una chincheta no es todavía el contrato persistente entre toda la aplicación y su API. El sistema puede pasar pruebas visuales y fallar en distancia o en reserva por falta de enlace geográfico. **No es solucionable de forma robusta solo ajustando CSS o el texto de un botón.**

## Decisión de entrada

1. **No cambiar producción** durante este reconocimiento.
2. Tratar `ADR-001` como la especificación para una refactorización aditiva y aislada.
3. Completar auditoría de código web realmente activo frente a `main` y backup inmutable de API/web antes de editar datos.
4. Diseñar el contrato `LocationV1` y su serialización persistida a D1 QA (no prod).
5. Introducir un E2E auténtico `mapa → distancia → reserva → cotización → aceptación → nuevo pedido`, ejecutado contra Worker API real de QA y D1 QA independiente.
6. Añadir la prueba que fallaba: `Avenida Italia sin número pero con coordenadas confirmadas → Aeropuerto de Carrasco`. La distancia debe provenir de esas coordenadas, no del texto.
7. Migración aditiva en QA, prueba de compatibilidad hacia atrás y publicación sólo después de evidencia E2E y rollback operativo.
8. Eliminar rutas de despliegue que no dependan del mismo gate verificado; activar branch protection obligatoria desde los ajustes administrativos de GitHub cuando esté disponible.

## Criterio de no-engaño

Esta auditoría **confirma el problema y documenta la solución**, pero no implementa todavía persistencia de coordenadas, no corrige el error de ruta de la captura y **no garantiza que el siguiente pedido ya funcione**. Reportar la fase como cerrada sólo cuando el E2E reproduzca y supere esos casos contra D1 QA y, después, producción sea verificada sin escrituras de prueba.
