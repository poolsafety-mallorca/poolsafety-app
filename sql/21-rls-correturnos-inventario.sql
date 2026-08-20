-- ============================================================
-- PoolSafety · Correturnos pueden leer/actualizar inventario del
-- hotel donde ficharon (bug silencioso descubierto 2026-08-20)
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Bug detectado: María Herrera (correturnos) fichó en Inturotel
-- Cala Azul. La cabecera de la app lo detecta bien, PERO al ir a
-- Botiquín salía "0/0 revisados · sin material configurado" aunque
-- ese hotel tiene 37 items en inventario_puesto.
--
-- Causa: la policy `invp_select` solo dejaba al socorrista leer
-- inventario donde puesto_id = SU puesto asignado en la ficha
-- (empleados.puesto_id). Los correturnos no tienen puesto fijo o
-- lo tienen en otro hotel → RLS bloquea → 0 filas devueltas sin
-- error → la app cree que el hotel no tiene inventario.
--
-- Fix: cualquier miembro activo de la empresa puede LEER el
-- inventario de cualquier puesto de su empresa. Y puede
-- ACTUALIZAR (marcar revisiones, cambiar stock desde botiquín)
-- el inventario del puesto donde tenga ficha o donde haya
-- fichado hoy.
-- ============================================================

-- 1) SELECT amplio: cualquier empleado activo de la empresa puede
--    leer inventario de cualquier puesto de su empresa. Solo lectura
--    — no permite crear ni borrar items del catálogo.
drop policy if exists invp_select on inventario_puesto;
create policy invp_select on inventario_puesto for select using (
  auth_es_admin()
  or exists (
    select 1 from puestos p
    where p.id = inventario_puesto.puesto_id
      and p.empresa_id = auth_empresa()
  )
);

-- 2) WRITE (update): admin siempre; socorrista puede actualizar
--    stock+revisión del puesto donde ficho HOY, o donde tenga
--    puesto asignado en su ficha.
drop policy if exists invp_write on inventario_puesto;
create policy invp_write on inventario_puesto for all
  using (
    auth_es_admin()
    or inventario_puesto.puesto_id in (
      select puesto_id from empleados where usuario_id = auth.uid()
    )
    or inventario_puesto.puesto_id in (
      select distinct puesto_id from fichajes
      where empleado_id = auth_empleado_id()
        and hora >= (current_date - interval '1 day')
        and puesto_id is not null
    )
  )
  with check (
    auth_es_admin()
    or inventario_puesto.puesto_id in (
      select puesto_id from empleados where usuario_id = auth.uid()
    )
    or inventario_puesto.puesto_id in (
      select distinct puesto_id from fichajes
      where empleado_id = auth_empleado_id()
        and hora >= (current_date - interval '1 day')
        and puesto_id is not null
    )
  );

-- ============================================================
-- Verificación: ejecutando como socorrista, cala azul debería
-- devolver 37 items ahora.
-- ============================================================
select p.nombre, count(*) as items
  from inventario_puesto ip
  join puestos p on p.id = ip.puesto_id
  where p.nombre ilike '%cala azul%'
  group by p.nombre;
