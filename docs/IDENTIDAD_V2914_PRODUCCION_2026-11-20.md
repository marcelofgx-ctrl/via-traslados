# Vía Traslados — Web V29.1.4 · continuidad de identidad verificada

**Fecha:** 20 de noviembre de 2026 (Uruguay).  
**Estado:** PUBLICADA Y VERIFICADA EN PRODUCCIÓN.  
**Rollback:** preparado, no ejecutado.

## Incidencia

El propietario mostró la pantalla «PASO 2 DE 3» con tarjeta «Cuenta reconocida / Cuenta verificada en este dispositivo», pero también se solicitaba el celular. Requirió que una sesión real y válida permitiera mostrar el nombre, recuperar celular y correo y saltar directamente al paso 3, sin repetir OTP, PIN o Turnstile.

## Auditoría productiva — solo lectura

La auditoría GitHub Actions `44671177004` y `44671292170` corroboró:
- Cloudflare Worker web V29.1.3 al 100 %: `ae77208c-2200-4a83-9411-c27170112009`.
- API V35 al 100 %: `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079`.
- `app.js?v=29.1` SHA-256 `3df13d2f4d318511ea189e90446da78fd448d8edf90fc4d41df7d7e7e0f03a0c`.
- `store.js?v=19.1` SHA-256 `3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8`.
- El flujo `#to-contact` forzaba `remembered();changeStep(2);loadCaptcha()` incluso cuando una sesión ya podía validarse.
- `remembered()` interpretaba `ViaStore.customer()?.profile` almacenado localmente como sesión autenticada sin exigir verificación actual.
- La API `GET /api/customer/me`, utilizada por `ViaStore.resume()`, ya devuelve perfil con nombre, teléfono y correo **solo con sesión vigente**.
- Además, la tarjeta `#known-customer.hidden` podía resultar visible en el paso 2 de invitados por una regla CSS de mayor precedencia; se detectó reproduciendo la captura inicial en QA.

## Parche mínimo V29.1.4

**Modificados únicamente:** `app.js` y `index.html`. Recursos publicados: `app.js?v=29.2`; meta versión `29.1.4`. No se crearon tablas ni migraciones.

- Valida el token vigente mediante `ViaStore.resume()` y exige que siga siendo el mismo token tras la respuesta asíncrona.
- Si la API confirma la identidad y hay nombre/celular/correo: completa los campos de contacto con datos del servidor, ejecuta `openConfirmation(false)` y salta directamente del paso 1 al **PASO 3 DE 3**.
- El resumen de confirmación muestra «Hola, [primer nombre]. Tu cuenta está verificada» y, bajo ese saludo, el celular y correo devueltos por el backend.
- Sin sesión, con expiración, HTTP 401, error de red o perfil incompleto: no exhibe identidad guardada y mantiene el flujo de autenticación del paso 2.
- La sesión vuelve a comprobarse antes de `S.create(trip())`; una sesión vencida no puede generar un POST de reserva desde ese formulario.
- Protege contra solicitudes antiguas y cambios de cuenta; si se cierra sesión o se reemplaza la identidad, se elimina la identidad previa del resumen y se regresa a la pantalla de identificación. El botón Volver desde paso 3 de cuenta autenticada regresa al paso 1, sin imponer paso 2 innecesario.
- Mantiene OTP, PIN, WebAuthn, Resend y Turnstile cuando la sesión no está verificada. No añade rutas nuevas ni modifica la asociación de reservas por correo.
- Se añadió CSS selectivo para `#known-customer.hidden` y los formularios de identidad `hidden`, evitando tarjeta «Cuenta reconocida» superpuesta a un teléfono vacío.

## Evidencia QA

- Rama aislada: `via-identity-recognized-qa-20261120`; Worker QA preexistente `https://via-traslados-gps-precision-qa.marcelof-gx.workers.dev/`.
- GitHub Actions final QA `44673518808`: **success**.
- HTTP 200 real para HTML con V29.1.4 y app `29.2`; API QA aislada, POST `/api/requests` bloqueado con HTTP 503. Verificación de que producción V29.1.3 seguía intacta durante QA.
- **11 pruebas Chrome E2E sintéticas**: sesión válida en 320/360/390/412, invitado, token inválido, error de API, sesión vencida durante la confirmación, volver desde paso 3, cambio de identidad entre pestañas y cierre de sesión dentro de la misma pestaña. Todas superadas; sin scroll horizontal.
- Sesiones, nombres, correos y tokens utilizados en QA son sintéticos; no hay reservas reales ni envíos OTP reales.

## Publicación productiva controlada

- Commit de publicación: `cd3299cbac6dfcc1a46e64f7086f185143b28ced`.
- GitHub Actions `44673716608`: **success**.
- Preflight: Cloudflare web V29.1.3 y API V35 exactas; hashes de config, geo, GPS, store y APK validados.
- Despliegue **solo web** V29.1.4: Worker `via-traslados-web-prod`, versión Cloudflare **`2d0205bf-990f-44ae-94e4-cf517a9d2093`**; deployment **`811b58a6-621c-46f0-9bc8-02c1b6f224b8`**.
- Postdeploy: activo al 100 %, HTML y `app.js?v=29.2` verificados, salud API V35 y OTP bien, y **las 11 pruebas Chrome sintéticas** realizadas otra vez sobre `https://viatraslados.com/`, todas exitosas. Geocodificación inversa pública IDE Uruguay contestó.
- SHA-256 final de `app.js`: **`73afe2490a64b9a1c1b6cf4ce61283c1f68184208cbe783a70126cecc3b21e69`**.
- Evidencia QA privada ID `14600733810` (retención hasta 20/12/2026); evidencia publicación privada ID `14601191189` (retención hasta 18/02/2027).

## Componentes intactos

| Componente | Versión/hash confirmado |
|---|---|
| API V35 | `9f0db4cc-29b8-4d79-8ce8-8fb0588bd079` |
| Store | `3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8` |
| GPS `reference.js` | `7e4841b60c7a9796673ed7ad41e54446cac3eded802bcb1cb37971cec61fd47b` |
| Motor `geo-v2/core.mjs` | `17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1` |
| `config.js` | `51c35d348defb7f6b804457ffee090642cc609a9c22d57f3521e6a7706247273` |
| APK V35 | `324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3` |
| D1 | Sin migraciones, restauraciones ni modificaciones |

## Rollback exacto

Restaurar solo Worker web `via-traslados-web-prod` a **V29.1.3 `ae77208c-2200-4a83-9411-c27170112009`** al 100 %. Guard: `scripts/via-identity-v2914-production-guard.mjs rollback`. Comprobar `app.js?v=29.1` y SHA `3df13d2f4d318511ea189e90446da78fd448d8edf90fc4d41df7d7e7e0f03a0c`; sin tocar API ni D1. No se ejecutó rollback durante la publicación.

## Pendiente de validación manual

Probar en Chrome real del Samsung con una sesión personal válida que muestra el paso 3 con nombre y contacto, y con una sesión cerrada donde se presenta el paso 2. Las pruebas automatizadas no sustituyen la comprobación física ni prueban una reserva real de extremo a extremo.
