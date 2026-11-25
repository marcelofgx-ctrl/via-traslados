import {readFile,writeFile} from 'node:fs/promises';
const path=process.argv[2];let s=await readFile(path,'utf8');
const signature=/function gpsPanel\([^)]*\)\s*\{/g;
const matches=[...s.matchAll(signature)];
if(matches.length!==1||!s.includes("gpsPanel('Número orientativo'")||!s.includes('go:openGpsMap'))throw Error('Unexpected live GPS renderer contract');
const m=matches[0];
const native=String.raw`
  // V30.4.5: presentation-only branch inside the actual GPS renderer.
  document.getElementById('via-number-info-native')?.remove();
  if(arguments[0]==='Número orientativo'){
   const action=arguments[2]?.[0],origin=document.getElementById('home-origin')?.closest('.reference-field');
   if(origin&&typeof action?.go==='function'){
    gpsPanel('','',[]); // Clear the normal status, preserving its original lifecycle.
    const info=document.createElement('div');
    info.id='via-number-info-native';info.className='via-number-info';
    info.setAttribute('role','status');info.setAttribute('aria-live','polite');
    const copy=document.createElement('span');copy.className='via-number-copy';
    copy.innerHTML='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M10 9v5M10 6v.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>Número aproximado</span>';
    copy.title='Es un número cercano, no necesariamente tu puerta.';
    const btn=document.createElement('button');btn.type='button';btn.className='via-number-action';btn.textContent='Ajustar en mapa ›';
    btn.setAttribute('aria-label','Ajustar la ubicación en el mapa');
    btn.addEventListener('click',e=>{e.preventDefault();action.go()});
    info.append(copy,btn);origin.after(info);return;
   }
  }
`;
s=s.slice(0,m.index+m[0].length)+native+s.slice(m.index+m[0].length);
const originInput="document.getElementById('home-origin')";
const tail=s.lastIndexOf('})();');
if(tail<0)throw Error('Unknown GPS source closure');
s=s.slice(0,tail)+originInput+"?.addEventListener('input',()=>document.getElementById('via-number-info-native')?.remove());\n"+s.slice(tail);
await writeFile(path,s);
