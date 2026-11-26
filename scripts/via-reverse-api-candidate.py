import runpy,pathlib,json,re,subprocess,sys
M=runpy.run_path('scripts/v302-route-cache-qa.py');P=M['P'];H=runpy.run_path('scripts/v301-exact-repromotion.py')
API='via-traslados-api';WEB='via-traslados-web-prod';A='5ad845a7-beeb-44e5-9e52-6459bd1fbb8b';W='b23d68ea-5aae-4827-b808-3c4c3504a959'
OUT=pathlib.Path('via-reverse-api');OUT.mkdir(exist_ok=True)
def guard():
 assert M['version'](API)==A and M['version'](WEB)==W,'Active version changed'
def meta(v):return M['cf'](API,'/versions/'+v)
def contract(v):return H['binding_contract'](meta(v))
def prepare():
 guard();assert P['latest_uploaded_version'](API)==A,'API source ambiguous'
 s=P['api_source']();assert 'viaPoiHandle' in s and '/api/health' in s and 'env.DB' in s
 # Preserve non-default exports, replacing only the default export with a wrapper.
 groups=list(re.finditer(r'\bexport\s*\{([^}]*)\}\s*;?',s))
 found=[]
 for g in groups:
  entries=[x.strip() for x in g.group(1).split(',') if x.strip()]
  for e in entries:
   match=re.fullmatch(r'([A-Za-z_$][\w$]*)\s+as\s+default',e)
   if match:found.append((g,entries,e,match.group(1)))
 assert len(found)==1,'Unrecognized API default export'
 g,entries,e,name=found[0]
 rest=[x for x in entries if x!=e]
 s=s[:g.start()]+'const __viaReverseOriginal='+name+';\n'+('export {'+','.join(rest)+'};\n' if rest else '')+s[g.end():]
 addon=pathlib.Path('addons/via-reverse-api.mjs').read_text().replace('export function ','function ').replace('export async function ','async function ')
 s+='\n'+addon+'\nexport default {...__viaReverseOriginal,async fetch(request,env,ctx){if(new URL(request.url).pathname==="/api/via-reverse")return viaReverseHandle(request,env);return __viaReverseOriginal.fetch.call(__viaReverseOriginal,request,env,ctx)}};\n'
 (OUT/'worker.mjs').write_text(s);subprocess.run(['node','--check',str(OUT/'worker.mjs')],check=True)
 b=contract(A);assert b['DB']['type']=='d1' and b['VIA_GEOAPIFY_API_KEY']['type']=='secret_text'
 rt=meta(A)['resources']['script_runtime']
 cfg={'name':API,'main':'./worker.mjs','compatibility_date':rt['compatibility_date'],'compatibility_flags':rt.get('compatibility_flags') or [],'workers_dev':True,'keep_vars':True,'d1_databases':[{'binding':'DB','database_name':'via-traslados-db','database_id':'dfc6a732-4817-4c49-8f2b-16ecaff3ecc0'}]}
 (OUT/'wrangler.jsonc').write_text(json.dumps(cfg));guard();print('VIA_REVERSE_API_PREPARED no traffic; only additive endpoint')
def verify():
 guard();v=P['latest_uploaded_version'](API);assert v!=A
 assert contract(v)==contract(A),'Binding drift'
 assert all(meta(v)['resources']['script_runtime'].get(k)==meta(A)['resources']['script_runtime'].get(k) for k in ['compatibility_date','compatibility_flags'])
 r={'active':A,'candidate':v,'preview':'https://'+v[:8]+'-via-traslados-api.marcelof-gx.workers.dev','web':W}
 (OUT/'candidate.json').write_text(json.dumps(r));print('VIA_REVERSE_API_CANDIDATE '+json.dumps(r))
if __name__=='__main__':{'prepare':prepare,'verify':verify}[sys.argv[1]]()
