import {createHash} from 'node:crypto';
const paths=['mis-reservas.html','app.js?v=29','store.js?v=19','via-ux-v25.css?v=25','styles.css'];
for(const path of paths){
  const url='https://viatraslados.com/'+path;
  const res=await fetch(url,{signal:AbortSignal.timeout(22000)});
  if(res.status!==200){console.log('ASSET_NOT_200',path,res.status);continue}
  const body=await res.text();
  const hash=createHash('sha256').update(body).digest('hex');
  const patterns=path.startsWith('app.js')?['async function initMine','async function draw(){',"$('mine-logout')?.addEventListener",'await S.resume();']:
    path.startsWith('store.js')?['async function resume(){','async function logout(){','async function mine(){',"global.ViaStore="]:
    path.endsWith('.css')?['.via-mine-account.known-customer','.hidden']:['id="mine-welcome"','id="mine-login-card"','app.js?v=29','via-ux-v25.css'];
  const matches={};for(const term of patterns){
    const index=body.indexOf(term);
    matches[term]=index<0?null:body.slice(Math.max(0,index-160),index+1550);
  }
  console.log('REAL_MINE_ASSET',JSON.stringify({path,hash,len:body.length,matches}));
}
