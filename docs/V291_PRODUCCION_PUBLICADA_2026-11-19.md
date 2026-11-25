# Vía Traslados — Web V29.1.0 publicada en producción

**Fecha:** 19 de noviembre de 2026, 12:37–12:39 (Uruguay).

## Resultado comprobado

- URL pública: https://viatraslados.com/
- **Web productiva: V29.1.0**, `app.js?v=29.1`, `store.js?v=19.1`.
- Cloudflare Worker: `via-traslados-web-prod`.
- **Deployment activo nuevo:** `6b2d546f-0df1-4ee6-bf21-0092495bf40d`.
- **Versión activa nueva:** `49313136-3544-4e5c-a010-2efc201de6f1` (100 % tráfico).
- **Rollback web anterior V29:** version ID `ec35bd52-b832-4cff-bcb2-6a6b84c34c79`; deployment original `31e8299a-76af-4981-a882-5822fcf07aca`.
- **API V35:** `via-traslados-api` version ID `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079` — no se actualizó.
- **APK V35 firmada:** SHA-256 `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3` — presente y descargable, mismos bytes.
- **Motor geográfico frontend:** `geo-v2/core.mjs?v=3`, SHA-256 `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1` — mismos bytes.
- **`config.js` productiva:** SHA-256 `51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273` — mismos bytes.
- D1 y esquema de producción: **sin migraciones ni operaciones de escritura ejecutadas por el workflow de publicación**.

## Evidencias

- Ejecución de publicación completa: [GitHub Actions 44556793390](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44556793390), conclusión **success**. Recopila manifiesto `release-proof/before.json` y `release-proof/after.json` como artefacto privado con retención de 90 días.
- Navegador Chromium real contra **dominio productivo**, simulando móviles 320, 360, 390 y 412px: [44557191929](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44557191929), conclusión **success**:
  - HTTP 200 portada, flujo «Creá tu cuenta», cambio a «Ya tengo cuenta».
  - Ausencia de panel QA y de desplazamiento horizontal.
  - Config web apunta a API V35 real; Turnstile site key presente.
  - Salud API OTP `otpAvailable:true`.
  - El motor Geo frontend y la APK se verificaron por SHA-256.

**Limitación honesta:** `otpAvailable:true` y el sitio Turnstile configurado NO prueban entrega efectiva de un correo por Resend a una casilla real. Se debe comprobar desde el móvil con una casilla autorizada sin crear reservas ni alterar viajes existentes. La web de producción no utiliza el OTP sintético de QA.

## Rollback inmediato si hay incidencia

1. En Cloudflare > Workers & Pages > `via-traslados-web-prod` > Deployments, seleccionar versión exacta **`ec35bd52-b832-4cff-bcb2-6a6b84c34c79`** y elegir Rollback; NO seleccionar una versión «anterior» distinta sin mirar ID.
2. Alternativa automatizada: mediante credenciales autorizadas, `npx wrangler@4.160.1 rollback ec35bd52-b832-4cff-bcb2-6a6b84c34c79 --name via-traslados-web-prod --message "Rollback Web V29.1 a V29"`.
3. Verificar HTML V29 `app.js?v=29`, `store.js?v=19`, motor Geo SHA, APK SHA y API V35.
4. No restaurar D1 ni actualizar API/APK por un fallo limitado a la web. Considerar que caché PWA/propagación Cloudflare pueden conservar momentáneamente recursos nuevos.

## Autorización y trazabilidad

El propietario autorizó expresamente priorizar publicación ahora con rollback disponible. Se creó marcador privado `.release/via-web-v291-production-authorized.txt` y el workflow `.github/workflows/via-v291-production-release.yml`, que comprueba versiones activas, conserva APK y ejecuta rollback automático si falla el paso de deploy o la comprobación posterior. **No se ejecutó rollback**, porque la publicación y sus controles terminaron correctamente.

Este documento refleja el estado **después de la publicación**, a diferencia de `docs/V291_RC1_RELEASE_MANIFEST.md`, que registra la candidata previa.
