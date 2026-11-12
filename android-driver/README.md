# Vía Traslados – APK conductor QA

Aplicación Android Java **independiente** del proyecto Quick Trip, conectada exclusivamente con `via-traslados-api`. Se crea en la rama `android-conductor-qa` y **no** modifica el backend ni la web pública.

**Características:** clave privada ingresada manualmente (no se almacena), solicitudes nuevas, cotizaciones en pesos uruguayos, ofertas enviadas, reservas aceptadas, gestión de estados del viaje, mapa/ruta mediante Google Maps, llamada al teléfono del pasajero, historial y actualización cada 20 segundos mientras la app está visible.

**Nuevo en QA v0.2.0:** al detectar un presupuesto aceptado por el pasajero, aparece una tarjeta blanca desde abajo con recorrido e importe, y accesos a «Ver reserva» e «Ir a confirmar». El conductor debe confirmar expresamente: el aviso nunca confirma el viaje por sí solo. Un indicador en la barra superior muestra el número de propuestas aceptadas todavía pendientes; el aviso se muestra una sola vez por reserva en ese dispositivo.

**Limitaciones QA:** los mensajes y notificaciones push remotas con la APK cerrada no están implementados. El aviso local funciona solo cuando la aplicación está abierta y puede consultar las reservas. No hay pagos, asignación automática de conductores, comisiones ni cálculo automático de precios. La ruta abre la app Google Maps para mostrar indicaciones. El panel depende del API y su secreto `OPERATOR_KEY_HASH`, no incluido en el código ni en la APK. El pasajero acepta una oferta desde la web.

**Compilación:** GitHub Actions compila `android-driver/app/build/outputs/apk/debug/app-debug.apk`. Para instalar habilitá «Instalar apps desconocidas» únicamente para el origen que uses. La APK de depuración es para pruebas internas, no para Play Store ni distribución pública.

**Seguridad:** HTTPS obligatorio, login en memoria, no copias de clave a disco, `allowBackup=false`, sin acceso a contactos ni ubicación ni cámara, sin permisos de llamadas directas. Usa `ACTION_DIAL` para mostrar el número y deja la llamada en manos de la persona.

**Descarga QA v0.2.0:** https://github.com/marcelofgx-ctrl/via-traslados/releases/tag/via-conductor-qa-v0.2.0
