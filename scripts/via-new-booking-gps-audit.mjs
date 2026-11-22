// Focused read-only audit: exact public script chain + address/near-me handlers.
const ROOT='https://viatraslados.com';
const page=await fetch(ROOT+'/index.html',{headers:{'Cache-Control':'no-cache'}}).then(r=>r.text());
const tags=[...page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
console.log('VIA_ACTUAL_JS_ORDER',JSON.stringify(tags));
const local=[...new Set(tags.filter(s=>!s.startsWith('http')).map(s=>s.replace(/^\.\//,'').split('?')[0]))];
for(const path of local){
 const r=await fetch(ROOT+'/'+path,{signal:AbortSignal.timeout(25000)});
 if(!r.ok){console.log('VIA_SCRIPT_NOT_FOUND',path,r.status);continue}
 const code=await r.text(),lines=code.split('\n');
 const expressions=[
  /getCurrentPosition|watchPosition|navigator\.geolocation|reverseGeocod|geoapify|address\.house|house_number|houseNumber|street_number|streetNumber/i,
  /via:address|ViaAddress|start.*booking|new.*booking|reset.*trip|reset.*form|clear.*origin|home-origin/i,
  /near-me|nearMe|nearby|me-locate|locate-me|gps-btn|gps-button|location-btn|geo-btn/i,
  /geolocation|locationGranted|locationObtained|geo\.coords|latitude|longitude/i
 ];
 const hits=[];
 for(let i=0;i<lines.length;i++)if(expressions.some(p=>p.test(lines[i])))hits.push(i);
 if(!hits.length)continue;
 console.log('VIA_RELEVANT_FILE',JSON.stringify({path,lines:lines.length,bytes:code.length,hits:hits.length}));
 const shown=new Set();let snippets=[];
 for(const i of hits){
  for(let j=Math.max(0,i-3);j<Math.min(lines.length,i+5);j++){
   if(shown.has(j))continue;shown.add(j);
   const val=lines[j].slice(0,260);
   if(/api.?key\s*=|secret\s*=|password\s*=|bearer \w+/i.test(val))continue;
   snippets.push(String(j+1).padStart(4,' ')+' '+val)
  }
  if(snippets.length>170)break
 }
 for(let i=0;i<snippets.length;i+=70)console.log('VIA_CODE_LINES '+path+' part '+Math.floor(i/70)+'\n'+snippets.slice(i,i+70).join('\n'))
}
console.log('VIA_ORIGIN_FOCUSED_AUDIT_END');
