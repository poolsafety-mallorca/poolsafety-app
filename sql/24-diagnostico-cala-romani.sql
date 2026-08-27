-- ============================================================
-- PoolSafety · Diagnóstico Cala Romani — "no deja registrar ni
-- revisar botiquines"
-- Ejecutar en Supabase SQL Editor con Role postgres.
-- SOLO LECTURA: no modifica nada. Se puede lanzar en producción
-- sin riesgo y las veces que haga falta.
-- ============================================================
-- IMPORTANTE: es UNA sola consulta a propósito. El SQL Editor de
-- Supabase sólo enseña el resultado de la ÚLTIMA sentencia, así que
-- un diagnóstico partido en varios `select` pierde todos los bloques
-- menos el último. Aquí sale todo junto en una tabla con la columna
-- `bloque`.
--
-- Reportado el 2026-08-27: los socorristas de Cala Romani no pueden
-- registrar ni revisar botiquines. Dos causas posibles:
--
--   A) FALTA MATERIAL — Cala Romani tiene tres botiquines (sql/14) y
--      las unidades 2 y 3 pueden estar sin artículos, el mismo fallo
--      que se reportó en Cala Gran. Lo repara sql/22.
--
--   B) RLS BLOQUEA LA ESCRITURA — si sql/23 no se ejecutó, la única
--      policy es invp_write de sql/21, que sólo deja escribir en el
--      puesto asignado en la ficha o donde el empleado haya fichado
--      desde ayer. Lo arregla sql/23.
--
-- El bloque "0 · VEREDICTO" lo resuelve solo. Los demás bloques son
-- el detalle en el que se apoya.
-- ============================================================

with
-- ¿Está aplicado sql/23? Con sql/21 sólo hay invp_select + invp_write.
pol as (
  select policyname, cmd, permissive
    from pg_policies
   where schemaname = 'public' and tablename = 'inventario_puesto'
),
sql23_aplicado as (
  select count(*) filter (where policyname = 'invp_update') > 0
     and count(*) filter (where policyname = 'invp_write')  = 0 as ok
    from pol
),
romani as (
  select id, nombre from puestos where nombre ilike '%romani%' limit 1
),
-- Unidades del hotel y cuántos artículos cuelgan de cada una
uds as (
  select um.id, um.seccion, um.numero, um.nombre, um.activo,
         (select count(*) from inventario_puesto ip where ip.unidad_id = um.id) as articulos
    from unidades_material um
    join romani r on r.id = um.puesto_id
),
unidades_vacias as (
  select count(*) as n from uds where activo and articulos = 0
),
-- Quién podría escribir bajo la regla de sql/21
socorristas as (
  select e.nombre, e.estado, e.fecha_baja,
         coalesce(e.puesto_id = r.id, false) as puesto_asignado_ok,
         exists (
           select 1 from fichajes f
            where f.empleado_id = e.id and f.puesto_id = r.id
              and f.hora >= (current_date - interval '1 day')
         ) as ficho_desde_ayer,
         (select max(f2.hora) from fichajes f2
           where f2.empleado_id = e.id and f2.puesto_id = r.id) as ultimo_fichaje
    from empleados e
    cross join romani r
   where e.puesto_id = r.id
      or exists (select 1 from fichajes f
                  where f.empleado_id = e.id and f.puesto_id = r.id
                    and f.hora > now() - interval '30 days')
),
bloqueados as (
  select count(*) as n from socorristas
   where not puesto_asignado_ok and not ficho_desde_ayer
)
select * from (
  -- 0 · VEREDICTO ------------------------------------------------
  select 0 as orden, '0 · VEREDICTO' as bloque,
         'sql/23 aplicado' as concepto,
         case when (select ok from sql23_aplicado) then 'SI' else 'NO' end as valor,
         case when (select ok from sql23_aplicado)
              then 'Las cuatro policies invp_* estan puestas'
              else 'CAUSA B: sigue la invp_write de sql/21 -> ejecuta sql/23' end as detalle
  union all
  select 0, '0 · VEREDICTO', 'socorristas que RLS bloquearia',
         case when (select ok from sql23_aplicado) then '0'
              else (select n::text from bloqueados) end,
         case when (select ok from sql23_aplicado)
              then 'sql/23 ya esta puesto: la regla de sql/21 no aplica, todos pueden escribir'
              when (select n from bloqueados) = 0
              then 'Ninguno: aun con la regla de sql/21 todos pueden escribir -> la causa NO es B'
              else 'CAUSA B: esos no pueden marcar y la v120 no se lo dice' end
  union all
  select 0, '0 · VEREDICTO', 'unidades sin articulos',
         (select n::text from unidades_vacias),
         case when (select n from unidades_vacias) = 0
              then 'Ninguna: todas las unidades tienen material'
              else 'CAUSA A probable: mira el bloque 3. Si la seccion no tiene'
                   || ' articulos en el catalogo inventario_items es normal;'
                   || ' si los tiene, ejecuta sql/22' end
  union all
  select 0, '0 · VEREDICTO', 'hotel encontrado',
         coalesce((select nombre from romani), '(NINGUNO)'),
         case when (select count(*) from romani) = 0
              then 'Sin puesto que case con %romani% - revisa el nombre'
              else 'ok' end

  -- 1 · POLICIES -------------------------------------------------
  union all
  select 1, '1 · POLICIES inventario_puesto', policyname, cmd, permissive
    from pol

  -- 2 · HELPER ---------------------------------------------------
  union all
  select 2, '2 · HELPER', 'auth_empleado_activo',
         case when to_regprocedure('public.auth_empleado_activo()') is null
              then 'NO EXISTE' else 'existe' end,
         coalesce((
           select substring(pg_get_functiondef(p.oid) from 'select coalesce\(\(select (.*) from empleados')
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'auth_empleado_activo'
         ), 'sql/23 no se ha ejecutado nunca')

  -- 3 · UNIDADES -------------------------------------------------
  union all
  select 3, '3 · UNIDADES de Cala Romani',
         seccion || ' #' || numero || ' · ' || nombre,
         articulos::text || ' articulos',
         case when not activo then 'INACTIVA'
              when articulos = 0 then 'VACIA -> ejecuta sql/22'
              else 'ok' end
    from uds

  -- 4 · ARTICULOS POR SECCION ------------------------------------
  union all
  select 4, '4 · ARTICULOS por seccion',
         ii.seccion || ' · ' || coalesce(um.nombre, '(sin unidad)'),
         count(*)::text || ' articulos',
         count(*) filter (where ip.revisado_hoy)::text || ' revisados hoy'
    from inventario_puesto ip
    join romani r             on r.id  = ip.puesto_id
    join inventario_items ii  on ii.id = ip.item_id
    left join unidades_material um on um.id = ip.unidad_id
   group by ii.seccion, coalesce(um.nombre, '(sin unidad)')

  -- 5 · SOCORRISTAS ----------------------------------------------
  union all
  select 5, '5 · SOCORRISTAS', nombre,
         case when puesto_asignado_ok or ficho_desde_ayer
              then 'PUEDE escribir' else 'BLOQUEADO por sql/21' end,
         'estado=' || estado
           || case when fecha_baja is not null then ' fecha_baja=' || fecha_baja else '' end
           || ' · puesto_en_ficha=' || puesto_asignado_ok
           || ' · ficho_desde_ayer=' || ficho_desde_ayer
           || ' · ultimo_fichaje=' || coalesce(ultimo_fichaje::text, 'nunca')
    from socorristas
) d
order by orden, concepto;
