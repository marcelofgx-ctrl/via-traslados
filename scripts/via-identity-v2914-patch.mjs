import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='identity-v2914-build/assets/';
const digest=b=>createHash('sha256').update(b).digest('hex');
const expected={
 app:'3df13d2f4d318511ea189e90446da78fd448d8edf90fc4d41df7d7e7e0f03a0c',
 store:'3dc61982cbf5498402ae7eebdf01a03979d34fca9d81d5d77497d748e3b4e6c8',
 reference:'7e4841b60c7a9796673ed7ad41e54446cac3eded802bcb1cb37971cec61fd47b',
 geo:'17a9ef5d2396d595e6d0847b0b32da80244f75084ced89cad485ff22377509c1'
};
for(const [name,hash] of Object.entries(expected)){
 const file=name==='geo'?'geo-v2/core.mjs':name+'.js';
 assert.equal(digest(await readFile(dir+file)),hash,'Cambio en archivo activo: '+file);
}
const before=await readFile(dir+'app.js','utf8');
let app=before;
const replaceOne=(a,b,label)=>{
 assert.equal(app.split(a).length,2,'Fuente productiva no reconocible: '+label);
 app=app.replace(a,b);
};
const replaceBlock=(from,to,newCode,label)=>{
 const passenger=app.indexOf('function initPassenger()');
 const passengerEnd=app.indexOf('function initDriver(',passenger);
 const i=app.indexOf(from,passenger),j=app.indexOf(to,i+from.length);
 if(!(passenger>=0&&i>=passenger&&j>i&&(passengerEnd<0||j<passengerEnd)))console.log('VIA_IDENTITY_V2914_PATCH_DIAG',JSON.stringify({label,passenger,passengerEnd,i,j,fromCount:app.split(from).length-1,toCount:app.split(to).length-1,near:app.slice(Math.max(passenger,0)+140,Math.max(passenger,0)+380)}));
 assert(passenger>=0&&i>=passenger&&j>i&&(passengerEnd<0||j<passengerEnd),'Rango pasajero inválido '+label);
 app=app.slice(0,i)+newCode+app.slice(j);
};
const helper=await readFile('scripts/via-identity-v2914-helpers.txt','utf8');
const wizard=await readFile('scripts/via-identity-v2914-wizard.txt','utf8');
const summary=await readFile('scripts/via-identity-v2914-summary.txt','utf8');
replaceBlock(" const current=S.customer,hasSession=()=>!!current()?.profile;",
 " const error=message=>",
 helper+" const hidden=(id,yes)=>$(id)?.classList.toggle('hidden',yes);\n",
 'trust account');
replaceBlock("  $('wizard-back').addEventListener('click',()=>{",
 "  $('forget-customer')?.addEventListener('click',async()=>{",
 wizard,'verified direct step3');
replaceOne(
 "   $('verification-description').textContent=needsPinReset?\n    'Ya verificaste tu correo. Elegí un PIN nuevo y confirmá tu viaje.':\n    'Tu cuenta está verificada. Solo falta confirmar la solicitud.';",
 "   $('verification-description').textContent=needsPinReset?\n    'Ya verificaste tu correo. Elegí un PIN nuevo y confirmá tu viaje.':\n    'Tu cuenta está verificada. Solo falta confirmar la solicitud.';\n"+summary.trimEnd(),
 'verified summary');
replaceOne(
 "  $('forget-customer')?.addEventListener('click',async()=>{\n   await S.logout();",
 "  $('forget-customer')?.addEventListener('click',async()=>{\n   ++identityEpoch;validatedToken=null;\n   await S.logout();",
 'logout pending validation');
replaceOne("    await S.pinLogin(selectedPhone,pin,grant);remembered();",
 "    await S.pinLogin(selectedPhone,pin,grant);validatedToken=current()?.sessionToken||null;remembered();",
 'PIN proof');
replaceOne("   try{await window.ViaPasskeys.signIn(selectedPhone);remembered();openConfirmation(false)}",
 "   try{await window.ViaPasskeys.signIn(selectedPhone);validatedToken=current()?.sessionToken||null;remembered();openConfirmation(false)}",
 'passkey proof');
replaceOne("   try{await S.finishPhoneLogin(selectedPhone,code);remembered();openConfirmation(needsPinReset)}",
 "   try{await S.finishPhoneLogin(selectedPhone,code);validatedToken=current()?.sessionToken||null;remembered();openConfirmation(needsPinReset)}",
 'email proof');
replaceOne(
 "     await S.verifyCode(verifiedEmail,code,{name:signupPayload.name,phone:signupPayload.phone});\n     enrolled=true;",
 "     await S.verifyCode(verifiedEmail,code,{name:signupPayload.name,phone:signupPayload.phone});\n     validatedToken=current()?.sessionToken||null;\n     enrolled=true;",
 'enrollment proof');
replaceOne(
 "    const result=await S.create(trip());",
 "    // La sesión pudo vencer durante la confirmación: revalidar antes de POST.\n"+
 "    if(hasSession()){\n"+
 "     const token=current()?.sessionToken;\n"+
 "     if(!await revalidateIdentity()||current()?.sessionToken!==token){\n"+
 "      validatedToken=null;\n"+
 "      remembered();changeStep(2);loadCaptcha();\n"+
 "      throw Error('Tu sesión no pudo verificarse. Volvé a ingresar antes de solicitar el traslado.');\n"+
 "     }\n"+
 "    }\n"+
 "    const result=await S.create(trip());",
 'secure final booking');
assert.equal(app.split("openConfirmation(false); // Paso 2 omitido").length,2,'Debe saltar el paso 2');
assert.equal(app.split('function previewRoute(').length,2,'Distancia geográfica modificada');
assert.equal(app.split('const result=await S.create(trip());').length,2,'Contrato reservas duplicado');
let html=await readFile(dir+'index.html','utf8');
for(const a of ['content="29.1.3"','app.js?v=29.1','reference.js?v=29','store.js?v=19.1','geo-v2/core.mjs?v=3']){
 assert.equal(html.split(a).length,2,'HTML cambió '+a);
}
html=html.replace('content="29.1.3"','content="29.1.4"')
 .replace('app.js?v=29.1','app.js?v=29.2');
await writeFile(dir+'app.js',app);
await writeFile(dir+'index.html',html);
console.log('VIA_IDENTITY_V2914_PATCHED '+JSON.stringify({
 changed:['index.html','app.js'],oldAppSha:expected.app,newAppSha:digest(app),newHtmlSha:digest(html),
 web:'29.1.4',appResource:'29.2',storeUnchanged:expected.store,
 gpsUnchanged:expected.reference,geoUnchanged:expected.geo
}));
