import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSIGNABLE_STATUSES,bookingSeconds,occupiedInterval,bookingsOverlap,scheduleConflicts,assignmentError} from '../backend/assignment-rules.js';

const base={id:'VIA-A',trip_date:'2026-11-20',trip_time:'10:00',status:'accepted',duration_s:480};

test('Estados admitidos incluyen oferta aceptada y confirmada, pero no viajes en marcha',()=>{
  assert.deepEqual(ASSIGNABLE_STATUSES,['requested','quoted','accepted','confirmed']);
  assert.equal(assignmentError(base,'accepted'),null);
  assert.equal(assignmentError(base,'confirmed'),null);
  for(const status of ['cancelled','completed','en_route','arrived','in_progress'])
    assert.match(assignmentError(base,status),/marcha|finalizado|cancelado/);
});
test('Usa zona horaria sintética consistente para comparar fecha y hora local',()=>{
  assert.equal(bookingSeconds('2026-11-20','10:00'),1795168800);
  assert.equal(bookingSeconds('2026-02-30','10:00'),null);
  assert.equal(bookingSeconds('2026-11-20','xx:00'),null);
});
test('No inventa disponibilidad y aplica duración mínima más margen de 30 min',()=>{
  const window=occupiedInterval(base);
  assert.equal(window.end-window.start,5400);
  assert.equal(bookingsOverlap(base,{...base,id:'VIA-B',trip_time:'11:20'}),true);
  assert.equal(bookingsOverlap(base,{...base,id:'VIA-C',trip_time:'11:30'}),false);
  assert.equal(bookingsOverlap(base,{...base,id:'VIA-D',status:'cancelled'}),false);
  assert.equal(bookingsOverlap(base,{...base,id:'VIA-E',trip_date:'2026-11-21'}),false);
});
test('Cruces de agenda se calculan por conductor y se excluye la propia reserva',()=>{
  const assigned=[
    {driver_id:'D1',...base,id:'VIA-A'},
    {driver_id:'D1',...base,id:'VIA-OTRA',trip_time:'10:45'},
    {driver_id:'D2',...base,id:'VIA-EXTERNA',trip_time:'10:30'}
  ];
  const conflicts=scheduleConflicts(base,assigned,'D1');
  assert.equal(conflicts.length,1);
  assert.equal(conflicts[0].bookingId,'VIA-OTRA');
  assert.equal(scheduleConflicts(base,assigned,'D2').length,1);
  assert.equal(scheduleConflicts(base,assigned,'D3').length,0);
});
