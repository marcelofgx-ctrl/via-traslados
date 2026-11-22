// Read-only audit of public passenger app's actual current web code.
// Does not access API, Cloudflare secrets, D1, customer data or session tokens.
const HOME='https://viatraslados.com';
const urls=['index.html','app.js','map.js','geo-v2/core.mjs','sw.js'];
const tests={
 'index.html':/src=["'][^"']+\.js|id=["'][^"']*(?:origin|near|locat|gps|geo)|button|form|meta name=["']version/gi,
 'app.js':/reverseGeocod|geolocat|geoapify|house_?number|street_?number|address\.house|near.?me|cerca de|navigator\.geolocation|getCurrentPosition|watchPosition|origin|new.?booking|new.?request|reset|refresh|wizard|localStorage|sessionStorage|number|número/gi,
 'map.js':/reverse|geolocat|geoapify|house_?number|street_?number|address\.house|getCurrentPosition|watchPosition|origin|cache|refresh|reset|geocode/gi,
 'geo-v2/core.mjs':/reverse|geolocat|geoapify|house_?number|street_?number|address\.house|getCurrentPosition|origin|cache|address/gi,
 'sw.js':/cache|fetch|offline|version/gi
};
for(const pathname of urls){
 const r=await fetch(HOME+'/'+pathname,{signal:AbortSignal.timeout(25000),headers:{'Accept':'text/javascript,text/html,*/*','Cache-Control':'no-cache'}});
 if(!r.ok){console.log('VIA_ORIGIN_PUBLIC_RESOURCE',{pathname,http:r.status});continue}
 const s=await r.text(),lines=s.split('\n');
 const matches=[];
 for(let i=0;i<lines.length;i++){
  if(tests[pathname].test(lines[i])){
   matches.push(i);
   tests[pathname].lastIndex=0;
  }
  tests[pathname].lastIndex=0;
 }
 console.log('VIA_ORIGIN_RESOURCE',JSON.stringify({path:pathname,http:r.status,bytes:s.length,lines:lines.length,matches:matches.length}));
 const excerpts=[];
 const seen=new Set();
 for(const ix of matches){
  const st=Math.max(0,ix-2),en=Math.min(lines.length,ix+3);
  for(let j=st;j<en;j++){
   if(seen.has(j))continue;seen.add(j);
   // Skip verbatim config blobs; the public source is not expected to have secrets,
   // but never print token/key/cookie local variables to public workflow output.
   const line=lines[j].slice(0,260);
   if(/(?:api.?key|bearer |authorization|secret|token|password)\s*[:=]/i.test(line))continue;
   excerpts.push(String(j+1).padStart(4,' ')+' '+line)
  }
  if(excerpts.length>=115)break;
 }
 console.log('VIA_ORIGIN_CODE_SNAPSHOT '+pathname+'\n'+excerpts.join('\n'));
}
console.log('VIA_NEW_BOOKING_ORIGIN_AUDIT_READONLY_FINISHED');
