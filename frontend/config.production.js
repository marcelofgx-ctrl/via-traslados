/* Configuración pública para la futura web de producción de Vía Traslados.
 * NO contiene secretos. No publicar automáticamente ni usar en QA de Vercel.
 * Turnstile debe generar el token con action: 'otp', bajo viatraslados.com.
 */
window.VIA_CONFIG = Object.freeze({
  demo: false,
  apiUrl: 'https://via-traslados-api.marcelof-gx.workers.dev',
  turnstileSiteKey: '0x4AAAAAAF4VvUKNEQsTbewm'
});
