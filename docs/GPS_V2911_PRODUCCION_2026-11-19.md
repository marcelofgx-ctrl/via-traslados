# Vía Traslados — V29.1.1 GPS Chrome publicada en producción

**Fecha:** 19 de noviembre de 2026 (Uruguay).
**Estado:** PUBLICADA y comprobada. La web anterior V29.1.0 conserva su versión para rollback.

## Incidencia
Captura del navegador Chrome en Android con origen «Punto de recogida sin dirección confirmada», referencia GPS e incertidumbre **±2.000 m**. El navegador sí entregaba posición, pero era demasiado imprecisa para identificar calle/número. No se debe convertir una posición así en una puerta real.

**Causa técnica en la versión activa:** `reference.js?v=26` leía una sola vez `navigator.geolocation.getCurrentPosition()` con `enableHighAccuracy:true`. Si Chrome entregaba una lectura inicial de baja calidad, el código usaba esas coordenadas de inmediato y mostraba la advertencia. El motor inverso IDE Uruguay sí respondía 200 con calles/portales en coordenadas conocidas; no era una caída de Geoapify/IDE.

## Corrección puntual
- Nuevo `reference.js?v=27` usa `watchPosition()` solo cuando el pasajero toca el botón de GPS. Escucha varias lecturas durante **máximo 18 s**, registra la mejor y termina temprano si alcanza **≤100 m**.
- Si la precisión sigue mala, muestra una advertencia y pide activar ubicación precisa o elegir origen en el mapa; **no afirma un domicilio que el GPS no puede justificar**.
- Conserva la detección de Uruguay, el reverse geocoding de IDE, `buildPickupDisplay()` del motor geográfico y la protección existente que impide reemplazar una dirección que el usuario haya escrito después de iniciar la consulta.
- La ubicación nunca se solicita automáticamente al abrir el sitio.
- Solo se cambió `index.html` (meta versión 29.1.1 y enlace `reference.js?v=27`) y `reference.js`. API V35, D1, APK V35 y todos los demás activos se copiaron desde la versión efectivamente activa, sin modificaciones de bytes.

## Publicación exacta y rollback
- **Web antes:** V29.1.0, Worker version ID `49313136-3544-4e5c-a010-2efc201de6f1` (deployment `6b2d546f-0df1-4ee6-bf21-0092495bf40d`).
- **Web después:** **V29.1.1**, Worker `via-traslados-web-prod` version ID **`0043d931-e3cc-444a-966c-7e760d13f792`** (deployment `b54dd824-9c87-4663-b7a0-dc779b91b835`).
- **API V35 sin cambios:** `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079`.
- **Rollback directo a V29.1.0:** activar **`49313136-3544-4e5c-a010-2efc201de6f1`** en Cloudflare, Worker `via-traslados-web-prod`. El anterior checkpoint V29 `ec35bd52-b832-4cff-bcb2-6a6b84c34c79` sigue documentado como versión previa, pero NO es el retorno inmediato de esta corrección.
- SHA-256 motor `geo-v2/core.mjs?v=3` intacto: `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1`.
- SHA-256 APK V35 intacta: `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3`.
- SHA-256 `config.js` intacta: `51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273`.
- SHA-256 `reference.js` antes: `a184e955c0d3d4f13c67f858093ae648cc54a60e218ecd6c6c84ab4d8b46868f`; después: `ef28049b873c228284787f0865982a06ce562b93759a97dec5676e18f6166680`.

## Pruebas ejecutadas
- Auditoría activa solo lectura y reverse IDE Uruguay con 200: GitHub Actions `44624921422`.
- QA GPS aislada: `44626223197`, success. Chrome con lecturas sintéticas ±2.000 m→±35 m y viewport 320,360,390,412; cero sobrescritura de dirección manual; sin rutas D1 prod.
- **Publicación y postdeploy**: `44626964740`, **success**. Verificó antes de desplegar que el Worker web era V29.1.0 y la API V35; desplegó solo web y registró manifest; verificó nueva V29.1.1, hashes Geo/APK/config, API saludable; luego Chrome real contra `https://viatraslados.com/` en 320,360,390,412 con sensor geográfico simulado. Artefacto de evidencias `via-gps-v2911-production-proof`, retención 90 días.
- **Limitación real:** una prueba con GPS simulado no garantiza que el Android de una persona obtenga señal mejor. Si Chrome/Android tiene permisos aproximados, poca señal, ahorro de batería o ubicación inexacta, seguirá apareciendo la advertencia. No se convierte ubicación incierta en una dirección postal.

## Procedimiento de prueba manual
Abrir https://viatraslados.com/ en Chrome, recargar la portada, activar localización precisa del sitio y del teléfono, tocar ◎ en origen. Debe mostrar «Mejorando precisión…» si empieza con ±2.000m; si el teléfono obtiene mejor posición, utiliza la lectura nueva y una referencia de IDE. Si no mejora, marcar el punto en el mapa o escribir la dirección.

**No se ejecutó rollback**: publicación y controles terminaron exitosamente. Ninguna migración de D1 ni modificación de API/APK fue realizada.
