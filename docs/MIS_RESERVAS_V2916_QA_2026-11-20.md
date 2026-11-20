# Mis reservas V29.1.6 — QA aprobada; producción pendiente de autorización

20/11/2026, Uruguay. QA finalizada a las **07:00**. No se publicó en producción.

## Hallazgo real

Las capturas del propietario se reprodujeron en Chrome: la página productiva pide
`mine-identity-v291.css?v=1` y ese recurso devuelve **404**. Sin ese CSS los accesos
quedan como botones nativos con tres textos consecutivos, y el `display:flex!important`
de `.via-mine-account.known-customer` vence al ocultamiento genérico de `.hidden`.
Por eso «Sesión segura» se veía incluso para un visitante sin cuenta autenticada.
El texto del saludo estaba vacío porque el JS sí había identificado al visitante
como no autenticado. No se atribuyó a Chrome un fallo exclusivo del navegador.

Además `initMine()` dibujaba un perfil guardado localmente antes de `S.resume()`.
Se corrigió ese orden para no presentar una identidad recordada como verificada.

## Candidato probado

- Rama: `via-mine-access-qa-20261120`.
- Commit de código probado: `9dc33571bc014e07e2b1cc490b022335f895bc19`.
- QA: https://via-traslados-mine-access-qa.marcelof-gx.workers.dev/mis-reservas.html
- Run: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44715361186 — **success**.
- Evidencia privada: artefacto `via-mine-v2916-qa-proof`, ID `14619736094`.
- Producción de partida: web V29.1.5, Worker `d3561c58-fedf-4273-9b21-e07de026308d`.
- La primera ejecución detuvo la preparación al tratar un enlace de navegación
  (`avance-v30.html`, no publicado) como dependencia estática. Se corrigió el
  inventario para distinguir navegación y recursos CSS/JS. No se desplegó nada
  en esa ejecución ni se modificó producción.

Cambios de aplicación limitados a `mis-reservas.html`, al bloque `initMine()` de
`app.js` y al CSS ausente recuperado. Los botones se llaman **Ingresar** y
**Crear cuenta**, tienen 50 px de alto, diseño compacto y no repiten «Ya viajaste»,
«Primera vez», «Soy nuevo» ni flechas. Solo se muestra un formulario por vez.

La sesión se valida con el `GET /api/customer/me` existente antes del saludo y la
consulta de reservas. Se descartan respuestas de otra cuenta y se vacían los datos
privados al cambiar de identidad. Logout y error de validación ocultan el saludo.
No se alteraron OTP/PIN/passkeys, Store, motor geográfico, GPS, API, D1 ni APK.

## Validación

**27 escenarios pasaron en Chrome automatizado:**

- 4 anchos (320, 360, 390, 412): invitado, alternancia ingresar/registro, controles
  con estilos cargados y ausencia de scroll horizontal.
- Sesión válida, 401, error de red, validación demorada y carrera de cambio de
  usuario entre pestañas; logout en las sesiones válidas. No se muestra el perfil
  local anterior mientras se espera la respuesta.
- 7 regresiones de teclado, autocompletar y GPS adaptativo.
- 11 regresiones de identidad del formulario de reserva, incluyendo salto a paso 3,
  sesión vencida durante confirmación y cierre/cambio de cuenta.

Las respuestas de autenticación/reservas de las pruebas son sintéticas e
interceptadas. El Worker QA bloquea `/api/*` con HTTP 503 y su configuración
apunta a su propio origen, sin API productiva ni envíos reales de correo.
No se hicieron reservas reales. Las pruebas de teclado y clasificación de
navegador usan Chromium y simulaciones; no sustituyen un Samsung físico.

El empaquetador auditó **41 archivos** desde producción, conserva sus hashes y
recorre las dependencias de **todos los HTML** para impedir otra pérdida silenciosa
del CSS de una página secundaria. El cambio falla si falta una dependencia cargada.

## Fuentes exactas y entrega

`design/via/access-v2916/` conserva el HTML sin analítica dinámica, CSS y app exacta
del candidato. El app se comparó byte por byte contra el JS desplegado en QA.

| Archivo | SHA-256 |
|---|---|
| `app.js` | `e683d1cb152eec30c6bc25c80291b63e43e5bcd385e031674e90cb1e63a40216` |
| `mis-reservas.html` | `51c93c09329c711fa854dc3bad98e3a6ffa828d03d843905318b04d6906256c4` |
| `mine-identity-v291.css` | `de86dc9af0641fec8b682877743ff5c27793fb4eeb8c2440b368a4bc2363180a` |

## Pendiente

Obtener autorización del propietario para publicar. El README exige aprobación
explícita antes de desplegar en producción; esta sesión prepara y valida el cambio.
La publicación deberá preservar Worker activo y todos sus activos, retirar el
banner QA, conservar config productiva y habilitar rollback a V29.1.5. Actualizar
la carga de `app.js` del HTML de Mis reservas a `?v=29.3` y del CSS a `?v=2`.
No fusionar una rama histórica entera ni reemplazar producción por Pages.
