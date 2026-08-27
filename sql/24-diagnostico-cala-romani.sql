-- ============================================================
-- PoolSafety · Diagnóstico Cala Romani — "no deja registrar ni
-- revisar botiquines"
-- Ejecutar en Supabase SQL Editor con Role postgres.
-- SOLO LECTURA: no modifica nada. Se puede ejecutar en producción
-- sin riesgo y las veces que haga falta.
-- ============================================================
-- Reportado el 2026-08-27: los socorristas de Cala Romani no pueden
-- registrar ni revisar el botiquín. Hay dos causas posibles y este
-- script distingue cuál es:
--
--   A) FALTA MATERIAL — las unidades Botiquín 2 y 3 (Cala Romani tiene
--      tres, ver sql/14) no tienen artículos. Es el mismo fallo que se
--      reportó en Cala Gran y que repara sql/22.
--
--   B) RLS BLOQUEA LA ESCRITURA — si sql/23 no llegó a ejecutarse, la
--      única policy es `invp_write` de sql/21, que sólo deja escribir
--      en el puesto asignado en la ficha o donde el empleado haya
--      fichado en las últimas 24 h. En Cala Romani entran VARIOS
--      socorristas, así que al segundo y al tercero les bloquea. Y con
--      la v120 desplegada el UPDATE no da error: devuelve 0 filas, el
--      tick se pinta y al recargar vuelve atrás.
--
-- Mira el bloque 1: si NO salen las cuatro policies invp_select /
-- invp_update / invp_insert / invp_delete, es el caso B → ejecuta
-- sql/23. Si salen, mira el bloque 3: unidades con 0 artículos → caso
-- A → ejecuta sql/22.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ¿Está aplicado sql/23? Policies vivas en inventario_puesto
-- ------------------------------------------------------------
-- Esperado tras sql/23: exactamente 4 filas (select/update/insert/
-- delete). Si aparece `invp_write`, sql/23 NO se ejecutó → caso B.
select policyname, cmd, permissive
  from pg_policies
 where schemaname = 'public' and tablename = 'inventario_puesto'
 order by policyname;

-- ------------------------------------------------------------
-- 2) ¿Existe el helper y con qué criterio?
-- ------------------------------------------------------------
-- Sin fila → sql/23 no se ejecutó nunca (caso B).
select p.proname,
       p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as definicion
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'auth_empleado_activo';

-- ------------------------------------------------------------
-- 3) Cala Romani: unidades de material y cuántos artículos tiene cada una
-- ------------------------------------------------------------
-- Esperado: Botiquín 1, 2 y 3 · DESA 1 · Oxígeno 1, todas con el mismo
-- número de artículos. Una unidad con 0 artículos → caso A (sql/22).
select p.nombre    as hotel,
       um.seccion,
       um.numero,
       um.nombre   as unidad,
       um.activo,
       (select count(*) from inventario_puesto ip where ip.unidad_id = um.id) as articulos
  from unidades_material um
  join puestos p on p.id = um.puesto_id
 where p.nombre ilike '%romani%'
 order by um.seccion, um.numero;

-- ------------------------------------------------------------
-- 4) Cala Romani: artículos por sección, incluidos los huérfanos
-- ------------------------------------------------------------
-- `unidad_id is null` = artículos sin unidad asignada. La app los pinta
-- dentro de la unidad #1, así que no rompen, pero conviene verlos.
select ii.seccion,
       coalesce(um.nombre, '(sin unidad)') as unidad,
       count(*) as articulos,
       count(*) filter (where ip.revisado_hoy) as revisados_hoy
  from inventario_puesto ip
  join puestos p            on p.id  = ip.puesto_id
  join inventario_items ii  on ii.id = ip.item_id
  left join unidades_material um on um.id = ip.unidad_id
 where p.nombre ilike '%romani%'
 group by ii.seccion, coalesce(um.nombre, '(sin unidad)')
 order by ii.seccion, unidad;

-- ------------------------------------------------------------
-- 5) Los socorristas de Cala Romani: ¿pasarían el chequeo de escritura?
-- ------------------------------------------------------------
-- `puesto_asignado_ok` = tiene Cala Romani en su ficha (empleados.puesto_id).
-- `ficho_desde_ayer`   = tiene un fichaje ahí desde ayer (misma ventana que
--                        usa la policy de sql/21: hora >= current_date - 1 día).
-- Con sql/21 SOLO puede escribir quien tenga true en alguna de las dos.
-- Con sql/23 aplicado basta con estar de alta en la empresa, así que
-- todos deberían poder. Si aquí ves socorristas con las dos en false y
-- se quejan de que no pueden marcar, es exactamente el caso B.
select e.nombre,
       e.estado,
       e.fecha_baja,
       coalesce(e.puesto_id = p.id, false)      as puesto_asignado_ok,
       exists (
         select 1 from fichajes f
          where f.empleado_id = e.id
            and f.puesto_id   = p.id
            and f.hora       >= (current_date - interval '1 day')
       )                                        as ficho_desde_ayer,
       (select max(f2.hora) from fichajes f2
         where f2.empleado_id = e.id and f2.puesto_id = p.id) as ultimo_fichaje
  from empleados e
  cross join (select id from puestos where nombre ilike '%romani%' limit 1) p
 where e.puesto_id = p.id
    or exists (select 1 from fichajes f
                where f.empleado_id = e.id and f.puesto_id = p.id
                  and f.hora > now() - interval '30 days')
 order by e.nombre;
