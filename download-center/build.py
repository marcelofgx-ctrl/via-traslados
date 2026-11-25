import pathlib,hashlib,json,shutil,html
root=pathlib.Path('download-center/assets');(root/'apk').mkdir(parents=True,exist_ok=True)
rows=[]
for version,source,name,title,status,change,expected in [
 ('35','apk-v35/via-traslados-conductor-v35.apk','via-traslados-conductor-v35.apk','Vía Traslados Conductor','Producción','Versión estable firmada · API real','324c1c5b8ed997ec12e51ba37afe665854d226d4a5dd995a4cc0a531651d65e3'),
 ('36','apk-v36/via-traslados-v36-horas-qa.apk','via-traslados-v36-horas-qa.apk','Tu conductor por hora','QA sin conexión','Ficha por horas y cotización manual simulada',None)]:
 p=pathlib.Path(source);b=p.read_bytes();sha=hashlib.sha256(b).hexdigest();assert len(b)>100000 and b[:2]==b'PK'
 if expected:assert sha==expected
 else:assert pathlib.Path('apk-v36/SHA256SUMS.txt').read_text().split()[0]==sha
 shutil.copyfile(p,root/'apk'/name);rows.append(dict(version=version,name=name,title=title,status=status,change=change,bytes=len(b),sha256=sha,url='/apk/'+name))
(root/'versiones.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
(root/'SHA256SUMS.txt').write_text(''.join(r['sha256']+'  '+r['name']+'\n' for r in rows))
cards=''
for r in rows:
 qa=r['version']=='36'
 cards+=f"""<article><div class="top"><div class="phone">▯</div><div><span class="eyebrow">{'ENTORNO DE PRUEBA' if qa else 'VERSIÓN ESTABLE'}</span><h2>{r['title']}</h2><p>V{r['version']} · {r['status']} · {r['bytes']/1e6:.1f} MB</p></div></div><p>{r['change']}</p><p class="hint">{'Instalación independiente de V35. No utiliza reservas reales.' if qa else 'Para conductores autorizados. Opera con viajes reales.'}</p><a class="download {'qa' if qa else ''}" href="{r['url']}" download>↓ Descargar APK V{r['version']}{' QA' if qa else ''}</a><details><summary>Verificar archivo (SHA-256)</summary><code>{r['sha256']}</code></details></article>"""
template=pathlib.Path('download-center/template.html').read_text()
(root/'index.html').write_text(template.replace('<!--CARDS-->',cards))
