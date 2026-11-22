# Vía Traslados — V29.1.14 · Pedido nuevo y dirección GPS (22/11/2026)

## Resultado

**Publicado en producción web**: https://viatraslados.com  
**Worker web activo confirmado por Cloudflare**: `d3f863be-575c-40eb-902b-96818085bb66`  
**Rollback inmediato**: V29.1.13 `2f2407d8-d665-47c6-9b14-edf7655b00a4` (exclusivamente `via-traslados-web-prod`).

## Problema reproducible

La portada `reference.js` únicamente copiaba origen/destino al asistente si la caja de portada no estaba vacía. Así, al volver a iniciar una solicitud, podían sobrevivir en el formulario direcciones, coordenadas y notas del pedido anterior. El cálculo vial usaba también la clave de la última ruta y estado asíncrono previo.

El GPS ya utilizaba `watchPosition({enableHighAccuracy:true,maximumAge:0})` ante clic explícito. No había necesidad de un `setInterval`/hilo permanente: el servicio de reversa puede retornar solo calle, y el número postal cercano nunca es una confirmación automática de la puerta.

## Corrección quirúrgica

- `reference.js`: al pulsar `Solicitar traslado`, reinicia el formulario de pedido y metadatos de direcciones antiguas, **pero conserva la sesión autenticada**. Copia datos desde la portada incluso cuando origen/destino estén vacíos; no hereda coordenadas de otro pedido.
- Tras recuperar una página previamente abierta desde el historial del navegador (`pageshow.persisted`), elimina el borrador anterior y actualiza fecha inicial. No borra cuenta, credenciales, sesión ni perfil.
- `app.js`: invalida estimaciones viales tardías (`routePending`), descarta la clave `tripLast` y los datos transitorios OTP/Turnstile del **borrador**, sin cerrar ni invalidar la sesión real del usuario.
- `reference.js`: cada uso consciente de `Cerca de mí` solicita GPS nuevo y una búsqueda inversa. Si el geocodificador solo identifica calle, se muestra **Confirmá el número** con opción de elegir el punto en el mapa. Si hay portal cercano, se identifica como **Número orientativo**, no puerta exacta. Los números de nombres de vías como `Ruta 8` no se clasifican como portal. Un número GPS orientativo viejo solo se conserva 120 s y cuando se comprueba que continúa dentro de la misma calle/posición.
- Las búsquedas de reversa atrasadas no sobrescriben un origen escrito manualmente; conserva el control existente de cancelación por cambios del usuario.
- Sin polling ni requests de geolocalización en segundo plano.
- La portada `index.html` cambia solo etiqueta v29.1.14 y parámetros `app.js?v=29.14` / `reference.js?v=31` para evitar caché de código anterior.

No se editó `geo-v2/core.mjs`, `address-autocomplete.js`, `store.js`, `passkeys.js`, `mis-reservas.html` ni archivos de diseño. Se retuvo el aspecto aprobado de `Mis reservas` V29.1.13.

## QA y evidencia

- Fuente productiva verdadera: [snapshot auditada V29.1.13](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45050566643), `audit/live-v29113/manifest.json` y archivos exactos.
- QA aislada: [Workflow 45051657505](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45051657505), **57/57 PASS**:
  - 42 casos distribuidos en Chrome Android 320/390/412 px y WebKit iOS 375/390/430 px: limpiar pedido anterior, conservar nuevas direcciones y coordenadas, retorno de historial, calle sin número, portal orientativo, calle `Ruta 8`, refresco explícito de GPS y respuesta tardía ignorada.
  - 8 regresiones de teclado/login y 7 de `Mis reservas`, historial, paginación y no-scroll.
  - Imágenes de ambas variantes de dirección en artefacto `via-v29114-fresh-booking-gps-qa-android-ios`, junto con manifiesto de hashes.
- **QA nunca consultó ni modificó API/D1 productivos:** el Worker de stage devuelve 503 para `/api/*`; Playwright intercepta requests y entrega datos ficticios.
- Chromium Android usó una ubicación simulada del propio navegador; en WebKit headless se simuló solo la interfaz del sensor GPS debido a que su dispositivo virtual no produjo la posición. Los flujos JavaScript y DOM sí corrieron en el motor WebKit real. No se probaron iPhone/Android físicos.

## Publicación y retorno

- [Release productiva 45051964169](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45051964169), **SUCCESS** y log `VIA_V29114_PRODUCTION_VERIFIED d3f863be-575c-40eb-902b-96818085bb66`.
- El build obtuvo 56 activos productivos; **solo** cambió `index.html`, `app.js` y `reference.js`, y preservó los demás byte a byte por checksum.
- Smoke postpublicación `PROD_CORE_INVARIANTS_PASS OTP_CONFIG_CORS_ROUTE_GEO_FRONTEND_APK`. La entrega real de emails OTP no se probó y no se crearon reservas de producción para validar UI.
- En caso de regresión, seleccionar en Cloudflare el Worker web previo `2f2407d8-d665-47c6-9b14-edf7655b00a4`, 100 % del tráfico. **Nunca** revertir Worker API ni D1 como parte de este cambio. La web y API tienen ciclos de publicación separados.

