# Vía Traslados: actualizaciones automáticas asistidas de APK (QA)

## Alcance

- Se prepara la próxima APK de Vía Traslados **sin intervenir en Quick Trip, Mapa, Fila Digital u otros repositorios**.
- La APK consulta, al regresar a primer plano, un manifiesto `latest.json` en el centro oficial QA, como máximo una vez cada seis horas, y muestra un aviso solo si `versionCode` aumenta.
- En Ajustes incluye «Buscar actualizaciones».
- Tras pulsar «Actualizar» usa Android DownloadManager y valida SHA-256, ID de paquete y `versionCode` antes de abrir el instalador.
- **No existe instalación silenciosa** para una APK común distribuida fuera de Google Play: Android solicita autorización.
- El archivo manifest y APK deben estar accesibles sin una cuenta privada GitHub.

## Estado al 12/11/2026

- Versión descargable actual: etiqueta de distribución `via-conductor-qa-v0.2.0`, pero la APK tiene **versionCode 10**, `applicationId uy.viatraslados.conductor.autoprecalcqa` (la etiqueta 0.2.0 no coincide con el nombre interno del build).
- Rama fuente del actualizador: `via-actualizaciones-apk-qa-20261112`. QA compila versionCode 11, versionName 0.3.0-qa.
- Rama del centro de descargas: `via-apk-descarga-qa-20261112`. Allí se guarda `qa-apk-download/latest.json`, `SHA256SUMS.txt` y APK.
- Web de descargas en Vercel: `https://via-conductor-apk-qa.vercel.app/`.
- La segunda web Cloudflare Pages no se pudo activar automáticamente: el token GitHub para Cloudflare carece de permisos de Pages; no afecta la web Cloudflare existente.

## IMPORTANTE: clave de firma digital estable, imprescindible antes de distribuir 0.3.0

GitHub Actions genera por defecto una clave `debug.keystore` efímera en cada runner. Por eso **no es seguro confiar en que dos APK QA compiladas en días distintos puedan actualizarse entre sí**.

Antes de distribuir v0.3.0 se necesita crear una clave de firma de QA estable, resguardarla fuera del repositorio y configurarla como secretos en el entorno CI:
- `VIA_ANDROID_KEYSTORE_B64`: fichero keystore codificado en base64, no imprimirlo en logs.
- `VIA_ANDROID_STORE_PASSWORD`.
- `VIA_ANDROID_KEY_ALIAS`.
- `VIA_ANDROID_KEY_PASSWORD`.

No enviar secretos ni archivo `.jks` a conversaciones ni subir al repositorio. No compartir esta firma QA con otras aplicaciones.

**Migración una sola vez:** si v0.2.0 fue firmada con clave debug distinta, Android rechazará reemplazarla directamente por la primera versión firmada con la clave nueva. Hay que comprobar la firma de la instalada. Si no coinciden, el usuario deberá desinstalar y reinstalar una vez (desinstalar elimina datos locales: recordar credenciales / huella y login; el backend de reservas permanece independiente). A partir de entonces conservar la misma clave para actualizaciones sucesivas.

## Protocolo de publicación para cada versión

1. Incrementar `versionCode` y actualizar `versionName`, conservando `applicationId` y misma clave de firma.
2. Compilar, probar inicio, autenticación, actualización, estado de reservas y seguridad. **No publicar una APK debug con firma efímera.**
3. Publicar APK firmada en el centro de descargas QA y generar su `SHA256SUMS.txt`.
4. Solo después de confirmar que el archivo es accesible, actualizar de forma atómica `latest.json` con `versionCode`, SHA-256, URL exacta y notas del cambio. No anunciar versiones que aún no están publicadas.
5. Probar descarga anónima, checksum, ID, firma y subida de versión en un teléfono Android.
6. La APK instalada consulta `latest.json`; presenta un aviso al detectar una versión superior. El usuario confirma la descarga y Android confirma la instalación.
7. Conservar el APK previo y una estrategia de rollback. Android no permite instalar un `versionCode` menor como actualización convencional.

## Seguridad y limitaciones

- HTTPS obligatorio. No se aceptan direcciones APK fuera del host autorizado.
- Descarga con SHA-256 y verificación del paquete. Android también verifica la firma criptográfica.
- Nunca se incluyen claves API ni secretos de la cuenta en la APK o en `latest.json`.
- Las actualizaciones se consultan cuando la app está abierta; no requieren un servicio residente ni consumo continuo de batería.
- El mecanismo solo corresponde al APK del **conductor**. Las actualizaciones de la PWA pública son independientes.
- No desplegar versiones nuevas a `viatraslados.com`, Cloudflare D1 o Worker API sin plan de pruebas y autorización específica.
