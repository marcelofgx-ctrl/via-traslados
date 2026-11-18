# Vía Traslados — integración real de web V29 y conductores (V35)

**Auditoría realizada:** 17/11/2026 (Uruguay). **Alcance:** únicamente `via-traslados`.

## Diagnóstico comprobado

- La web productiva `https://viatraslados.com` utiliza `via-traslados-api.marcelof-gx.workers.dev`, con base exclusiva `via-traslados-db`.
- La APK V34 real (compilación [43794980796](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/43794980796), código `a7d93b8`) se construyó con `-PviaCatalogQa=true`, que activa `BuildConfig.VIA_ONLINE_QA` y selecciona `via-traslados-api-qa.marcelof-gx.workers.dev` y `via-traslados-qa-db`.
- Por ello, un traslado creado en producción no aparece en las peticiones de la V34 QA. Es aislamiento intencional y **no** fallo del GPS ni del autorefresco.
- Auditoría no destructiva [44210954172](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44210954172): PROD salud=200, QA salud=200, peticiones sin sesión=401, estado público=200; endpoint de guía de precios avanzado PROD=404 (todavía no desplegado).
- El backend de `main` limita la lista de conductores a viajes asignados. El código avanzado desarrollado en QA contiene reglas de liberación y capacidad de cotizar solicitudes no asignadas con autorización.

## Ramas preparadas y protección del entorno

1. `via-integracion-apk-prod-v35-20261117`, nacida del código exacto de V34 QA. Se agregó la variante `-PviaProduction=true` con paquete independiente `uy.viatraslados.conductor.production`, versión `0.35.0-production-rc1`, rótulo de producción y bloqueo de combinaciones PROD/QA. **Es una candidata DEBUG, no una publicación definitiva ni apta para distribución pública.** Su backend previsto es la API productiva; no expone el administrador QA como puerta de entrada.
2. `via-integracion-despacho-backend-v35-20261117`, nacida de `main`. Recupera únicamente el contrato de despacho avanzado probado en QA (tablas y triggers comerciales, `assignment-rules.js`, `dispatch-business.js`, `dispatch-ops.js`, rutas de operador y administración), más pruebas. No incorpora `qa-entry.js`, `qa-driver-onboarding.js` ni sesiones públicas de prueba. No cambia los archivos visuales de la web ni el motor geográfico.

**Ninguna rama ha migrado D1 de producción ni publicado otro Worker.** La V34 QA, su URL de descarga y su base permanecen aisladas.

## Circuito definido en el código propuesto

- `requested`: solicitud nueva persistida por la web; admin la consulta; socio autorizado puede cotizar; contratado solo si fue liberada o asignada.
- `quoted`: cotización atómica en `booking_quotes`; al cotizar se fija el importe y se adjudica al conductor, con controles de permisos, capacidad y cruces de agenda.
- `accepted`: aceptación explícita del pasajero desde su enlace o sesión; **no** significa confirmación definitiva.
- `confirmed` → `en_route` → `arrived` → `in_progress` → `completed`: progresión del servicio por equipo autorizado; cancelaciones según reglas reales.
- `completed`: registro de comisión en centésimos, por defecto 25% para contratado y 0% para socio, sin cobro centralizado.
- Datos de contacto del pasajero se ocultan a conductores no asignados. Solo el administrador autorizado puede gestionar permisos y asignaciones.
- API sin secretos en el APK, autentificación por cuenta aprobada; los accesos QA de demostración **nunca** deben utilizarse en producción.

## Condiciones obligatorias antes de desplegar

1. Verificar esquema real de `via-traslados-db` **sin leer pasajeros**. Crear respaldo D1 recuperable antes de cualquier `CREATE TABLE`/`CREATE TRIGGER` y probar la migración en una copia de QA. Verificar `PRAGMA foreign_key_check` y preservar usuarios, reservas e históricos.
2. Validar el build del Worker con configuración productiva, secretos existentes y rollback de versión. Evitar afectar el Worker web `via-traslados-web-prod`. El despliegue propuesto es del **backend**, `via-traslados-api`.
3. Verificar acceso privado de administrador fundador (no clave QA pública), cuenta de socio y cuenta de contratado; perfiles comerciales, permisos y asignación/solapamientos. **El registro QA con foto y administrador demo no debe promoverse directamente**: requiere flujo productivo privado y almacenamiento protegido para imágenes reales.
4. Ejecutar E2E de solicitud → cotización → aceptación → confirmación → finalización, primero con usuarios y reservas ficticios en QA; después prueba productiva controlada con consentimiento y limpieza de sus datos de prueba. No insertar reservas ficticias en la D1 real indiscriminadamente.
5. Antes de distribuir la APK a conductores reales: build `release` firmada con clave estable, respaldo de firma, validación en Samsung, instrucciones de actualización, y eliminación de cualquier ruta QA accesible.
6. El refresco de APK abierta no equivale a push remoto. Implementar y probar Web Push/FCM y avisos persistentes por separado, sin prometer recepción con app cerrada.

## Publicación y rollback

Publicar primero backend con migración respaldada, verificar `/api/health`, `/api/operator/requests/:id/price-guide` (401 sin autorización), flujo de permisos y cotizaciones, y sólo después liberar instalador de producción. En incidencia, restaurar la versión anterior del Worker; los cambios de D1 requieren plan compatible (no borrar registros por revertir código). Conservar la V34 QA y la versión web V29, sin cambios en QuickTrip, Mapa, Fila Digital ni otros proyectos.
