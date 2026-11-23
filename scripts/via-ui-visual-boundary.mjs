/* Vía Traslados — permanent, read-only GitHub PR visual-change boundary.
 * This gate never deploys, calls Cloudflare, or writes to API/D1.
 * A visual PR must not simultaneously change protected business/geographic
 * source files. For legitimate functional changes use a separate QA/release. */
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.GITHUB_BASE_REF||'';
const head=process.env.GITHUB_HEAD_REF||'';
if(!base){
 console.log('VIA_VISUAL_BOUNDARY_NO_PR',JSON.stringify({reason:'No pull request base; manual mode read-only'}));
 process.exit(0);
}
let list;
try{
 list=execFileSync('git',['diff','--name-only','origin/'+base+'...HEAD'],{encoding:'utf8',timeout:20000});
}catch(e){
 console.error('Cannot identify change set; refuse to mark the visual safety contract green');
 process.exit(1);
}
const files=list.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const isVisual=/^(via-(?:ui|visual|styling|style|typography|design|theme|look|mine|typo)|ui[-/])/i.test(head)||
 files.some(p=>/\.(css|scss)$/.test(p));
const protectedPaths=[
 /^backend\//i,
 /^migrations\//i,
 /^database\//i,
 /^pages\/(?:app|store|passkeys|reference|address-autocomplete|map-point-picker)\.js$/i,
 /^pages\/geo-v2\//i,
 /^geo-v2\//i,
 /^scripts\/(?:cloudflare-d1|create-wrangler|v35-prod|v36-prod)/i,
 /^\.github\/workflows\/(?:cloudflare-production|via-v35-backend-protected-release|via-v35-prod-signed-release)\.yml$/i
];
const changedProtected=files.filter(p=>protectedPaths.some(re=>re.test(p)));
if(isVisual&&changedProtected.length){
 console.error('VIA_VISUAL_CHANGE_PROTECTED_SOURCE_REFUSED',JSON.stringify({head,protected:changedProtected}));
 console.error('Split the functional/geo/backend changes into a separate QA-reviewed release. Visual commits must not modify them.');
 process.exit(1);
}
const mapScript=files.filter(p=>/^scripts\/via-[^/]+map-point-picker\.js$/i.test(p));
for(const mapPath of mapScript){
 const name=mapPath.split('/').at(-1);
 const version=name.match(/v(?:29)?\d{2,6}/i)?.[0]||'';
 // Versioned presentation patches need independent full suite and rollback builder.
 if(version){
  const release='scripts/via-'+version+'-release.py';
  const check=files.some(f=>f.endsWith('-map-qa.mjs')||f.includes('map-qa.'));
  const hasBuilder=existsSync(release)||files.some(f=>f===release);
  assert(hasBuilder&&check,'Map presentation patches must supply a guarded release builder and mobile QA');
 }
}
console.log('VIA_VISUAL_BOUNDARY_PASS',JSON.stringify({head,base,isVisual,changedFiles:files.length,
 protectedChanges:changedProtected.length,never_deploys:true}));
