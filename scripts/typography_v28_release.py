#!/usr/bin/env python3
"""Vía Traslados V26 — release aislado del mapa, con V25 intacta y rollback.
Requiere secretos Cloudflare en GitHub Actions; nunca toca D1, OTP ni DNS.
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

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/"typo-v28-prod-package"
ASSETS=OUT/"assets"
LIVE="https://viatraslados.com"
WORKER="via-traslados-web-prod"
QA="via-traslados-web-typo-v28-qa"
QA_URL=f"https://{QA}.marcelof-gx.workers.dev"
ACCOUNT=os.environ["CLOUDFLARE_ACCOUNT_ID"]
TOKEN=os.environ["CLOUDFLARE_API_TOKEN"]
BASE=f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/{WORKER}"
V27_BASE="7ee0cb722970cb019e77f4619ac79c21ac02a6d5"
EXPECTED_LIVE_VERSION="2723e59c-7da0-44cd-a50e-ffb3b716eb8f"
CHANGED={"index.html","address-selected-preview.js","sw.js"}
ADDED={"address-typography-v28.css"}
LEGACY={"app.js","store.js","passkeys.js","config.js","reference.js","address-autocomplete.js",
        "map-point-picker.js","geo-v2/core.mjs","reserva.html","mis-reservas.html",
        "conductor.html","via-ux-v25.css",
        "via-status-premium.css","via-v3.css"}
EXTRA={"flow-premium.css","flow-premium.js","via-refinement.css","admin.html"}
AGENT="ViaTypographyV28Release/2026-11-17"

def get(url,authorization=False):
    headers={"User-Agent":AGENT,"Cache-Control":"no-cache","Accept-Encoding":"identity"}
    if authorization:headers["Authorization"]="Bearer "+TOKEN
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(req,timeout=32) as r:
        assert r.status==200,(url,r.status)
        return r.read(),r.headers

def cloud(path,body=None):
    headers={"Authorization":"Bearer "+TOKEN,"Accept":"application/json"}
    payload=None
    method="GET"
    if body is not None:
        payload=json.dumps(body).encode("utf-8")
        method="POST"
        headers["Content-Type"]="application/json"
    req=urllib.request.Request(BASE+path,data=payload,headers=headers,method=method)
    with urllib.request.urlopen(req,timeout=45) as r:result=json.load(r)
    assert result.get("success"),str(result.get("errors"))[:500]
    return result.get("result") or {}

def active_version():
    result=cloud("/deployments")
    versions=(result.get("deployments") or [{}])[0].get("versions") or []
    assert len(versions)==1 and float(versions[0]["percentage"])==100, "Multiple active versions"
    return versions[0]["version_id"]

def without_auto_analytics(data):
    # Cloudflare puede insertar este script al servir un dominio personalizado.
    # Nunca subir un HTML que ya lo contenga: evitar doble inyección.
    return re.sub(rb'<script\b[^>]*static\.cloudflareinsights\.com[^>]*>.*?</script>',
        b'',data,flags=re.I|re.S)

def stripped_html(data):
    text=without_auto_analytics(data).decode("utf-8","replace")
    return re.sub(r'>\s+<','><',re.sub(r'\s+',' ',text)).strip()

def write_config(name,filename):
    obj={
        "name":name,"main":"worker.mjs","compatibility_date":"2026-11-10",
        "workers_dev":True,
        "assets":{"directory":"./assets","binding":"ASSETS","run_worker_first":["/api/*"]}
    }
    (OUT/filename).write_text(json.dumps(obj,indent=2))

def sha(data):return hashlib.sha256(data).hexdigest()

def worker_source():
    raw,headers=get(BASE,True)
    match=re.search(r'boundary="?([^";]+)',headers.get("Content-Type",""))
    assert match,"No se obtuvo el Worker actual en formato multipart"
    source=None
    for part in raw.split(b'--'+match.group(1).encode()):
        if b"Content-Disposition" not in part or b"\r\n\r\n" not in part:continue
        head,body=part.split(b"\r\n\r\n",1)
        if b'.js"' in head or b'.mjs"' in head or b'name="_worker.js"' in head:
            source=body.rstrip(b"\r\n").decode("utf-8")
            break
    assert source and len(source)>4000
    for fragment in ("env.ASSETS.fetch(request)","isClosed","/api/direcciones"):
        assert fragment in source,"El Worker cambió: falta "+fragment
    return source

def packaged_paths():
    return {p.relative_to(ROOT/"pages").as_posix():p
       for p in (ROOT/"pages").rglob("*")
       if p.is_file() and not any(x.startswith("_") for x in p.relative_to(ROOT/"pages").parts)
       and p.suffix.lower() not in (".jsonc",) }

def prepare():
    assert re.fullmatch(r"[0-9a-f]{32}",ACCOUNT,re.I)
    OUT.mkdir(exist_ok=True)
    ASSETS.mkdir(exist_ok=True)
    before=active_version()
    assert before==EXPECTED_LIVE_VERSION,"La versión productiva ya no es la V27 auditada. Abortado."
    live_html,_=get(LIVE+"/")
    baseline=subprocess.check_output(["git","show",V27_BASE+":pages/index.html"],cwd=ROOT)
    # Fuente V25 que efectivamente se publicó. Cualquier cambio de producción
    # posterior provoca abortar, NO se pisa el sitio activo con código viejo.
    assert stripped_html(live_html)==stripped_html(baseline),(
        "La portada activa difiere de V27. Abortado para no revertir cambios de producción.")
    candidate=(ROOT/"pages"/"index.html").read_bytes()
    assert b"app.js?v=27" in candidate and b"via-ux-v25.css?v=25" in candidate
    assert b"address-typography-v28.css?v=28" in candidate
    assert b"address-selected-preview.js?v=28" in candidate
    assert b"geo-v2/core.mjs?v=3" in candidate and b"map-point-picker.js?v=26" in candidate
    assert b"demo: false" in (ROOT/"pages"/"config.js").read_bytes()
    original_assets=packaged_paths()
    assert len(original_assets)>=24
    for name,path in original_assets.items():
        if name in CHANGED or name in ADDED:
            data=path.read_bytes()
        else:
            try:
                data,headers=get(LIVE+"/"+urllib.parse.quote(name,safe="/"))
                if name.endswith((".js",".css",".mjs",".webp")):
                    ct=headers.get("Content-Type","").lower()
                    assert "text/html" not in ct,"El asset apunta a HTML "+name
            except urllib.error.HTTPError as e:
                if name in LEGACY or e.code!=404:raise
                data=path.read_bytes()
            # Los archivos que gestionan cuentas, reservas y conductores
            # siguen BYTE A BYTE iguales a lo publicado previamente.
            if name in LEGACY and data!=path.read_bytes():
                # El sitio activo prevalece sobre cualquier copia histórica.
                # También guardamos sus bytes en el paquete para compararlos antes
                # y después de publicar. No se introduce una versión antigua.
                print("PRESERVING_LIVE_V25_ASSET",name,sha(data)[:12])
        if name.endswith(".html") and name not in CHANGED:
            data=without_auto_analytics(data)
        target=ASSETS/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
    for name in EXTRA:
        try:
            data,_=get(LIVE+"/"+name)
        except urllib.error.HTTPError as e:
            if e.code!=404:raise
            print("OPTIONAL_COMPAT_ASSET_NOT_PRESENT",name)
            continue
        (ASSETS/name).write_bytes(without_auto_analytics(data) if name.endswith(".html") else data)
    assert b"demo: false" in (ASSETS/"config.js").read_bytes()
    assert b"app.js?v=27" in (ASSETS/"index.html").read_bytes()
    assert b"app.js?v=27" in (ASSETS/"reserva.html").read_bytes()
    assert b"via-ux-v25.css?v=25" in (ASSETS/"index.html").read_bytes()
    assert b"passkeys.js?v=21" in (ASSETS/"index.html").read_bytes()
    assert b"via-traslados-passenger-driver-geov2-v28-typography" in (ASSETS/"sw.js").read_bytes()
    (OUT/"worker.mjs").write_text(worker_source())
    (OUT/"expected-version.txt").write_text(before)
    write_config(QA,"wrangler.qa.jsonc")
    write_config(WORKER,"wrangler.prod.jsonc")
    print("RELEASE_PACKAGE_READY","old_version",before,"asset_count",len(list(ASSETS.rglob("*"))))
    print("GUARDED_EXISTING_V27",len(LEGACY),"NEW_CSS_FILES",len(ADDED))

def check_asset(url,name):
    actual,_=get(url+"/"+name)
    expected=(ASSETS/name).read_bytes()
    if name.endswith(".html"):
        assert stripped_html(actual)==stripped_html(expected),(
            "HTML diferente tras quitar script analítico de Cloudflare: "+name)
    else:
        assert actual==expected, "Asset inconsistente "+name
    return len(actual)

def verify_qa():
    # La ruta workers.dev puede tardar en propagarse después de Wrangler deploy.
    # No ignorar otros fallos ni continuar a producción sin verificar HTML real.
    for attempt in range(18):
        try:
            html,_=get(QA_URL+"/")
            assert b"app.js?v=27" in html and b"address-typography-v28.css?v=28" in html
            break
        except urllib.error.HTTPError as e:
            if e.code!=404:raise
            print("WAITING_QA_WORKER_EDGE",attempt+1)
            time.sleep(4)
    else:
        raise AssertionError("QA Worker no quedó accesible tras comprobar propagación")
    config,_=get(QA_URL+"/config.js")
    assert b"demo: false" in config
    for path in ("app.js","store.js","config.js","reference.js","address-autocomplete.js",
        "map-point-picker.js","geo-v2/core.mjs","sw.js","conductor.html","reserva.html",
        "mis-reservas.html","via-ux-v25.css","address-selected-preview.js","address-typography-v28.css"):
        for attempt in range(14):
            try:
                check_asset(QA_URL,path)
                break
            except urllib.error.HTTPError as error:
                if error.code!=404:raise
                print("WAITING_QA_ASSET_EDGE",path,attempt+1)
                time.sleep(3)
        else:raise AssertionError("El archivo no está disponible en QA: "+path)
    q=urllib.parse.urlencode({"mode":"reverse","lat":-34.905000,"lng":-56.185000})
    geo,_=get(QA_URL+"/api/direcciones?"+q)
    assert isinstance(json.loads(geo).get("results"),list),"Reverse API inaccesible"
    print("ISOLATED_QA_WORKER_OK",QA_URL)

def rollback(previous):
    print("START_ROLLBACK_TO",previous)
    cloud("/deployments",{
        "strategy":"percentage",
        "versions":[{"percentage":100,"version_id":previous}],
        "annotations":{"workers/message":"Rollback automático tipografía V28 si falla post-deploy"}
    })
    for _ in range(8):
        time.sleep(3)
        if active_version()==previous:
            print("ROLLBACK_CONFIRMED")
            return
    raise RuntimeError("Rollback no confirmado por Cloudflare")

def release():
    previous=(OUT/"expected-version.txt").read_text().strip()
    assert previous==active_version(),"Producción cambió desde staging. Abortado."
    live_html,_=get(LIVE+"/")
    baseline=subprocess.check_output(["git","show",V27_BASE+":pages/index.html"],cwd=ROOT)
    assert stripped_html(live_html)==stripped_html(baseline),"La portada ya no coincide con V27"
    for asset in LEGACY:
        check_asset(LIVE,asset)
    print("PUBLISH_PRECHECK_OK",previous)
    changed=False
    try:
        args=["npx","--yes","wrangler@4.160.1","deploy",
            "--config",str(OUT/"wrangler.prod.jsonc")]
        p=subprocess.run(args,text=True,capture_output=True,timeout=270,cwd=ROOT)
        print("WRANGLER_EXIT",p.returncode)
        print("WRANGLER_LAST_LINES",p.stdout[-1000:])
        if p.returncode:
            print("WRANGLER_ERROR_TAIL",p.stderr[-900:])
            raise RuntimeError("No fue posible crear una versión del Worker")
        changed=True
        for iteration in range(22):
            try:
                html,_=get(LIVE+"/")
                if b"address-typography-v28.css?v=28" in html and b"app.js?v=27" in html:break
            except Exception:pass
            time.sleep(3)
        else:raise AssertionError("La portada V28 no se propagó")
        # Las nuevas URLs y las funciones de reservas pueden propagarse por
        # bordes de Cloudflare en distintos momentos.
        for path in ("address-selected-preview.js","address-typography-v28.css","reference.js","address-autocomplete.js","map-point-picker.js","geo-v2/core.mjs",
                     "sw.js","config.js","app.js","store.js","conductor.html","reserva.html","mis-reservas.html"):
            for _ in range(16):
                try:
                    check_asset(LIVE,path)
                    break
                except Exception:
                    time.sleep(3)
            else:raise AssertionError("Asset V28 no está listo: "+path)
        q=urllib.parse.urlencode({"mode":"reverse","lat":-34.905000,"lng":-56.185000})
        data,_=get(LIVE+"/api/direcciones?"+q)
        assert isinstance(json.loads(data).get("results"),list)
        new=active_version()
        assert new!=previous
        print("PRODUCTION_TYPOGRAPHY_V28_VERIFIED",LIVE,"previous",previous,"new",new)
        print("NO_D1_OTP_WORKERS_DNS_CHANGES")
    except Exception as e:
        print("RELEASE_FAILED",type(e).__name__,str(e)[:400])
        if changed or active_version()!=previous:rollback(previous)
        raise

if __name__=="__main__":
    if len(sys.argv)!=2 or sys.argv[1] not in ("prepare","verify-qa","release"):
        raise SystemExit("Usar prepare | verify-qa | release")
    {"prepare":prepare,"verify-qa":verify_qa,"release":release}[sys.argv[1]]()
