import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../pages/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('no GPS permission query or getCurrentPosition during autocomplete initialization',()=>{
 const listeners={};
 let requested=0;
 const navigator={
  permissions:{query:()=>{requested++;throw Error('No background permission query')}},
  geolocation:{getCurrentPosition:()=>{requested++;throw Error('No auto GPS')}}
 };
 const window={};
 const document={getElementById:()=>null};
 runInNewContext(read('address-autocomplete.js'),{navigator,window,document});
 assert.equal(requested,0);
 assert.equal(typeof window.ViaSearchLocation.get,'function');
 assert.equal(window.ViaSearchLocation.get(),null);
});

test('GPS only triggered by direct click, denial remains inline and manual origin unchanged',()=>{
 let clicks=0,requests=0,status=null;
 const input={value:'Montevideo Shopping, Montevideo'};
 const gpsButton={
  disabled:false,addEventListener(type,fn){if(type==='click')status=fn},
  setAttribute(){},removeAttribute(){}
 };
 const box={insertAdjacentElement(position,node){assert.equal(position,'afterend');statusNode=node}};
 let statusNode=null;
 const nodes={
  'location-shortcut':gpsButton,
  'home-origin':input,
  'home-date':{value:''},
  'home-time':{value:''}
 };
 const document={
  getElementById:id=>nodes[id]??(id==='via-gps-feedback'?statusNode:null),
  querySelector:selector=>selector==='.reference-route-fields'?box:null,
  createElement:()=>({textContent:'',hidden:false,setAttribute(){}})
 };
 const navigator={geolocation:{getCurrentPosition(onSuccess,onError){
  requests++;onError({code:1,message:'Permission blocked by Android overlay'});
 }}};
 runInNewContext(read('reference.js'),{
  document,navigator,window:{},fetch:()=>{},encodeURIComponent,
  requestAnimationFrame:()=>{},Date,console
 });
 assert.equal(requests,0,'no request on page load');
 assert.equal(typeof status,'function');
 status();
 clicks++;
 assert.equal(requests,1,'GPS only after click');
 assert.equal(input.value,'Montevideo Shopping, Montevideo','denied GPS must not erase typed address');
 assert.equal(gpsButton.disabled,false);
 assert.match(statusNode.textContent,/escribir el origen manualmente/i);
 status();
 assert.equal(requests,2,'explicit retry is allowed');
 assert.equal(clicks,1);
});

test('on Android, no modal alerts; stable entry screen and cache invalidation',()=>{
 const reference=read('reference.js'),autocomplete=read('address-autocomplete.js');
 const index=read('index.html'),sw=read('sw.js');
 assert.doesNotMatch(reference,/\balert\s*\(/);
 assert.doesNotMatch(autocomplete,/navigator\.geolocation|navigator\.permissions/);
 assert.match(reference,/gpsButton\?\.addEventListener\('click'/);
 assert.match(index,/id="home-origin"/);
 assert.match(index,/id="location-shortcut"/);
 assert.match(index,/reference\.js\?v=13/);
 assert.match(index,/address-autocomplete\.js\?v=13/);
 assert.match(index,/reference\.css\?v=13/);
 assert.match(sw,/via-traslados-pages-v13-location-optin/);
});
