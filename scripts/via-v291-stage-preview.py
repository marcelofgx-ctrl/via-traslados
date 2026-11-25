#!/usr/bin/env python3
"""Reescritura EXCLUSIVA del preview QA, nunca del paquete productivo V29.1.
Evita pedir correos personales y explica el OTP sintético 123456.
"""
import pathlib,re
assets=pathlib.Path("via-v291-rc-build/assets")
config=assets/"config.js"
t=config.read_text(encoding="utf-8")
assert "via-traslados-maestro-api-qa.marcelof-gx.workers.dev" in t
assert "via-traslados-api.marcelof-gx.workers.dev" not in t
config.write_text(t+"\nwindow.VIA_V291_PREVIEW_ONLY=true;\n",encoding="utf-8")
html_file=assets/"mis-reservas.html"
html=html_file.read_text(encoding="utf-8")
pairs=[
 ("<p>Completá tus datos y verificá tu correo. No necesitás reservar un viaje.</p>",
  "<p><strong>Versión de prueba:</strong> no se envían correos. Usá datos ficticios y un correo terminado en <code>@qa.invalid</code>. El código de prueba es <strong>123456</strong>.</p>"),
 ('placeholder="tu-correo@ejemplo.com"','placeholder="prueba@qa.invalid"'),
 (">Enviar código al correo</button>",">Generar código de prueba</button>"),
 ("<h2>Bienvenido de nuevo</h2><p>Ingresá con tu celular para continuar.</p>",
  "<h2>Bienvenido de nuevo</h2><p>Solo se admiten cuentas ficticias creadas en este entorno. No se envían SMS ni correos reales.</p>")
]
for old,new in pairs:
 assert html.count(old)==1,("Mise-reservas cambió",old,html.count(old))
 html=html.replace(old,new,1)
html_file.write_text(html,encoding="utf-8")
appfile=assets/"app.js"
app=appfile.read_text(encoding="utf-8")
target="if(window.VIA_CONFIG?.turnstileSiteKey&&!signupCaptchaToken)"
assert app.count(target)==1,("No se encontró control de envío",app.count(target))
guard=("if(window.VIA_V291_PREVIEW_ONLY&&!/^[a-z0-9._+-]{1,40}@qa\\.invalid$/.test(email)){"
 "signupMessage('Esta versión no envía correos. No uses tu email personal. "
 "Ingresá uno ficticio terminado en @qa.invalid; el código es 123456.');return;}"
)
app=app.replace(target,guard+target,1)
old="signupMessage('Revisá el correo y escribí el código de seis cifras.');"
assert app.count(old)==1
app=app.replace(old,"signupMessage('Código ficticio de pruebas: 123456. No se envió ningún correo.');",1)
appfile.write_text(app,encoding="utf-8")
for path in ("index.html","mis-reservas.html","reserva.html"):
 p=assets/path
 if p.is_file():
  text=p.read_text(encoding="utf-8")
  assert "SIN VIAJES REALES" in text
  p.write_text(text.replace("SIN VIAJES REALES","SIN CORREOS NI VIAJES REALES"),encoding="utf-8")
print("VIA_V291_STAGE_TEST_OTP_ONLY_NO_REAL_EMAIL")
