# V31 — Tu conductor por hora (propuesta preliminar)
Base estable: a6d1b893da5fe0da1cdd3319dd3c937976685ac1 (web V30.4.8, APK V35). Esta rama no modifica producción.
- Dos modalidades en Servicios: traslado privado y «Tu conductor por hora».
- Recogida, inicio, duración con accesos 2/4/8 h y valor personalizado, pasajeros, equipaje, recorrido previsto opcional. Sin destino obligatorio. No confundir duración contratada con ETA de carretera.
- Prototipo estático con estado en memoria y dos vistas que simulan solicitud, cotización y aceptación. Ningún acceso a API/D1, OTP, GPS ni reservas reales. No es una APK instalable.
- Integración futura: introducir serviceType=hourly (default point_to_point para históricos), requestedDurationMinutes y itineraryNotes. Presupuesto debe conservar precio, duración incluida, km incluidos opcionales y condiciones de extras. Validar reglas en API, no sólo frontend. La APK V35 usa MainActivity.java con tarjetas y quote(item); añadir distinción y ventana horaria, no inventar km/ruta si no existe destino. Al aceptar, asignación atómica y comprobación de solapamiento de agenda en servidor, tiempos y estados compatibles. Preservar comisión del 25% para contratados conforme a reglas vigentes. No cambiar flujo normal. No migrar D1 hasta revisar esquema efectivo y respaldar. Probar QA web/API/APK aisladas y regresión del servicio normal.
- Decisiones abiertas: mínimo y máximo comercial, kilometraje y extras, política de cancelación, zona y habilitaciones aplicables; precios manuales sin tarifa inventada. No habilitar venta comercial hasta verificar normativa y completar pruebas.

## V31.0.1 — identidad comercial aprobada
Nombre visible: «Tu conductor por hora». Subtítulo: «Tu tiempo, tus paradas, tu recorrido.» Se aplica también a la etiqueta de la vista conductor. Sin cambios de lógica ni de tarifas.
