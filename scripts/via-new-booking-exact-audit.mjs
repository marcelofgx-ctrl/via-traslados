// Final GET-only precise source lines for near-me GPS and second booking entry.
const base='https://viatraslados.com';
const ranges={'reference.js':[[1,12],[85,132],[132,238]],'app.js':[[200,215],[925,936]],'geo-v2/core.mjs':[[1,100],[100,200]],'address-autocomplete.js':[[10,38]]};
for(const [file,rs] of Object.entries(ranges)){
 const response=await fetch(base+'/'+file,{signal:AbortSignal.timeout(25000)});
 if(!response.ok){console.log('VIA_EXACT_FILE_ERROR',file,response.status);continue}
 const lines=(await response.text()).split('\n');
 for(const [a,b] of rs){
  console.log('VIA_EXACT_CODE_BEGIN '+JSON.stringify({file,from:a,to:Math.min(b,lines.length)}));
  for(let i=a-1;i<Math.min(b,lines.length);i++){
   const line=lines[i].slice(0,300);
   if(/apiKey\s*[=:]|token\s*[=:]|password\s*[=:]|secret\s*[=:]/i.test(line))continue;
   console.log(String(i+1).padStart(4,' ')+' '+line)
  }
  console.log('VIA_EXACT_CODE_END '+file)
 }
}
