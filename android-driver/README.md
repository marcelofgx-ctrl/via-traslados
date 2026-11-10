# Vía Traslados – APK conductor QA

Aplicación Android Java **independiente** del proyecto Quick Trip, conectada exclusivamente con `via-traslados-api`. Se crea en la rama `android-conductor-qa` y **no** modifica el backend ni la web pública.

**Características:** clave privada ingresada manualmente (no se almacena), solicitudes nuevas, cotizaciones en pesos uruguayos, ofertas enviadas, reservas aceptadas, gestión de estados del viaje, mapa/ruta mediante Google Maps, llamada al teléfono del pasajero, historial y actualización cada 30 segundos mientras la app está visible.

**Limitaciones QA:** los mensajes y notificaciones push no están implementados. No hay pagos, asignación automática de conductores, comisiones ni cálculo automático de precios. La ruta abre la app Google Maps para mostrar indicaciones. El panel depende del API y su secreto `OPERATOR_KEY_HASH`, no incluido en el código ni en la APK. El pasajero acepta una oferta desde la web.

**Compilación:** GitHub Actions compila `android-driver/app/build/outputs/apk/debug/app-debug.apk`. Para instalar habilitá «Instalar apps desconocidas» únicamente para el origen que uses. La APK de depuración es para pruebas internas, no para Play Store ni distribución pública.

**Seguridad:** HTTPS obligatorio, login en memoria, no copias de clave a disco, `allowBackup=false`, sin acceso a contactos ni ubicación ni cámara, sin permisos de llamadas directas. Usa `ACTION_DIAL` para mostrar el número y deja la llamada en manos de la persona.
