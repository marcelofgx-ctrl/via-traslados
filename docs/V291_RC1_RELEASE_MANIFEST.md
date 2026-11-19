# Vía Traslados — V29.1.0-RC1, release candidato y rollback

**Generado:** 19/11/2026. **Estado: compilado y probado, NO publicado en producción.**

## Punto de partida, confirmado por Cloudflare

- Web pública V29, archivo `app.js?v=29` y `store.js?v=19`.
- Worker `via-traslados-web-prod`: **version_id `ec35bd52-b832-4cff-bcb2-6a6b84c34c79`**, deployment `31e8299a-76af-4981-a882-5822fcf07aca` (**rollback de la futura publicación**).
- API `via-traslados-api` versión V35, version_id **`9f0db4cc-29b8-4d79-8ce8-8fb0588bd079`**, sin cambios previstos.
- APK V35 versión `0.35.0` original, hash SHA-256 `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3`, NO se reemplaza.
- D1 productiva: intacta, NO ejecutar migraciones como parte del cambio visual.
- El motor web `geo-v2/core.mjs?v=3` conserva SHA-256 `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1`.
- El HTML público puede contener analítica Cloudflare insertada dinámicamente (se detectó una diferencia de un byte tras retirarla); la compilación aborta si cambia el Worker `version_id` o cualquier hash de archivos JS críticos.

## Qué contiene V29.1.0-RC1

**Solo cambios de frontend:** saludo `Hola, [primer nombre]` con sesión validada, CTA `Creá tu cuenta` para visitante sin sesión, registro independiente por OTP y Turnstile reales mediante endpoints V35 existentes, selector premium de usuarios, cierre de sesión sin persistencia de identidad anterior y guarda contra respuestas HTTP atrasadas de otra cuenta.

- `app.js` nuevo SHA `3df13d2f4d318511ea189e90446da78fd448d8edf90fc4d41df7d7e7e0f03a0c`.
- `store.js` nuevo SHA `3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8`.
- `index.html` nuevo SHA `7af72471be856b4c4dddc2cc2316737b84d4e50c0b94fcc4c58e5ab2c3020c9d`.
- `mis-reservas.html` nuevo SHA `36810ebfb3e906904ef9cdc41727d4afb33c481564a86a0927dc1b980bb6f986`.
- CSS nuevo `mine-identity-v291.css` y scripts `via-v291-home-account.js/css`.
- `config.js` preservado byte a byte con API productiva, sin modificar endpoint.
- **NO incluir:** selector `QA · Cuentas`, pasajeros A/B, OTP fijo `123456`, bypass Turnstile, Geoapify QA, APK V36 debug, esquema D1 ni idempotency-header dependiente de API nueva.

## Ensayos comprobados

Run **[44537506631](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44537506631)** completó exitosamente:
- Recuperación de 37 activos públicos desde el Worker realmente publicado, con hash y versión fijados; Wrangler dry-run sin desplegar.
- Sintaxis JS y Python válida.
- Chromium móvil **320, 360, 390 y 412px** con API autenticación simulada localmente, ninguna solicitud de reserva productiva.
- Usuario invitado, saludo `Ana`, cambio `Bruno`, logout, ocultación de cuenta anterior, elección exclusiva login/registro, acceso directo a registro y ausencia de scroll horizontal/errores JS.
- Validación de ausencia de marcas QA y de cambios en motor de rutas; artefacto privado `via-web-v291-rc1-no-publicado` (ID `14536132777`), conservado hasta **19/12/2026**.

## Gate de publicación, NO alcanzado todavía

1. Probar **entrega de OTP real / Turnstile** de nueva cuenta y existente, con identidad autorizada y sin registrar reservas innecesarias. El E2E anterior usa API simulada y no demuestra la entrega.
2. Verificar kilómetros/minutos reales. MAESTRO QA tiene `routePreviewReady:false`; exigir Geoapify/OTP pepper QA independientes o validar una candidata con los mismos parámetros en sandbox seguro.
3. Probar PWA/caché/service worker y Android Samsung físico, incluidas transiciones A→B→Salir, después de cerrar y reabrir.
4. Releer estado de Workers: si el actual `ec35bd52...` cambió, invalidar candidata y auditar de nuevo. No confiar solo en la rama `main`.
5. Reconciliar la discrepancia detectada previamente en recuentos D1 de producción **24→7** antes de cambios de backend/DB. **No impide una publicación exclusivamente visual sin migraciones**, pero sigue siendo alerta de integridad.
6. Obtener un plan de rollback que apunte al ID exacto `ec35bd52...`, ensayarlo con versión de pruebas y registrar ID **nuevo** del despliegue antes de activarlo.
7. Confirmar que la fase V29.1 no incluye V30 quoted, ni nueva API V36 ni Android release V36.

## Procedimiento al aprobar

- Congelar rama/commit RC y descargar el artefacto íntegro. Verificar firmas/checksums.
- Crear nuevo Worker de **staging aislado** con el paquete idéntico al previsto para web producción; obtener evidencias.
- Ejecutar pruebas no destructivas de rutas, autenticación real autorizada y reservas existentes, además de revisión humana en Android.
- Tras verificar semáforo de publicación, subir una versión nueva **solo al Worker `via-traslados-web-prod`**, sin alterar API ni D1, y registrar su **Cloudflare version_id**; activarla al 100%.
- Verificar salud, `app.js?v=29.1`, `store.js?v=19.1`, geo-v2, APK V35, y flujos sin duplicación.
- **Rollback:** activar nuevamente version_id `ec35bd52-b832-4cff-bcb2-6a6b84c34c79` en `via-traslados-web-prod` y volver a verificar los hashes de V29. Nunca elegir arbitrariamente la versión inmediatamente anterior si hay despliegues intermedios. No tocar D1/API para corregir una regresión visual.

**No fusionar ni desplegar automáticamente este PR en borrador.**
