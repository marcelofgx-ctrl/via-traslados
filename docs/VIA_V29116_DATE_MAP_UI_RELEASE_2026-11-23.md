# Vía Traslados v29.1.16 — fecha completa y referencia del mapa en dos líneas

**Fecha:** 23/11/2026  
**Producción:** https://viatraslados.com/  
**Worker web productivo:** `f46757df-8ff2-4653-bec3-e15b8394a99a`  
**Rollback inmediato:** v29.1.15 `e7830749-95f0-4a0e-8781-0e2ae6a19466`, únicamente Worker `via-traslados-web-prod`.

## Pedido y resultado

El usuario confirmó con capturas reales que la dirección del mapa se trasladaba bien a portada, pero pidió dos ajustes finales: mostrar **la fecha completa**, con los cuatro números del año, y separar en dos líneas la dirección y la leyenda «N.º orientativo · A unos 3 m». También pidió medidas permanentes para que futuras mejoras visuales no rompan GPS, geocodificador, reservas ni sesiones.

Se ejecutó una edición visual mínima sin rediseño del mapa ni de «Mis reservas».

## Archivos cambiados en el Worker

- `index.html`: nuevo indicador v29.1.16; URL del selector con parámetro `v=28`; referencias a los dos nuevos activos visuales con caché de versión.
- `map-point-picker.js`: **única** diferencia funcionalmente no significativa: `showReference(result)` compone la misma etiqueta en dos nodos `span.via-reference-street` y `small.via-reference-detail`. Se preservan sin un byte diferente el GPS, cálculo de coordenadas, reverse geocoding, parser de números de puerta, timeouts, eventos y confirmación del punto.
- `via-v29116-visual.css` (**nuevo**): presentación de dos renglones sin recorte y espacio visual de fecha dentro de la misma tarjeta. No cambia la estructura general ni el mapa base.
- `via-v29116-date-ui.js` (**nuevo**): salida visible `dd/mm/aaaa` **solo de lectura** desde `input type="date"`. El control nativo permanece clicable y accesible, conserva fecha ISO y validación; sincroniza `change`/`input`, retorno del historial y reactivación del navegador, sin temporizadores periódicos ni llamadas de red.

**El inventario productivo contenía 57 activos. Se cambiaron solo dos existentes (`index.html`, `map-point-picker.js`) y se agregaron dos visuales.** El builder obliga a un diff exacto del único bloque `showReference`. No se editaron `app.js`, `reference.js`, `geo-v2/core.mjs`, `address-autocomplete.js`, `store.js`, `passkeys.js`, API, D1, ni APK conductor.

## QA y evidencias

- [QA integral 45162769026](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45162769026): **83/83 PASS**:
  - 8 pruebas de fecha legible completa en Chrome Android y WebKit/iOS de 320, 360, 375, 390, 412 y 430 px. Se midió el ancho real del texto y su zona visible; comprobado que el `input type=date` nativo sigue siendo el único valor persistido, y el retorno desde BFCache.
  - 18 pruebas en motor real Leaflet y navegadores Android/iOS: calle sin número, número orientativo, mapa sin respuesta postal, expiración de reverse geocoding, coordenadas reales, y presentación en dos renglones.
  - 42 regresiones de pedido nuevo/GPS, 8 de login/teclado y 7 de «Mis reservas» (activa/historial, paginación, sin scroll).
  - E2E de QA utiliza datos de usuarios y reservas ficticios y bloquea peticiones a `/api/*`: cero escrituras en D1 productiva.
- [Prueba adicional iOS WebKit 45162585892](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45162585892): 4 fechas + 6 pruebas del mapa en imagen de navegador con WebKit preinstalado, todo aprobado.
- Artefactos: capturas `via-v29116-date-proof` y `via-v29116-map-proof`, además de manifiesto de hashes del build.

## Publicación y recuperación

- [Release productiva 45163423809](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45163423809): **SUCCESS**, Worker `f46757df-8ff2-4653-bec3-e15b8394a99a`.
- La publicación exigió prueba de GitHub Actions real: `QA_RUN_ID=45162769026` con SHA probado `9649bec79decfae85630ea218834131643c2192d`, 83/83, y comprobó que los archivos de implementación no se alteraron entre QA y producción.
- Comprobaciones `VIA_V29116_PRODUCTION_VERIFIED` y `PROD_CORE_INVARIANTS_PASS OTP_CONFIG_CORS_ROUTE_GEO_FRONTEND_APK`.
- **No** se probó el envío real de correo OTP ni se crearon reservas verdaderas como parte de las pruebas automatizadas.
- Rollback: reasignar 100 % del tráfico de `via-traslados-web-prod` a `e7830749-95f0-4a0e-8781-0e2ae6a19466` (v29.1.15), sin retroceder D1 ni Worker API.

## Protección para las próximas versiones

- Documento permanente [VIA_UI_SAFETY_CONTRACT_2026-11-23.md](https://github.com/marcelofgx-ctrl/via-traslados/blob/main/docs/VIA_UI_SAFETY_CONTRACT_2026-11-23.md) en `main`.
- Control automático de frontera visual agregado a `main`: `.github/workflows/via-ui-visual-boundary.yml` + `scripts/via-ui-visual-boundary.mjs`. Ante PR a `main`, impide mezclar CSS/visual con modificaciones de motor geográfico, backend, autenticación y otras rutas protegidas. **Este workflow no despliega.**
- Cada versión productiva se publica solamente tras reconstruir desde el Worker efectivo, hashes SHA256, QA aislada real Android/WebKit, aprobación con SHA de QA, Wrangler `--dry-run`, smoke productivo y rollback específico de web.
- Para que los PR requieran obligatoriamente el check `Visual boundary safety`, hay que activar **Require status checks to pass** en Branch Protection de GitHub. La conexión actual no tiene permisos de administración para establecer esa regla desde el chat. Esta limitación no afecta al gate efectivo de la release v29.1.16.

## Validación en el móvil

1. Abrir https://viatraslados.com/ y comprobar que la fecha muestre todos los números de `dd/mm/aaaa`.
2. Tocar la fecha: debe conservarse el selector nativo de Android/iOS.
3. Abrir el origen en el mapa, ajustar la chincheta y comprobar que la calle y la leyenda «N.º orientativo · A unos … m» estén en **dos renglones**.
4. Confirmar el punto y comprobar que la dirección siga apareciendo en la portada con `n.º aprox.`. Esta última validación del dispositivo real complementa, no sustituye, los tests simulados.
