#!/usr/bin/env python3
"""Publica dos páginas informativas en via-traslados-web-prod, sin modificar motor web, backend, D1 o APK."""
import importlib.util
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.error

spec=importlib.util.spec_from_file_location("prior_release","scripts/v35_prod_apk_release.py")
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
r.OUT=pathlib.Path("v36-demo-conductores-release")
r.ASSETS=r.OUT/"assets"
r.QA="via-traslados-web-apk-v35-qa"
r.QA_URL="https://"+r.QA+".marcelof-gx.workers.dev"
PAGES=("conductores.html","avance-v30.html")
NEW_LINKS='<span id="via-conductores-link" style="display:inline-flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-left:.7em;"><a href="/conductores.html" style="color:inherit;text-decoration:underline;text-underline-offset:3px;">Soy conductor · Registrarme</a><a href="/avance-v30.html" style="color:inherit;text-decoration:underline;text-underline-offset:3px;">Conocer avances de diseño</a></span>'
EXPECTED_V35_SHA="324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3"
EXPECTED_V34_SHA="ecc0bb6f296efeaa048500cd67991702eabebee243dea50e94d438f096026d38"
FILE_ASSETS=("descargas/via-traslados-conductor-v34-qa.apk","descargas/via-traslados-conductor-v35.apk")

def prepare():
 if not re.fullmatch(r"[a-f0-9]{32}",r.ACCOUNT,re.I):raise AssertionError("Cloudflare account invalid")
 previous=r.active_version()
 homepage,_=r.http_get(r.LIVE+"/")
 original=r.sanitize_html(homepage)
 for m in (*r.EXPECTED_MARKERS,b'via-driver-v35-download',b'via-driver-v34-download'):
  if m not in original:raise AssertionError("Página productiva no es versión segura V29/V35; abortar")
 if b'via-conductores-link' in original:raise AssertionError("Enlaces ya publicados; detener")
 worker=r.get_live_worker_source()
 paths=set(r.source_asset_list())
 paths.update(r.EXTRAS)
 paths.update(FILE_ASSETS)
 paths.discard("index.html")
 paths.difference_update(PAGES)
 r.OUT.mkdir(exist_ok=True);r.ASSETS.mkdir(exist_ok=True)
 audit={}
 for item in sorted(paths):
  # Todos los archivos existentes tienen que ser descargables exactamente desde producción.
  try:body,headers=r.http_get(r.LIVE+"/"+urllib.parse.quote(item,safe="/"))
  except urllib.error.HTTPError as e:
   if e.code==404 and item in r.EXTRAS and item not in FILE_ASSETS:continue
   raise
  if not item.endswith(".html") and "text/html" in headers.get("Content-Type","").lower():
   raise AssertionError("Asset inesperado responde HTML: "+item)
  if item.endswith(".html"):body=r.sanitize_html(body)
  p=r.ASSETS/item;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body);audit[item]=r.digest(body)
 if r.digest((r.ASSETS/FILE_ASSETS[1]).read_bytes())!=EXPECTED_V35_SHA:raise AssertionError("APK V35 cambiada")
 if r.digest((r.ASSETS/FILE_ASSETS[0]).read_bytes())!=EXPECTED_V34_SHA:raise AssertionError("APK V34 QA cambiada")
 if original.count(b"</footer>")!=1:raise AssertionError("footer ambiguo")
 updated=original.replace(b"</footer>",NEW_LINKS.encode()+b"</footer>",1)
 assert updated.count(b'via-conductores-link')==1
 (r.ASSETS/"index.html").write_bytes(updated)
 for name in PAGES:
  raw=pathlib.Path("production-additions",name).read_bytes()
  if not (raw.startswith(b"<!doctype html>") and len(raw)>2500):
   raise AssertionError("Página nueva inválida "+name)
  (r.ASSETS/name).write_bytes(raw)
 (r.OUT/"worker.mjs").write_text(worker,encoding="utf-8")
 (r.OUT/"original-homepage.html").write_bytes(original)
 (r.OUT/"previous-version.txt").write_text(previous)
 (r.OUT/"original-hashes.json").write_text(json.dumps(audit,indent=2))
 r.config(r.WORKER,"wrangler.prod.jsonc")
 r.config(r.QA,"wrangler.qa.jsonc")
 for p in ("wrangler.prod.jsonc","wrangler.qa.jsonc"):
  f=r.OUT/p;data=json.loads(f.read_text());data["keep_vars"]=True;f.write_text(json.dumps(data,indent=2))
 print("READY_WEB_DEMO",len(audit),"PRESERVED_ASSETS",previous,"EXISTING_APKS_UNCHANGED",flush=True)

def smoke(url):
 home,_=r.http_get(url+"/")
 if "via-conductores-link" not in home.decode():raise AssertionError("Página inicio no tiene acceso a conductores")
 for marker in r.EXPECTED_MARKERS:
  if marker not in home:raise AssertionError("Se perdió versión original V29")
 for name,needle in [("conductores.html",b"Solicitar registro"),("avance-v30.html",b"EJEMPLO VISUAL")]:
  raw,_=r.http_get(url+"/"+name)
  raw=r.sanitize_html(raw)  # Cloudflare puede inyectar analytics en HTML únicamente en dominio final.
  if needle not in raw:raise AssertionError("Página no publicada: "+name)
  # Cloudflare inyecta contenido en HTML de dominio personalizado, por lo que
  # su SHA puede diferir sin alterar la página. Validar contenido y enlaces públicos.
  required=(b"<html",b"</html>","vía traslados".encode("utf-8"),b"/conductores.html",b"/avance-v30.html") if name=="avance-v30.html" else (b"<html",b"</html>","vía traslados".encode("utf-8"),b"Solicitar registro",b"/descargas/via-traslados-conductor-v35.apk",b"/avance-v30.html")
  for marker in required:
   if marker.lower() not in raw.lower():
    raise AssertionError("Contenido requerido ausente en "+name+": "+repr(marker))
  if len(raw)<3000:raise AssertionError("Nueva página HTML incompleta: "+name)
 for name in ["app.js","store.js","config.js","reserva.html","mis-reservas.html",
              "review-compact-v29.css","geo-v2/core.mjs","via-status-premium.css",*FILE_ASSETS]:
  raw,_=r.http_get(url+"/"+name)
  if name.endswith(".html"):raw=r.sanitize_html(raw)
  expect=json.loads((r.OUT/"original-hashes.json").read_text()).get(name)
  if expect is None or r.digest(raw)!=expect:raise AssertionError("Regresión asset original "+name)
 qs=urllib.parse.urlencode({"mode":"reverse","lat":-34.905,"lng":-56.185})
 geodata,_=r.http_get(url+"/api/direcciones?"+qs)
 if not isinstance(json.loads(geodata).get("results"),list):raise AssertionError("Servicio geográfico roto")
 print("WEB_DEMO_SMOKE_OK",url,flush=True)

def verify_stage():
 for attempt in range(15):
  try:smoke(r.QA_URL);return
  except (urllib.error.HTTPError,AssertionError) as ex:
   print("WAIT_STAGE",attempt+1,type(ex).__name__,str(ex)[:110],flush=True);time.sleep(5)
 raise AssertionError("Staging no validado. No publicar producción.")

def deploy():
 previous=(r.OUT/"previous-version.txt").read_text().strip()
 if r.active_version()!=previous:raise AssertionError("Worker prod cambió: abortar")
 now,_=r.http_get(r.LIVE+"/")
 if r.normalized_html(now)!=r.normalized_html((r.OUT/"original-homepage.html").read_bytes()):
  raise AssertionError("Página principal cambió luego del backup")
 for name,oldhash in json.loads((r.OUT/"original-hashes.json").read_text()).items():
  raw,_=r.http_get(r.LIVE+"/"+urllib.parse.quote(name,safe="/"))
  if name.endswith(".html"):raw=r.sanitize_html(raw)
  if r.digest(raw)!=oldhash:raise AssertionError("Asset producción cambió luego backup: "+name)
 print("PROD_PRECHECK_PASSED",previous,flush=True)
 changed=False
 try:
  cmd=["npx","--yes","wrangler@4.160.1","deploy","--config",str(r.OUT/"wrangler.prod.jsonc"),"--keep-vars"]
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=300)
  if p.returncode:
   print("DEPLOY_ERROR",p.stderr[-1200:],flush=True);raise RuntimeError("Cloudflare web deploy failed")
  changed=True
  for i in range(24):
   try:
    smoke(r.LIVE)
    if r.active_version()==previous:raise AssertionError("Versión anterior aún activa")
    print("VIA_PRODUCTION_DEMO_READY",r.LIVE+"/conductores.html",
          r.LIVE+"/avance-v30.html","APKS_PRESERVED",flush=True)
    return
   except Exception as ex:
    print("WAITING_PROD_EDGE",i+1,type(ex).__name__,str(ex)[:140],flush=True)
    time.sleep(5)
  raise RuntimeError("Web producción no se pudo comprobar")
 except Exception:
  if changed or r.active_version()!=previous:r.rollback(previous)
  raise

if __name__=="__main__":
 if len(sys.argv)!=2 or sys.argv[1] not in ("prepare","verify-stage","release"):
  raise SystemExit("prepare|verify-stage|release")
 {"prepare":prepare,"verify-stage":verify_stage,"release":deploy}[sys.argv[1]]()
