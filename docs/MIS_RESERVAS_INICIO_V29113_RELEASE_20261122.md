# Vía Traslados — Hotfix CSS v29.1.13 «Inicio» (2026-11-22)

## Causa verificada

Captura real de Android: el texto `Inicio` se cortaba al extremo derecho del botón. La v29.1.12 imponía `width:94px`, o `92px` para pantallas pequeñas y `90px` con campo enfocado, a un botón que contiene un SVG de portada, un separador y un texto. Además tenía `overflow:hidden` heredado. La auditoría de solo lectura comprobó que el Worker real seguía sirviendo exactamente ese CSS.

## Corrección exacta

- ÚNICO recurso visual nuevo: `mine-v29113-inicio.css`, estrictamente limitado al `body[data-page="mine"] .topbar .top-link` y su icono, separador y etiqueta.
- Reemplazo del ancho fijo por `width:max-content` / `min-width:max-content`, con `flex:0 0 auto`. Etiqueta sin recorte, sombras y verde petróleo intactos.
- Leve reducción de separación interna, sin agrandar desproporcionadamente el botón.
- Dos únicos archivos preexistentes modificados en la compilación: `index.html` para etiqueta de versión y `mis-reservas.html` para enlazar un stylesheet adicional. Ningún JavaScript previo se cambia.
- API, D1, OTP, sesiones, reservas, rutas, conductor APK y proyectos ajenos no modificados.

## QA

- Auditoría fuente de verdad: [GitHub Actions 45034065760](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45034065760) — confirmó v29.1.12 `1de806f9-a97c-4948-98ab-ccbc94f5e0e1`.
- [GitHub Actions 45034326178](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45034326178) — **27/27 PASS**.
  - 12 Chrome Android / iOS WebKit: texto de `Inicio` medido con DOM Range, botón sin scrollWidth excedente, margen a la derecha del texto, logo sin choque, HTML y destinos reales, reservas y pestañas, copia de capturas frente a la v29.1.12, prueba de letra ampliada a 18px.
  - 8 regresiones de teclado / pantalla sin sesión.
  - 7 regresiones de reservas paginadas / historial / sin scroll.
- Los datos de usuario, viajes y OTP de QA fueron **simulados en el navegador**. No se crearon reservas reales ni se enviaron correos.
- Capturas + manifest en artefacto `via-v29113-inicio-no-clipping-android-ios-evidence` del workflow QA.

## Producción y rollback

- [GitHub Actions 45034604972](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45034604972) — producción **SUCCESS**.
- **Worker productivo v29.1.13:** `2f2407d8-d665-47c6-9b14-edf7655b00a4`.
- **Rollback primario exacto:** v29.1.12 `1de806f9-a97c-4948-98ab-ccbc94f5e0e1`, únicamente Worker `via-traslados-web-prod` al 100%. No revertir API ni D1.
- Comprobación post-release `VIA_V29113_PRODUCTION_VERIFIED` seguida de `PROD_CORE_INVARIANTS_PASS OTP_CONFIG_CORS_ROUTE_GEO_FRONTEND_APK`. Entrega real de email OTP no ejercitada.
- Enlace: https://viatraslados.com/mis-reservas.html

La prueba de compacidad también se incorporó al pipeline: no basta que el CSS compile ni que el elemento exista; la palabra completa debe estar contenida geométricamente, incluso con texto ampliado.
