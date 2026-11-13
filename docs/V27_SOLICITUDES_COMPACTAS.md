# Vía Traslados — Solicitudes compactas premium V27 (QA)

## Objetivo
Optimizar la lista nativa de Solicitudes de Vía Traslados utilizando la referencia visual de GetTransfer **solo como guía de densidad**, manteniendo marca y estilo propios.

La pantalla es para la APK del conductor/administrador. No modifica la web pública de pasajeros.

## Diseño implementado
- Header de marca con altura existente; título **Solicitudes** de 21sp.
- Tabs **Nuevas** y **Con ofertas** (admin) / **Mis ofertas** (conductor), 46dp de alto y contadores reales.
- Barra de controles en una sola línea: **Fecha del viaje / Recientes** (orden real), **Filtro** (todas/aeropuerto/con equipaje), **Buscar** (dirección, ID o pasajero).
- Campo de búsqueda de 43dp solo cuando se abre; búsqueda inmediata sin reconstruir pantalla ni perder teclado.
- Tarjetas de 15dp radio, padding 13dp, 8dp entre tarjetas; sin elevación ni sombras fuertes.
- Fecha/hora a la izquierda, estado real a la derecha, ID y cotización (si corresponde) en segunda línea.
- Origen/destino con círculos A/B, dirección principal naturalizada, máximo 2 líneas por ubicación; detalle muestra la dirección completa.
- Fila única **ruta y tiempo** (si están calculados por proveedor), **pasajeros y valijas** en etiqueta compacta; spinner mientras se busca ruta.
- Atribución Geoapify / OSM visible y con enlaces al disponer de rutas; en demo offline se indica «Ruta ilustrativa».
- Acciones: texto «Ver detalles» y botón de **Sugerir precio** únicamente en solicitudes nuevas. Botón 42dp.
- Listas vacías, orden, filtros y contadores usan el dataset real; nada se muestra como disponible en GPS si no hay datos de presencia.

## Controles reales
- **Ordenación:** fecha del viaje ascendente o creación descendente. No inventar prioridad o tiempo de respuesta.
- **Filtros:** aeropuerto cuando aparece literalmente «aeropuerto/airport» en origen o destino; equipaje cuando la reserva indica al menos 1 valija.
- **Búsqueda:** texto en ID, dirección, destino y nombre de pasajero. Mayúsculas/minúsculas indiferentes.
- El cálculo de ruta reutiliza el caché de la reserva y se solicita solamente para tarjetas visibles; al filtrar se descartan las referencias visuales anteriores.

## QA
- Rama **via-solicitudes-compactas-v27-qa-20261112**, basada en V26; no fusionar ni publicar a producción.
- APK demo usa packageId **uy.viatraslados.conductor.v27preview** (distinto de la APK real y la V26 Demo), con datos ficticios locales. No requiere login ni puede operar sobre D1 o Worker.
- Estados simulados: 3 solicitudes nuevas, 2 con oferta y 1 aceptada. Permite probar tabs, búsqueda, orden, filtros y detalles.
- Flujo de backend de asignación y V26 sigue aislado para su validación antes de publicación operativa.
- Validación obligatoria: compilar APK, probar controles, legibilidad en teléfono Android, ampliar fuentes, direcciones largas, accesibilidad, visualización de atribución e importes.
- La APK demo NO se anuncia en `latest.json` de la aplicación real ni reemplaza la versión operativa.

## Pendientes fuera del alcance
- Posición GPS/ETA de conductores, notificaciones push con app cerrada.
- Publicación operativa V26/V27, firma digital estable y migración de la ficha de vehículo al D1 QA.
