import runpy,re,json
m=runpy.run_path('scripts/v302-route-cache-qa.py');o=m['O']
assert m['version'](m['WEB'])=='b23d68ea-5aae-4827-b808-3c4c3504a959'
assert m['version'](m['API'])=='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b'
s=o['get_live_worker_source']()
# Extract only reverse-routing relevant source. Mask any literal token or key parameters.
lines=s.splitlines()
def safe(x):
 x=re.sub(r'(?i)(api[_-]?key|token|secret|authorization)(\s*[:=]\s*["\x27])[^"\x27]+',r'\1\2[REDACTED]',x)
 x=re.sub(r'(?i)([?&](?:api[_-]?key|token|key)=)[^&\s"\x27]+',r'\1[REDACTED]',x)
 return x
matches=[i for i,x in enumerate(lines) if re.search(r'(?i)reverse|/api/direcciones|nominatim|ide\.uy|geoportal|geoservicios',x)]
ids=sorted({k for i in matches for k in range(max(0,i-3),min(len(lines),i+5))})
print('VIA_REVERSE_SOURCE_LENGTH',len(s),'lines',len(lines),'matches',len(matches))
for i in ids[:180]:print('VIA_REVERSE_SOURCE',i+1,safe(lines[i])[:1600])
