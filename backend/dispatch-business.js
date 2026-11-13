// Vía Traslados: reglas comerciales internas y guía no vinculante de precios.
// Mantener independiente de otras aplicaciones, siempre importes en pesos uruguayos.
export const DEFAULT_GUIDE=Object.freeze({
 baseUyu:300,perKmUyu:25,perMinuteUyu:4,minTargetUyu:850,
 minFloorUyu:650,lowFactorBps:7500,highFactorBps:15500,
});
export const CONTRACTOR_COMMISSION_BPS=2500;
const round10=value=>Math.round(value/10)*10;
export const commercialMode=mode=>mode==='partner'?'partner':'contractor';
export function commissionBps(role,mode,bps){
 if(role==='admin'||commercialMode(mode)==='partner')return 0;
 if(Number.isInteger(bps)&&bps>=0&&bps<=5000)return bps;
 return CONTRACTOR_COMMISSION_BPS;
}
export function mayQuoteAll(actor,profile){
 return actor?.role==='admin'&&actor.id!=='master'
   || actor?.role==='driver'&&Number(profile?.can_quote_all)===1;
}
export function mayRelease(actor,profile){
 return actor?.role==='admin'
   || actor?.role==='driver'&&Number(profile?.can_release)===1;
}
export function hasQuoteAccess(actor,profile,released){
 return mayQuoteAll(actor,profile)||actor?.role==='driver'&&Boolean(released);
}
export function priceGuide(distanceKm,minutes,overrides={}){
 const config={...DEFAULT_GUIDE,...overrides};
 if(!Number.isFinite(distanceKm)||distanceKm<=0||!Number.isFinite(minutes)||minutes<=0)return null;
 const suggested=round10(Math.max(config.minTargetUyu,
   config.baseUyu+distanceKm*config.perKmUyu+minutes*config.perMinuteUyu));
 return {
  currency:'UYU',basis:'orientative',
  minimum:round10(Math.max(config.minFloorUyu,suggested*config.lowFactorBps/10000)),
  suggested,
  maximum:round10(Math.max(suggested,config.minFloorUyu,suggested*config.highFactorBps/10000)),
  source:'Modelo interno Vía Traslados, no precio de mercado ni cotización vinculante',
  extrasExcluded:['peajes','espera','estacionamiento','retorno en vacío'],
 };
}
export function quoteBreakdown(priceUyu,bps){
 if(!Number.isInteger(priceUyu)||priceUyu<1||priceUyu>10000000
   ||!Number.isInteger(bps)||bps<0||bps>5000)throw Error('Cotización inválida');
 const fee=Math.round(priceUyu*bps/10000);
 return {grossUyu:priceUyu,commissionBps:bps,commissionUyu:fee,driverNetUyu:priceUyu-fee};
}
