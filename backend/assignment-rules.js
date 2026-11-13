// Vía Traslados — evaluación de agenda, sin inferir GPS ni presencia en línea.
// Todos los horarios son locales de Uruguay; la UTC sintética solo sirve para compararlos.
export const ASSIGNABLE_STATUSES = Object.freeze(['requested','quoted','accepted','confirmed']);
export const CLOSED_STATUSES = Object.freeze(['cancelled','completed']);
export const MINIMUM_SERVICE_SECONDS = 3600;
export const TURNAROUND_SECONDS = 1800;

export function bookingSeconds(date,time){
  if(typeof date!=='string'||typeof time!=='string'||
     !/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
  const ms=Date.parse(date+'T'+time+':00Z');
  return Number.isFinite(ms)?Math.floor(ms/1000):null;
}
export function occupiedInterval(booking){
  const start=bookingSeconds(booking.trip_date??booking.date,booking.trip_time??booking.time);
  if(start===null)return null;
  const seconds=Math.max(MINIMUM_SERVICE_SECONDS,Number(booking.duration_s)||0);
  return {start,end:start+seconds+TURNAROUND_SECONDS};
}
export function bookingsOverlap(first,second){
  if(first?.id&&second?.id&&first.id===second.id)return false;
  if(CLOSED_STATUSES.includes(first?.status)||CLOSED_STATUSES.includes(second?.status))return false;
  const a=occupiedInterval(first),b=occupiedInterval(second);
  if(!a||!b)return false;
  return a.start<b.end&&b.start<a.end;
}
export function scheduleConflicts(booking,rows,driverId){
  return rows.filter(row=>row.driver_id===driverId&&bookingsOverlap(booking,row))
    .map(row=>({bookingId:row.id,date:row.trip_date,time:row.trip_time}));
}
export function assignmentError(booking,status){
  if(!booking)return 'Solicitud no encontrada';
  if(!ASSIGNABLE_STATUSES.includes(status))return 'El viaje ya está en marcha, finalizado o cancelado';
  if(bookingSeconds(booking.trip_date,booking.trip_time)===null)return 'Horario del viaje inválido';
  return null;
}
