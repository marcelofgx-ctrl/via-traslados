#!/usr/bin/env python3
"""Respaldo REPRODUCIBLE de Git blobs: no lee ni escribe Cloudflare/QA/produccion."""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

OUT = Path("ZIP_MAESTRO_MOTOR_GEOGRAFICO_VIA_TRASLADOS.zip")
REFS = [
    ("01_V29_FRONTEND_PUBLICADO", "4ee78e500a773afb702e50092dcba15b52457492", "Rama V29 referenciada por workflow de produccion"),
    ("02_MAIN_BACKEND_RUTAS", "6f00e1fc82724c4743f008703f3a36b0b59fc1b1", "main del 17/11/2026; backend Geoapify y D1"),
    ("03_GEO_V2_QA_ORIGINAL", "010ae43959893d79b43b8b3df8242305c2a34e42", "Geolocalizacion V2 QA con API direcciones y tests"),
    ("04_V28_TIPOGRAFIA", "3b130be1c4e900914ebaef1461303ef312d544d1", "Rama V28 historica"),
    ("05_RUTAS_HISTORICO", "f8ed58346e242007e370a978f747b0b7fea82292", "Commit historico de rutas")
]

def git(*args: str) -> bytes:
    p = subprocess.run(["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode:
        raise RuntimeError("git " + " ".join(args) + ": " + p.stderr.decode(errors="replace")[:350])
    return p.stdout

def blob_hash(blob: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(blob)).encode() + b"\0" + blob).hexdigest()

DOCS = {
"README_INICIO.md": """# ZIP MAESTRO — MOTOR GEOGRAFICO VIA TRASLADOS
Respaldo de **codigo fuente REAL extraido directamente de objetos Git**, con sus commits y hashes, no una reconstruccion escrita por IA.

## POR DONDE EMPEZAR
1. Leer docs/ARQUITECTURA_Y_VERSIONES.md.
2. Verificar copia: python3 herramientas/verificar_respaldo.py .
3. Seleccionar componente del snapshot correcto, SIN copiar toda una rama encima de otra.
4. Para web de pasajeros partir de codigo/01_V29_FRONTEND_PUBLICADO/pages/. Para API de rutas, consultar codigo/02_MAIN_BACKEND_RUTAS/backend/route-estimate.js y backend/worker.js. Para detalles originales de QA, codigo/03_GEO_V2_QA_ORIGINAL/pages/api/direcciones.mjs.
5. Ejecutar tests del snapshot elegido, recuperar en QA aislada, observar respuesta de servicios externos y solo entonces planificar produccion.

Este paquete NO incluye bases D1, secretos, tokens, credenciales, certificados, compilaciones APK ni prueba de que una revision permanezca desplegada hoy. No se modifico el servidor para construirlo.
Snapshot 'publicado' = commit que usa el workflow de liberacion V29 encontrado en main; no auditoria independiente de bytes del Worker desplegado.
Ruta privada de origen: github.com/marcelofgx-ctrl/via-traslados.
""",
"docs/ARQUITECTURA_Y_VERSIONES.md": """# Inventario arquitectonico comprobado
- Frontend V29: pages/index.html, pages/app.js, pages/store.js, pages/reference.js, pages/address-autocomplete.js, pages/map-point-picker.js y .css, pages/address-selected-preview.js y .css, pages/address-typography-v28.css, pages/review-compact-v29.css, pages/geo-v2/core.mjs.
- Web Worker de V29: pages/_worker.js es quien atiende GET /api/direcciones, delegando estaticos a env.ASSETS.fetch. Usa IDE Uruguay. NO toma el handler Vercel pages/api/direcciones.mjs que existe en el snapshot Geo V2 QA.
- Geolocalizacion: navigator.geolocation se invoca con accion explicita del usuario; assessGpsFix (core.mjs) clasifica vigencia y exactitud. La lectura GPS original se mantiene; referencias postales cercanas no la reemplazan silenciosamente.
- Mapa: pages/map-point-picker.js y .css; MapLibre GL 6.18.0 importado externamente en index.html, con referencia Leaflet 1.9.4 en la pagina. Conservar todas las dependencias DOM, scripts y estilos del snapshot. Revisar URLs de cartografia en el archivo real antes de migrar.
- API backend separada: backend/worker.js importa routeEstimateRoutes y precalculateBookingRoute desde backend/route-estimate.js. Expone POST /api/public/route-preview y GET /api/operator/requests/:id/route, este ultimo autenticado.
- Geoapify: geocodificacion IDE Uruguay primero y Geoapify como respaldo bajo confianza; rutas de carretera a traves de Geoapify Routing API modo drive, sin trafico en vivo.
- Caché D1: booking_routes (7 dias) y route_preview_cache (6 horas); proteccion presupuestos mediante rate limits. Esquema D1 en backend/schema.sql.
- Importante: el repo main del 17/11/2026 NO conserva pages/ pero SI backend/route-estimate.js; la rama V29 SI conserva pages/ pero no contiene backend/route-estimate.js. Son snapshots distintos, NO fusionar arbitrariamente.
- V26 / GeoV2 QA: pages/api/direcciones.mjs corresponde a un handler tipo Vercel; conservarlo como variante documentada, no sustituir pages/_worker.js en Cloudflare.
- Referencia del despliegue: main/.github/workflows/via-review-v29-production.yml incluye checkout del SHA V29 y comando de publicacion; verificar la fecha y la version efectiva en Cloudflare ANTES de afirmar equivalencia.
- Los cinco snapshots integrales incluyen otras piezas del proyecto para conservar dependencias indirectas y pruebas originales; NO significa que deban desplegarse juntos.
""",
"docs/CONTRATOS_API.md": """# Contratos observados en CODIGO (no solicitudes de produccion)
## 1. Busqueda IDE, servido por Worker web V29
GET /api/direcciones?mode=suggest&q=18%20de%20Julio
GET /api/direcciones?mode=resolve&q=...
GET /api/direcciones?mode=reverse&lat=-34.9&lng=-56.1
GET /api/direcciones?mode=places&q=aeropuerto
- modo por defecto: suggest; metodos no GET -> 405; 'q' de 3 a 120 caracteres salvo reverse.
- Coordenadas validas limitadas a Uruguay (lat -36..-30, lon -59..-52).
- respuesta HTTP 200: {"results":[{"label":"...", "street":"...", "city":"...", "department":"...", "lat":null, "lng":null, "accuracy":"street"}], "mode":"suggest", "provider":"IDE Uruguay"}
- el ejemplo es de ESQUEMA ilustrativo y NO representa una direccion real; portal solo cuando IDE certifica la puerta.
- fallos externos: 503 y results []; el consumidor debe permitir ingreso manual sin geocodificar falsamente.
- API QA alternativa en snapshot 03/pages/api/direcciones.mjs NO se debe confundir con el Worker web V29.

## 2. Preview de ruta del backend principal
POST /api/public/route-preview
Content-Type: application/json
Origin: https://<origen-HTTPS-autorizado>
{"origin":"<direccion-confirmada-A>","destination":"<direccion-confirmada-B>"}
- validacion de dos direcciones diferentes (longitud minima 5), tamano maximo 1200 y origen HTTPS.
- respuesta 200 de forma: {"distanceKm":0.0,"durationMinutes":0,"source":"Geoapify","estimate":true,"trafficIncluded":false,"cached":false,"attribution":"© OpenStreetMap contributors · Powered by Geoapify","attributionUrl":"https://www.geoapify.com/"}
- 0.0/0 son marcadores ilustrativos de tipo, NUNCA resultados de rutas reales.
- errores 400/403/413/422/429/503 segun controles; NO inventar distancias.
- Cache HMAC: route_preview_cache TTL 21600s; requiere env.OTP_PEPPER, env.DB, env.VIA_GEOAPIFY_API_KEY.

## 3. Ruta por reserva para operador autenticado
GET /api/operator/requests/:id/route
- autorizacion obligatoria, administrador o conductor asignado; 401/403 en caso contrario.
- exito usa forma de salida del preview con distancia de ruta, cache D1 booking_routes por 7 dias.
- env.VIA_GEOAPIFY_API_KEY ausente -> 503 {"error":"Motor gratuito de distancias no configurado.","reason":"route_provider_missing"}
- limites desde codigo: 30 rutas/h por usuario, 250/24h global; preview 8/h por IP.

Los clientes deben mostrar atribucion y 'sin transito en vivo'.
""",
"docs/DEPENDENCIAS_Y_CONFIGURACION.md": """# Dependencias y configuracion sin secretos
- Node.js 22 en workflow V29, JavaScript ESM; package.json de cada snapshot conserva scripts reales.
- Backend main: npm package @simplewebauthn/server 14.1.0; no asumir que una rama usa package-lock si no existe.
- npx wrangler@4.160.1 para dry-run/publicacion en workflow V29.
- MapLibre GL JS 6.18.0 y Leaflet 1.9.4 importados via CDN en V29; revisar index.html para enlaces exactos.
- IDE: https://direcciones.ide.uy/api/v1/geocode/...; cartografia basada en fuentes de mapas que deben conservar sus URLs/atribuciones originales.
- Geoapify Routing API /v1/routing, Geocoding API /v1/geocode/search, clave solo servidor.
- Variables y bindings detectados: VIA_GEOAPIFY_API_KEY (secreto); OTP_PEPPER (secreto HMAC de preview); DB (binding D1 en Worker API); ASSETS (binding de assets en Worker web). Para publicar ademas CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN como credenciales externas del proceso, JAMAS dentro del ZIP.
- Variables de autenticacion, OTP, Turnstile y correo del backend NO son parte del motor; si se reutiliza el backend completo, enumerarlas de los archivos y entorno destino, jamas reutilizar secretos de Vía.
- Para duplicar a otra app: definir endpoints, origins/CORS, D1, secret manager, cuotas, cartografia y pruebas del nuevo proyecto de forma independiente. Nunca copiar bases, tokens o conexiones de Vía.
- Plantillas en configuracion/ son deliberadamente no ejecutables sin revisar: no contienen identificadores ni valores reales.
""",
"docs/PRUEBAS_Y_RECUPERACION.md": """# Recuperacion conservadora
1. Descomprimir, ejecutar python3 herramientas/verificar_respaldo.py . y leer manifiesto.json.
2. En la app de destino capturar commit y ficheros reales, comparar con codigo/01..., codigo/02... y codigo/03....
3. Corregir por capa: normalizacion/ranking IDE, precision GPS y referencia postal, estabilidad mapa, o ruta Geoapify/cache D1.
4. Nunca intercambiar pages/api/direcciones.mjs (Vercel QA) por pages/_worker.js (Cloudflare V29) sin adaptar contrato y runtime.
5. Para ejecutar tests de una revision: entrar en el subdirectorio codigo/01... (o 02/03) y correr npm test; ejecutar npm install cuando lo requiera package.json. Usar Node 22, comprobar tests concretos de rutas, GPS, mapa y direcciones. Los .cjs de browser requieren Playwright/navegador que NO vienen embebidos.
6. Adicionalmente ejecutar python3 pruebas_adicionales/verificar_contratos.py . para consistencia de puntos clave del respaldo.
7. Probar en QA independiente: direcciones con puerta verificada; localidad homonima; GPS impreciso y antiguo; ajuste de chincheta; errores IDE; sin Geoapify key -> 503; cuotas 429; rutas viales (nunca linea recta como resultado final); navegadores Android y movil de 320/360/390 px.
8. Registrar resultados de QA y control de rollback. NO ejecutar despliegue Cloudflare ni mutar D1, reservas o conductores por motivo de restaurar este motor.
9. Verificar versiones publicadas mediante registros del despliegue, dado que Git por si solo no prueba el estado presente del Worker.
10. Para una aplicacion diferente, reutilizar algoritmos y contratos con atribuciones y nuevas credenciales, NO copiar autenticacion o datos privados.
""",
"docs/PROMPT_MAESTRO.md": """# PROMPT PARA OTRA IA
Recibi este ZIP como respaldo tecnico independiente. Primero valida hashes (herramientas/verificar_respaldo.py) y examina codigo real bajo codigo/ con manifiesto.json. No asumas que todos los snapshots pertenecen al mismo despliegue: V29 web bajo 01, backend de rutas bajo 02, origen Geo V2 QA bajo 03, V28 bajo 04 e historia de rutas bajo 05.
Audita codigo de mi aplicacion actual y genera un DIFF de funciones faltantes/rotas. Preserva orden de prioridad IDE Uruguay, exactitud del GPS sin sustituir sus coordenadas, direcciones no confirmadas, selector de mapa, Geoapify para carretera, cuotas, cache, respuesta sin trafico vivo y atribuciones. No inventes coordenadas ni tiempos.
Propon un plan minimo con pruebas, impleméntalo solo en QA aislada tras verificar dependencias; reporta resultados y estrategia rollback. No tocar base D1 de produccion, reservas, roles, autenticacion ni QuickTrip. Solo tras autorizacion explicita considerar publicacion. Si hay incertidumbre sobre qué codigo esta desplegado, verificá Cloudflare y no supongas.
Para reutilizar en otra app, migra mediante adaptadores de API y configuraciones independientes, sin llevarte usuarios ni secretos.
""",
"configuracion/.env.example": """# EJEMPLO. Nunca colocar credenciales reales en ZIP o Git.
VIA_GEOAPIFY_API_KEY=REEMPLAZAR_EN_SECRET_MANAGER
OTP_PEPPER=REEMPLAZAR_EN_SECRET_MANAGER
CLOUDFLARE_ACCOUNT_ID=REEMPLAZAR_LOCALMENTE
CLOUDFLARE_API_TOKEN=REEMPLAZAR_EN_SECRET_MANAGER
# Bindings Cloudflare (no son valores .env): DB (D1), ASSETS (Static Assets)
""",
"configuracion/wrangler-web.ejemplo.toml": """# MODELO NO DESPLEGABLE SIN ADAPTAR. NO usa el nombre productivo real.
name = "motor-geo-web-qa-ejemplo"
main = "./pages/_worker.js"
compatibility_date = "2026-11-01"
[assets]
directory = "./pages"
binding = "ASSETS"
""",
"configuracion/wrangler-api.ejemplo.toml": """# MODELO NO DESPLEGABLE SIN ADAPTAR. NO apunta a ninguna D1 real.
name = "motor-geo-api-qa-ejemplo"
main = "./backend/worker.js"
compatibility_date = "2026-11-01"
[[d1_databases]]
binding = "DB"
database_name = "BASE_QA_EXCLUSIVA"
database_id = "REEMPLAZAR_UUID_QA"
# secretos VIA_GEOAPIFY_API_KEY y OTP_PEPPER se crean fuera del repositorio
""",
"herramientas/verificar_respaldo.py": """#!/usr/bin/env python3
import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
manifest=json.loads((root/'manifiesto.json').read_text(encoding='utf-8'))
errors=[]
for f in manifest['archivos']:
    p=root/f['ruta']
    if not p.is_file(): errors.append('FALTA '+str(p)); continue
    b=p.read_bytes()
    if hashlib.sha256(b).hexdigest()!=f['sha256']: errors.append('SHA256 '+str(p))
    git=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\\0'+b).hexdigest()
    if git!=f['git_blob_sha']: errors.append('GIT '+str(p))
print('ARCHIVOS:',len(manifest['archivos']),'ERRORES:',len(errors))
for x in errors[:50]: print(x)
raise SystemExit(1 if errors else 0)
""",
"pruebas_adicionales/verificar_contratos.py": """#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
def read(s): return (root/s).read_text(encoding='utf-8')
web=read('codigo/01_V29_FRONTEND_PUBLICADO/pages/_worker.js')
route=read('codigo/02_MAIN_BACKEND_RUTAS/backend/route-estimate.js')
core=read('codigo/01_V29_FRONTEND_PUBLICADO/pages/geo-v2/core.mjs')
picker=read('codigo/01_V29_FRONTEND_PUBLICADO/pages/map-point-picker.js')
assert "/api/direcciones" in web and "direcciones.ide.uy" in web
assert "/api/public/route-preview" in route and "VIA_GEOAPIFY_API_KEY" in route
assert "trafficIncluded:false" in route and "booking_routes" in route
assert "assessGpsFix" in core and "evaluateReverseCandidates" in core
assert "maplibre" in picker.lower()
print('Contratos clave presentes en snapshots originales: OK (no prueba disponibilidad de servicios externos)')
"""
}

def main():
    zip_members = []
    records = []
    for folder, sha, purpose in REFS:
        names = git("ls-tree", "-rz", sha).split(b"\0")
        count = 0
        for entry in names:
            if not entry: continue
            meta, path = entry.split(b"\t", 1)
            mode, kind, blobsha = meta.split(b" ", 2)
            if kind != b"blob": continue
            rel = path.decode("utf-8", errors="strict")
            if any(p in rel.lower() for p in ("/.env", ".dev.vars", "id_rsa", ".p12", ".pem", ".key", "secrets.json")):
                raise RuntimeError("Archivo potencialmente confidencial en Git: "+rel)
            data = git("cat-file", "blob", blobsha.decode())
            if blob_hash(data) != blobsha.decode():
                raise RuntimeError("Hash Git incorrecto: "+rel)
            dest = "codigo/" + folder + "/" + rel
            records.append({"ruta":dest,"origen_commit":sha,"ruta_git":rel,"bytes":len(data),
                            "sha256":hashlib.sha256(data).hexdigest(),"git_blob_sha":blobsha.decode()})
            zip_members.append((dest, data))
            count += 1
        print(folder, sha, count, "archivos originales")
    for path, body in DOCS.items():
        zip_members.append((path, body.encode("utf-8")))
    manifest = {
        "titulo":"ZIP MAESTRO MOTOR GEOGRAFICO VIA TRASLADOS",
        "generado_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
        "repositorio":"marcelofgx-ctrl/via-traslados",
        "versiones":[{"directorio":a,"commit":b,"descripcion":c} for a,b,c in REFS],
        "total_archivos_originales":len(records),
        "archivos":records,
        "advertencia":"El ZIP no prueba el estado actual en Cloudflare. No incluye bases ni secretos."
    }
    zip_members.append(("manifiesto.json",json.dumps(manifest,indent=2,ensure_ascii=False).encode()))
    with zipfile.ZipFile(OUT,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:
        for path,data in sorted(zip_members,key=lambda r:r[0]):
            z.writestr(path,data)
    with zipfile.ZipFile(OUT) as z:
        assert z.testzip() is None
        names=set(z.namelist())
        for f in records:
            assert f["ruta"] in names
            data=z.read(f["ruta"])
            assert hashlib.sha256(data).hexdigest()==f["sha256"]
            assert blob_hash(data)==f["git_blob_sha"]
        for must in ("codigo/01_V29_FRONTEND_PUBLICADO/pages/_worker.js",
                     "codigo/01_V29_FRONTEND_PUBLICADO/pages/geo-v2/core.mjs",
                     "codigo/02_MAIN_BACKEND_RUTAS/backend/route-estimate.js",
                     "codigo/03_GEO_V2_QA_ORIGINAL/pages/api/direcciones.mjs",
                     "docs/PROMPT_MAESTRO.md"):
            assert must in names,must
    print("ZIP_VERIFICADO",OUT,len(records),"archivos originales",OUT.stat().st_size,"bytes")
    print("ZIP_SHA256",hashlib.sha256(OUT.read_bytes()).hexdigest())
    Path("RESULTADO_VERIFICACION.txt").write_text("ZIP_VERIFICADO OK\nARCHIVOS="+str(len(records))+
        "\nZIP_SHA256="+hashlib.sha256(OUT.read_bytes()).hexdigest()+"\n",encoding="utf-8")

if __name__=="__main__":
    main()
