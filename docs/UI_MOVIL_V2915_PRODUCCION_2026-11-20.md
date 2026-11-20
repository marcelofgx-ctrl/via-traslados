# Vía Traslados — Web V29.1.5: UX teclado, GPS adaptativo y dirección estable

**Fecha de publicación:** 20/11/2026 (Uruguay). **Estado:** PUBLICADA Y VERIFICADA. **Rollback:** preparado, no ejecutado.

## Motivo y auditoría
El propietario presentó capturas de su Samsung donde las sugerencias «Aeropuerto» quedaban detrás del teclado, el cartel de GPS consumía espacio y la referencia «Roque Sáenz Peña 1711» podía alternar con «Roque Sáenz Peña» al reconsultar ubicación. Solicitó detectar Chrome, tratar de forma diferenciada el tiempo máximo GPS y preservar el motor de búsqueda.

Auditoría read-only desde el Worker en producción:
- Workflows `44709592700`, `44709736808`, `44710656148`, `44710738158` y `44711304874`.
- Web productiva de partida V29.1.4, version ID **`2d0205bf-990f-44ae-94e4-cf517a9d2093`**, 100 %. API V35 `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079`.
- **Hallazgo crítico:** los activos realmente incluidos en el HTML eran `address-autocomplete.js?v=26` y `address-selected-preview.js?v=29`; los enlaces `?v=11` y `?v=26` para JS que aparecían en auditorías iniciales no eran los recursos cargados por el HTML vigente. Las correcciones se hicieron exclusivamente sobre los **activos efectivamente utilizados**.
- Autocompletado v26 ubicaba `.address-suggestions` con `window.innerHeight`, incluso al abrir el teclado; cuando quedaba poco espacio usaba `bottom:10px`, lo que podía tapar resultados.
- En `reference.js?v=29` el GPS conservaba hasta 18 segundos en todos los navegadores y el estado de éxito quedaba visible indefinidamente.
- El motor puro `geo-v2/core.mjs?v=3` es la autoridad para la referencia postal: un portal cercano es solo orientativo y se presenta como «Cerca de ...», jamás como dirección confirmada.

## Cambios mínimos V29.1.5
**Archivos web modificados exclusivamente:** `index.html`, `reference.js`, `address-autocomplete.js`.

Versiones: meta `29.1.4 → 29.1.5`, `reference.js?v=29 → ?v=30`, `address-autocomplete.js?v=26 → ?v=27`. Se mantienen `app.js?v=29.2`, `address-selected-preview.js?v=29`, `store.js?v=19.1`, `geo-v2/core.mjs?v=3`.

1. **Sugerencias y teclado:** cálculo del área visible con `window.visualViewport.offsetTop/height/width`, despliegue arriba o debajo del campo según espacio real y `maxHeight` ajustada. Reposicionamiento en resize/scroll del visual viewport, scroll de página y rotación. Sin scroll horizontal ni controles decorativos.
2. **GPS adaptativo por navegador:** heurística de `navigator.userAgent`: Samsung Internet, aunque contenga `Chrome/`, usa 7.500 ms; familia Chrome (incluidas PWA / Custom Tabs con user-agent compatible) usa 18.000 ms; Firefox/otros usan 8.000 ms. Se conserva la finalización anticipada al obtener precisión ≤100 m y el umbral de rechazo si la precisión final es >250 m. Los identificadores de navegador son orientativos y no distinguen inequívocamente una Custom Tab de Chrome completo.
3. **Aviso compacto:** «Ubicación obtenida» se muestra en modo compacto y desaparece tras 3.800 ms, antes si se enfoca Destino. El botón de mapa del Origen permanece operativo.
4. **Estabilidad de puerta orientativa:** una nueva lectura que no devuelve número conserva un portal GPS orientativo previamente mostrado **solo si** mantiene la misma calle normalizada, el nuevo GPS está ≤40 m del anterior, ambas lecturas tienen precisión ≤100 m y el número previo era explícitamente aproximado. Se mantiene `numberIsApproximate=true`. Si cambia la calle o la zona, no se conserva el portal. Nunca se fabrica una puerta, ni se sustituye una selección manual/confirmada por una respuesta GPS antigua.

**No se modificaron:** IDE Uruguay, Geoapify, motor geo puro, API, D1, sesiones, cotizaciones, reserva, APK ni WebAuthn/OTP.

## QA
- Rama aislada: `via-ui-v2915-qa-20261120`.
- Worker QA: `https://via-traslados-gps-precision-qa.marcelof-gx.workers.dev/` (uso de laboratorio; su contenido puede actualizarse con nuevas pruebas). Verificado HTTP 200 con V29.1.5 y ambos assets nuevos. API productiva no disponible en QA y POST de reservas bloqueado con HTTP 503.
- Ejecución QA final **`44712619711`**: **success**.
- **33 escenarios automatizados pasados:** 7 UI nuevos (teclado simulado en 320/360/390/412 px, Chrome/Samsung Internet/Firefox y preservación/rechazo de portal orientativo en reconsulta), 15 de regresión GPS y 11 de sesiones/identidad. Sin reservas reales.
- El test de teclado utiliza `visualViewport` simulado en Chromium, no un teclado físico Samsung; la clasificación de navegador usa user-agents simulados. Es necesaria una validación manual de campo.

## Publicación productiva y verificación
- GitHub Actions **`44713040422`**: **success**.
- Commit de autorización productiva: `731275e5cb3cdba125cbf495bb9cad36ec624c05`.
- Preflight: Cloudflare Web V29.1.4 al 100 % y API V35 sin modificaciones; inventario de 41 recursos productivos y hashes de los activos estables.
- Versión Web V29.1.5: **`d3561c58-fedf-4273-9b21-e07de026308d`**, Deployment **`520ffce4-b5f3-4d1d-8545-ed9f7f1022c9`**.
- HTTP 200 + HTML versión `29.1.5`, JS GPS y de autocompletar nuevos, salud API/OTP, motor geográfico y APK intactos. Las **33 pruebas** volvieron a pasar sobre `https://viatraslados.com/` después de publicar; ruta inversa de muestra respondió.
- Evidencia privada QA `via-ui-v2915-qa-evidence` ID `14617637907` (retención hasta 20/12/2026).
- Evidencia privada producción `via-ui-v2915-production-proof` ID `14618166707` (retención hasta 18/02/2027).

## Hashes SHA-256

| Asset | SHA anterior | SHA nuevo |
|---|---|---|
| `reference.js` | `7e4841b60c7a9796673ed7ad41e54446cac3eded802bcb1cb37971cec61fd47b` | `e585ee99e2214c6fd24e776c1dfa9eb75be41cc63e2040806237835abee6c1a2` |
| `address-autocomplete.js` | `bf3b671b4693b088a82259c5cbb9ed860e7b6c4f108aa43cf50e2e563a7aaf17` | `54f74853a72debba09d9f18eec44fa3dc05f3f366250b5c41672555c28a63a2a` |
| `app.js` estable | `73afe2490a64b9a1c1b6cf4ce61283c1f68184208cbe783a70126cecc3b21e69` | Sin cambios |
| `address-selected-preview.js` | `bf0f7aa019eab8f42fe8dc5fe12a2c559f5871ff07266a4c8ea0dc1fb4f234e8` | Sin cambios |
| `geo-v2/core.mjs` | `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1` | Sin cambios |
| `store.js` | `3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8` | Sin cambios |
| `config.js` | `51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273` | Sin cambios |
| APK V35 | `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3` | Sin cambios |

## Rollback
Retorno inmediato: activar en Worker web `via-traslados-web-prod` la versión **V29.1.4 `2d0205bf-990f-44ae-94e4-cf517a9d2093`** al 100 %. Guardia: `scripts/via-ui-v2915-production-guard.mjs rollback`. Verificar meta `29.1.4`, JS `reference.js?v=29`, `address-autocomplete.js?v=26`, hashes originales, API V35 y D1 intactos. **No se necesitó ejecutar rollback** en esta publicación.

## Validación física pendiente
Abrir la web en Chrome normal, Samsung Internet y la Custom Tab donde se tomaron las capturas. Repetir búsqueda de Aeropuerto con el teclado abierto, ajustar en el mapa, repetir GPS en la misma ubicación y confirmar que el número orientativo se conserva solo en condiciones seguras. Los tests sintéticos no sustituyen esta comprobación en Samsung real.
