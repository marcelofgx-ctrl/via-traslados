# Vía Traslados — limpieza controlada de D1 productiva (22/11/2026)

## Alcance solicitado

Mantener al único administrador fundador en `via-traslados-db`; reiniciar datos de pasajeros, reservas y ensayos sin cambiar el esquema, configuración, API ni QA.

## Entorno y control de acceso

- Producción: D1 `via-traslados-db`, identificador `dfc6a732-4817-4c49-8f2b-16ecaff3ecc0`.
- QA: `via-traslados-qa-db`, separada. No se ejecutó ninguna escritura sobre QA.
- Cuenta conservada: `marcelof.gx@gmail.com`, celular `094 842 756`, rol `admin`, estado `approved`, correo verificado.
- Se conservaron tablas de autenticación de staff: `staff_users`, `staff_contacts`, `staff_sessions`, `staff_refresh_tokens`, `staff_email_codes`, `staff_password_resets`.
- También se mantuvo `service_settings` con `public_web_enabled=1`.
- No se consultó ni modificó `_cf_KV`, tabla interna protegida de Cloudflare.

## Evidencia de auditoría, limpieza y controles

- [Auditoría pre-borrado](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45043697453) — éxito. Base correcta, administrador único, credenciales/contacto verificados, bookmark de recuperación.
- [Limpieza de producción](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45043883843) — éxito. 19 sentencias DELETE sobre tablas temporales/operativas allowlisted; preservación de cuentas y configuración; smoke test.
- [Verificación independiente posterior](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45044044832) — éxito.

## Estado antes y después

| Elemento | Antes | Después |
|---|---:|---:|
| Usuarios de staff | 1 (admin) | 1 (admin) |
| Contactos del staff | 1 | 1 |
| Reservas | 17 | 0 |
| Eventos de reservas | 39 | 0 |
| Cotizaciones | 5 | 0 |
| Rutas de reservas | 14 | 0 |
| Asignaciones de conductores | 5 | 0 |
| Perfiles de pasajeros | 3 | 0 |
| Sesiones de pasajeros | 16 | 0 |
| Passkeys de pasajeros | 2 | 0 |
| PIN de pasajeros | 2 | 0 |
| Sesiones de staff (admin) | 17 | 17 |
| Refresh tokens de staff | 14 | 14 |
| Configuración de servicio | 1 | 1 |

La limpieza dejó a cero todas las tablas persistentes de pasajeros, reservas, cotizaciones y asignaciones. En la verificación posterior, la web pública ya había regenerado **2 registros de limitación OTP** y **1 caché de rutas**; son datos técnicos temporales y no usuarios ni reservas.

## Recuperación

Bookmark obtenido inmediatamente **antes** de la ejecución destructiva:

`000000df-00000000-0000512b-fd3e949e0062d3b2b030620657aaee82`

Cloudflare D1 Time Travel permite restaurar a ese punto de recuperación durante su ventana de retención (normalmente hasta 30 días). **No se ejecutó una restauración**, y este bookmark no equivale a una exportación SQL permanente. Una restauración retrocedería **toda** la D1 productiva a ese instante, incluidas las operaciones nuevas realizadas después. Evaluar el impacto sobre datos nuevos antes de utilizarlo.

## Restricciones respetadas

- Sin cambios en Workers productivos, API, OTP, reglas de acceso, esquema, triggers ni índices.
- Sin modificaciones en la web pasajeros v29.1.13, APK de conductores, Quick Trip, Mapa o Fila Digital.
- Smoke test final: `PROD_CORE_INVARIANTS_PASS OTP_CONFIG_CORS_ROUTE_GEO_FRONTEND_APK`. La entrega real de emails OTP no se ensayó.

