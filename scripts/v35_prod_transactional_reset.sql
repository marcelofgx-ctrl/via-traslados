-- Vía Traslados V35: reiniciar SOLO datos transaccionales y de pasajeros de producción.
-- Pre-requisitos OBLIGATORIOS: backup exportado y verificado, bookmark y auditoría read-only.
-- NO ejecutar contra D1 de QA, D1 de otro proyecto, ni si cambian conteos.
-- Quedan intactos: 1 administrador aprobado, credenciales de staff, configuraciones
-- de tarifas, web, rutas geográficas y caché Geoapify, histórico de auditoría.
-- No se permite reset si hay comisiones devengadas/pendientes.
DELETE FROM booking_commission_ledger;
DELETE FROM booking_quotes;
DELETE FROM booking_dispatch_releases;
DELETE FROM booking_events;
DELETE FROM booking_routes;
DELETE FROM driver_assignments;
DELETE FROM bookings;

DELETE FROM customer_passkey_challenges;
DELETE FROM customer_sessions;
DELETE FROM customer_passkeys;
DELETE FROM customer_pins;
DELETE FROM email_verified_sessions;
DELETE FROM email_otp_codes;
DELETE FROM customers;
-- Restablecer contadores de intentos para las pruebas iniciales.
DELETE FROM otp_rate_limits;
-- Eliminar sólo solicitudes de conductor AÚN no aprobadas para probar alta de cero.
-- Administradores aprobados, contraseñas y sesiones de staff NO se tocan.
DELETE FROM staff_users WHERE role='driver' AND status='pending';

INSERT INTO admin_audit(actor_id,action,target,detail)
VALUES('system','production-test-reset-20261117','via-traslados-db',
       'Respaldo D1 verificable GitHub run 44220512329. Limpieza de reservas, pasajeros y cuenta conductor pendiente. Admin/config conservados.');
