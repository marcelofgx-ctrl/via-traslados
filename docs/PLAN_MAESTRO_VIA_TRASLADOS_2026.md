# VÍA TRASLADOS — PLAN MAESTRO DE CONTINUIDAD

**Fecha:** 18 de noviembre de 2026  
**Estado:** especificación versionada; no es un despliegue ni reemplaza las pruebas reales.  
**Repositorio exclusivo:** `marcelofgx-ctrl/via-traslados`  
**Producción:** https://viatraslados.com  
**Backend:** `via-traslados-api` (Cloudflare Workers)  
**D1 de producción:** `via-traslados-db`  
**App Android:** `uy.viatraslados.conductor.production`, APK firmada V35.

## 1. Producto y reglas de negocio que no se deben desvirtuar

Vía Traslados es una plataforma de **solicitud y reserva anticipada** de traslados privados en Uruguay, similar conceptualmente al flujo de GetTransfer. NO es una aplicación de transporte urbano inmediato tipo Uber. El pasajero solicita origen, destino, fecha, hora, viajeros y equipaje; una persona autorizada cotiza manualmente; el pasajero acepta; se confirma y asigna el servicio; el conductor cobra presencialmente, con su propio POS si corresponde. Las referencias tarifarias ayudan, pero no sustituyen una cotización emitida por persona autorizada.

Roles actuales:
- **Administrador fundador:** cuenta de titular verificada por correspondencia de correo + teléfono configurados en el Worker; único capaz de otorgar/retirar permiso `admin` y administrar condiciones comerciales.
- **Administrador delegado:** puede administrar operaciones según sus capacidades, pero no nombrar nuevos administradores.
- **Socio:** condiciones comerciales y visibilidad definidas por el administrador fundador.
- **Contratado:** sólo ve solicitudes asignadas o liberadas de acuerdo con reglas de despacho; comisión de referencia 25%, que se devenga al completarse el viaje, no al enviar la oferta.

No inventar notificaciones, ubicaciones GPS en vivo, fotos de vehículos, verificaciones de teléfono ni precios finales que el backend no proporcione.

## 2. Fuentes de verdad y prohibiciones

1. **No rediseñar ni reimplementar** el buscador geográfico, geocodificación, ruta/duración/distancia actualmente funcionales (IDE Uruguay, Geoapify y frontend asociado).
2. **No copiar `pages-release` ni `design/via/booking-v25` directamente a producción.** Son referencias históricas/QA, no necesariamente reflejan todos los assets activos en el Worker `via-traslados-web-prod`.
3. Para editar la web: inspeccionar y preservar los **bytes de los assets realmente servidos** por el Worker productivo y su manifest de la versión vigente; alterar sólo archivos y selectores explícitamente relacionados con la vista de ofertas.
4. No tocar la D1 productiva, registros reales ni credenciales de pasajeros para pruebas. Preferir datos sintéticos en un Worker y D1 QA separados.
5. V35 APK productiva debe seguir firmada con la **misma clave privada** para todas sus futuras actualizaciones. No rotar ni reconstruir certificado de firma; guardar copia privada fuera del sitio y Git.
6. Prohibido mezclar recursos de Quick Trip/Mapa QT, Fila Digital y Vía Traslados.
7. Las comprobaciones deben proteger las nueve etapas reales: `requested`, `quoted`, `accepted`, `confirmed`, `en_route`, `arrived`, `in_progress`, `completed`, `cancelled`.
8. Mantener estado `quoted` (oferta recibida) **diferenciado** de `accepted` (pasajero aceptó) y de `confirmed` (servicio confirmado).
9. Toda modificación a producción requiere respaldo, verificación funcional, rollback documentado y autorización expresa del usuario.
10. No afirmar que QA o producción pasaron las pruebas antes de disponer de resultados verificables.

## 3. Web pasajero — primera entrega: mejorar SOLO «Oferta recibida» (V30 Web)

**Decisión validada el 18/11:** la vista V29 de reserva **confirmada** se conserva: ya es clara, premium y funcional. V30 no reemplaza el seguimiento general, no altera la confirmación verde ni las pantallas `accepted` / `confirmed`. El nuevo diseño compacto se aplica exclusivamente al estado `quoted` de la vista de pasajeros. Otras mejoras de densidad se discutirán aparte.

### Objetivo
Que el pasajero, **cuando exista una oferta recibida (`quoted`)**, entienda en una sola pantalla principal el recorrido, la fecha/hora, el importe, quién propone el traslado (si esa información fue autorizada) y cómo aceptar esa oferta. La página confirmada (`confirmed`) no debe cambiar. Inspiración estructural: tarjetas compactas y controles inferiores de referencia aportada por el usuario. **Diseño original** de Vía Traslados, sin copiar identidad de terceros.

### Jerarquía de pantalla (móvil)
1. Encabezado compacto: `Oferta recibida`, fecha/hora y referencia de reserva abreviada.
2. Resumen de trayecto: A/origen, B/destino, km y minutos reales calculados o aviso de dato no disponible.
3. Mapa **miniatura opcional** o acción `Ver recorrido` si pantalla pequeña, sin geocodificación nueva ni peticiones repetidas.
4. Tarjeta principal: **importe final propuesto en UYU** destacado; servicio programado; viajeros y valijas.
5. Conductor y vehículo: mostrar sólo lo respaldado por la API autorizada; si no hay vehículo/imagen, no inventar ni publicar PII.
6. Acción fija y dentro de área segura: **Aceptar oferta**; secundario discreto `Volver`. No ofrecer `Rechazar` hasta verificar contrato backend y efectos.
7. Datos secundarios en un panel desplegable: notas, condiciones, mapa expandido y otros detalles.

### Reglas de UX
- **Sin scroll vertical para el núcleo** de la oferta en móvil típico; adaptable a 320×640, 360×740, 390×844 y 412×915, también 1280 px.
- No establecer `overflow:hidden` general que esconda textos, precio o controles. Con texto ampliado (200%) o traducciones largas, permitir desplazamiento accesible.
- Barra inferior táctil 48–52 dp, esquinas 12–14, verde petróleo sólo en la acción principal.
- Contraste legible, controles con accesibilidad, botones bloqueados mientras se procesa una operación; no bloquear navegación al volver de un diálogo.
- Al aceptar: loading inmediato, envío del endpoint real existente, bloqueo de repetición, confirmación **solo** tras respuesta de servidor. Respuesta 409/401/red debe dar estado comprensible y opción de reintento.
- Se debe conservar la selección de direcciones exactas, el kilometraje, el tiempo, la verificación de cuenta y acceso por PIN/passkey.

**Guarda de alcance:** probar igualdad visual y funcional de la pantalla confirmada antes/después de V30; los cambios de estilo deben quedar bajo un selector `data-booking-status="quoted"` o equivalente. Ningún cambio global de `status-card` o confirmación.

### Criterios de aceptación
- Ver un trayecto completo y un importe sin desplazamiento en 360×740, excepto si contenidos excepcionalmente largos o accesibilidad requieren scroll.
- Comprobar diseños para: sin oferta, oferta recibida, aceptada, confirmada, cancelada y errores.
- Variantes: ruta desconocida, dirección larga, 8 pasajeros, 5 valijas, importe elevado, precio ausente y sesión vencida.
- Aceptar una sola vez; dos taps simultáneos nunca crean dobles eventos. Errores 401/403/409 no dejan estado falso.
- Flujo válido entre web, backend QA y APK QA: solicitud `requested`, cotización `quoted`, aceptación `accepted`, confirmación `confirmed`.
- **Regresión cero** en assets geográficos y geocodificación: validar hash/archivos, geocodificación Shangrilá–Lagomar, mapa y route preview.
- QA aislada: **nunca enviar correos reales, generar reservas de pruebas en prod, ni tocar la D1 productiva**.
- Comparación visual contra V29 actual antes de autorizar cualquier publicación.

## 4. APK conductor V36 — confiabilidad y seguridad operativa

En otra rama, tras validar web V30:
- Medir tiempos completos de `crear solicitud -> visible en APK -> cotizar -> aceptar -> confirmado`.
- La APK V35 revisa solicitudes cada 20 s abierta; medir costos y latencia antes de bajar frecuencia a 6–8 s. El polling sigue siendo fallback.
- Notificaciones remotas cuando Android está en segundo plano o cerrado (FCM), con registro y revocación de tokens, permisos, idempotencia y comprobación física en Samsung. Hasta entonces no afirmar disponibilidad.
- Impedir del **lado servidor** pasar a `en_route` antes de la ventana permitida (parámetro a acordar, ejemplo 90 minutos), zona `America/Montevideo`, opciones explícitas y auditadas para administrador. UI deshabilitada con explicación; QA de límites.
- Corregir Ajustes `Versión 0.9.0` vs V35, y texto `cada 30 s` vs polling real `20 s`, usando metadatos de compilación y una constante única.
- Distinguir claramente conductor asignado, ubicación GPS verificada y ubicación no disponible; nunca simular seguimiento.
- Mantener términos `Nuevas`, `Con ofertas`, `Viajes`, `Historial`; mejorar indicadores/agrupación para viajes de hoy, próximos y en curso sin alterar reglas de visibilidad.

## 5. Alta y roles V37

- Alta verificada de conductores con nombre, contacto, matrícula, marca/modelo/año/color, capacidad, foto y documentación que corresponda.
- Fotos privadas en almacenamiento apropiado, formatos/tamaños controlados; accesos sólo titular/admin, sin URLs públicas permanentes ni base64 expuesto.
- Bandeja de aprobación administrativa con estado pending/approved/blocked, revocación de sesiones y huella al bloquear, eventos auditados.
- Condiciones comerciales únicamente desde fundador: socio / contratado y comisión porcentual, con balance auditado.
- Un conductor que cotiza toma la solicitud según reglas vigentes; evitar dos asignaciones y cruces horarios; probar atomicidad con SQL QA.

## 6. Experiencia V38 y trabajo posterior

- Seguimiento GPS real **solo si** se implementa un flujo explícito de permisos, telemetría y protección de privacidad.
- Refinamiento de navegación, acceso a mapa, tiempos estimados, estado de recogida, condiciones del servicio.
- Optimización de consulta de caché de rutas y telemetría del backend basada en medidas; nunca sustituir motor funcional por una aproximación.

## 7. Orden de trabajo y compuertas

**Paso 0 — terminado:** auditoría de reserva productiva (18/11): una reserva confirmada, vinculada con un pasajero, cotización, conductor administrador, ruta y eventos; la web y APK V35 funcionan para este caso. No equiparar esta prueba con cobertura E2E completa.

**Paso 1 — siguiente:** identificar fuente exacta del frontend V29 ACTIVO en `via-traslados-web-prod`, descargar copia para QA y tomar snapshot/hash de los ficheros geográficos y autenticación. No realizar escrituras D1 productivas.

**Paso 2:** construir **solo la pantalla V30 de oferta** en entorno QA aislado, conservar aceptación real existente, probar 320/360/390/412 y accesibilidad. Comparar captura contra V29.

**Paso 3:** conectar QA web con API/D1 QA para ensayar todos los estados y medir latencias.

**Paso 4:** presentar capturas, URL QA y resultados antes de tocar prod. Si el usuario aprueba, planificar despliegue exclusivo del frontend con rollback y verificar que APK V35 y backend no cambiaron.

**Paso 5:** V36 APK (notificaciones, tiempos, fecha), V37 conductores, V38 mejoras, cada una en rama/PR independiente.

## 8. Incidencias y documentación

- [#36 Push real y app cerrada](https://github.com/marcelofgx-ctrl/via-traslados/issues/36)
- [#37 Alta real y vehículo privado](https://github.com/marcelofgx-ctrl/via-traslados/issues/37)
- [#41 Latencia de transacciones y polling](https://github.com/marcelofgx-ctrl/via-traslados/issues/41)
- [#42 Hallazgos en APK V35](https://github.com/marcelofgx-ctrl/via-traslados/issues/42)
- [Mapa de despliegues](DEPLOYMENT_MAP.md)

**No dar por desplegada una versión por crear una rama/PR, ni por un workflow exitoso si no se ha comprobado el dominio correcto.**
