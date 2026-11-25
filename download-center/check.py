import pathlib,urllib.request,hashlib,json,sys,time
base=sys.argv[1].rstrip('/')
rows=json.loads(pathlib.Path('download-center/assets/versiones.json').read_text())
def fetch(path):
 for i in range(5):
  try:
   with urllib.request.urlopen(urllib.request.Request(base+path,headers={'User-Agent':'ViaTrasladosDownloadCheck','Cache-Control':'no-cache'}),timeout=25) as r:return r.read(),r.headers
  except Exception:
   if i==4:raise
   time.sleep(3)
page,h=fetch('/');assert b'Centro de descargas' in page
for r in rows:
 data,h=fetch(r['url']);assert hashlib.sha256(data).hexdigest()==r['sha256']
 assert h.get_content_type()=='application/vnd.android.package-archive'
 assert 'attachment' in h.get('Content-Disposition','')
 print('VIA_DOWNLOAD_VERIFIED '+r['name']+' '+str(len(data)),flush=True)
