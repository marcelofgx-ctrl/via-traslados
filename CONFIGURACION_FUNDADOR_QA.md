# Vía Traslados — alta del administrador fundador (QA 0.5)

Este cambio corresponde únicamente al proyecto **Vía Traslados**.
No altera Quick Trip, la web de pasajeros, sus datos ni los DNS de Resend.

## Funcionamiento acordado

- La pantalla de registro es la misma para todos.
- El fundador se reconoce por la coincidencia **en el servidor** de su celular y su correo electrónico con las variables privadas configuradas en el Worker.
- Solo **después de verificar el correo con OTP** se activa el rol `admin` y el estado `approved`. Sin SMS, el correo preconfigurado es una condición de seguridad imprescindible: no basta con escribir el teléfono del fundador.
- Los demás usuarios entran como `driver` / `pending`, confirman su correo y requieren aprobación.
- El fundador puede aprobar conductores, designar uno o varios administradores y revocar sus permisos. Un administrador delegado no puede nombrar a otros.
- El fundador no puede retirar su propio permiso desde el panel.
- Cambiar de administrador a conductor o viceversa revoca todas las sesiones previas de esa persona, incluidas las biométricas.

## Activación segura en Cloudflare (pendiente)

Configurar en el Worker exclusivo `via-traslados-api` las siguientes variables privadas, con los datos **correctos y expresamente confirmados por el titular**:

- `VIA_FOUNDER_PHONE`: el celular del fundador, normalizable a E.164 uruguayo. No se incrusta en la APK.
- `VIA_FOUNDER_EMAIL`: correo del fundador que realmente puede recibir el código OTP de Resend. No se infiere de capturas ni de direcciones de prueba.

Ambas variables deben configurarse **antes** de validar el alta real. No difundir las variables como texto público ni comitear valores en GitHub.

Si no se configuran, el backend mantiene la conducta previa: cuenta de conductor pendiente. Si ya existe una cuenta con los datos correctos y el correo verificado, reabrir la verificación en el backend actualizado permite activar su rol fundador sin borrar la cuenta.

### Orden de QA y producción

1. Ejecutar pruebas de regresión de backend, roles, revocación y OTP.
2. Compilar e instalar la APK de pruebas `uy.viatraslados.conductor.founderqa` sin sustituir las versiones anteriores.
3. Validar diseño con capturas reales y probar red lenta, error, reenvío y teclado.
4. Confirmar los datos fundadores y preparar las variables en Cloudflare.
5. Desplegar el backend correspondiente y verificarlo con D1 y Resend; solo entonces probar el flujo completo de administrador fundador.
6. Promover a producción con consentimiento explícito. Ningún trabajo de esta rama debe desplegar Cloudflare automáticamente.

## Diseño 0.5

Registro y OTP en páginas completas y compactas, evitando diálogos modales apilados sobre el formulario. La espera muestra una línea de progreso indeterminada verde petróleo con texto contextual, para indicar trabajo de red real sin simular resultados. Se conserva el inicio por celular/contraseña y huella con permiso.

## Limitaciones

Aún no existe validación por SMS: la combinación segura depende de la configuración del teléfono fundador **y** la prueba de control de su correo. Las pruebas automatizadas no sustituyen la comprobación visual en un Samsung real.
