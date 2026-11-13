# Vía Traslados · despacho comercial V29 QA (13/11/2026)

## Reglas operativas solicitadas

- El administrador fundador decide los permisos de cotización general y liberación por cuenta, y la modalidad comercial interna de cada conductor.
- **Socio**: comisión inicial 0 %, ve y puede cotizar solicitudes generales si el fundador habilita `canQuoteAll`; puede liberar solicitudes si habilita `canRelease`. No se otorga automáticamente a todo conductor registrado.
- **Contratado**: comisión predeterminada 25 % sobre la tarifa ofertada (base bruta); ve solicitudes **solo cuando fueron liberadas** o cuando ya tiene una adjudicada. El fundador puede modificar el porcentaje; los cambios no deben divulgar el tipo de contrato al conductor.
- Inicialmente: configurar la cuenta real del administrador y una segunda cuenta aprobada/habilitada con la misma posibilidad de cotizar. No conceder accesos antes de verificar sus identidades.
- Cada cotización es una adjudicación: la inserción en `booking_quotes` pasa por un trigger `BEFORE` de autorización y solapamiento, y otro `AFTER` asigna al conductor y marca la solicitud como `quoted`. Solo hay una cotización válida por reserva.
- **Cotizada ≠ aceptada ≠ confirmada.** La aceptación del pasajero sigue siendo explícita. El conductor no debería ver una confirmación anticipada.
- Liberar una solicitud requiere permiso y solo opera sobre `requested` sin conductor. No cambia por sí solo ningún presupuesto.
- Contacto personal del pasajero se oculta a los conductores hasta su asignación. Admin conserva el acceso completo.

## Modelo SQL (D1 solo de este proyecto)

- `driver_commercial_profiles`: modo, cotizar general, liberar, comisión en puntos básicos, actualización.
- `booking_dispatch_releases`: apertura de cada viaje a contratados.
- `booking_quotes`: conductor y monto adjudicado; comisión bloqueada en el momento de cotizar.
- `booking_commission_ledger`: importe devengado solo con estado `completed`, tasa, centésimos y referencia de liquidación (manual). Comisiones de socios 0 % se registran como dispensadas.
- Un cambio de conductor luego de la cotización aplica para la liquidación la tasa vigente del conductor final, en vez de atribuirle la anterior.
- `service_settings`: parámetros propios del sistema de sugerencias. No representan tarifas oficiales ni tarifas publicadas de GetTransfer.

## Ejemplo de guía orientativa

Referencia del usuario: un ejemplo de GetTransfer para viaje de 185 km / 146 min mostraba banda USD 90–216 y una comisión 37 % en esa plataforma. **No se reutiliza como tarifa oficial ni se infiere un esquema de cobro de GetTransfer fuera de esa captura.**

Propuesta configurable Vía Traslados en UYU:
`base 300 + 25 * km + 4 * min`; mínimo sugerido 850; piso inferior 650; banda inferior 75 % y superior 155 % del sugerido, redondeada a decenas. Para 185 km/146 min: mínimo $ 4.130, sugerido $ 5.510, máximo $ 8.540. La guía es aproximada, sin contemplar retorno vacío, peajes, espera, estacionamiento, fines de semana, temporadas, capacidad y costos reales. El conductor escribe libremente el presupuesto que enviará.

Comisión contractual de ejemplo sobre 5.510 UYU: `5510 * 0.25 = 1377.50 UYU`; neto conductor `4132.50 UYU`. Estos importes son antes de costos del vehículo, impuestos o comisiones de cobro.

## Limitaciones de V29

- No se cobra automáticamente: se registra la obligación al cerrar un viaje y el administrador puede marcar como recibido un pago con referencia. Conectar pasarelas, facturación electrónica y conciliación de medios de pago requiere trabajo aparte.
- El calculador es orientativo y parametrizable por el fundador, nunca debe bloquear de forma silenciosa una oferta fuera del rango.
- No se ha implementado localización GPS/presencia ni notificación push fuera de la app para liberaciones.
- La APK V29 Demo tiene package `uy.viatraslados.conductor.v29preview`; muestra operaciones simuladas, nunca contacta Worker/D1 ni reemplaza V28.
- Todas las rutas y cambios de este desarrollo están en rama QA, sin migraciones remotas ni alteraciones de viatraslados.com, otras apps o reservas de producción.

## Pendientes antes de producción

1. Test de integración contra **Worker y D1 QA aislados**, con varias cuentas reales de prueba y permisos fundador vs socio vs contratado.
2. Prueba de dos cotizaciones concurrentes y del historial auditable de liberaciones y cambios de modalidad.
3. Prueba de respuesta pasajero, confirmación y cierre para verificar devengo correcto.
4. Diseño de liquidación/recibo fiscal, comprobante y política de cancelaciones o no presentación.
5. Firma Android persistente y compatibilidad de actualizaciones sobre la APK ya instalada.
6. Validación visual Samsung, accesibilidad, textos y precios reales antes de liberar.
