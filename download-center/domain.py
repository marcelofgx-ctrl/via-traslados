import os,json,urllib.request,urllib.parse
account=os.environ['CLOUDFLARE_ACCOUNT_ID'];host='descargas.viatraslados.com';service='via-traslados-descargas'
def cf(path,body=None):
 req=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},method='PUT' if body is not None else 'GET')
 with urllib.request.urlopen(req,timeout=25) as r: j=json.load(r)
 assert j.get('success'),'CF request failed'
 return j['result']
zones=cf('/zones?name=viatraslados.com&status=active');assert len(zones)==1 and zones[0]['account']['id']==account
zone=zones[0]['id'];path='/accounts/'+account+'/workers/domains'
existing=cf(path+'?hostname='+host)
exact=[d for d in existing if d['hostname']==host]
if exact:
 assert len(exact)==1 and exact[0]['service']==service,'Hostname assigned to another worker'
else:
 records=cf('/zones/'+zone+'/dns_records?name='+host)
 assert not records,'Hostname has an existing DNS record: no changes made'
 result=cf(path,{'hostname':host,'service':service,'zone_id':zone,'environment':'production'})
 assert result['hostname']==host and result['service']==service
print('VIA_DOWNLOAD_DOMAIN_ATTACHED '+host,flush=True)
