import json,os,pathlib,urllib.request,hashlib
root='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database'
def call(path,body=None):
 req=urllib.request.Request(root+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},method='POST' if body is not None else 'GET')
 with urllib.request.urlopen(req,timeout=25) as r:j=json.load(r)
 assert j.get('success')
 return j['result']
db=[d for d in call('?name=via-poi-cache-qa') if d.get('name')=='via-poi-cache-qa'];assert len(db)==1
id=db[0]['uuid'];assert id!='dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'
def query(sql,params=[]):
 r=call('/'+id+'/query',{'sql':sql,'params':params});assert all(x.get('success') for x in r);return r[-1].get('results',[])
before=query('SELECT COUNT(*) AS n FROM poi_search_cache')[0]['n']
for s in pathlib.Path('qa/reverse-reference-cache.sql').read_text().split(';'):
 if s.strip():query(s)
key=hashlib.sha256(b'via-reverse-qa-schema-smoke').hexdigest()
slot=next((s for s in range(4096) if not query('SELECT slot FROM reverse_reference_cache WHERE slot=?',[s])),None)
assert slot is not None
payload=json.dumps([{'street':'Calle de prueba sintetica','source':'Geoapify','lat':-34.9061,'lng':-56.1999}])
try:
 query('INSERT INTO reverse_reference_cache(slot,cache_key,payload,expires_at) VALUES(?,?,?,unixepoch()+60)',[slot,key,payload])
 rows=query('SELECT payload FROM reverse_reference_cache WHERE slot=? AND cache_key=? AND expires_at>unixepoch()',[slot,key])
 assert len(rows)==1 and json.loads(rows[0]['payload'])[0]['street']=='Calle de prueba sintetica'
finally:
 query('DELETE FROM reverse_reference_cache WHERE slot=? AND cache_key=?',[slot,key])
assert not query('SELECT slot FROM reverse_reference_cache WHERE slot=? AND cache_key=?',[slot,key])
after=query('SELECT COUNT(*) AS n FROM poi_search_cache')[0]['n']
print('VIA_REVERSE_D1_QA_PASS '+json.dumps({'database':'via-poi-cache-qa','table':'reverse_reference_cache','syntheticRowRemoved':True,'poiEntriesBefore':before,'poiEntriesAfter':after,'productionNotTargeted':True}))
