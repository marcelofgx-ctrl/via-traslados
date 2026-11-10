/* Vía Traslados · WebAuthn passkeys. Huella/PIN se verifican en el sistema del teléfono.
   Se ejecuta solo en viatraslados.com (HTTPS), nunca en las demos de Vercel. */
(function(global){'use strict';
const S=global.ViaStore;
const available=()=>!!(global.isSecureContext&&global.PublicKeyCredential&&
  global.navigator?.credentials?.create&&global.navigator?.credentials?.get&&!S.isDemo());
function toBytes(s){
 const base=String(s).replace(/-/g,'+').replace(/_/g,'/');
 const binary=atob(base+'='.repeat((4-base.length%4)%4));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function to64(data){
 const bytes=new Uint8Array(data),binary=Array.from(bytes,c=>String.fromCharCode(c)).join('');
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function creationOptions(json){
 const p={...json};
 p.challenge=toBytes(p.challenge);
 p.user={...p.user,id:toBytes(p.user.id)};
 p.excludeCredentials=(p.excludeCredentials||[]).map(k=>({...k,id:toBytes(k.id)}));
 return p;
}
function loginOptions(json){
 const p={...json};p.challenge=toBytes(p.challenge);
 p.allowCredentials=(p.allowCredentials||[]).map(k=>({...k,id:toBytes(k.id)}));
 return p;
}
function toJson(credential){
 if(typeof credential.toJSON==='function')return credential.toJSON();
 const response=credential.response;
 const j={
  id:credential.id,rawId:to64(credential.rawId),type:credential.type,
  authenticatorAttachment:credential.authenticatorAttachment||undefined,
  clientExtensionResults:credential.getClientExtensionResults?.()||{},
  response:{clientDataJSON:to64(response.clientDataJSON)}
 };
 if(response.attestationObject){
  j.response.attestationObject=to64(response.attestationObject);
  j.response.transports=response.getTransports?.()||[];
  j.response.publicKeyAlgorithm=response.getPublicKeyAlgorithm?.();
  const pk=response.getPublicKey?.();
  if(pk)j.response.publicKey=to64(pk);
 }else{
  j.response.authenticatorData=to64(response.authenticatorData);
  j.response.signature=to64(response.signature);
  j.response.userHandle=response.userHandle?to64(response.userHandle):null;
 }
 return j;
}
async function enable(){
 if(!available())throw Error('La huella está disponible al abrir viatraslados.com en Chrome o en una app compatible.');
 if(!S.customer())throw Error('Primero confirmá tu correo para activar el acceso con huella.');
 const requested=await S.passkeyRequest('register/options',{});
 const credential=await navigator.credentials.create({publicKey:creationOptions(requested.options)});
 if(!credential)throw Error('No se completó el registro de la huella');
 const result=await S.passkeyRequest('register/verify',{challengeId:requested.challengeId,credential:toJson(credential)});
 if(!result.registered)throw Error('No se pudo activar este dispositivo');
 const c=S.customer();
 S.saveCustomer({...c,passkeys:(c?.passkeys||0)+1});
 return result;
}
async function signIn(phone){
 if(!available())throw Error('Este navegador no admite huella. Podés entrar con código por correo.');
 const requested=await S.passkeyRequest('login/options',{phone});
 const credential=await navigator.credentials.get({publicKey:loginOptions(requested.options)});
 if(!credential)throw Error('No se completó la identificación');
 const result=await S.passkeyRequest('login/verify',{challengeId:requested.challengeId,credential:toJson(credential)});
 S.saveCustomer(result);
 return result;
}
global.ViaPasskeys={available,enable,signIn};
})(window);
