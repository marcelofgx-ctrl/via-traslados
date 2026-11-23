# Vía Traslados — mapa y dirección GPS v29.1.15

**Fecha:** 23/11/2026  
**Publicación web:** https://viatraslados.com/  
**Cloudflare Worker activo:** `e7830749-95f0-4a0e-8781-0e2ae6a19466`  
**Rollback inmediato:** v29.1.14 `d3f863be-575c-40eb-902b-96818085bb66` (solo Worker `via-traslados-web-prod`).

## Problema observado por el usuario en Android

Las capturas en producción mostraban:

1. Portada: `Punto de recogida sin dirección confirmada` y simultáneamente panel `Confirmá el número — Encontramos la calle`, incluso sin calle proporcionada por el geocodificador.
2. Selector: `SELECCIÓN PRECISA · QA` visible en sitio productivo.
3. Selector: `Identificando la dirección cercana…` sin resultado útil visible; el mapa sí mostraba coordenadas y etiquetas cartográficas que **no prueban** una puerta geocodificada.
4. Mensajes de ayuda demasiado altos, y campo de fecha angosto en móvil.

## Corrección

- `reference.js`: separa correctamente **calle no identificada** (avisar `Confirmá el punto`), **calle identificada sin portal** (`Número por confirmar`) y **portal próximo no certificado** (`Número orientativo`). No inventa puertas desde etiquetas del mapa.
- `map-point-picker.js`: elimina la etiqueta QA del encabezado, muestra calle solo cuando hay datos reales de reversa, conserva expresamente el nombre completo de rutas numeradas como `Ruta 8`, y nunca equipara un número cercano a la puerta del pasajero.
- Al mover la chincheta, la resolución inversa dispone de un límite visible independiente de 6,2 s, además de la cancelación de red. Si la consulta se demora o falla, la pantalla muestra que la dirección sigue pendiente, pero permite **confirmar coordenadas**. Las respuestas tardías no sobreescriben el estado actual de otro punto.
- Tras una búsqueda inversa ya finalizada o vencida, la confirmación no repite obligatoriamente una consulta inútil; las coordenadas siguen siendo la fuente efectiva del punto.
- Nuevo `via-v29115-map-ui.css`: compacta el panel GPS en portada y mejora el espacio disponible para fecha en Android/iOS sin alterar tarjetas, login ni `Mis reservas`.
- `index.html`: versión `v29.1.15` y parámetros nuevos de caché para selector/GPS. 
- **No** hay geolocalización continua ni hilo de refresh. Solo se consulta GPS cuando se solicita explícitamente.

## Auditoría de código efectivo

- <https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45153856355> — snapshot GET-only de los archivos reales productivos v29.1.14, archivada en `audit/live-v29114/`.
- Reconstructor recuperó **56 activos** originales y preservó hashes. Archivos existentes modificados: solo `index.html`, `reference.js`, `map-point-picker.js`. Un CSS nuevo.
- Se conservaron literalmente `app.js`, `store.js`, `passkeys.js`, `geo-v2/core.mjs`, la configuración y la APK V35.

## QA

- <https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45157380151> — **75/75 PASS** con motores Chrome Android y WebKit/iOS, stage sin API productiva:
  - 18 pruebas mapa real Leaflet/GPS: calle desconocida, calle sola, portal orientativo, retirada de QA, watchdog de reversa y confirmación de coordenadas en Android 320/390 px y iOS 375 px.
  - 42 regresiones pedido nuevo/BFCache/GPS.
  - 8 regresiones de teclado/inicio de sesión y 7 de `Mis reservas`.
  - Los datos de reservas, sesiones y geocodificación se simularon en el navegador. No se enviaron OTP reales ni se insertaron pedidos.
  - El pin de Leaflet se valida con tolerancia geográfica de ~1 m debido a redondeos del punto mostrado; se conservan todos los decimales de la coordenada elegida.
- <https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45157417688> — verificación adicional en imagen oficial preinstalada de WebKit, **27/27 PASS** (6 mapa +21 pedidos nuevos).

## Producción y rollback

- <https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45157921824> — **SUCCESS**, v29.1.15 publicada.
- Cloudflare confirmó `VIA_V29115_PRODUCTION_VERIFIED e7830749-95f0-4a0e-8781-0e2ae6a19466`.
- `PROD_CORE_INVARIANTS_PASS OTP_CONFIG_CORS_ROUTE_GEO_FRONTEND_APK`. **No** se comprobó la entrega real de correos OTP.
- Rollback: asignar tráfico del Worker `via-traslados-web-prod` 100 % a la versión `d3f863be-575c-40eb-902b-96818085bb66` (v29.1.14). **No** revertir API, D1, sesiones o APK.
- No se hicieron escrituras en D1 ni solicitudes de reserva de prueba a producción por parte de los tests.

## Prueba recomendada en teléfono real

En https://viatraslados.com/, pulsar `Cerca de mí`. Si devuelve solo coordenadas, debe aparecer **Confirmá el punto** (sin afirmar que encontró calle). En el mapa deben verse coordenadas y encabezado sin `QA`. Si no hay domicilio identificado, la chincheta debe poder confirmarse igualmente y guardarse como coordenadas GPS/mapa. Si el proveedor sí devuelve un portal cercano, se presenta expresamente como **orientativo**.

La exactitud de un número postal no puede garantizarse por el mero dibujo de un número en la cartografía; requiere datos verificados o confirmación del usuario.
