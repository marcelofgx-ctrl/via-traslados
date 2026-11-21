// Vía Traslados — puente exclusivo del backend de QA (sin referencias productivas).
import api from './worker.js';
const QA_ORIGIN='https://via-traslados-current-prod-qa.marcelof-gx.workers.dev';
const QA_DB_NAME='via-traslados-db-auth-qa-20261121';
const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Via-Environment':'qa-isolated'}
});
const allowlist=env=>String(env.VIA_QA_TEST_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
export default {
 async fetch(req,env,ctx){
  if(env.VIA_QA_ENV!=='isolated'||env.VIA_QA_NAME!==QA_DB_NAME||!env.DB)
   return json({error:'QA sin base aislada: operación bloqueada'},503);
  const u=new URL(req.url),path=u.pathname,origin=req.headers.get('Origin');
  if(origin && origin!==QA_ORIGIN)return json({error:'Origen QA no autorizado'},403);
  if(!/^\/api\//.test(path))return json({error:'Recurso QA inexistente'},404);
  if(req.method==='POST'&&path==='/api/auth/start'){
   let email='';
   try{email=String((await req.clone().json()).email||'').trim().toLowerCase()}catch{}
   if(!allowlist(env).includes(email))return json({error:'QA restringida a los correos de prueba autorizados'},403);
  }
  // Impedir usos indirectos de la API QA desde el dominio productivo.
  if(path==='/api/health'&&req.method==='GET'){
   const res=await api.fetch(req,env,ctx);
   const body=await res.json();
   return json({...body,qaIsolated:true,identityTestEnabled:allowlist(env).length>0},res.status);
  }
  const res=await api.fetch(req,env,ctx);
  const h=new Headers(res.headers);h.set('X-Via-Environment','qa-isolated');
  return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
 }
};
