import os,json,urllib.request,urllib.parse
root='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database'
def get(path):
 req=urllib.request.Request(root+path,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=25) as r:j=json.load(r)
 assert j.get('success')
 return j
rows=[];page=1
while True:
 j=get('?per_page=100&page='+str(page));batch=j['result'];rows.extend(batch)
 if len(batch)<100:break
 page+=1
total=0;unknown=0
for db in rows:
 d=get('/'+db['uuid'])['result'];size=d.get('file_size',db.get('file_size'))
 if not isinstance(size,(int,float)):unknown+=1
 else:total+=size
 print('VIA_D1_SIZE '+json.dumps({'name':db['name'],'bytes':size,'tables':d.get('num_tables',db.get('num_tables'))}))
print('VIA_D1_TOTAL '+json.dumps({'databases':len(rows),'bytes':total,'unknown':unknown}))
