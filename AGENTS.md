# Vía Traslados — directivas permanentes de trabajo y entregas

Estas instrucciones aplican a toda intervención futura en Vía Traslados: PWA de pasajeros, API/Cloudflare, D1, APK conductores, buscador, mapas, paneles, QA y producción.

## Regla obligatoria: el usuario siempre recibe instrucciones y enlace al final

Cada vez que se proponga, prepare, pruebe, corrija o publique una función, la respuesta al usuario **debe** terminar con un enlace directo y exacto a lo que puede abrir o inspeccionar. El enlace debe corresponder al estado REAL de la entrega, no a lo que se pretende conseguir.

- Si está **publicado en producción y verificado**, terminar con `https://viatraslados.com` o la ruta exacta que se modificó, indicando la versión visible.
- Si se trata de **una versión QA efectivamente desplegada y accesible**, terminar con su URL QA real, dejando claro que no es producción y si los datos o endpoints son simulados.
- Si únicamente se han ejecutado **pruebas automáticas sin publicación**, terminar con el enlace directo a la ejecución específica de GitHub Actions (o PR/commit si no hay ejecución) precedido por «Solo pruebas de código; todavía no se puede probar en la web». No entregar un enlace productivo como si contuviera un cambio que aún no fue publicado.
- Si no existe todavía un enlace válido, decirlo explícitamente, sin inventar direcciones; terminar con el último enlace real y su propósito, o explicar que no hay preview disponible.

**La última sección de toda comunicación de entrega debe ser «Enlace para probar / verificar», con al menos un enlace real identificado, o una explicación expresa de por qué todavía no existe.** Nunca colocar después del enlace información clave que haga ambiguo qué se está probando.

## Formato de informe obligatorio para cambios y publicaciones

Antes del enlace final, detallar de manera breve pero suficiente, en español claro y sin requerir que el usuario interprete logs:

1. **Qué solicitó el usuario y qué se hizo:** cambio específico y comportamiento esperado.
2. **Versión exacta y entorno:** producción, QA, solo branch/código o pruebas locales; distinguir WEB, API, APK y D1. Indicar versión o commit cuando esté verificado.
3. **Estado real:** preparado, en pruebas, aprobado, publicado, fallido, restaurado; nunca confundir CI verde con publicación ni `workflow run successfully requested` con despliegue completado.
4. **Cómo probarlo:** pasos numerados concretos para un teléfono Android y, cuando corresponda, iOS; datos o consultas de ejemplo; interacción esperada y cómo confirmar el éxito.
5. **Qué quedó fuera o pendiente:** funciones no implementadas, proveedor sin validar, limitaciones de QA/mocks y pruebas manuales pendientes.
6. **Protección y recuperación:** posibles efectos sobre reservas, GPS, autenticación, APK, datos D1; versiones anteriores y rollback realmente comprobado (sin prometer garantías absolutas).
7. **Pruebas verificadas:** enlace a corrida, número de pruebas pasadas/fallidas, si fueron simuladas o con servicios reales, y fecha cuando proceda.
8. **Qué tiene que hacer el usuario:** indicar «nada» si no requiere acciones; si hay una acción, un solo paso claro con la pantalla/opción precisa.

El usuario no debe tener que adivinar qué hicimos, ni preguntar nuevamente dónde abrir la aplicación.

## Control previo para afirmar «publicado»

- Comprobar ejecución finalizada con éxito, versión Worker efectivamente activa y porcentaje de tráfico, respuesta HTTP real del sitio o servicio, y funcionamiento de los cambios según los tests pertinentes.
- Comprobar versión visible y concordancia con metadatos. La versión debe ser pequeña, discreta y siempre visible en pantalla principal: ver `docs/VIA_UI_SAFETY_CONTRACT_2026-11-23.md`.
- No confundir el último código subido a Cloudflare con el código de la versión que recibe tráfico después de un rollback.
- Nunca atribuir un fallo funcional a un proveedor sin separar respuestas reales de datos descartados por nuestra lógica.
- En QA, indicar si se probaron solo respuestas simuladas. No presentar búsquedas de POI ficticios como evidencia de resultados de Geoapify reales.
- Mantener reserva, identidad, GPS, mapa y D1 protegidos; un cambio puramente visual no justifica modificar API o base de datos.

## Ejemplo de cierre correcto

**Estado:** V30.0 sigue en producción, Geoapify POI aprobado en pruebas simuladas pero NO publicado.

**Cómo verificar ahora:** abrir web, probar direcciones por calle y número; la búsqueda por nombre de comercio aún puede devolver cero resultados.

**Enlace para probar / verificar:** [Vía Traslados — producción V30](https://viatraslados.com). *Este enlace NO incluye todavía Geoapify Places.*

Si en cambio la entrega es «QA solo de código», el enlace final debe ser la corrida concreta de GitHub Actions y no la página de producción.

## Referencias del proyecto

- Contrato de seguridad y versión visible: `docs/VIA_UI_SAFETY_CONTRACT_2026-11-23.md`.
- Producción PWA: `https://viatraslados.com`.
- Repositorio: `https://github.com/marcelofgx-ctrl/via-traslados`.
- No codificar como estable la URL de un QA temporal; verificar cuál es el Worker efectivamente desplegado en cada entrega.
