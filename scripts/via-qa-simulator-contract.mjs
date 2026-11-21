// QA-only simulator contract. No external API access or real user data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const configSource=readFileSync('via-current-qa/assets/config.js','utf8');
const storeSource=readFileSync('via-current-qa/assets/store.js','utf8');
const memory=new Map();
function load(search){
 const context={
  window:{},location:{search,origin:'https://qa.example'},
  sessionStorage:{getItem:key=>memory.get(key)??null,setItem:(key,v)=>memory.set(key,String(v))},
  URLSearchParams
 };
 vm.runInNewContext(configSource,context,{timeout:1000});
 return context.window.VIA_CONFIG;
}
const def=load('');
assert.equal(def.demo,false,'Normal QA must never silently enter demo');
assert.equal(def.apiUrl,'https://qa.example');
assert.equal(def.turnstileSiteKey,'');
assert.equal(load('?qa_sim=1').demo,true,'Simulator must require explicit opt-in');
assert.equal(load('').demo,true,'Simulator should persist across pages of one tab');
assert.equal(load('?qa_sim=0').demo,false,'Simulator can be disabled');
assert.equal(load('').demo,false,'Normal QA restored');
const route=storeSource.match(/async function estimateRoute\(origin,destination\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.ok(route.includes('/api/public/route-preview'),'Real public route API must still be used by simulator');
assert.ok(!route.includes('if(isDemo())return null'),'QA route preview must not be bypassed in local simulator');
assert.ok(!configSource.includes('viatraslados.com'),'Config must not contact production');
const ui=readFileSync('via-current-qa/assets/via-qa-browser-diagnostics.js','utf8');
assert.ok(ui.includes('SIMULACIÓN QA')&&ui.includes('No se envían correos ni se crean reservas reales.'),'UI must clearly label fake data');
console.log('QA_SIMULATOR_CONTRACT_OK: opt-in and opt-out, simulated identity, genuine QA routing, no production APIs');
