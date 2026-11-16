# Vía Traslados — Geolocalización v2 (QA aislada)

## Motivo
No confundir **posición GPS**, **domicilio postal** y **punto de recogida**. En la versión previa, la geocodificación inversa adjudicaba el portal más próximo, había una excepción a una calle concreta y el render dependía de un recurso cartográfico incompatible con el navegador. Ninguna de esas decisiones certifica el domicilio del usuario.

## Contrato de datos
- `pickupPoint`: latitud/longitud de GPS o selección explícita en mapa; `source`: `gps`|`map`; precisión estimada en metros cuando proviene de GPS; tiempo de captura.
- `postalAddress`: calle, número, localidad, departamento, país; `status`: `user_confirmed`|`suggested`|`unknown`; fuente y distancia al punto.
- `nearbyReference`: posible calle/portal cercano, **nunca** considerado domicilio exacto por una consulta inversa.
- `instructions`: texto voluntario del pasajero ("portón", "esquina", etc.).
- Es válido tener punto de recogida sin número de puerta identificado. No fabricar números ni sustituciones de localidad.

## Reglas y umbrales de validación
1. GPS: capturar coordenadas, margen de precisión y antigüedad. Intentar nueva lectura si es impreciso o antiguo. No prometer precisión de puerta.
2. Geocodificación inversa: usar resultado como **referencia**; si hay calles distintas próximas o distancias excesivas, mantener la calle como no confirmada.
3. El usuario confirma una dirección postal o un punto manualmente; la respuesta asíncrona del geocodificador no sobrescribe una elección posterior.
4. Guardar lat/lng del GPS o de la chincheta como fuente de la verdad del lugar elegido. La coordenada del resultado postal no la sustituye.
5. No introducir reglas excepcionales por calle, matrícula, coordenada o localidad. Todas las reglas deben ser genéricas.
6. La capa de números en mapa se evalúa según **disponibilidad real** del dato. No generar edificios/portales sintéticos.
7. No hacer otro despliegue de prueba al usuario hasta tener pruebas de lógica, integración y un control visual verificable en dispositivos móviles.

## Pruebas de aceptación antes de QA móvil
- Resultados cercanos con puertas diferentes: ninguno se convierte automáticamente en el domicilio del pasajero.
- Dos calles cercanas: etiquetar como ambiguo, no decidir por el primer resultado.
- GPS con error alto o coordenadas antiguas: informar de baja confianza y ofrecer ajuste manual.
- Una ubicación marcada en mapa: conserva exactamente las coordenadas seleccionadas.
- Búsqueda textual con número confirmado: la tarjeta muestra calle, puerta y localidad; si no existe, invita a fijar punto en mapa.
- Reapertura del selector, navegación y confirmación: no altera el valor de origen/destino por respuestas asíncronas.
- Pantalla principal estable con contenido largo, teclado abierto y navegador móvil; sin reescalado JavaScript.
- Mapa sin cuadrados vacíos y con aviso útil al fallar el proveedor. Trazar errores de carga MapLibre por navegador.
- Pruebas en múltiples localidades con datos ficticios/sintéticos y diversas categorías: casco urbano, suburbio, interior, sin numeración.

## Secuencia de trabajo
1. Implementar y probar el núcleo puro de evaluación GPS y confianza en direcciones en esta rama, sin conectarlo a producción.
2. Reemplazar el endpoint IDE por un adaptador que conserve tipo de resultado, estado y confianza (sin reglas locales particulares); comparar con fuente independiente en casos ambiguos.
3. Integrar núcleo + UI en QA, verificando coordenadas al enviar reservas y experiencia en pantalla.
4. Publicar solo tras superar pruebas automatizadas y revisión visual; ofrecer al usuario una única prueba final representativa.

**Estado:** plan de refactorización; no aprobado para producción ni desplegado.
