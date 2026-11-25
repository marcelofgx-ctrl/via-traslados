const hosts=['https://via-traslados-api.marcelof-gx.workers.dev/api/via-places?q=','https://via-traslados-v303-search-stage.marcelof-gx.workers.dev/api/direcciones?mode=places&q='];
for(const host of hosts)for(const q of ['Nuevocentro','Nuevocentro Shopping','Nuevo centro','Nuevo centro shopping','Mcdonalds','Plaza Italia Shopping']){
 try{const r=await fetch(host+encodeURIComponent(q)+'&lat=-34.88&lng=-56.17',{signal:AbortSignal.timeout(25000)});const j=await r.json();console.log('VIA_V303_DIAG '+JSON.stringify({host:host.includes('api.marcelof')?'api':'qa',q,status:r.status,error:j.error,features:j.features?.map(x=>x.properties.name),rows:j.results?.map(x=>x.label)}))}
 catch(e){console.log('VIA_V303_DIAG '+JSON.stringify({q,error:e.name}))}
}