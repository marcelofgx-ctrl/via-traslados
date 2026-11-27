"""Patch only a verified copy of the active frontend assets; never deploy here."""
from pathlib import Path
import sys,shutil
root=Path(sys.argv[1])
app=root/'app.js';s=app.read_text()
anchor="'<div class=\"via-trip-summary\" aria-label=\"Detalles de tu reserva\">'+"
assert s.count(anchor)==1,'Unknown frontend source: stop'
s=s.replace(anchor,"(window.ViaDriverConfirmation?.render(b)||'')+"+anchor)
app.write_text(s)
for n in ['via-driver-confirmation.js','via-driver-confirmation.css']:shutil.copyfile(Path('addons')/n,root/n)
for page in ['booking.html']:
 p=root/page;assert p.exists(),page
 s=p.read_text();assert s.count('</head>')==1
 s=s.replace('</head>','<link rel="stylesheet" href="/via-driver-confirmation.css?v=31qa"><script src="/via-driver-confirmation.js?v=31qa" defer></script></head>')
 p.write_text(s)
