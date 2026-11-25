// Preliminary contract, NOT connected to production handlers or D1.
import {bookingSeconds,occupiedInterval,TURNAROUND_SECONDS,CLOSED_STATUSES} from './assignment-rules.js';
export function normalizeHourly(input){
 if(input?.serviceType!=='hourly')throw Error('Tipo de servicio inválido');
 const minutes=input.requestedDurationMinutes;
 if(!Number.isInteger(minutes)||minutes<60||minutes>1440||minutes%30!==0)throw Error('Duración inválida');
 if(bookingSeconds(input.date,input.time)===null)throw Error('Fecha u hora inválidas');
 const origin=typeof input.origin==='string'?input.origin.trim():'';
 if(!origin||origin.length>500)throw Error('Recogida inválida');
 const notes=String(input.itineraryNotes??'').trim();if(notes.length>1000)throw Error('Recorrido demasiado largo');
 if(!Number.isInteger(input.passengers)||input.passengers<1||input.passengers>4||!Number.isInteger(input.bags)||input.bags<0||input.bags>4)throw Error('Capacidad inválida');
 return {serviceType:'hourly',requestedDurationMinutes:minutes,date:input.date,time:input.time,origin,itineraryNotes:notes,passengers:input.passengers,bags:input.bags};
}
export function normalizeHourlyQuote(input){
 const price=input?.priceUyu,km=input?.includedKm??null,terms=String(input?.terms??'').trim();
 if(!Number.isInteger(price)||price<1||price>10000000||km!==null&&(!Number.isInteger(km)||km<0||km>5000)||terms.length>1500)throw Error('Presupuesto inválido');
 return {priceUyu:price,includedKm:km,terms};
}
export function serviceInterval(b){
 if((b.serviceType??b.service_type)!=='hourly')return occupiedInterval(b);
 const start=bookingSeconds(b.trip_date??b.date,b.trip_time??b.time),minutes=b.requestedDurationMinutes??b.requested_duration_minutes;
 if(start===null||!Number.isInteger(minutes)||minutes<60||minutes>1440||minutes%30!==0)throw Error('Bloque horario inválido');
 return {start,end:start+minutes*60+TURNAROUND_SECONDS};
}
export function serviceOverlaps(a,b){
 if(a?.id&&a.id===b?.id||CLOSED_STATUSES.includes(a?.status)||CLOSED_STATUSES.includes(b?.status))return false;
 const x=serviceInterval(a),y=serviceInterval(b);if(!x||!y)throw Error('Horario inválido');
 return x.start<y.end&&y.start<x.end;
}
