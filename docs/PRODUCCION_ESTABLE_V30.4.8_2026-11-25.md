# Vía Traslados — Base estable V30.4.8 / V35
**Consolidación: 25/11/2026, Uruguay.** Esta acta prevalece sobre las referencias históricas de producción de versiones anteriores. No implica que main o pages-release contengan los bytes actualmente servidos.
## Identidad y recuperación
| Recurso | Referencia verificada en publicación |
|---|---|
| Web pública | https://viatraslados.com — V30.4.8 |
| Worker web (100 % de tráfico) | via-traslados-web-prod / d29d5304-db8d-48bb-a082-44b336454ed6 |
| Worker API (sin cambio) | via-traslados-api / 5ad845a7-beeb-44e5-9e52-6459bd1fbb8b |
| Rollback web anterior | V30.2 / 9e2dac8c-6d6f-4921-b425-99b6a71d525d |
| D1 de reservas | via-traslados-db, sin cambios de datos ni migración en el release web |
| Caché de establecimientos | via-poi-cache-prod, separada de reservas |
| APK conductores | V35 producción, API real, conservada |
| QA | https://via-traslados-v304-search-stage.marcelof-gx.workers.dev — sin cuentas ni reservas reales |
| Fuente de release | d61600e465fd635efaec8d80e15e88459cb425de |
| Rama de referencia | via-stable-v3048-prod-20261125 |

Activación registrada 25/11/2026 08:07:05 UY. La ejecución final terminó con éxito a las 08:07:26 UY (comparación de 39 recursos). No hubo rollback.

## Evidencia verificable
- QA aprobada: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45599888559
- Construcción, contrato de bindings y manifiesto: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45600307825/artifacts/15014789208
- Activación del mismo candidato y verificación posterior: https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/45601161049
- La primera promoción quedó bloqueada por una comprobación incorrecta de visibilidad del número de versión. La segunda comprobó URL de script y elementos reales, reutilizó el candidato exacto y superó los controles antes y después de la activación. No era un problema de Chrome.
- Pruebas emuladas Android/Chromium e iOS/WebKit aprobadas: búsqueda Costa Urbana, distancias, teclado, indicador azul, regreso/recarga conservando la ruta sin duplicar consultas.
- Invariantes de producción: OTP health/config/CORS (no envío real), ruta Shangrilá–aeropuerto, geocodificación inversa, portada, config, app.js, motor geográfico, reserva.html, disponibilidad APK V35.
- Validación del usuario en teléfono real: búsqueda Costa Urbana con distancia 1,7 km en línea recta, creación de dos solicitudes, recepción en APK V35 con distancias viales 3,2 km/5 min y 2,9 km/6 min; cancelación de la solicitud al aeropuerto reflejada en la APK (dos nuevas pasan a una). No se certifica una reserva comercial completa ni el cobro.

## Funcionalidades congeladas
IDE Uruguay + Geoapify complementarios; prioridad por relevancia y cercanía; sugerencias con distancia en línea recta, cálculo vial separado; caché local POI 24 h y D1 POI 30 días (8192 slots, máximo 6000 bytes de payload por slot); caché de rutas existente; botón GPS circular, ayuda temporal 4 segundos, teclado compacto con restauración, número aproximado azul integrado y mapa accesible. Producción conserva identidad/Turnstile y reservas; la ayuda de aislamiento de autenticación QA NO forma parte de producción.

## Regla de continuidad
1. No reconstruir producción desde una rama antigua. Antes de cambios, verificar Worker activo y última versión subida, inventariar los activos efectivos y respaldar el candidato exacto. No asumir que GitHub main es la fuente de los bytes desplegados.
2. Todo cambio nuevo sale de esta base verificada a una rama QA separada. No modificar esta rama estable. QA y D1 de producción separados; no usar credenciales ni reservas reales en QA.
3. Regresión obligatoria: IDE/POI (Costa Urbana, Nuevocentro, McDonald's, direcciones con puerta), GPS, rutas, cachés al volver/recargar, teclado/cierre/selección, mapa, identidad, solicitudes y APK. No considerar aprobado si la prueba no alcanza el componente efectivo.
4. Publicar candidato sin tráfico, comprobar contratos y 39 activos de referencia más cambios autorizados, probar Android/iOS; obtener aprobación visual cuando corresponda. Activar exclusivamente la versión aprobada, verificar dominio real y API/OTP/APK; rollback si falla. Mostrar versión visible y enlace exacto al entregar una prueba. No decir "publicado" antes de verificar tráfico.
5. Rollback únicamente web: desde un entorno autorizado comprobar que el Worker activo siga siendo d29d5304-db8d-48bb-a082-44b336454ed6; volver a 9e2dac8c-6d6f-4921-b425-99b6a71d525d si se justifica. Nunca restaurar D1 ni revertir API por un defecto web. Revalidar el dominio tras revertir. El rollback recupera V30.2 y pierde las mejoras V30.4.8; conservar ambas referencias.
6. Para restaurar V30.4.8 ante una regresión de una versión futura, comprobar compatibilidad de API/D1 y disponibilidad de la versión exacta d29d5304-db8d-48bb-a082-44b336454ed6; activar sólo con autorización y smoke posterior.

## Pendientes (no modificados en esta consolidación)
- Eliminar duplicados de POI sin perder cobertura ni direcciones.
- Evitar mensaje de distancia pendiente inicial si el cálculo ya existe; analizar persistencia/asíncronía antes de cambiar.
- Probar envío y recepción real OTP con sesión nueva, dispositivo iOS físico y ciclo presupuesto–aceptación–asignación–inicio–finalización–cobro, con solicitudes de prueba controladas.
- Mantener número de versión visible en todas las entregas futuras; la comprobación del release actual verificó script y elementos, no certificó visibilidad del número en portada.
- No se ejecutó limpieza de solicitudes, migración, nuevo despliegue ni copia de datos de clientes. Esta acta y rama son una referencia de código/recetas y versiones Cloudflare, no un respaldo autónomo de D1 ni una copia íntegra de los artefactos activos. El manifiesto de GitHub del release tiene retención limitada.
