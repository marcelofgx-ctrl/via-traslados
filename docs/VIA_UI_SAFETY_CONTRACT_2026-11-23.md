# Vía Traslados — contrato de seguridad para futuras mejoras visuales

**Establecido:** 23/11/2026. **Aplica a:** web pasajeros, `Mis reservas`, mapa, reservas, identidad, PWA y APK conductores.

## Regla principal

**Un cambio de presentación nunca debe modificar la lógica de negocio accidentalmente.**
Todo cambio tendrá un alcance explícito, una fuente productiva auditada, QA aislado, pruebas de regresión y rollback recuperable. No se autoriza producción por la sola apariencia de una captura.

## 1. Fuentes y entornos

- La fuente de verdad de la web es el Worker de Cloudflare **efectivamente activo**, no asumir que `main` ni un branch contienen su código actual. Confirmar la versión activa de Cloudflare y copiar las referencias y CSS/JS que realmente se sirven.
- `PROD`: `https://viatraslados.com`. Worker web `via-traslados-web-prod`, Worker API independiente, D1 prod `via-traslados-db`.
- `QA`: `https://via-traslados-mine-v2917-stage.marcelof-gx.workers.dev`, Worker estático aislado; cualquier `/api/*` responde 503 a menos que Playwright lo intercepte con **datos simulados**. Nunca escribir sobre la D1 productiva durante QA.
- Bloquear cualquier publicación si cambia inesperadamente el Worker productivo, el contenido original o los hashes de los recursos protegidos.

## 2. Clasificar las modificaciones

**Presentación exclusivamente (preferente):** nuevos CSS, tipografía, espacios, alineación y contenido de etiquetas; scripts de *solo lectura de valores* para controles visuales, manteniendo los inputs nativos.

**Motor protegido:** `geo-v2/core.mjs`, cálculos de rutas, `reference.js` GPS, `address-autocomplete.js`, `app.js`, `store.js`, `passkeys.js`, autenticación OTP, RBAC, API, D1, idempotencia, despacho y APK.

Si un mensaje necesita editar código de mapa para cambiar una frase, **se permite solo un diff exacto y verificable en la función de presentación**, no en el cálculo, el evento del mapa ni la resolución postal. El builder aborta si difiere un byte extra.

## 3. Contratos funcionales obligatorios

- GPS solo al tocar `Cerca de mí`, sin geolocalización/polling permanente; cada pulsación produce un intento nuevo; no reutilizar coordenadas de otro pedido.
- Una calle sin número **no equivale** a una puerta postal. Número cercano es **orientativo**, y `Ruta 8` no es `puerta 8`.
- La chincheta puede confirmarse aunque falle o venza la búsqueda inversa; guardar sus latitud y longitud reales. Respuestas tardías no pisan un dato elegido después.
- Nuevo pedido limpia datos del viaje anterior y mantiene sesión/datos de la persona correcta.
- El control de fecha sigue siendo un `input type="date"` nativo. El texto visible `dd/mm/aaaa` debe reflejar exactamente su `value` ISO, sin cambiarlo.
- `Mis reservas`: conservar diseño visual aprobado v29.1.13, roles, historial, pestañas, paginación, número de reservas, sesiones y botón Inicio. Sin scroll general no solicitado.
- APK conductores, comisiones, cotizaciones, estados de despacho, OTP e infraestructura **fuera del alcance de visuales**.

## 4. Pruebas que detienen un despliegue

1. Análisis estático: sintaxis válida; inventario y SHA256 de recursos; diff exacto con lista de archivos permitidos.
2. QA Android Chrome en 320, 360, 390, 412 px; WebKit iOS en 320, 375, 390, 430 px. Medir el **texto realmente visible** con rectángulos y métricas de fuente, no solo la presencia en DOM.
3. GPS/mapa Leaflet con geocodificación simulada: calle desconocida, calle solo, portal orientativo, calle numerada, timeout y confirmación; contrastar lat/lng dentro de tolerancia cartográfica submétrica razonable.
4. Identidad, regreso del navegador, borrador nuevo, OTP simulado, teclado, sin superposición, `Mis reservas`, navegación y paginación.
5. Capturas Android/iOS y manifiesto de artefactos asociados al commit aprobado.
6. Smoke público GET-only para API/CORS/OTP, geocodificador, rutas y APK. **No** equivale a verificar entrega real de correo ni a ejecutar un pedido productivo E2E.

## 5. Publicación y rollback

- **Nunca desplegar con pruebas rojas** ni con cambios de hashes no explicados.
- La entrega productiva requiere `release/VIA_<VERSION>_QA_APPROVED` en la rama concreta y pasos independientes de `prepare`, `QA smoke`, `Wrangler --dry-run` y `release`.
- Publicar solo el Worker **web** con `--keep-vars`. No usar workflows antiguos que además escriben esquemas D1 para un cambio visual.
- Validar Worker realmente activo, HTML/CSS/JS exactos y recursos protegidos **después** de publicar. Si falla, reasignar 100 % del tráfico a la versión web inmediata anterior. No revertir API ni D1 por una falla de CSS.

## 6. Permanencia

Los tests y este contrato deben acompañar el proyecto. Los cambios futuros deben partir de la versión web productiva efectiva y reutilizar los tests de fecha, GPS, mapa, autenticación, reservas y compatibilidad móvil. **El estado verde de QA debe ser un requisito de publicación**, no solo una recomendación.

No hay modo de garantizar que ningún navegador, proveedor de mapas o servicio externo falle jamás; esta defensa acota y detecta regresiones propias antes de producción, conserva pruebas rastreables y posibilita recuperación inmediata.

## 7. Identificador de versión — requisito permanente

**Obligatorio en todas las siguientes publicaciones de la web de pasajeros.**
La pantalla principal debe mostrar siempre un distintivo de versión **pequeño, discreto y visible sin desplazarse**. No puede quedar únicamente en el footer si el diseño no permite ver ese pie de página.

- Posición preferente: dentro del subtítulo del logotipo del encabezado principal, con un texto tipo `· v30.0`; tipografía 9–10 px, opacidad secundaria, sin colores llamativos ni tarjetas.
- El texto debe derivarse automáticamente de `<meta name="via-release-version" content="...">`, no quedar codificado con una versión antigua.
- Debe mantenerse legible en Android Chrome y Safari iOS, 320–430 px, sin tapar iconos, botones, teclado, mapa, formularios ni generar scroll.
- En futuras releases, actualizar el `meta` y verificar que el número mostrado coincide; si no, bloquear la publicación.
- Mantener **un solo** `id="via-release-indicator"` en el HTML y comprobar que está dentro del `<header>` y no únicamente dentro del `<footer>`.
- Un cambio de etiqueta nunca autoriza cambios en API, D1, reservas, mapa, autenticación o APK.
- La etiqueta ya existía en el footer de V30.0, pero quedaba fuera de la vista principal; el requerimiento es visibilidad efectiva, no solo presencia en el DOM.

El parche de referencia y sus pruebas están en `scripts/via-home-visible-version.mjs` y `tests/via-home-visible-version.test.mjs` (rama de implementación `via-version-visible-v30-20261124`).

## 8. Entrega y pruebas explicadas al usuario — directiva obligatoria

**Cada modificación, prueba, publicación y rollback debe comunicarse con un informe operativo claro, no solo con registros de CI.** Al terminar la respuesta se debe incluir siempre un **enlace real y directo a lo que se probará**.

- Separar inequívocamente `PROD`, `QA desplegado` y `solo pruebas de código`. Si no hubo deploy, decir «No publicado»; una corrida de GitHub verde no equivale a que la web nueva esté operativa.
- Antes del enlace, explicar qué cambió, versión/entorno, qué funciona y qué no, instrucciones concretas para reproducir el caso desde Android/iOS, resultado esperado, pruebas automatizadas y reales, efectos en reservas/API/D1, rollback comprobado, pendientes y cualquier acción requerida del usuario.
- Incluir un **distintivo visible de versión** en la UI y verificar que coincide con el despliegue real; no dejarlo oculto exclusivamente en un footer.
- La **última sección** se titulará «Enlace para probar / verificar». Ofrecer la URL exacta del entorno verificado; si solo se corrieron tests, enlazar la ejecución y aclarar que todavía no hay aplicación nueva para probar. Nunca inventar links ni inducir a testear código que no está publicado.
- Cerrar con el enlace específico, claramente identificado. Evitar obligar al usuario a interpretar logs o a pedir repetidamente dónde entrar.
- Esta regla es transversal, también a Geoapify, buscador de lugares, GPS, autenticación, mapa, APK conductor y tareas de rollback.

La directiva operativa completa también está en `AGENTS.md`, en la raíz del repositorio.
