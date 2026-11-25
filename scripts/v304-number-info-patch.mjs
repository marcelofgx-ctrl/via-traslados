import {readFile,writeFile} from 'node:fs/promises';
const path=process.argv[2];let s=await readFile(path,'utf8');
const signature=/function gpsPanel\([^)]*\)\s*\{/g;
const matches=[...s.matchAll(signature)];
if(matches.length!==1||!s.includes("gpsPanel('Número orientativo'")||!s.includes('go:openGpsMap'))throw Error('Unexpected live GPS renderer contract');
const m=matches[0];
const native=`
  // V30.4.7: only the existing in-field approximate number indicator is needed.
  // Its visibility is driven by ViaAddress metadata, not by the GPS status panel.
  if(arguments[0]==='Número orientativo')return gpsPanel('','',[]);
`;
s=s.slice(0,m.index+m[0].length)+native+s.slice(m.index+m[0].length);
await writeFile(path,s);
