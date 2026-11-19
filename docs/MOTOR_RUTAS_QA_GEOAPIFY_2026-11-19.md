# Vía Traslados — reactivar el cálculo vial real en MAESTRO QA

Fecha: 19/11/2026. **No es un cambio productivo**.

## Hallazgo confirmado por capturas de Samsung
El pasajero puede seleccionar origen y destino y entrar en «Revisá tu traslado»; el saludo de la cuenta reconocida funciona. Sin embargo, el panel dice «Distancia no disponible». El backend MAESTRO QA respondía directamente un 503 `qa_geoapify_not_configured` y jamás pasaba al módulo que calcula las distancias. Por lo tanto **no demuestra una falla del motor IDE Uruguay/Geoapify en producción**.

## Ajuste técnico aplicado exclusivamente en QA
- `backend/qa-entry-maestro.js` reutiliza la implementación `routeEstimateRoutes` de `backend/route-estimate.js` solo si están presentes tanto `VIA_GEOAPIFY_API_KEY` como `OTP_PEPPER` **en el Worker exclusivo** `via-traslados-maestro-api-qa`.
- En caso contrario responde 503 `qa_geoapify_not_configured`, sin kilómetros inventados ni peticiones al Worker productivo.
- El cálculo real, cuando se habilite, utiliza el mismo catálogo de lugares verificados, IDE Uruguay, Geoapify Routing y caché de `route_preview_cache` **en D1 exclusiva** `via-traslados-maestro-qa-db`.
- Mantiene 12 solicitudes/hora por IP como límite exterior QA; el módulo original agrega su propia protección y presupuesto.
- `scripts/maestro-qa-provision.mjs` genera `keep_vars = true` para preservar los secretos configurados en el panel exclusivo QA en despliegues sucesivos.
- `GET /api/health` expone únicamente `routePreviewReady: true/false`, nunca los secretos.

## Activación pendiente: credenciales QA exclusivas
En Cloudflare Workers & Pages > `via-traslados-maestro-api-qa` > Settings > Variables and Secrets, agregar por separado:
1. `VIA_GEOAPIFY_API_KEY` — **clave Geoapify de pruebas**, idealmente una clave independiente con límites de uso. Configurarla como Secret, nunca en GitHub ni en HTML/JS.
2. `OTP_PEPPER` — cadena aleatoria criptográficamente robusta (por ejemplo, 32 bytes), también Secret. Evitar reutilizar el pepper del Worker productivo.

No copiar directamente las credenciales, D1 o configuración de producción. La UI en QA no muestra el valor de las claves. La aplicación no está lista para pruebas de kilómetros hasta que /api/health informe `routePreviewReady:true` **y una ruta de lugares verificados devuelva distanceKm y durationMinutes positivos**.

## Evidencia de ejecución
- GitHub Actions [API MAESTRO QA](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44528863780): success, Worker y D1 separados, E2E de permisos/usuario, producción inalterada.
- GitHub Actions [Chromium MAESTRO QA 320/360/390/412](https://github.com/marcelofgx-ctrl/via-traslados/actions/runs/44529026915): success; confirma `MAESTRO_QA_GEOAPIFY_PENDING`, alta sin reservas y A/B/logout.
- Web QA: https://via-traslados-maestro-web-qa.marcelof-gx.workers.dev/

## Antes de producción
Repetir pruebas reales de km/min en varios recorridos representativos, incluyendo direcciones con puerta y lugares de referencia, revisar errores de geocodificación y límites de consumo. Preservar motor y versiones productivas existentes. **No publicar este cambio automáticamente.**
