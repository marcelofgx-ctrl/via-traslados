const names=new Set(['via-traslados-conductor-v35.apk','via-traslados-v36-horas-qa.apk']);
export default {async fetch(request,env){
 const u=new URL(request.url),n=u.pathname.split('/').pop();
 if(!['GET','HEAD'].includes(request.method))return new Response('Método no permitido',{status:405});
 if(!['/','/index.html','/versiones.json','/SHA256SUMS.txt'].includes(u.pathname)&&!(names.has(n)&&u.pathname==='/apk/'+n))return new Response('No encontrado',{status:404});
 const r=await env.ASSETS.fetch(request);const h=new Headers(r.headers);
 h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');h.set('X-Robots-Tag','noindex, nofollow');
 if(names.has(n)&&r.ok){h.set('Content-Type','application/vnd.android.package-archive');h.set('Content-Disposition','attachment; filename="'+n+'"');h.set('Cache-Control','public, max-age=86400');}
 else h.set('Cache-Control','no-cache');
 return new Response(r.body,{status:r.status,headers:h});
}};