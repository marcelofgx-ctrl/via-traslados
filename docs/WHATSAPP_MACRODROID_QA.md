# Vía Traslados — verificación opcional por correo o WhatsApp (QA)

## Alcance
- Un pasajero nuevo elige **correo** (OTP de Resend) o **WhatsApp** (OTP del teléfono dedicado con MacroDroid).
- La validación inicial se hace una vez. Los siguientes ingresos se hacen con PIN de seis cifras o passkey (biometría/PIN del dispositivo).
- Para recuperar el PIN, el pasajero solo puede elegir un canal previamente verificado para **esa cuenta**.
- El método WhatsApp es experimental: **no equivale a la API oficial de WhatsApp** y puede fallar tras cambios en Android/WhatsApp o sufrir restricciones.
- Si el teléfono verificador no ha consultado la cola en los últimos 150 segundos, la web **no ofrece** el método WhatsApp y conserva el correo.

## Aislamiento
No desplegar esta rama directamente al Worker público \`via-traslados-web-prod\` ni a \`via-traslados-api\`. Validar en un Worker/API QA con D1 QA exclusiva antes de cualquier activación. Preservar los activos de producción existentes, geocodificador y frontend premium v23.

## Backend QA
1. Aplicar \`backend/schema.sql\` **solo a la D1 de QA de Vía Traslados**.
2. Configurar los secretos existentes para Turnstile OTP y \`OTP_PEPPER\` de al menos 32 caracteres.
3. Configurar **como secreto del Worker de QA**, no como variable pública, \`WHATSAPP_BRIDGE_KEY\` aleatoria de al menos 32 caracteres. No copiarla a GitHub, JavaScript web, screenshots ni logs.
4. Dejar funcionando \`PUBLIC_ORIGIN\` con el origen real y permitido por la configuración de QA. Turnstile verifica action \`otp\` y hostname del origen.
5. Pruebas: \`npm run check && npm test\`. Ejecutar verificación de compilación Worker y pruebas end-to-end contra D1 QA antes de habilitar el botón.

## Puente de MacroDroid — diseño de integración
Usar un **celular Android dedicado**, con WhatsApp en su cuenta de servicio y conexión estable. No utilizar la cuenta personal del administrador. Evaluar riesgos del equipo permanentemente desbloqueado y proteger su acceso físico.

- Cada 30–60 segundos MacroDroid hace \`GET /api/customer/whatsapp/bridge/next\` al **Worker API de QA** con \`Authorization: Bearer <CLAVE_PRIVADA_EN_EL_CELULAR>\`.
- Respuesta \`{"item":null}\`: no hay envíos. Si existe un trabajo: \`{"item":{"id":"UUID","recipient":"+5989...","message":"Vía Traslados: ..."}}\`.
- MacroDroid abre/envía WhatsApp a \`recipient\` con \`message\` mediante su automatización compatible con el dispositivo. El envío no está garantizado por la API oficial. No registrar códigos en notificaciones persistentes o historial de macros.
- **Solo cuando la acción de envío sea realmente satisfactoria**, \`POST /api/customer/whatsapp/bridge/ack\` con cabecera privada y JSON \`{"id":"UUID","sent":true}\`. Si falla: \`{"id":"UUID","sent":false}\`; se reintentará luego de un intervalo.
- El código es válido 10 minutos, máximo 5 intentos de verificación. La cola cifra el texto con AES-GCM y la DB conserva un HMAC del código, no el código en claro.
- No asumir que un tap automático garantiza entrega. Testear dispositivo bloqueado, reinicio, batería, conexión, WhatsApp cerrado, permisos Android y duplicados.

## Rutas nuevas
- \`GET /api/customer/verification/channels\`: canales disponibles según heartbeat.
- \`POST /api/customer/whatsapp/start\`: \`{phone,purpose:"registration"|"recovery",turnstileToken}\`.
- \`POST /api/customer/whatsapp/verify\`: \`{phone,purpose,code}\`. En alta devuelve comprobante de uso único; en recuperación devuelve sesión si el celular pertenece a una cuenta verificada.
- \`POST /api/customer/session\`: acepta \`{channel:"whatsapp",name,phone,verificationToken}\` para registrar solo después de verificar el celular.
- \`GET /api/customer/whatsapp/bridge/next\` y \`POST /api/customer/whatsapp/bridge/ack\`: **exclusivas de MacroDroid**, requieren secreto Worker de servidor.

## Datos y limitaciones conocidas
Por compatibilidad con el esquema existente, las cuentas creadas exclusivamente con WhatsApp reciben un identificador interno de correo \`wa-UUID@identidad.viatraslados.invalid\`. Ese identificador **no es un correo de contacto** y nunca debe usarse para mensajes. No se vinculan direcciones de correo proporcionadas por terceros sin verificación independiente. Para permitir cambiar de canal o añadir un email real a una cuenta WhatsApp, hace falta implementar una función separada de **verificar y vincular correo** antes del lanzamiento comercial.

## Salida de QA y criterios de paso
- Confirmar que Resend y acceso PIN/huella anterior no sufren regresiones.
- Comprobar que WhatsApp no aparece si MacroDroid está desconectado.
- Comprobar códigos equivocados, expirados, reusados, límites por IP/celular, errores de envío y reintentos.
- Comprobar que el PIN puede recuperarse por el canal previamente verificado, nunca por uno que no pertenece al usuario.
- Probar manualmente el envío real en el dispositivo dedicado y las vistas de 320, 360 y 390 píxeles.
- **No activar producción automáticamente**, ni ejecutar migraciones sobre otros proyectos.
