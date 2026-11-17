#!/usr/bin/env python3
"""Compila un respaldo autónomo, solo lectura, desde 5 commits Git inmutables."""
import hashlib, io, json, os, re, shutil, subprocess, tarfile, zipfile
from datetime import datetime, timezone
from pathlib import Path

REPO = "marcelofgx-ctrl/via-traslados"
REFS = {
 "01_V29_WEB": "4ee78e500a773afb702e50092dcba15b52457492",
 "02_GEO_V2_QA": "010ae43959893d79b43b8b3df8242305c2a34e42",
 "03_V28_WEB": "3b130be1c4e900914ebaef1461303ef312d544d1",
 "04_BACKEND_MAIN": "6f00e1fc82724c4743f008703f3a36b0b59fc1b1",
 "05_RUTAS_HISTORICO": "f8ed58346e242007e370a978f747b0b7fea82292"
}
ROOT = Path("geo-master-build")
OUT = Path("salida/ZIP_MAESTRO_MOTOR_GEOGRAFICO_VIA_TRASLADOS.zip")
def sha(b):return hashlib.sha256(b).hexdigest()
def run(cmd,cwd=None,timeout=120):
 return subprocess.run(cmd,cwd=cwd,timeout=timeout,text=True,capture_output=True)
def put(name, data):
 p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(data,encoding="utf-8")
def snapshot(label, commit, records, exclusions):
 check=run(["git","cat-file","-t",commit])
 if check.returncode or check.stdout.strip()!="commit":raise RuntimeError("Commit no disponible: "+commit)
 a=subprocess.run(["git","archive","--format=tar",commit],check=True,capture_output=True)
 forbidden={".env",".env.production",".env.local","id_rsa","id_ed25519"}
 secret_patterns=[
  re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
  re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
  re.compile(rb"\bsk-[A-Za-z0-9]{24,}\b"),
  re.compile(rb"\bAIza[0-9A-Za-z_-]{30,}\b")
 ]
 with tarfile.open(fileobj=io.BytesIO(a.stdout)) as t:
  for m in t:
   if not m.isfile():continue
   p=Path(m.name)
   if p.is_absolute() or ".." in p.parts:raise RuntimeError("Path inseguro")
   if p.name in forbidden or p.suffix.lower() in {".pem",".p12",".pfx",".key",".jks"}:
    exclusions.append({"snapshot":label,"path":str(p),"reason":"archivo sensible omitido"});continue
   data=t.extractfile(m).read()
   redactado=False
   for rx in secret_patterns:
    if rx.search(data):
     data=rx.sub(b"[SECRETO_OMITIDO]",data);redactado=True
   if redactado:exclusions.append({"snapshot":label,"path":str(p),"reason":"secreto literal redactado"})
   target=ROOT/"FUENTES"/label/p;target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(data)
   records.append({"snapshot":label,"path":str(p),"bytes":len(data),"sha256":sha(data),"redacted":redactado})
def test(label):
 folder=ROOT/"FUENTES"/label
 tests=sorted((folder/"tests").glob("*.test.mjs"))
 if not tests:return {"snapshot":label,"result":"SIN_TESTS"}
 result=run(["node","--test",*[str(x.relative_to(folder)) for x in tests]],cwd=folder,timeout=140)
 log="COMMAND node --test\nEXIT "+str(result.returncode)+"\n"+(result.stdout+result.stderr)[-40000:]
 put("PRUEBAS/"+label+".txt",log)
 return {"snapshot":label,"files":len(tests),"result":"PASS" if result.returncode==0 else "FAIL_REVISAR_LOG","exit_code":result.returncode}
def main():
 if ROOT.exists():shutil.rmtree(ROOT)
 ROOT.mkdir(parents=True)
 records=[];exclusions=[]
 for label,commit in REFS.items():
  snapshot(label,commit,records,exclusions)
  print("RECUPERADO",label,commit,flush=True)
 created=datetime.now(timezone.utc).isoformat()
 deps={};envs={}
 for label in REFS:
  p=ROOT/"FUENTES"/label/"package.json"
  if p.exists():
   d=json.loads(p.read_text(encoding="utf-8"))
   deps[label]={"dependencies":d.get("dependencies",{}),"devDependencies":d.get("devDependencies",{}),"scripts":d.get("scripts",{})}
  vars=set()
  for fp in (ROOT/"FUENTES"/label).rglob("*"):
   if fp.is_file() and fp.suffix in {".js",".mjs",".cjs",".py"}:
    vars.update(re.findall(r"\benv\.([A-Z][A-Z_0-9]{2,})\b",fp.read_text(encoding="utf-8",errors="ignore")))
  envs[label]=sorted(vars)
 intro = """# ZIP MAESTRO DEL MOTOR GEOGRAFICO DE VIA TRASLADOS

Creado UTC: """+created+"""
Repositorio privado: https://github.com/"""+REPO+"""
Contiene cinco copias completas y diferenciadas de código real, obtenidas desde commits inmutables.
NO se genera un motor nuevo. NO se ejecuta despliegue. NO se accede a D1, Cloudflare o credenciales.

CARPETAS PRINCIPALES
FUENTES/01_V29_WEB: código V29 validado, frontend geográfico, mapa, GPS y Worker Pages.
FUENTES/02_GEO_V2_QA: geocodificador QA alternativo y pruebas especiales.
FUENTES/03_V28_WEB: versión anterior para contrastes y rollback.
FUENTES/04_BACKEND_MAIN: cálculo de carretera Geoapify, API, D1 y tests.
FUENTES/05_RUTAS_HISTORICO: commit original de cálculo de rutas.
DOCUMENTACION: instalación, integración, API, variables, recuperación y prompt maestro.
CONTRATOS: esquemas JSON sin distancias ni direcciones inventadas.
PRUEBAS: ejecución de node --test, con estado comprobable y posibles fallos de dependencias.
MANIFIESTO_FUENTES.json y SHA256SUMS.txt para comprobar integridad.

ADVERTENCIA: V29 se publicó a través de un script que reconstruía un Worker
sobre una versión que estaba activa. No se pudo verificar aquí identidad byte a byte
del binario realmente ejecutado en Cloudflare. Sí se respaldan los commits y los scripts.
NO mezclar el Pages Worker de V29 con la API Vercel alternativa de QA.
NO copiar base QA de la APK de conductores V34 a producción.

Para empezar: ejecutar python3 HERRAMIENTAS/verificar_integridad.py tras descomprimir.
"""
 put("LEEME_PRIMERO.md",intro)
 put("DOCUMENTACION/ARQUITECTURA.md","""# Arquitectura y fuentes

GPS y precisión: FUENTES/01_V29_WEB/pages/geo-v2/core.mjs
Localización inicial: FUENTES/01_V29_WEB/pages/reference.js
Buscador: FUENTES/01_V29_WEB/pages/address-autocomplete.js
MapLibre y selector: FUENTES/01_V29_WEB/pages/map-point-picker.js y .css
Estilos visuales: FUENTES/01_V29_WEB/pages/address-selected-preview.css,
address-typography-v28.css y review-compact-v29.css
API de direcciones de V29: FUENTES/01_V29_WEB/pages/_worker.js
API alternativa de QA: FUENTES/02_GEO_V2_QA/pages/api/direcciones.mjs
PWA e integración: FUENTES/01_V29_WEB/pages/index.html, app.js y store.js
Geoapify: FUENTES/04_BACKEND_MAIN/backend/route-estimate.js
API y permisos: FUENTES/04_BACKEND_MAIN/backend/worker.js y staff.js
D1: FUENTES/04_BACKEND_MAIN/backend/schema.sql

REGLAS IMPORTANTES
- GPS: precisión buena <=25 m; aproximada <=100 m; lectura obsoleta >30 segundos.
- Coordenadas GPS o del mapa se conservan siempre; portales cercanos NO son direcciones certificadas.
- Reverse evalúa calle hasta 100 m y conflictos a 25 m (lógica pura).
- QA resolve verifica número exacto; el Worker de V29 NO tiene contrato idéntico.
- La distancia comercial se calcula por carretera con Geoapify; no sustituir por Haversine.
- Caché de ruta por reserva 7 días; preview 6 horas (ver archivo para cuotas exactas).
- Tiempo estimado sin tráfico en vivo; no afirmar lo contrario.
- MapLibre GL JS 6.18.0 en CDN, Leaflet 1.9.4 como compatibilidad.
- Wrangler 4.160.1 en workflow de release de V29. Node 22 usado en Actions.
- IDE Uruguay: direcciones.ide.uy/api/v1/geocode/.
- Geoapify: api.geoapify.com/v1/routing y /v1/geocode/search.
- Mantener licencia/atribución OpenStreetMap y Geoapify.
- No portar autenticación o D1 de pasajeros con el motor de mapas.
""")
 put("DOCUMENTACION/CONTRATOS_API.md","""# Contratos de API respaldados

GET /api/direcciones : Worker V29 en pages/_worker.js
Parámetros: mode=suggest|resolve|reverse|places, q (3 a 120 caracteres) o lat/lng (reverse).
200: {"results":[],"mode":"suggest","provider":"IDE Uruguay"}
400: {"error":"Coordenadas fuera de Uruguay."}
405: {"error":"Método no permitido"}
503: {"error":"El buscador de direcciones no está disponible ahora. Podés ingresar la dirección manualmente.","results":[]}
Las filas pueden incluir street,city,department,lat,lng,accuracy. No inventar portales.

API alternativa Vercel QA: pages/api/direcciones.mjs
Añade qa:true, validación estricta de puerta para resolve, reverse con referenceOnly,
distanceMeters y policy reference_only. NO reemplazar el Worker V29 sin comparación.

POST /api/public/route-preview en backend/route-estimate.js
Body JSON: origin y destination como cadenas de direcciones elegidas.
200: distanceKm:number, durationMinutes:integer, source:"Geoapify", estimate:true,
trafficIncluded:false, cached:boolean, attribution:string, attributionUrl:string.
422: faltan direcciones o no hay localización/ruta fiables.
429: cuota, 502/504: fallos de proveedor, 503: no configurado.
Protección de origen HTTPS, D1, cuota por IP y presupuesto global, y caché por hash HMAC.
GET /api/operator/requests/:id/route requiere operador autorizado o admin;
401 sin autenticación, 403 sin asignación, 404 reserva inexistente.

IMPORTANTE: estos ejemplos representan ESTRUCTURAS y NO mediciones reales.
""")
 put("DOCUMENTACION/DEPENDENCIAS_Y_VARIABLES.json",json.dumps({"packages":deps,"binding_names_only":envs,"cdn":{"maplibre":"6.18.0","leaflet":"1.9.4"},"apis":["IDE Uruguay","Geoapify Routing","Geoapify Geocoding"]},ensure_ascii=False,indent=2))
 put("CONFIGURACION/.env.example","""# Plantilla sin claves ni IDs de producción
VIA_GEOAPIFY_API_KEY=
OTP_PEPPER=
PUBLIC_ORIGIN=https://qa.ejemplo.invalid
# DB: D1 binding del entorno (NO cadena).
# ASSETS: binding Pages para archivos estáticos.
# No copiar secretos ni bases de datos de producción.
""")
 put("DOCUMENTACION/INSTALACION_Y_RECUPERACION.md","""# Instalación, integración y recuperación

1. Descomprimir y ejecutar HERRAMIENTAS/verificar_integridad.py.
2. Elegir 01_V29_WEB para frontend/Pages; 02_GEO_V2_QA para comparar pruebas,
   NUNCA mezclarlos automáticamente. Backend Geoapify desde 04_BACKEND_MAIN.
3. Leer package.json y los workflow de cada snapshot. Instalar dependencias con npm
   en la COPIA elegida. No publicar ninguno de los snapshots directamente.
4. Configurar QA con secretos nuevos en Cloudflare y D1 independiente; vincular ASSETS
   y DB correctamente. No almacenar claves en .env compartido.
5. Copiar módulos geográficos conservando los contratos con app.js, store.js y Worker.
6. Ejecutar node --test en QA; si falta @simplewebauthn/server, npm install
   en copia de pruebas. Revisar PRUEBAS: algunas pruebas requieren un navegador real.
7. Probar GPS expirado/baja precisión, reverse ambiguo, calle y número inexistente,
   localidades homónimas, mover chincheta, geocodificación y timeout.
8. Probar rutas reales por carretera, cuota 429, proveedor 502/504, caché,
   y visualización sin tráfico en vivo.
9. Comparar contra código/despliegue actual, registrar rollback y pruebas móviles.
10. Solo tras aceptación humana publicar, sin tocar autenticación ni reservas.

REUTILIZACION EN OTRA APP: copiar e integrar módulos geográficos por separado,
adaptar únicamente la capa HTTP y la UI. Conservar hashes/commits fuente, tests,
coordenadas, contratos, licencias, cuotas y errores. No incluir D1 real ni credenciales.

ADVERTENCIA V34: conductor Android de QA no debe ver reservas creadas en
viatraslados.com si las bases están aisladas. No mezclar entornos para solucionar eso.
""")
 put("DOCUMENTACION/PROMPT_MAESTRO.md","""Actuá como ingeniero de recuperación de motor geográfico.
Tengo adjunto ZIP_MAESTRO_MOTOR_GEOGRAFICO_VIA_TRASLADOS.zip.
1. Leé el ZIP completo y verificá HERRAMIENTAS/verificar_integridad.py.
2. Compará fuentes y contratos con mi aplicación actual ANTES de modificar.
3. Usá 01_V29_WEB (GPS/MapLibre/geocodificador Pages), 02_GEO_V2_QA
   (pruebas/alternativa documentada), 04_BACKEND_MAIN (Geoapify y cuotas)
   y el histórico; NO fusionar versiones ciegamente.
4. No cambiar arquitectura ni reemplazar lo validado. Preservar lat/lng
   seleccionadas y etiquetar cualquier dirección inversa aproximada.
5. No inventar calle, portal, km o tráfico en vivo. Respetar proveedores y atribución.
6. No modificar reservas, roles, autenticación, pagos, prod D1 ni otros proyectos.
7. Primero diagnóstico, luego parche mínimo, pruebas Node y Android/navegadores QA.
8. Documentar rollback y pedir autorización explícita antes de publicar.
""")
 put("CONTRATOS/route-preview.response.schema.json",json.dumps({"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","required":["distanceKm","durationMinutes","source","estimate","trafficIncluded","cached"],"properties":{"distanceKm":{"type":"number","exclusiveMinimum":0},"durationMinutes":{"type":"integer","minimum":1},"source":{"const":"Geoapify"},"estimate":{"const":True},"trafficIncluded":{"const":False},"cached":{"type":"boolean"},"attribution":{"type":"string"},"attributionUrl":{"type":"string"}}},indent=2))
 put("CONTRATOS/direcciones.response.schema.json",json.dumps({"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","required":["results","mode","provider"],"properties":{"results":{"type":"array"},"mode":{"enum":["suggest","resolve","reverse","places"]},"provider":{"type":"string"}}},indent=2))
 put("PRUEBAS/PLAN_ADICIONAL.md","""Pendientes fuera de Node: Chromium/Android real, MapLibre resize sin temblor,
precisión GPS y timestamp, calles homónimas, locales, portales inexistentes,
fallo IDE/Geoapify, cuotas/caché, QA de CORS y autenticación, comparación
del Worker realmente desplegado frente al commit V29, rollback probado.
""")
 statuses=[]
 for label in ["01_V29_WEB","02_GEO_V2_QA","04_BACKEND_MAIN"]:
  statuses.append(test(label))
 put("PRUEBAS/ESTADO.json",json.dumps(statuses,ensure_ascii=False,indent=2))
 verifier='''#!/usr/bin/env python3
import json,hashlib,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
m=json.loads((root/"MANIFIESTO_FUENTES.json").read_text(encoding="utf-8"))
bad=[]
for f in m["files"]:
 p=root/"FUENTES"/f["snapshot"]/f["path"]
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=f["sha256"]:
  bad.append(str(p.relative_to(root)))
print("Comprobados:",len(m["files"])-len(bad),"de",len(m["files"]))
if bad:
 print("FALLOS:",*bad,sep="\\n");sys.exit(1)
print("INTEGRIDAD OK")
'''
 put("HERRAMIENTAS/verificar_integridad.py",verifier)
 put("MANIFIESTO_FUENTES.json",json.dumps({"repo":REPO,"created_utc":created,"commits":REFS,"files":records,"secrets_excluded_or_redacted":exclusions},ensure_ascii=False,indent=2))
 sums=[]
 for p in sorted(ROOT.rglob("*")):
  if p.is_file():sums.append(sha(p.read_bytes())+"  "+str(p.relative_to(ROOT)))
 put("SHA256SUMS.txt","\n".join(sums)+"\n")
 OUT.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(OUT,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:
  for p in sorted(ROOT.rglob("*")):
   if p.is_file():z.write(p,p.relative_to(ROOT))
 with zipfile.ZipFile(OUT) as z:
  assert z.testzip() is None
  assert len(z.namelist())>len(records)
 print("ZIP_READY",OUT,"SIZE",OUT.stat().st_size,"FILES",len(records),
       "SHA256",sha(OUT.read_bytes()),"SECRET_EXCLUSIONS",len(exclusions),flush=True)
if __name__=="__main__":main()
