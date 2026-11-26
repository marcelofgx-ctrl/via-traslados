export default {async fetch(r,env){
 const u=new URL(r.url);
 if(u.pathname==='/api/health'&&r.method==='GET')return Response.json({ok:true,environment:'number-search-qa',reservations:false});
 if(u.pathname==='/api/direcciones'&&r.method==='GET'){
  const target=new URL(u.pathname+u.search,'https://viatraslados.com');
  try{return await fetch(target,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)})}catch{return Response.json({error:'Buscador no disponible',results:[]},{status:503})}
 }
 if(u.pathname.startsWith('/api/')||!['GET','HEAD'].includes(r.method))return Response.json({error:'QA de búsqueda, sin reservas'},{status:503});
 return env.ASSETS.fetch(r);
}};