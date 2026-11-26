import runpy,pathlib,json,re,subprocess,sys
M=runpy.run_path('scripts/v302-route-cache-qa.py');P=M['P'];H=runpy.run_path('scripts/v301-exact-repromotion.py')
API='via-traslados-api';WEB='via-traslados-web-prod';A='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b';W='eb447f2d-4772-4ab6-9583-ee785bfa9621';REVERSE='8d9255cc-8dcf-42f1-b66c-a4c5abd5c06f'
OUT=pathlib.Path('via-resilience');OUT.mkdir(exist_ok=True)
def guard():assert M['version'](API)==A and M['version'](WEB)==W,'Active production changed'
def meta(n,v):return M['cf'](n,'/versions/'+v)
def contract(n,v):return H['binding_contract'](meta(n,v))
def split(s,name):
 groups=list(re.finditer(r'\bexport\s*\{([^}]*)\}\s*;?',s));found=[]
 for g in groups:
  entries=[x.strip() for x in g.group(1).split(',') if x.strip()]
  for e in entries:
   m=re.fullmatch(r'([A-Za-z_$][\w$]*)\s+as\s+default',e)
   if m:found.append((g,entries,e,m.group(1)))
 assert len(found)==1,'Unexpected bundle export'
 g,entries,e,old=found[0];rest=[x for x in entries if x!=e]
 return s[:g.start()]+'const '+name+'='+old+';\n'+('export {'+','.join(rest)+'};\n' if rest else '')+s[g.end():]
def prepare():
 guard();latest=P['latest_uploaded_version'](API)
 assert latest in {A,REVERSE},'Unknown latest API; stop'
 assert contract(API,latest)==contract(API,A)
 s=P['api_source']();assert 'viaPoiHandle' in s and '/api/health' in s
 assert ('/api/via-reverse' in s)==(latest==REVERSE)
 # Known reverse candidate was built as additive wrapper of the active API.
 # Keep original implementation and previously prepared reverse endpoint.
 s=split(s,'__viaResilienceOriginal')
 forward=pathlib.Path('addons/via-forward-api.mjs').read_text().replace('export function ','function ').replace('export async function ','async function ')
 reverse='' if latest==REVERSE else pathlib.Path('addons/via-reverse-api.mjs').read_text().replace('export function ','function ').replace('export async function ','async function ')
 dispatch='' if latest==REVERSE else 'if(path==="/api/via-reverse")return viaReverseHandle(request,env);'
 s+='\n'+forward+'\n'+reverse+'\nexport default {...__viaResilienceOriginal,async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path==="/api/via-forward")return vfHandle(request,env);'+dispatch+'return __viaResilienceOriginal.fetch.call(__viaResilienceOriginal,request,env,ctx)}};\n'
 (OUT/'api.mjs').write_text(s);subprocess.run(['node','--check',str(OUT/'api.mjs')],check=True)
 b=contract(API,A);assert b['DB']['type']=='d1' and b['VIA_GEOAPIFY_API_KEY']['type']=='secret_text'
 rt=meta(API,A)['resources']['script_runtime']
 cfg={'name':API,'main':'./api.mjs','compatibility_date':rt['compatibility_date'],'compatibility_flags':rt.get('compatibility_flags') or [],'workers_dev':True,'keep_vars':True,'d1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':'dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'}]}
 (OUT/'wrangler-api.jsonc').write_text(json.dumps(cfg));guard();print('VIA_RESILIENCE_API_PREPARED source '+latest+'; no active traffic')
def verify():
 guard();v=P['latest_uploaded_version'](API);assert v not in {A,REVERSE}
 assert contract(API,v)==contract(API,A)
 assert all(meta(API,v)['resources']['script_runtime'].get(k)==meta(API,A)['resources']['script_runtime'].get(k) for k in ['compatibility_date','compatibility_flags'])
 r={'active':A,'candidate':v,'preview':'https://'+v[:8]+'-via-traslados-api.marcelof-gx.workers.dev','web':W}
 (OUT/'candidate.json').write_text(json.dumps(r));print('VIA_RESILIENCE_API_CANDIDATE '+json.dumps(r))
if __name__=='__main__':{'prepare':prepare,'verify':verify}[sys.argv[1]]()
