# Vía Traslados — Rutas gratuitas con Geoapify (QA 0.9)

Solo Vía Traslados. No modificar Quick Trip, DNS de Resend, cuentas, reservas ni servicios independientes.

## Implementación

- Worker `via-traslados-api` expone el endpoint de ruta existente `GET /api/operator/requests/:id/route`, con autenticación y aislamiento de las reservas por rol.
- **No se utiliza Google Routes** ni hace falta habilitar facturación en Google Cloud.
- Ubicación: 1) catálogo de lugares verificados de la propia web de Vía; 2) IDE Uruguay (resolución de calles y puertas); 3) Geoapify Geocoding API como respaldo, con filtro `countrycode:uy` y umbral de confianza. No se inventan coordenadas.
- Geoapify Routing API: modo `drive`, `format=json`, 2 waypoints, distancia en metros y tiempo en segundos.
- Respuesta compacta: kilómetros (1 decimal), minutos, estimación, nombre y atribución del proveedor.
- Caché en D1 existente `booking_routes`, por 7 días y solo si el proveedor del registro es `geoapify`. Sin duplicar llamadas con el refresco de 30 segundos de Android.
- Límites conservadores de protección: 30 solicitudes de ruta/hora por usuario y 250 solicitudes de ruta/24 h globales, más el límite propio de Geoapify.
- Sin credenciales no presenta kilometraje inventado: `503 route_provider_missing`.
- La APK de QA 0.9 muestra `Powered by Geoapify` y `© OpenStreetMap contributors` como enlaces, solo cuando existe un cálculo real.

## Activación en Cloudflare (pendiente de la cuenta del titular)

1. Abrir https://myprojects.geoapify.com/, registrarse en el plan Free y crear un proyecto exclusivo para Vía Traslados.
2. Desde API Keys obtener una clave válida para **Routing API** y **Geocoding API**.
3. Abrir Cloudflare Dashboard → Workers & Pages → Worker **via-traslados-api** → Settings → Runtime variables and secrets → Production → Add variable.
4. Completar `Key = VIA_GEOAPIFY_API_KEY`, `Value = <clave privada>`, activar **Secret** y desplegar. **Nunca** pegar el valor en chat, APK o GitHub.
5. Volver a abrir la APK 0.9 y usar el botón de actualización en Solicitudes para volver a pedir la ruta.
6. Confirmar dos recorridos de prueba con kilómetros/minutos razonables y atribución. La primera vez puede requerir geocodificación; los resultados posteriores vienen de D1.

El plan gratuito permite uso comercial pero requiere atribución a Geoapify y a OpenStreetMap. En noviembre de 2026 el plan indica 3.000 créditos/día y no requiere tarjeta. Puede haber límites y variaciones posteriores; verificar las condiciones actuales en https://www.geoapify.com/pricing/.

**Seguridad**: la clave permanece en el entorno de Cloudflare. Los requests externos por HTTPS pueden contenerla en su query string, por lo que nunca hay que registrar URLs completas con credenciales ni publicarlas. No restringir por referrer de navegador si la llamada sale desde el Worker.

## Validación

`npm test` y `npm run check` en GitHub Actions; compilar APK Android `uy.viatraslados.conductor.geoapifyqa` sin reemplazar instalaciones existentes.

El servidor se puede publicar antes de tener la clave, manteniendo respuesta `503` hasta la activación privada.
