# Vía Traslados — Congelamiento de producción y rollback (21/11/2026)

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
