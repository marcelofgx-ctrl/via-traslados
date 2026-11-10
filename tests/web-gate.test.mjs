import test from 'node:test';
import assert from 'node:assert/strict';
import site from '../pages/_worker.js';
function env(){
 let reads=0;
 return {ASSETS:{fetch:async req=>{reads++;return new Response('<h1>Vía Traslados</h1>',{status:200,headers:{'Content-Type':'text/html'}})}},get reads(){return reads}};
}
test('apagado en D1 impide cargar la portada en el edge',async()=>{
 const real=globalThis.fetch;
 globalThis.fetch=async(url)=>{assert.match(String(url),/api\/public\/status/);return new Response(JSON.stringify({enabled:false}),{status:200})};
 try {
  const assets=env();
  for(const route of ['/','/index.html','/reserva.html','/mis-reservas.html']){
   const response=await site.fetch(new Request('https://viatraslados.com'+route),assets);
   assert.equal(response.status,503,route);
   assert.match(await response.text(),/temporalmente suspendido/i);
   assert.match(response.headers.get('Cache-Control'),/no-store/);
  }
  assert.equal(assets.reads,0);
 }finally{globalThis.fetch=real}
});
test('el administrador conserva la página privada durante la suspensión',async()=>{
 const real=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({enabled:false}),{status:200});
 try{
  const assets=env();
  const response=await site.fetch(new Request('https://viatraslados.com/conductor.html'),assets);
  assert.equal(response.status,200);
  assert.equal(assets.reads,1);
 }finally{globalThis.fetch=real}
});
test('web habilitada funciona y un fallo de estado no derriba la portada',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({enabled:true}),{status:200});
  const asset=env();
  assert.equal((await site.fetch(new Request('https://viatraslados.com/'),asset)).status,200);
  globalThis.fetch=async()=>{throw Error('Fallo temporal de red')};
  assert.equal((await site.fetch(new Request('https://viatraslados.com/'),asset)).status,200);
 }finally{globalThis.fetch=original}
});
