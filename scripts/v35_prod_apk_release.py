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
QA="via-traslados-web-apk-v35-qa"
QA_URL="https://"+QA+".marcelof-gx.workers.dev"
BASE="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/workers/scripts/"+WORKER
OUT=pathlib.Path("v35-prod-apk-release")
ASSETS=OUT/"assets"
APK_SOURCE=pathlib.Path("apk-file/via-traslados-conductor-v35.apk")
APK_NAME="descargas/via-traslados-conductor-v35.apk"
EXPECTED_APK_SHA256=pathlib.Path("apk-file/apk-sha256.txt").read_text().strip()
BRANCH_SRC="4ee78e500a773afb702e50092dcba15b52457492"
EXTRAS=("flow-premium.css","flow-premium.js","via-refinement.css","admin.html",
        "descargas/via-traslados-conductor-v34-qa.apk")
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

def prepare():
    if not re.fullmatch(r"[0-9a-f]{32}",ACCOUNT,re.I):raise AssertionError("Account Cloudflare inválida")
    data=APK_SOURCE.read_bytes()
    if not re.fullmatch(r"[0-9a-f]{64}",EXPECTED_APK_SHA256):raise AssertionError("Hash APK V35 inválido")
    if digest(data)!=EXPECTED_APK_SHA256:raise AssertionError("APK V35 firmada no coincide con checksum de CI")
    if len(data)<100000:raise AssertionError("APK V35 sospechosamente pequeña")
    old_apk,_=http_get(LIVE+"/descargas/via-traslados-conductor-v34-qa.apk")
    if digest(old_apk)!="ecc0bb6f296efeaa048500cd67991702eabebee243dea50e94d438f096026d38":
        raise AssertionError("V34 QA original alterada; no desplegar")
    original_version=active_version()
    homepage,_=http_get(LIVE+"/")
    homepage=sanitize_html(homepage)
    for marker in EXPECTED_MARKERS:
        if marker not in homepage:raise AssertionError("La versión actual no es V29: abortar")
    worker=get_live_worker_source()
    OUT.mkdir(exist_ok=True);ASSETS.mkdir(exist_ok=True)
    paths=source_asset_list()
    inventory={}
    for path in paths:
        if path in ("index.html",):continue
        dest=ASSETS/path
        try:
            binary,headers=http_get(LIVE+"/"+urllib.parse.quote(path,safe="/"))
            if path.endswith((".js",".mjs",".css",".webp",".svg")):
                if "text/html" in headers.get("Content-Type","").lower():
                    raise AssertionError("Asset devolvió HTML en vez de archivo: "+path)
        except urllib.error.HTTPError as e:
            raise AssertionError("Asset de V29 no disponible en producción: "+path+" status="+str(e.code))
        if path.endswith(".html"):binary=sanitize_html(binary)
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(binary)
        inventory[path]=digest(binary)
    for path in EXTRAS:
        if path in inventory:continue
        try:
            binary,headers=http_get(LIVE+"/"+urllib.parse.quote(path,safe="/"))
            if "text/html" in headers.get("Content-Type","").lower() and not path.endswith(".html"):
                raise AssertionError("Archivo extra devolvió HTML: "+path)
        except urllib.error.HTTPError as e:
            if e.code==404:continue
            raise
        if path.endswith(".html"):binary=sanitize_html(binary)
        extra_target=ASSETS/path
        extra_target.parent.mkdir(parents=True,exist_ok=True)
        extra_target.write_bytes(binary)
        inventory[path]=digest(binary)
    # Versiones y datos de cuenta permanecen byte a byte iguales a los publicados.
    (ASSETS/"index.html").write_bytes(link_html(homepage))
    inventory["index.html.previous"]=digest(homepage)
    newapk=ASSETS/APK_NAME
    newapk.parent.mkdir(parents=True,exist_ok=True)
    newapk.write_bytes(data)
    (OUT/"worker.mjs").write_text(worker,encoding="utf-8")
    (OUT/"original-homepage.html").write_bytes(homepage)
    (OUT/"original-version.txt").write_text(original_version)
    (OUT/"asset-inventory.json").write_text(json.dumps(inventory,indent=2))
    config(WORKER,"wrangler.prod.jsonc")
    config(QA,"wrangler.qa.jsonc")
    print("PREPARED",len(inventory),"ASSETS",len(data),"APK_BYTES","ACTIVE",original_version,"V29_PRESERVED",flush=True)

def check(url,path,expected=None):
    actual,_=http_get(url+"/"+path)
    expected=expected if expected is not None else (ASSETS/path).read_bytes()
    if path.endswith(".html"):
        if normalized_html(actual)!=normalized_html(expected):raise AssertionError("HTML distinto: "+path)
    elif digest(actual)!=digest(expected):
        raise AssertionError("Archivo distinto: "+path)
    return len(actual)

def smoke(base):
    check(base,APK_NAME)
    check(base,"index.html")
    home,_=http_get(base+"/")
    if "via-driver-v35-download" not in home.decode("utf-8"):raise AssertionError("Enlace V35 ausente")
    if "via-driver-v34-download" not in home.decode("utf-8"):raise AssertionError("Se perdió enlace V34 QA")
    if not all(x in home for x in EXPECTED_MARKERS):raise AssertionError("Assets de V29 faltantes")
    for path in ("app.js","store.js","config.js","reference.js","address-autocomplete.js",
                 "map-point-picker.js","geo-v2/core.mjs","review-compact-v29.css",
                 "reserva.html","mis-reservas.html","conductor.html","sw.js"):
        check(base,path)
    q=urllib.parse.urlencode({"mode":"reverse","lat":-34.905,"lng":-56.185})
    response,_=http_get(base+"/api/direcciones?"+q)
    if not isinstance(json.loads(response).get("results"),list):
        raise AssertionError("Servicio de direcciones dejó de responder")
    print("SMOKE_OK",base,"APK_SHA256",EXPECTED_APK_SHA256,flush=True)

def verify_qa():
    for i in range(25):
        try:
            smoke(QA_URL);return
        except (urllib.error.HTTPError,AssertionError) as e:
            # Sólo se espera la propagación inicial del edge; no tolerar fallos permanentes.
            print("QA_EDGE_NOT_READY",i+1,type(e).__name__,str(e)[:150],flush=True)
            time.sleep(5)
    raise RuntimeError("QA no pasó verificación completa; producción NO tocada")

def rollback(version):
    print("ROLLBACK_START",version,flush=True)
    cf("/deployments",{"strategy":"percentage",
                       "versions":[{"percentage":100,"version_id":version}],
                       "annotations":{"workers/message":"Rollback automático al añadir descarga firmada V35"}})
    for _ in range(12):
        time.sleep(3)
        if active_version()==version:
            print("ROLLBACK_CONFIRMED",version,flush=True);return
    raise RuntimeError("Rollback no confirmado, requiere inspección humana")

def release():
    previous=(OUT/"original-version.txt").read_text().strip()
    if active_version()!=previous:raise AssertionError("Otra publicación cambió producción; ABORTAR")
    actual,_=http_get(LIVE+"/")
    old=(OUT/"original-homepage.html").read_bytes()
    if normalized_html(actual)!=normalized_html(old):raise AssertionError("Portada cambió desde la auditoría, ABORTAR")
    for path,expected_sha in json.loads((OUT/"asset-inventory.json").read_text()).items():
        if path.endswith(".previous"):continue
        remote,_=http_get(LIVE+"/"+urllib.parse.quote(path,safe="/"))
        if path.endswith(".html"):remote=sanitize_html(remote)
        if digest(remote)!=expected_sha:raise AssertionError("Archivo productivo cambió: "+path)
    print("PRODUCTION_PRECHECK_OK",previous,flush=True)
    changed=False
    try:
        p=subprocess.run(["npx","--yes","wrangler@4.160.1","deploy",
                          "--config",str(OUT/"wrangler.prod.jsonc")],
                         capture_output=True,text=True,timeout=270)
        print("WRANGLER_EXIT",p.returncode,"TAIL",p.stdout[-1200:],flush=True)
        if p.returncode:
            print("WRANGLER_ERROR",p.stderr[-800:],flush=True)
            raise RuntimeError("Wrangler prod falló")
        changed=True
        for i in range(25):
            try:
                smoke(LIVE)
                new=active_version()
                if new==previous:raise AssertionError("Cloudflare mantiene versión anterior")
                print("PRODUCTION_APK_DOWNLOAD_VERIFIED",LIVE+"/"+APK_NAME,
                      "OLD_VERSION",previous,"NEW_VERSION",new,flush=True)
                print("NO_BACKEND_OR_D1_OR_AUTH_CHANGES",flush=True)
                return
            except Exception as e:
                print("WAITING_EDGE",i+1,type(e).__name__,str(e)[:150],flush=True)
                time.sleep(5)
        raise RuntimeError("Verificación posterior agotó reintentos")
    except Exception:
        if changed or active_version()!=previous:rollback(previous)
        raise

if __name__=="__main__":
    if len(sys.argv)!=2:raise SystemExit("prepare|verify-qa|release")
    {"prepare":prepare,"verify-qa":verify_qa,"release":release}[sys.argv[1]]()
