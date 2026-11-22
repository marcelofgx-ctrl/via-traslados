# Vía Traslados — Mis reservas V29.1.12 — auditoría y plan de release

Fecha: 2026-11-22 (Uruguay). Actualización visual de la web de pasajeros ÚNICAMENTE.

## Origen productivo auditado con solo lecturas

- Dominio `https://viatraslados.com/mis-reservas.html`.
- Version inicial real en Cloudflare Worker `via-traslados-web-prod`: `f5d43ef0-1a28-4bce-a078-6fb364399e72`, pantalla V29.1.11.
- Comprobación GET-only en Actions [auditoría 45030216003](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45030216003). HTML productivo incluye `mine-v29111-fidelity.css?v=1`; portada `content="29.1.11"`.
- Rollback primario tras publicar V29.1.12: **V29.1.11, `f5d43ef0-1a28-4bce-a078-6fb364399e72`**. Versión histórica adicional V29.1.10: `ca5d72af-db3e-43ab-8476-727e44271e50`, confirmada en despliegues recientes.
- Rama `via-mine-v29112-cohesion-20261122` creada desde commit exacto `c4a22b75f734d7de21cbed7d4161f98ba7d4791c`.

## Corrección propuesta y alcance

- Botón Inicio: ícono de portada SVG lineal, separador fino, cápsula petróleo de ancho acotado y alto 36–38px; conserva el hipervínculo real de la portada.
- Alineación unificada de subtítulo, bienvenida, pestañas, tarjetas; menores intervalos verticales y sombras más contenidas; **sin marco blanco global**.
- Paginación visual acercada a la última tarjeta visible, preservando el motor de paginación original, el conteo efectivo de reservas y la ausencia de scroll del documento.
- CSS `mine-v29112-cohesion.css`, JS mínimo de medición `mine-v29112-cohesion.js`. No se modifica el controlador original V29.1.7, `store.js`, `app.js`, `passkeys.js` ni código de API o D1.

## Gates obligatorios

1. `scripts/via-mine-v29112-audit.py`: antes de ejecutar, debe confirmar versión activa v29.1.11 y rollback accesible.
2. `scripts/via-mine-v29112-release.py prepare`: recupera TODOS los archivos efectivos del Worker productivo y comprueba hashes de archivos sensibles. Se permiten únicamente los cambios de `index.html` (etiqueta de versión), `mis-reservas.html` (CSS e ícono y JS visual) y dos activos nuevos. Reconstruye Worker original con variables preservadas.
3. QA aislado: `via-traslados-mine-v2917-stage.marcelof-gx.workers.dev`; escritura API bloqueada, reservas simuladas solo por interceptor del navegador.
4. WebKit iOS y Chromium Android: pruebas de 320px a 430px, teclado, sesión, tabs, paginación, retorno a Inicio, contraste, capturas de v29.1.11 vs QA.
5. SOLO SI QA pasa: crear `release/VIA_V29112_QA_APPROVED`. El workflow productivo se dispara únicamente por ese marcador.
6. Publicación guarded con preflight por hashes y prueba postdespliegue de servicios existentes; rollback automático al Worker web original V29.1.11 ante fallo. No modificar el Worker API ni D1 ni APK.

## Estado de publicación

**Pendiente de completar y verificar en el workflow de producción.** No considerar V29.1.12 publicada únicamente porque el código exista en GitHub o QA.

