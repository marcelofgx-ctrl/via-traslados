import json,os,urllib.request
root='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database'
def call(path,body=None):
 req=urllib.request.Request(root+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},method='POST' if body is not None else 'GET')
 with urllib.request.urlopen(req,timeout=25) as r:j=json.load(r)
 assert j.get('success')
 return j['result']
db=[d for d in call('?name=via-poi-cache-qa') if d.get('name')=='via-poi-cache-qa']
assert len(db)==1
r=call('/'+db[0]['uuid']+'/query',{'sql':'SELECT COUNT(*) AS entries, COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS payload_bytes FROM poi_search_cache WHERE expires_at>unixepoch()'})
stats=r[0]['results'][0];assert 0<stats['entries']<=8192
print('VIA_V304_D1_REAL '+json.dumps(stats))
