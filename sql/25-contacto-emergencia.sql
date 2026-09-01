-- ==========================================================================
-- PoolSafety · sql/25 · Contacto de emergencia del socorrista
--
-- Un teléfono al que llamar si le pasa algo al socorrista durante el turno.
-- Lo rellena y lo edita el PROPIO socorrista desde su Perfil, y lo ven admin
-- y coordinación en la ficha del empleado.
--
-- No hacen falta políticas nuevas:
--   · `empleados_self_update` ya permite al empleado actualizar su propia fila.
--   · El trigger `empleados_proteger_campos` revierte los campos sensibles
--     (estado, puesto, contrato…) cuando quien edita no es admin. Estas dos
--     columnas NO están en esa lista, así que el socorrista sí puede tocarlas
--     y sigue sin poder tocar lo demás.
--
-- Idempotente: se puede ejecutar las veces que haga falta.
-- Ejecutar con Role postgres en el SQL Editor de Supabase.
-- ==========================================================================

alter table empleados add column if not exists emergencia_nombre text;
alter table empleados add column if not exists emergencia_telefono text;

comment on column empleados.emergencia_nombre is
  'A quién llamar si le pasa algo al trabajador (nombre y parentesco). Lo edita el propio trabajador.';
comment on column empleados.emergencia_telefono is
  'Teléfono del contacto de emergencia. Lo edita el propio trabajador desde su Perfil.';

-- Comprobación rápida tras ejecutar:
--   select nombre, emergencia_nombre, emergencia_telefono from empleados order by nombre;
