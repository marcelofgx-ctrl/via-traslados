# Vía Traslados — Corrección «Salir» en Mis reservas, 18/11/2026

## Fallo reproducido y fuente real

El usuario observó en `https://viatraslados.com/mis-reservas.html` que «Hola, [nombre] · Sesión segura» continuaba apareciendo después de pulsar **Salir**, simultáneamente al mensaje «Sesión cerrada». Además quedaba el celular de acceso anterior, dificultando entrar como nueva persona.

La fuente publicada `via-ux-v25.css?v=25` define `body[data-page="mine"] .via-mine-account.known-customer { display:flex!important; }`. Su especificidad prevalece sobre `.hidden {display:none!important;}`, y vuelve visible la tarjeta que JS correctamente intenta ocultar.

La vista `app.js?v=29` además esperaba a `S.logout()` (con petición remota) antes de actualizar el DOM y una llamada `S.resume()` antigua podía reintroducir la cuenta A.

## Cambios preparados exclusivamente en QA

- Script `scripts/maestro-mine-logout-qa-patch.mjs`: parte de hashes comprobados de `app.js?v=29` (`2801344d2589c045b272482967098c701cebbe7e0d6aa13ec48ea76593f7a3c3`) y `mis-reservas.html` (`ca8cb66fbf09a45fb2262eaf04ca0e8a89f53b81d8d269ac1ac2b38f9333e089`). Aborta si producción cambia.
- CSS nuevo `mine-identity-qa.css`: `#mine-welcome.hidden {display:none!important}` y reglas equivalentes limitadas a `body[data-page=mine]` para formulario, pestañas y selector.
- JS `initMine.draw()`: se queda vacío al no haber sesión, limpia nombre/lista y las respuestas de reserva se comprueban con la identidad/época actual antes de mostrarse.
- Evento de logout: limpiar celular y OTP de la pantalla, mostrar opciones y mensaje inmediatamente, sin esperar a que finalice la revocación remota.
- `scripts/via-v29-store-idempotency-qa.mjs`: `resume` y `mine` descartan respuestas iniciadas con otra sesión, y `logout` elimina almacenamiento local antes de revocar token servidor.
- Opciones visibles y compactas sin sesión: **«Ya tengo cuenta»** y **«Soy nuevo · Registrarme»**. La primera permite ingresar con celular existente; la segunda abre en la misma pantalla un **registro independiente**, con nombre, celular, email y OTP verificado, sin exigir solicitud de traslado. Aprovecha en producción el backend existente `POST /api/auth/start`, `POST /api/auth/verify` y `POST /api/customer/session` (no alterado).
- Todos los cambios se generan solo en el Worker QA `via-traslados-maestro-web-qa`; los demás recursos de producción y la V35 no cambian.

## Evidencia automática

- Fuente real auditada, hashes sin leer usuarios: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44419846291
- Build de los tres parches y publicación QA con Worker y motor geográfico preservados, smoke y prod intacta: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44420351608
- Navegador Chromium real en 320, 360, 390 y 412 px: entrar como pasajero A, ocultar formulario al iniciar, Salir, esconder nombre y teléfono anterior, ofrecer nueva/existente, ingresar B, sin scroll horizontal. Además, una respuesta tardía de A después de salir se descarta. **Todas aprobadas**: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44420866563

## Estado y siguientes pasos

**QA aprobada. Producción aún sin cambios.** No se ha publicado `app.js`, `store.js`, CSS ni HTML modificados en `viatraslados.com`; la captura original continuará reproduciéndose allí hasta que se apruebe un despliegue controlado.

Para producción, crear **parche mínimo sin el resto de las novedades QA** (especialmente NO trasladar `Idempotency-Key`/backend sin su migración). Partir de bytes y versión activos, conservar **todos** los assets, el Worker geográfico y la APK firmada V35, probar el paquete en Worker staging, registrar versión previa, habilitar rollback, comprobar SHA, sesiones reales y OTP en una cuenta autorizada antes del despliegue.

El alta nueva autónoma ya está preparada en QA mediante el backend existente. La prueba utiliza OTP **sintético** restringido a cuentas `@qa.invalid` con código `123456`; no se envía correo real. Falta confirmar entrega OTP real, Turnstile y credenciales del proveedor en una prueba controlada antes de publicarla en producción.

## Registro autónomo de QA — evidencia posterior
- La pantalla ahora tiene inscripción nueva sin viaje: nombre, celular, correo, solicitud de OTP y confirmación en `Mis reservas`.
- La API MAESTRO QA habilita exclusivamente correos falsos `@qa.invalid` y código de ensayo `123456`, protegiendo de envíos reales y verificando el contrato de sesión de la app. Esta excepción **no se incorpora al Worker productivo**.
- Ensayo HTTP real de backend y privacidad A/B: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44421672785
- Ensayo Chromium móvil 320/360/390/412 + **creación autónoma de nueva cuenta con OTP QA sin reserva** + cambio A/B + respuesta antigua descartada: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44421783650
- Publicación únicamente web QA y auditoría de producción intacta: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44421730011
