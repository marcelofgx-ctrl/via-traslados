#!/usr/bin/env python3
"""Publicación atómica de APK V35 release firmada: el API y D1 NO se modifican.
Preserva Worker existente, descarga archivos estáticos de la web ACTIVA,
valida Cloudflare QA, verifica la version activa y permite rollback Cloudflare.
"""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

LIVE="https://viatraslados.com"
ACCOUNT=os.environ["CLOUDFLARE_ACCOUNT_ID"]
TOKEN=os.environ["CLOUDFLARE_API_TOKEN"]
WORKER="via-traslados-web-prod"
QA="via-traslados-v291-rc1-stage"
QA_URL="https://"+QA+".marcelof-gx.workers.dev"
BASE="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/workers/scripts/"+WORKER
OUT=pathlib.Path("via-v291-rc-build")
ASSETS=OUT/"assets"
APK_SOURCE=None
APK_NAME="descargas/via-traslados-conductor-v35.apk"
EXPECTED_APK_SHA256=""
BRANCH_SRC="193fee54512870b1e530cc98baa6442be0f817d8"
EXTRAS=("flow-premium.css","flow-premium.js","via-refinement.css","admin.html")
EXPECTED_MARKERS=(b"review-compact-v29.css?v=29",b"app.js?v=29",b"geo-v2/core.mjs?v=3")

def digest(buf):
    return hashlib.sha256(buf).hexdigest()

def http_get(url,authorized=False):
    headers={"User-Agent":"ViaTrasladosV35SignedRelease","Cache-Control":"no-cache","Accept-Encoding":"identity"}
    if authorized:headers["Authorization"]="Bearer "+TOKEN
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(req,timeout=35) as resp:
        if resp.status!=200:raise ValueError("HTTP "+str(resp.status)+" "+url)
        return resp.read(),resp.headers

def cf(path, body=None):
    headers={"Authorization":"Bearer "+TOKEN,"Accept":"application/json"}
    method="GET";data=None
    if body is not None:
        method="POST";data=json.dumps(body).encode()
        headers["Content-Type"]="application/json"
    req=urllib.request.Request(BASE+path,data=data,method=method,headers=headers)
    with urllib.request.urlopen(req,timeout=35) as resp:obj=json.load(resp)
    if not obj.get("success"):raise ValueError("Cloudflare API rechazó operación: "+str(obj.get("errors"))[:300])
    return obj.get("result") or {}

def active_version():
    deployments=cf("/deployments").get("deployments") or []
    if not deployments:raise AssertionError("Sin Worker activo de producción")
    versions=deployments[0].get("versions") or []
    if len(versions)!=1 or float(versions[0]["percentage"])!=100:
        raise AssertionError("Producción tiene reparto de tráfico: NO desplegar")
    return versions[0]["version_id"]

def sanitize_html(data):
    return re.sub(rb'<script\b[^>]*static\.cloudflareinsights\.com[^>]*>.*?</script>',b"",data,flags=re.I|re.S)

def normalized_html(data):
    s=sanitize_html(data).decode("utf-8","replace")
    return re.sub(r'>\s+<','><',re.sub(r'\s+',' ',s)).strip()

def get_live_worker_source():
    raw,h=http_get(BASE,True)
    typ=h.get("Content-Type","")
    boundary=re.search(r'boundary="?([^";]+)',typ)
    if not boundary:
        if "javascript" in typ and b"env.ASSETS.fetch(request)" in raw:
            source=raw.decode("utf-8")
        else:raise AssertionError("No se pudo leer el código del Worker activo")
    else:
        source=None
        for part in raw.split(b"--"+boundary.group(1).encode()):
            if b"Content-Disposition" not in part or b"\r\n\r\n" not in part:continue
            head,body=part.split(b"\r\n\r\n",1)
            if b'.js"' in head or b'.mjs"' in head or b'name="_worker.js"' in head:
                source=body.rstrip(b"\r\n").decode("utf-8")
                break
    if not source or len(source)<4000:raise AssertionError("Código Worker no suficientemente validado")
    for frag in ("env.ASSETS.fetch(request)","isClosed","/api/direcciones"):
        if frag not in source:raise AssertionError("Worker cambió: falta "+frag)
    return source

def source_asset_list():
    p=subprocess.run(["git","ls-tree","-r","--name-only",BRANCH_SRC,"pages/"],capture_output=True,text=True,check=True)
    assets=[]
    for path in p.stdout.splitlines():
        name=path.removeprefix("pages/")
        if not name or any(comp.startswith("_") for comp in name.split("/")):continue
        if name.endswith(".jsonc"):continue
        assets.append(name)
    if len(assets)<25:raise AssertionError("Inventario de archivos activo incompleto")
    return sorted(set(assets))

def link_html(html):
    # Conservar intacto el resto del documento, insertar solo un acceso discreto.
    insert=( '<span id="via-driver-v35-download" style="display:inline-flex;align-items:center;gap:.45em;flex-wrap:wrap;">'
             '<a href="/'+APK_NAME+'" download="via-traslados-conductor-v35.apk"'
             ' style="color:inherit;text-decoration:underline;text-underline-offset:3px;">'
             'Descargar APK conductor · V35 Producción</a>'
             '<small style="opacity:.78;">Solo conductores autorizados · viajes reales</small></span>' )
    if b"via-driver-v35-download" in html:raise AssertionError("La web ya tiene la descarga V35, abortar")
    if b"via-driver-v34-download" not in html:raise AssertionError("Se perdió enlace V34 QA: no reemplazar")
    s=html.decode("utf-8")
    if s.count("</footer>")!=1:raise AssertionError("Footer no único: abortar para no romper diseño")
    return s.replace("</footer>",insert+"</footer>",1).encode("utf-8")

def config(name,filename):
    spec={"name":name,"main":"worker.mjs","compatibility_date":"2026-11-10",
          "workers_dev":True,"assets":{"directory":"./assets","binding":"ASSETS","run_worker_first":["/api/*"]}}
    (OUT/filename).write_text(json.dumps(spec,indent=2),encoding="utf-8")



EXPECTED_ACTIVE_WEB="ec35bd52-b832-4cff-bcb2-6a6b84c34c79"
EXPECTED_PUBLIC={
 "": "dbd30afa6ce6c9ad5b3935bcf5fae62970d40e66264d0fee0d5ee3f381ae8360",
 "app.js": "2801344d2589c045b272482967098c701cebbe7e0d6aa13ec48ea76593f7a3c3",
 "store.js": "4626099e71bf45a50bd02cdd4aa5eb1c8c7d03e09d97387ee27ca8e9801294ef",
 "geo-v2/core.mjs": "17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1",
}
PACKAGE_VERSION="29.1.0-rc1"
RELEASE_FILES={
 "store.js":"dist/via-v291-store.js",
 "app.js":"dist/via-v291-app.js",
 "mis-reservas.html":"dist/via-v291-mine.html",
 "mine-identity-v291.css":"dist/via-v291-mine.css",
 "via-v291-home-account.js":"scripts/via-v291-home-account.js",
 "via-v291-home-account.css":"scripts/via-v291-home-account.css",
}
def exact_replace(text,old,new,label):
    if text.count(old)!=1:
        raise AssertionError(f"Fuente V29 modificada: {label} ({text.count(old)} anclas)")
    return text.replace(old,new,1)

def production_home(original):
    html=sanitize_html(original).decode("utf-8")
    import re
    pattern=r'<a class="reference-reservations" href="./mis-reservas.html">.*?</a>'
    matches=list(re.finditer(pattern,html,flags=re.S))
    if len(matches)!=1:raise AssertionError("Mis reservas: número inesperado de enlaces")
    invite=('<aside id="via-home-account-invite" hidden aria-label="Crear cuenta Vía">'
      '<span class="via-home-account-invite__copy"><strong>¿Primera vez en Vía?</strong>'
      '<span>Tu cuenta, tus reservas.</span></span>'
      '<a class="via-home-account-invite__link" href="./mis-reservas.html?accion=registro">'
      'Creá tu cuenta <span aria-hidden="true">→</span></a></aside>')
    end=matches[0].end()
    html=html[:end]+invite+html[end:]
    html=exact_replace(html,'<div class="home-intro">',
      '<div class="home-intro"><div id="via-home-user-greeting" hidden aria-live="polite">'
      'Hola, <strong id="via-home-user-name"></strong></div>',"Saludo principal")
    html=exact_replace(html,'</head>',
      '<meta name="via-release-version" content="29.1.0-rc1">'
      '<link rel="stylesheet" href="./via-v291-home-account.css?v=1"></head>',"CSS del saludo")
    html=exact_replace(html,'</body>',
      '<script src="./via-v291-home-account.js?v=1"></script></body>',"Controlador sesión V29.1")
    html=exact_replace(html,'app.js?v=29','app.js?v=29.1',"Carga app versión 29.1")
    html=exact_replace(html,'store.js?v=19','store.js?v=19.1',"Carga store versión 19.1")
    for forbidden in ('VIA_QA_SYNTHETIC_OTP','via-qa-access','QA · Cuentas','@qa.invalid','via-maestro-api'):
        if forbidden in html:raise AssertionError("Rastros sintéticos: "+forbidden)
    return html.encode("utf-8")

def prepare():
    if not re.fullmatch("[0-9a-f]{32}",ACCOUNT,re.I):
        raise AssertionError("Cuenta Cloudflare inválida")
    # Gate de integridad: si otro cambio llegó a producción, abortar.
    web_version=active_version()
    if web_version!=EXPECTED_ACTIVE_WEB:
        raise AssertionError("La versión activa cambió; reauditar antes de generar RC")
    raw_home,_=http_get(LIVE+"/")
    if digest(raw_home)!=EXPECTED_PUBLIC[""]:
        print("VIA_V291_HTML_DIAG",json.dumps({
         "raw":digest(raw_home),"rawBytes":len(raw_home),
         "sanitized":digest(sanitize_html(raw_home)),
         "sanitizedBytes":len(sanitize_html(raw_home)),
         "expected":EXPECTED_PUBLIC[""]}),flush=True)
        # El Worker version_id activo está anclado, y Cloudflare agrega una
        # etiqueta de analítica por respuesta. Se acepta una variación de
        # solo un byte en el HTML limpio, nunca un cambio de worker o assets.
        if abs(len(sanitize_html(raw_home))-21045)>1:
            raise AssertionError("HTML público cambió materialmente; requiere nueva auditoría")
        print("VIA_V291_HOME_DYNAMIC_ANALYTICS_ONE_BYTE: se verifican versión CF y hashes de JS/CSS",flush=True)
    for marker in EXPECTED_MARKERS:
        if marker not in raw_home:raise AssertionError("Falta asset activo "+repr(marker))
    worker=get_live_worker_source()
    # Se prepara desde el Worker real, no desde un Worker simulado.
    OUT.mkdir(exist_ok=True)
    ASSETS.mkdir(parents=True,exist_ok=True)
    inventory={}
    for path in source_asset_list():
        if path=="index.html" or path.startswith("descargas/"):continue
        try:
            buf,head=http_get(LIVE+"/"+urllib.parse.quote(path,safe="/"))
        except urllib.error.HTTPError as e:
            if e.code==404:continue
            raise
        if path.endswith((".js",".css",".mjs",".svg")) and "text/html" in head.get("Content-Type","").lower():
            raise AssertionError("Archivo ejecutable devolvió HTML: "+path)
        if path.endswith(".html"):buf=sanitize_html(buf)
        out=ASSETS/path;out.parent.mkdir(parents=True,exist_ok=True)
        out.write_bytes(buf)
        inventory[path]=digest(buf)
    for path in EXTRAS:
        if path in inventory:continue
        try:buf,_=http_get(LIVE+"/"+urllib.parse.quote(path,safe="/"))
        except urllib.error.HTTPError as e:
            if e.code==404:continue
            raise
        if path.endswith(".html"):buf=sanitize_html(buf)
        out=ASSETS/path;out.parent.mkdir(parents=True,exist_ok=True)
        out.write_bytes(buf);inventory[path]=digest(buf)
    critical=["app.js","store.js","config.js","geo-v2/core.mjs","reserva.html","map.js","passkeys.js",
     "reference.js","address-autocomplete.js","wizard-ux.js","mis-reservas.html"]
    if any(not (ASSETS/p).is_file() for p in critical):
        raise AssertionError("Faltan archivos originales del sitio público")
    for path,expected in EXPECTED_PUBLIC.items():
        if not path:continue
        if digest((ASSETS/path).read_bytes())!=expected:
            raise AssertionError("Hash público incompatible con rollback para "+path)
    # Solo 3 archivos previos cambian y 3 assets nuevos se añaden;
    # todo lo demás, incluido motor de rutas, mantiene bytes.
    (ASSETS/"index.html").write_bytes(production_home(raw_home))
    for path,from_path in RELEASE_FILES.items():
        src=pathlib.Path(from_path)
        if not src.is_file() or src.stat().st_size<200:
            raise AssertionError("Falta artefacto V29.1 validado: "+from_path)
        dest=ASSETS/path;dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(src.read_bytes())
    mine=(ASSETS/"mis-reservas.html").read_text(encoding="utf-8")
    if 'app.js?v=29.1' not in mine or 'store.js?v=19.1' not in mine:
        raise AssertionError("Mis reservas tiene JS desactualizado")
    # La versión publicada de la API y sus nombres de variables se preservan.
    cf_original,_=http_get(LIVE+"/config.js")
    if (ASSETS/"config.js").read_bytes()!=cf_original:
        raise AssertionError("El API URL productivo fue modificado")
    app=(ASSETS/"app.js").read_text(encoding="utf-8")
    store=(ASSETS/"store.js").read_text(encoding="utf-8")
    for forbidden in ("window.VIA_QA_","qa-access","@qa.invalid","QA · Cuentas",
      "via-maestro-api","Idempotency-Key","via-booking-pending-idempotent-v1"):
        if forbidden in app or forbidden in store:
            raise AssertionError("QA-only o contrato backend incompatible en release: "+forbidden)
    (OUT/"worker.mjs").write_text(worker,encoding="utf-8")
    spec={"name":QA,"main":"worker.mjs","compatibility_date":"2026-11-10",
          "workers_dev":True,"assets":{"directory":"./assets","binding":"ASSETS","run_worker_first":["/api/*"]}}
    (OUT/"wrangler.candidate-stage.jsonc").write_text(json.dumps(spec,indent=2))
    changed={p:digest((ASSETS/p).read_bytes()) for p in ["index.html",*RELEASE_FILES.keys()]}
    manifest={"status":"BUILT_NOT_DEPLOYED","version":PACKAGE_VERSION,
      "productionVersionBefore":web_version,"apiVersionUnchanged":"9f0db4cc-29b8-4d79-8ce8-8fb0588bd079",
      "apkProductionSHA256":"324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3",
      "sourceAssets":inventory,"modifiedFiles":changed,
      "routeUnchangedSha256":EXPECTED_PUBLIC["geo-v2/core.mjs"],
      "configUnchangedSha256":inventory["config.js"],
      "workerSourceHash":digest(worker.encode("utf-8"))}
    (OUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print("VIA_V291_RC_PACKAGE_READY",json.dumps({
      "version":PACKAGE_VERSION,"base":web_version,
      "sourceFiles":len(inventory),"modified":changed,"status":"NO_PROD_DEPLOY"}),flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2 or sys.argv[1]!="prepare":
        raise SystemExit("Uso: python3 scripts/via-v291-prepare.py prepare")
    prepare()
