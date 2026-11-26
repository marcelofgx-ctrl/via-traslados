import {readFile,writeFile} from 'node:fs/promises';
const path=process.argv[2];let s=await readFile(path,'utf8');
const helper=(await readFile(new URL('../addons/via-numbered-search.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
const once=(a,b)=>{if(s.split(a).length!==2)throw Error('Active autocomplete anchor mismatch: '+a.slice(0,90));s=s.replace(a,b)};
once('function search(input){',helper+'\nfunction search(input){');
once("fetch(endpoint+'&mode=suggest',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json()})","viaNumberedSuggest(endpoint,q,abort.signal)");
once("if(streets.status==='rejected'&&places.status==='rejected'){","if(streets.status==='rejected'&&(!isPlaceQuery||places.status==='rejected'||!(places.value?.results||[]).length)){");
once("if(best&&source.value===chosen.label&&best.accuracy==='portal'){","if(best&&source.value===chosen.label&&best.accuracy==='portal'&&(!viaNumberQuery(chosen.label)||viaVerifiedPortal(best,viaNumberQuery(chosen.label)))){");
await writeFile(path,s);
