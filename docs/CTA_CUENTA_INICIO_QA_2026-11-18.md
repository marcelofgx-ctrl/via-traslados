# Vía Traslados — Invitación contextual a crear cuenta en portada (QA)

**Fecha:** 18 de noviembre de 2026, Uruguay.
**Objetivo:** visibilizar el registro autónomo, sin cambiar buscador geográfico, reservas, APK o producción.

## Comportamiento
- En la portada V29 activa clonada a QA, se incorporó **un único aviso compacto después del botón «Mis reservas»**, con la frase «¿Primera vez en Vía? · Tu cuenta, tus reservas.» y CTA «Creá tu cuenta».
- Se oculta si hay sesión validada mediante `ViaStore.customer()` + `ViaStore.resume()`, se muestra si no existe sesión, y se actualiza tras ingreso/salida, regreso a la pestaña o cambios de identidad. Si la verificación de sesión falla, ofrece el registro, sin asumir que la cuenta no existe.
- El CTA abre `mis-reservas.html?accion=registro` y muestra exclusivamente el formulario autónomo de alta, sin solicitar un traslado. Respeta una cuenta que ya esté identificada y no fuerza cerrar una sesión existente.
- Se mantienen el motor IDE Uruguay/Geoapify, `app.js?v=29`, reservas, estilos confirmados, navegación y APK productiva intactos.
- CSS y JavaScript de la invitación están limitados a `#via-home-account-invite` y empaquetados solo en QA; no añaden un buscador ni cambian teléfonos del pasajero.

## Qué detectamos sobre el teléfono

La portada **no conoce el número de un visitante anónimo**. No debe consultar registros por dispositivo, IP ni geolocalización. Solo se verifica si el usuario inició sesión y conserva una sesión válida.

El código backend existente, `backend/customer-auth.js`, contiene `accountByPhone()` y `POST /api/customer/phone/identify`. Este último consulta registros únicamente después de que la persona escribe el celular y supera Turnstile, con rate limits por teléfono/IP y grant efímero. Puede indicar si ya tiene cuenta, y disponibilidad de PIN/huella, sin autenticar solamente por número. El asistente debe preservar esta protección y **no implementar autoenumeración de celulares**.

## Cambios de código — QA aislada

- `scripts/qa-home-account-invite.js`
- `scripts/qa-home-account-invite.css`
- `scripts/maestro-web-qa-prepare.py`: inserta el aviso sobre HTML V29 efectivamente publicado y aborta si cambia la estructura, conserva SHA/manifest y comprueba QA.
- `scripts/maestro-mine-logout-qa-patch.mjs`: acceso directo `?accion=registro` inicia realmente modo de registro y habilita OTP sin afectar login existente.
- `scripts/maestro-browser-mobile-qa.mjs`: portada con/sin sesión, A→B, salida, enlace a registro, alta autónoma ficticia con OTP de QA y cero reservas.

## Evidencias

- Build e implementación web QA; Worker productivo y V34 QA intactos: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44428548455
- 320/360/390/412 px sin scroll horizontal ni errores JS, CTA visible sin sesión, oculto al ingresar A o B, visible tras salir; enlace abre formulario autónomo: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44428896257
- Flujo real de alta desde el CTA, OTP **sintético QA** y cuenta creada sin reservas, más mismos cuatro anchos: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44429016096

## Riesgos / producción

**NO PUBLICADO EN PRODUCCIÓN.** `main`, `viatraslados.com`, D1 productiva, Worker productivo y APK V35 no se modificaron.
Antes de trasladar la mejora a producción se necesita revisar assets efectivos/versión desplegada, probar correo OTP real y Turnstile con cuenta de prueba autorizada, controlar cache PWA y preparar rollback sin tocar los datos reales.

**Entorno QA:** https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev/
