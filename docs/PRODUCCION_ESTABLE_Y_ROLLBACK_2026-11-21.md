> **Referencia vigente (25/11/2026):** [V30.4.8 / APK V35](PRODUCCION_ESTABLE_V30.4.8_2026-11-25.md). Las entradas de abajo son históricas.

# Vía Traslados — Congelamiento de producción y rollback (21/11/2026)

## ESTADO PRODUCTIVO VIGENTE — v29.1.11 (22/11/2026, Uruguay)

**Esta versión sustituye los estados históricos de v29.1.10 y anteriores listados más abajo.**

| Elemento | Estado verificado |
| --- | --- |
| Web pública | https://viatraslados.com — **v29.1.11** |
| Worker web al 100 % | `via-traslados-web-prod` — `f5d43ef0-1a28-4bce-a078-6fb364399e72` |
| Rollback web inmediato | **v29.1.10** — `ca5d72af-db3e-43ab-8476-727e44271e50` |
| API, D1, clientes, reservas, OTP, passkeys y APK V35 | Sin modificaciones |

**Corrección exacta de la referencia del usuario:** logo `V` y `vía traslados` en **una misma línea**, botón `← Inicio` compacto **76–84 px** y sin efecto 3D exagerado, eliminación del gran marco blanco alrededor de la vista autenticada (lienzo verde menta abierto), bienvenida con inicial real y líneas topográficas conservadas, tarjetas con elevación y sombras perceptibles, flechas redondas verde esmeralda con icono blanco, pestañas y paginación compactas. Se conserva **no scroll general**, el flujo de teclado Android/Chrome e iOS/WebKit, la autenticación biométrica real, el correo OTP y los datos de cada pasajero. No se incorporan foto de usuario inexistente ni campana ficticia.

Sólo se añadió **un archivo CSS** `mine-v29111-fidelity.css`. Los únicos HTML existentes modificados son `index.html` (número de versión) y `mis-reservas.html` (referencia a CSS). Se inventariaron **52 recursos originales** desde la web productiva v29.1.10 y se comprobaron hashes sin cambios de app, store, passkeys, API, geo y APK.

- QA de referencia y no regresión: **26 pruebas aprobadas**, 11 de fidelidad y geometría Android/Chrome e iOS/WebKit (sin marco, logo horizontal, botón compacto, contraste de flechas), 8 pruebas de ingreso con teclado y botones visibles, y 7 de sesión autenticada, reservas, pestañas y paginación: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45015832050
- Publicación protegida, comparaciones y checks posterior `PROD_CORE_INVARIANTS_PASS`: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45016075240
- Manifiesto de release y rollback: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45016075240/artifacts/14751732317
- Fuente exacta: rama `via-mine-v29111-reference-fidelity-20261122`, commit de release `c4a22b75f734d7de21cbed7d4161f98ba7d4791c`.

**Recuperación si un dispositivo real revela defecto:** revertir **únicamente** Worker web `via-traslados-web-prod` a `ca5d72af-db3e-43ab-8476-727e44271e50` (v29.1.10), comprobar estado público, actualizar ancla de auditoría de lectura. Nunca restaurar base D1 ni alterar API, OTP, identidades o reservas por un defecto CSS. QA WebKit simula Safari/iOS; no equivale a una prueba de dispositivo iPhone físico.


## ESTADO PRODUCTIVO VIGENTE — v29.1.10 (22/11/2026, Uruguay)

**Esta entrada reemplaza todos los estados históricos de versiones anteriores indicados más abajo.**

| Elemento | Estado comprobado |
| --- | --- |
| Sitio real | https://viatraslados.com — **v29.1.10** |
| Worker web al 100 % | `via-traslados-web-prod`, `ca5d72af-db3e-43ab-8476-727e44271e50` |
| Rollback directo web | **v29.1.9**, `f35ac851-6f1b-403c-b2c7-f7c437693e0f` |
| API, D1, reservas, OTP, huellas, APK V35 | Sin modificaciones |

Se aplicó visualmente sólo en `Mis reservas` la referencia aprobada por el usuario: logo V verde con palabra `vía` destacada y `traslados` debajo, Inicio compacto con flecha a la izquierda, bienvenida verde con líneas topográficas, inicial del nombre autenticado en lugar de una fotografía inventada, tonos de tarjetas más delicados y controles de paginación sin desplazamiento general. No se añadió campana ficticia ni se alteró el título `Mis reservas`.

Se reconstruyeron **49 recursos existentes desde la web productiva efectiva v29.1.9** y se conservaron íntegramente todos salvo `index.html` (indicador de versión) y `mis-reservas.html` (enlaces visuales/arrow). Se agregaron tres assets: `mine-v29110-theme.css`, `mine-v29110-theme.js` y `mine-contours-v29110.svg`. La app, store, passkeys, geocodificador, configuración, API y APK conservaron hashes.

- QA Android/Chrome e iOS/WebKit: **23 casos aprobados**, incluyendo teclado abierto, identidad visual, saludo derivado de nombre autenticado, pestañas y reservas paginadas: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45013293504
- Despliegue productivo final exitoso, verificado con recursos públicos y `PROD_CORE_INVARIANTS_PASS`: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45014010616
- Inventario y respaldo de release: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45014010616/artifacts/14750273652
- Fuente exacta: rama `via-mine-v29110-premium-20261122`, lanzamiento por commit `4060f417f2eb1e64f641dad3ea9f5ec754c9c29c`.
- En dos intentos previos falló únicamente la comparación del HTML público de `reserva.html` por un salto de línea extra antes de `</body>` añadido al reempaquetar assets. Ambos intentos **hicieron rollback comprobado** a v29.1.9. Diagnóstico GET-only confirmó contenido y scripts iguales, con diferencia de un carácter de espacio: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45013927283 . La validación final toleró únicamente saltos de línea repetidos antes de `</body>` en HTML; los archivos funcionales conservaron comparación SHA estricta.

**Rollback si el usuario detecta un defecto visual:** revertir exclusivamente el Worker web `via-traslados-web-prod` a `f35ac851-6f1b-403c-b2c7-f7c437693e0f`, sin tocar D1/API, actualizar el ancla del auditor de lectura y comprobar que se muestra v29.1.9. La evidencia QA valida navegador simulado; el acceso biométrico físico y la entrega real de OTP no se certificaron en este release.


## ESTADO PRODUCTIVO ACTUAL — v29.1.9 (21/11/2026, 18:40 Uruguay)

**Esta sección reemplaza el estado de las entradas históricas que aparecen más abajo.**

| Recurso | Estado verificado |
| --- | --- |
| Web pública | https://viatraslados.com · **v29.1.9** |
| Worker web 100 % tráfico | `via-traslados-web-prod` — `f35ac851-6f1b-403c-b2c7-f7c437693e0f` |
| Rollback web seguro | **v29.1.6** — `0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b` |
| API Worker, D1, OTP, cuentas, passkeys | Sin cambios |
| Reservas y APK conductor V35 | Sin cambios |

- Alcance exacto: se estilizó **solamente** el frontend de `Mis reservas` con el monograma V esmeralda de cinta plegada, wordmark corporativo `vía traslados`, botón `→ Inicio` con cápsula verde petróleo, borde luminoso y degradado sutil, más las correcciones de panel compacto y paginación probadas en QA. No se ha alterado ninguna llamada de red, validación de identidad ni motor geográfico.
- Se modificaron únicamente los archivos públicos `index.html` (indicador de versión) y `mis-reservas.html` (referencias de presentación). Se agregaron CSS, SVG y JS visuales; **42 recursos de la web efectiva se inventariaron**, y los recursos críticos `app.js`, `store.js`, `passkeys.js`, `config.js`, `geo-v2/core.mjs` y APK V35 conservaron hashes originales.
- QA aprobada: **23 casos de navegador real** (ocho verificaciones de logo y botón Inicio; ocho de teclado/login Android+iOS; siete de sesión/paginación): https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44952417664
- Despliegue y comprobaciones efectivas de producción, con invariantes OTP, rutas, geocodificación y APK: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44952676747
- Evidencia y manifiesto: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44952676747/artifacts/14726008392
- Fuente exacta: rama `via-mine-exact-brand-prod-20261121`, commit `540f3628d5038fbdc9badae834abccf61d655045`.

**Rollback por problema visual:** restaurar exclusivamente la versión web `0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b` con despliegue 100 % desde Cloudflare Worker `via-traslados-web-prod`, comprobar que la portada vuelva a `v29.1.6` y revisar `mis-reservas.html`. Nunca restaurar D1, tocar API, cuentas, passkeys ni reservas para revertir CSS o logo. Después actualizar el ancla de auditoría automatizada, que ahora espera v29.1.9.

**Límite:** las 23 pruebas de frontend no certifican biometría física en dispositivos reales ni entrega de correo; el usuario debe comprobar su Samsung con su passkey normal. El servidor y cliente de autenticación se conservaron byte a byte.


## Corrección 21/11/2026 — rollback V29.1.7 rechazado, V29.1.6 estable

**Estado actual vigente (tiene prioridad frente a las notas históricas siguientes):**
- El usuario reportó el 21/11 a las 17:52 UY una regresión de acceso de pasajeros: vista abierta con teclado, formulario recortado y botones ocultos tras una gran superficie vacía. Se rechaza el diseño V29.1.7.
- Se restauró únicamente el Worker WEB `via-traslados-web-prod` a `0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b` (web pública **v29.1.6**) con comprobación de la página realmente servida, ejecución https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44948688379 .
- El rollback NO modificó la API, D1, passkeys, identidad de pasajeros ni reservas. La auditoría de `main` fue actualizada para exigir nuevamente la versión web V29.1.6; auditoría completa aprobada https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44948747898 .
- La V29.1.7 permanece documentada como entrega fallida. No republicarla.
- **Corrección V29.1.8 únicamente en QA**, rama `via-mine-v2918-guest-fix-20261121`, con nuevo logo corporativo y panel de acceso de altura natural. QA verificada con **8 pruebas específicas** Android/iOS (incluye teclado abierto y botón de huella/correo dentro del área visible) y **7 pruebas de acceso/paginación**: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44949924595 . Vista previa visual `https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev/mis-reservas.html` (QA: API deshabilitada, NO iniciar sesión real allí). **NO publicar a producción sin aprobación visual explícita del usuario**. La v29.1.6 permanece pública.


## Actualización de producción — 21/11/2026, 20:47 UTC: WEB v29.1.7

**Estado vigente y prioritario sobre los ejemplos históricos de este documento:**

- Web pública `https://viatraslados.com`: versión visible **v29.1.7**, Worker `via-traslados-web-prod` versión **`6be37e24-1b13-40f5-b087-50ff861f7bc4`** al 100 %.
- Versión anterior segura para rollback puntual web: **`0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b`**, v29.1.6.
- Alcance publicado: diseño premium únicamente en `Mis reservas`, marca/logo corporativo y botón `Inicio`, no scroll general móvil con paginación de tarjetas, adaptación iOS/WebKit/Android y teclado/safe-area. Se cambiaron sólo `index.html`, `mis-reservas.html`, y se añadieron `mine-premium-v2917.css` y `mine-premium-v2917.js`.
- **Conservados sin cambios de bytes:** `app.js`, `store.js`, `passkeys.js`, `config.js`, motor `geo-v2/core.mjs`, APK V35 firmada y demás assets. Sin tocar Worker API, D1, reservas, OTP ni firmas.
- QA real de interfaz con **siete perfiles móviles** Android/Chrome + iPhone/WebKit, sin scroll de página, reservas paginadas, pestañas, login y UX biométrica: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44947856374
- Publicación protegida, smoke de web real y checks posteriores OTP/CORS/distancias/rutas/APK: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44948065792
- Fuente exacta en rama `via-mine-premium-noscr-20261121`, commit `b24f28ddbde548b9f1c6238315bc2ef626d5f08d`.

Si la V29.1.7 introduce un fallo de interfaz, **revertir únicamente** `via-traslados-web-prod` a la versión web `0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b` desde Cloudflare, sin restaurar D1 ni tocar la API. Tras revertir, comprobar la vista de reservas y actualizar el ancla de la auditoría automática (que ahora exige v29.1.7). No usar el rollback v29.1.5 descripto más abajo como primera opción: es una referencia histórica anterior.


## Fuente de verdad y alcance

Esta acta documenta los recursos **realmente activos** el 21/11/2026. No presupone que `main` contenga el frontend desplegado. El lanzamiento comercial debe preservar este estado hasta que exista una necesidad justificada de cambio.

| Recurso | Identidad comprobada |
| --- | --- |
| Sitio | https://viatraslados.com |
| Versión mostrada en el pie de portada | **v29.1.6** |
| Cloudflare Worker web | `via-traslados-web-prod` |
| Versión de Worker web, 100 % tráfico | `0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b` |
| Cloudflare Worker API | `via-traslados-api` |
| Versión efectiva API | `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079` |
| D1 producción | `via-traslados-db` |
| UUID D1 | `dfc6a732-4817-4c49-8f2b-16ecaff3ecc0` |
| APK conductor | V35 firmada, conservada byte a byte |

La portada tiene el indicador `via-release-indicator` con `v29.1.6` y el metadato `content="29.1.6"`. **No es necesario publicar otra versión solo para agregar un número visible.**

## Evidencias y hashes

- Publicación protegida web v29.1.6: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44725142954
- Auditoría live con consulta de despliegues Cloudflare, estado comercial, controles públicos, D1 Time Travel y hashes: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44943409115
- Manifiesto exacto y reproducible (9 recursos públicos, hashes SHA-256): https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44943409115/artifacts/14722388376
- Release fuente: rama `via-mine-v2916-prod-release-20261120`, commit `f4bf854b51f2934b6a8e15e61c16bcdcf328cb2b`.
- SHA-256 motor `geo-v2/core.mjs`: `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1`.
- SHA-256 `store.js`: `3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8`.
- SHA-256 APK V35: `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3`.
- Respaldo de metadatos de rollback web: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44725142954/artifacts/14624010898 (vigente hasta 20/12/2026).
- Respaldo del artefacto APK V35 firmado: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44217589953 (vigente hasta 16/02/2027).
- Time Travel D1 se consultó por **GET**, sin publicar el bookmark ni leer/modificar reservas. Su disponibilidad se confirma por auditoría; la vigencia de cualquier punto histórico es limitada y debe obtenerse uno nuevo antes de una migración.

## Rollback WEB — procedimiento listo para ejecutar SOLO SI HAY UN FALLO

**Situación actual:** frontend v29.1.6 con versión previa conocida v29.1.5:

- Actual: `0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b`
- Anterior: `d3561c58-fedf-4273-9b21-e07de026308d`

Desde un entorno con permisos Cloudflare del propio proyecto, no desde una sesión QA:

```bash
npx --yes wrangler@4.160.1 deployments status --name via-traslados-web-prod --json
# Confirmar que la versión efectiva SIGUE siendo 0c8c2f0a-1e0e-41ac-9c61-09ea11cf3d3b
npx --yes wrangler@4.160.1 rollback d3561c58-fedf-4273-9b21-e07de026308d \
  --name via-traslados-web-prod \
  --message "Vía Traslados: rollback web v29.1.6 a v29.1.5"
npx --yes wrangler@4.160.1 deployments status --name via-traslados-web-prod --json
```

Verificar portada HTTPS, JS/CSS, `/api/direcciones`, `/reserva.html`, API y acceso privado. La v29.1.5 puede **reintroducir la incidencia de Mis reservas** corregida en v29.1.6; usar solo cuando el impacto lo justifique. La auditoría fijada a v29.1.6 marcará discrepancia tras un rollback intencional: no interpretarlo como fallo de reversión. Cambiar la referencia del auditor solo después de verificar la nueva versión efectiva.

**Rollback WEB NO restaura ni cambia D1, reservas, contraseñas, API ni el APK.** No utilizar `wrangler d1 execute`, `restore` ni desplegar desde `pages-release` para revertir un cambio visual. Para la API existe mecanismo separado; no reutilizar su versión anterior sin auditar compatibilidad de datos.

## Verificaciones y límites de la certificación

Aprobado en ejecución no destructiva: sitio y assets, geocodificación Shangrilá y aeropuerto, componentes V29/seguimiento V24, meta v29.1.6, hashes de Store, geografía y APK, API privada protegida, servicio comercial habilitado y existencia de D1/Time Travel.

**Aún NO se certificó en esta acta el circuito transaccional íntegro de un cliente real** (entrega de OTP, solicitud, cotización del conductor, aceptación, asignación y seguimiento del mismo traslado). Las pruebas de código y de QA no sustituyen un recorrido transaccional controlado. No se fabricaron reservas ni enviaron correos en la auditoría. El único paso de validación comercial pendiente debe ser un ensayo controlado, sin involucrar reservas de clientes.

## Regla de continuidad

No publicar la QA v29.1.12, ni usar su código simulado `123456`, ni cambiar Geoapify, autenticación, D1, rama `pages-release`, otros proyectos o firma de APK para este lanzamiento. Los cambios GitHub de esta auditoría son de CI y documentación; **no son un despliegue Cloudflare**.
