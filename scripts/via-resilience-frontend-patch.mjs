import {readFile,writeFile} from 'node:fs/promises';
const p=process.argv[2];let s=await readFile(p,'utf8');
const once=(a,b)=>{if(s.split(a).length!==2)throw Error('Active autocomplete anchor mismatch '+a.slice(0,80));s=s.replace(a,b)};
once("if(streets.status==='rejected'&&places.status==='rejected'){","if(streets.status==='rejected'&&(!isPlaceQuery||places.status==='rejected'||!(places.value?.results||[]).length)){");
once("No se pudo consultar el buscador. Probá de nuevo o escribí la dirección manualmente.","El buscador de direcciones no responde ahora. Reintentá o elegí el punto en el mapa.");
once("if(best&&source.value===chosen.label&&best.accuracy==='portal'){","if(best&&source.value===chosen.label&&best.accuracy==='portal'&&best.lat!=null&&best.lng!=null){");
await writeFile(p,s);
