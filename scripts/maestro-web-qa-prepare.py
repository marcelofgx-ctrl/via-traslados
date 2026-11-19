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
QA="via-traslados-maestro-web-qa"
QA_URL="https://"+QA+".marcelof-gx.workers.dev"
BASE="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/workers/scripts/"+WORKER
OUT=pathlib.Path("maestro-web-qa-build")
ASSETS=OUT/"assets"
APK_SOURCE=None
APK_NAME="descargas/via-traslados-conductor-v35.apk"
EXPECTED_APK_SHA256=""
BRANCH_SRC="4ee78e500a773afb702e50092dcba15b52457492"
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


# Entorno de pruebas con identidades A/B ficticias, sin OTP o cobros reales.
# Los assets se copian del Worker productivo V29 intacto en Cloudflare;
# sólo cambian store.js, config.js y la portada de QA.
QA_API="https://via-traslados-maestro-api-qa.marcelof-gx.workers.dev"
QA_APK="descargas/via-traslados-conductor-maestro-qa-v36.apk"

def qa_access_script():
    return """(function(){
'use strict';
const API='https://via-traslados-maestro-api-qa.marcelof-gx.workers.dev';
function start(){
  const el=document.createElement('aside');
  el.id='via-maestro-qa-access';
  el.setAttribute('aria-label','Control de cuentas de prueba');
  el.style.cssText='position:fixed;bottom:7px;right:7px;z-index:30000;background:#f5f9f7;border:1px solid #8aafa5;border-radius:12px;padding:9px 11px;max-width:min(94vw,350px);box-shadow:0 5px 15px #0002;font:12px/1.4 Arial,sans-serif;color:#123b38';
  el.innerHTML='<div style="font-weight:700;color:#035b54;margin-bottom:5px">ENTORNO DE PRUEBAS · SIN VIAJES REALES</div><div id="via-qa-active" aria-live="polite">Elegí una cuenta ficticia para probar reservas</div><div style="display:flex;gap:6px;margin-top:7px"><button type="button" data-via-qa="A">Pasajero A</button><button type="button" data-via-qa="B">Pasajero B</button><button type="button" data-via-qa="out">Salir</button></div><div id="via-qa-apk-link" style="margin-top:7px"></div>';
  document.body.appendChild(el);
  el.querySelectorAll('button').forEach(b=>b.style.cssText='min-height:42px;padding:4px 9px;border:1px solid #9bb9b0;border-radius:8px;background:#fff;color:#084943;font:600 12px Arial,sans-serif;cursor:pointer');
  const status=el.querySelector('#via-qa-active');
  const update=()=>{const c=window.ViaStore?.customer();status.textContent=c?'Cuenta activa: '+c.profile.name:'Elegí una cuenta ficticia para probar reservas'};
  update();
  el.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',async()=>{
    const persona=btn.dataset.viaQa;
    for(const b of el.querySelectorAll('button'))b.disabled=true;
    try{
      if(window.ViaStore?.customer())await window.ViaStore.logout();
      if(persona!=='out'){
        const resp=await fetch(API+'/api/qa/passenger-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona})});
        const data=await resp.json();
        if(!resp.ok||!data.qa||!data.sessionToken)throw Error(data.error||'Ingreso QA no disponible');
        window.ViaStore.saveCustomer(data);
      }
      update();
      window.dispatchEvent(new Event('via-customer-session'));
      status.textContent+=' · Acceso actualizado';
    }catch(e){status.textContent='QA: '+(e.message||'No se pudo ingresar')}
    finally{for(const b of el.querySelectorAll('button'))b.disabled=false}
  }));
  const apk=el.querySelector('#via-qa-apk-link');
  if(window.VIA_QA_APK_READY===true)apk.innerHTML='<a id="via-qa-debug-download" style="color:#006b60" href="/descargas/via-traslados-conductor-maestro-qa-v36.apk" download>Descargar APK conductores · MAESTRO QA V36</a>';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();"""

def qa_home(data,apk_ready):
    html=sanitize_html(data).decode("utf-8")
    if html.count("</body>")!=1:raise AssertionError("HTML de producción cambió")
    # Insertar un solo CTA pequeño junto a Mis reservas. Si cambia el
    # HTML efectivo del motor de reservas, abortar (fail-closed).
    target=r'<a class="reference-reservations" href="./mis-reservas.html">.*?</a>'
    matches=list(re.finditer(target,html,flags=re.S))
    if len(matches)!=1:
        sample=re.findall(r'.{0,100}reference-reservations.{0,180}',html,flags=re.S)[:3]
        raise AssertionError("Botón de Mis reservas no coincide con el selector esperado: "+repr(sample)[:900])
    invite=('<aside id="via-home-account-invite" hidden aria-label="Invitación a crear una cuenta">'
      '<span class="via-home-account-invite__copy"><strong>¿Primera vez en Vía?</strong>'
      '<span>Tu cuenta, tus reservas.</span></span>'
      '<a class="via-home-account-invite__link" href="./mis-reservas.html?accion=registro">'
      'Creá tu cuenta <span aria-hidden="true">→</span></a></aside>')
    end=matches[0].end()
    html=html[:end]+invite+html[end:]
    qa_css=('<link rel="stylesheet" href="/qa-home-account-invite.css?v=1">'
      '<style id="via-maestro-qa-only">'
      'a[href*="/descargas/"][href$=".apk"]:not(#via-qa-debug-download){display:none!important}'
      'body{padding-bottom:145px!important}'
      '</style>'
      '<meta name="robots" content="noindex,nofollow">')
    html=html.replace("</head>",qa_css+"</head>",1)
    html=html.replace("</body>",'<script>window.VIA_QA_APK_READY='+('true' if apk_ready else 'false')+';</script><script src="/qa-access.js?v=1"></script><script src="/qa-home-account-invite.js?v=1"></script></body>',1)
    if 'app.js?v=29' not in html or 'store.js?v=19' not in html:
        raise AssertionError("No se preservaron scripts V29 y V19 aprobados")
    return html.encode("utf-8")

def prepare():
    if not re.fullmatch("[0-9a-f]{32}",ACCOUNT,re.I):raise AssertionError("Cuenta CF inválida")
    from pathlib import Path
    patched=Path("dist/via-store-v29-idempotencia-qa.js")
    if not patched.is_file() or patched.stat().st_size<12000:
        raise AssertionError("No se generó store.js QA validado")
    live_version=active_version()
    homepage,_=http_get(LIVE+"/")
    homepage=sanitize_html(homepage)
    for marker in EXPECTED_MARKERS:
        if marker not in homepage:raise AssertionError("Producción V29 cambió: abortar")
    worker=get_live_worker_source()
    OUT.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
    paths=source_asset_list()
    inventory={}
    for path in paths:
        if path=="index.html" or path.startswith("descargas/"):continue
        try:
            binary,headers=http_get(LIVE+"/"+urllib.parse.quote(path,safe="/"))
        except urllib.error.HTTPError as e:
            if e.code==404:
                print("QA_SKIPPING_OBSOLETE_LIVE_ASSET",path,flush=True)
                continue
            raise
        if path.endswith((".js",".mjs",".css",".webp",".svg")) and "text/html" in headers.get("Content-Type","").lower():
            raise AssertionError("Asset inesperado HTML: "+path)
        if path.endswith(".html"):binary=sanitize_html(binary)
        dest=ASSETS/path
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(binary)
        inventory[path]=digest(binary)
    for path in EXTRAS:
        if path in inventory:continue
        try:
            binary,headers=http_get(LIVE+"/"+urllib.parse.quote(path,safe="/"))
        except urllib.error.HTTPError as e:
            if e.code==404:
                print("QA_SKIPPING_OPTIONAL_LIVE_ASSET",path,flush=True)
                continue
            raise
        if "text/html" in headers.get("Content-Type","").lower() and not path.endswith(".html"):
            raise AssertionError("Extra devuelve HTML: "+path)
        if path.endswith(".html"):binary=sanitize_html(binary)
        dest=ASSETS/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(binary)
        inventory[path]=digest(binary)
    required=["app.js","store.js","config.js","geo-v2/core.mjs","reserva.html","map.js","passkeys.js","reference.js","address-autocomplete.js","wizard-ux.js"]
    missing=[p for p in required if not (ASSETS/p).is_file()]
    if missing:raise AssertionError("Faltan archivos críticos de V29: "+", ".join(missing))
    # Nunca incluir APK de producción ni credenciales en el paquete QA.
    apk_file=pathlib.Path("qa-apk-file/via-traslados-conductor-maestro-qa-v36.apk")
    has_apk=apk_file.is_file() and apk_file.stat().st_size>100000
    if has_apk:
        dest=ASSETS/QA_APK;dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(apk_file.read_bytes())
        inventory[QA_APK]=digest(dest.read_bytes())
    (ASSETS/"index.html").write_bytes(qa_home(homepage,has_apk))
    (ASSETS/"store.js").write_bytes(patched.read_bytes())
    # Únicamente la vista Mis reservas cambia; se resuelve el CSS !important
    # y la identidad antigua sin reescribir el motor de direcciones ni las rutas.
    mine_app=Path("dist/via-mine-app-qa.js")
    mine_html=Path("dist/via-mine-html-qa.html")
    mine_css=Path("dist/via-mine-css-qa.css")
    for candidate in (mine_app,mine_html,mine_css):
        if not candidate.is_file() or candidate.stat().st_size<200:
            raise AssertionError("Falta artefacto seguro de Mis reservas: "+str(candidate))
    (ASSETS/"app.js").write_bytes(mine_app.read_bytes())
    mine_page=mine_html.read_text(encoding="utf-8")
    if mine_page.count("</head>")!=1 or mine_page.count("<h2>Crear tu cuenta</h2>")!=1:
        raise AssertionError("El formulario nuevo no coincide con el diseño QA esperado")
    mine_page=mine_page.replace("</head>",'<script>window.VIA_QA_SYNTHETIC_OTP=true;</script></head>',1)
    mine_page=mine_page.replace("<h2>Crear tu cuenta</h2>",
     '<h2>Crear tu cuenta</h2><p id="mine-qa-signup-instructions">Solo en QA: usá un nombre y celular ficticios, un correo terminado en @qa.invalid y el código de prueba 123456. No se envían correos.</p>',1)
    (ASSETS/"mis-reservas.html").write_text(mine_page,encoding="utf-8")
    (ASSETS/"mine-identity-qa.css").write_bytes(mine_css.read_bytes())
    (ASSETS/"config.js").write_text("window.VIA_CONFIG=Object.freeze({demo:false,apiUrl:"+json.dumps(QA_API)+",turnstileSiteKey:''});\n",encoding="utf-8")
    (ASSETS/"qa-access.js").write_text(qa_access_script(),encoding="utf-8")
    # CTA de portada separado de los scripts críticos, sin capturar teléfonos.
    (ASSETS/"qa-home-account-invite.js").write_text(
        pathlib.Path("scripts/qa-home-account-invite.js").read_text(encoding="utf-8"),encoding="utf-8")
    (ASSETS/"qa-home-account-invite.css").write_text(
        pathlib.Path("scripts/qa-home-account-invite.css").read_text(encoding="utf-8"),encoding="utf-8")
    (OUT/"worker.mjs").write_text(worker,encoding="utf-8")
    spec={"name":QA,"main":"worker.mjs","compatibility_date":"2026-11-10","workers_dev":True,
          "assets":{"directory":"./assets","binding":"ASSETS","run_worker_first":["/api/*"]}}
    (OUT/"wrangler.maestro-web.jsonc").write_text(json.dumps(spec,indent=2))
    (OUT/"manifest.json").write_text(json.dumps({
     "productionWebVersionReadOnly":live_version,"productionOrigin":LIVE,"webQa":QA_URL,
     "original":inventory,
     "modified":{"store.js":digest(patched.read_bytes()),"app.js":digest(mine_app.read_bytes()),"mis-reservas.html":digest((ASSETS/"mis-reservas.html").read_bytes()),"mine-identity-qa.css":digest(mine_css.read_bytes()),"config.js":digest((ASSETS/"config.js").read_bytes()),"index.html":digest((ASSETS/"index.html").read_bytes()),"qa-access.js":digest((ASSETS/"qa-access.js").read_bytes()),"qa-home-account-invite.js":digest((ASSETS/"qa-home-account-invite.js").read_bytes()),"qa-home-account-invite.css":digest((ASSETS/"qa-home-account-invite.css").read_bytes())}
    },indent=2))
    print("MAESTRO_QA_WEB_READY",len(inventory),"ORIGINAL_ASSETS",len(worker),"WORKER_BYTES",
          "LIVE_VERSION",live_version,"APK_INCLUDED",has_apk,flush=True)

def verify():
    for path in ("","store.js","config.js","app.js","mis-reservas.html","mine-identity-qa.css","geo-v2/core.mjs","qa-access.js","qa-home-account-invite.js","qa-home-account-invite.css","reserva.html"):
        url=QA_URL+"/"+path
        binary,h=http_get(url)
        if path=="store.js":
            assert digest(binary)==digest((ASSETS/"store.js").read_bytes()),"store QA distinto"
        if path=="app.js":
            assert digest(binary)==digest((ASSETS/"app.js").read_bytes()),"app.js no preservado"
        if path=="geo-v2/core.mjs":
            assert digest(binary)==digest((ASSETS/"geo-v2/core.mjs").read_bytes()),"motor alterado"
        if not binary:raise AssertionError("Asset sin contenido: "+path)
    home,_=http_get(QA_URL+"/")
    if b'ENTORNO DE PRUEBAS' not in (ASSETS/"qa-access.js").read_bytes():raise AssertionError("Sin banner QA")
    if b'qa-access.js' not in home:raise AssertionError("Sin acceso de pruebas")
    if home.count(b'id="via-home-account-invite"')!=1 or b'mis-reservas.html?accion=registro' not in home:
        raise AssertionError("No se publicó la invitación a registro en QA")
    q=urllib.parse.urlencode({"mode":"reverse","lat":-34.905,"lng":-56.185})
    reverse,_=http_get(QA_URL+"/api/direcciones?"+q)
    if not isinstance(json.loads(reverse).get("results"),list):
        raise AssertionError("Geocodificador QA no válido")
    print("MAESTRO_WEB_QA_SMOKE_OK",QA_URL,flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2 or sys.argv[1] not in ("prepare","verify"):
        raise SystemExit("prepare|verify")
    {"prepare":prepare,"verify":verify}[sys.argv[1]]()
