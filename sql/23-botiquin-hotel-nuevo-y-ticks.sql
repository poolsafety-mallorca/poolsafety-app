-- ============================================================
-- PoolSafety · Botiquín: hotel nuevo sin material + ticks que
-- no se dejan marcar por un segundo socorrista
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Dos fallos reportados el 2026-08-26 desde la app:
--
-- 1) Se crea un hotel nuevo ("HOTEL DE PRUEBAS") y al socorrista
--    le sale "0/0 revisados · sin material configurado" y
--    "No hay material configurado en esta sección para tu puesto".
--    Causa: crear un puesto NO sembraba ninguna fila en
--    inventario_puesto. El hotel nacía literalmente vacío.
--    Fix app: js/coordinador.js → sembrarMaterialPuesto().
--    Fix aquí: bloque 2, siembra los hoteles ya creados vacíos.
--
-- 2) Los artículos SIN tick verde no se dejan marcar por otro
--    socorrista: el tick se pinta y al recargar vuelve atrás.
--    Causa: la policy `invp_write` de sql/21 sólo deja escribir
--    en el puesto asignado en la ficha (empleados.puesto_id) o
--    donde el empleado haya fichado en las últimas 24 h. El
--    segundo socorrista del hotel, el correturnos, o cualquiera
--    que abra el botiquín ANTES de fichar, no cumple ninguna de
--    las dos → RLS devuelve 0 filas SIN error → el UPDATE
--    aparenta éxito y la app revierte al siguiente render.
--    Fix app: js/socorrista.js → updateInventario() con .select()
--    detecta las 0 filas y avisa en vez de mentir.
--    Fix aquí: bloque 1, cualquier empleado activo de la empresa
--    puede marcar revisión y ajustar stock del material de
--    cualquier puesto de SU empresa. Crear/borrar artículos del
--    inventario sigue siendo sólo de dueño/coordinador.
-- ============================================================

-- ------------------------------------------------------------
-- 1) RLS de inventario_puesto — separar UPDATE de INSERT/DELETE
-- ------------------------------------------------------------
-- sql/21 dejó una única policy `for all`, lo que mezclaba el
-- permiso de "marcar revisión" con el de "gestionar el catálogo".
-- Las separamos: escribir números → cualquier compañero de
-- empresa; crear/borrar filas → sólo admin.
drop policy if exists invp_write on inventario_puesto;

-- SELECT: se mantiene el de sql/21 (toda la empresa lee). Se
-- redeclara aquí para que este fichero funcione por sí solo.
drop policy if exists invp_select on inventario_puesto;
create policy invp_select on inventario_puesto for select using (
  auth_es_admin()
  or exists (
    select 1 from puestos p
    where p.id = inventario_puesto.puesto_id
      and p.empresa_id = auth_empresa()
  )
);

-- Helper: ¿el usuario actual es un empleado en activo?
-- SECURITY DEFINER a propósito — si la policy consultara `empleados`
-- directamente se le aplicaría el RLS de esa tabla dentro del propio
-- chequeo, que es justo el tipo de bloqueo silencioso que arreglamos.
create or replace function auth_empleado_activo()
returns boolean language sql stable security definer as $$
  select coalesce((
    select e.activo = true and coalesce(e.estado, 'activo') <> 'baja'
      from empleados e
     where e.usuario_id = auth.uid()
     limit 1
  ), false)
$$;

-- UPDATE: marcar revisado_hoy / ultima_revision / stock en
-- cualquier puesto de la propia empresa. Cubre al segundo
-- socorrista, al correturnos y al que revisa antes de fichar.
create policy invp_update on inventario_puesto for update
  using (
    auth_es_admin()
    or (
      auth_empleado_activo()
      and exists (
        select 1 from puestos p
        where p.id = inventario_puesto.puesto_id
          and p.empresa_id = auth_empresa()
      )
    )
  )
  with check (
    auth_es_admin()
    or (
      auth_empleado_activo()
      and exists (
        select 1 from puestos p
        where p.id = inventario_puesto.puesto_id
          and p.empresa_id = auth_empresa()
      )
    )
  );

-- INSERT / DELETE: sólo dueño o coordinador de la empresa.
drop policy if exists invp_insert on inventario_puesto;
create policy invp_insert on inventario_puesto for insert
  with check (
    auth_es_admin()
    and exists (
      select 1 from puestos p
      where p.id = inventario_puesto.puesto_id
        and p.empresa_id = auth_empresa()
    )
  );

drop policy if exists invp_delete on inventario_puesto;
create policy invp_delete on inventario_puesto for delete
  using (
    auth_es_admin()
    and exists (
      select 1 from puestos p
      where p.id = inventario_puesto.puesto_id
        and p.empresa_id = auth_empresa()
    )
  );

-- ------------------------------------------------------------
-- 2) Sembrar los hoteles que se crearon vacíos
-- ------------------------------------------------------------
-- Para cada puesto activo y cada sección que tenga marcada
-- (tiene_botiquin / tiene_desa / tiene_oxigeno) sin NINGÚN
-- artículo en esa sección: crea la unidad 1 y le copia el
-- catálogo maestro con stock 0 y el mínimo recomendado.
-- Sólo toca secciones vacías → no pisa inventarios ya cargados.
do $$
declare
  r record;
  v_unidad uuid;
  v_tiene_unidades boolean;
  v_insertados int;
begin
  select to_regclass('public.unidades_material') is not null into v_tiene_unidades;

  for r in
    select p.id as puesto_id, p.nombre, s.seccion
      from puestos p
      cross join lateral (values ('botiquin'), ('desa'), ('oxigeno')) as s(seccion)
     where p.activo = true
       and case s.seccion
             when 'botiquin' then coalesce(p.tiene_botiquin, false)
             when 'desa'     then coalesce(p.tiene_desa, false)
             else                 coalesce(p.tiene_oxigeno, false)
           end
       and not exists (
         select 1 from inventario_puesto ip
           join inventario_items ii on ii.id = ip.item_id
          where ip.puesto_id = p.id and ii.seccion = s.seccion
       )
  loop
    v_unidad := null;

    if v_tiene_unidades then
      select id into v_unidad from unidades_material
       where puesto_id = r.puesto_id and seccion = r.seccion and activo = true
       order by numero limit 1;

      if v_unidad is null then
        insert into unidades_material (puesto_id, seccion, nombre, numero)
        values (
          r.puesto_id,
          r.seccion,
          case r.seccion when 'botiquin' then 'Botiquín 1'
                         when 'desa'     then 'DESA 1'
                         else                 'Oxígeno 1' end,
          1
        )
        returning id into v_unidad;
      end if;
    end if;

    if v_tiene_unidades then
      insert into inventario_puesto (puesto_id, item_id, stock, minimo, revisado_hoy, unidad_id)
      select r.puesto_id, ii.id, 0, coalesce(ii.minimo_recomendado, 1), false, v_unidad
        from inventario_items ii
       where ii.seccion = r.seccion and coalesce(ii.activo, true) = true
      on conflict do nothing;
    else
      insert into inventario_puesto (puesto_id, item_id, stock, minimo, revisado_hoy)
      select r.puesto_id, ii.id, 0, coalesce(ii.minimo_recomendado, 1), false
        from inventario_items ii
       where ii.seccion = r.seccion and coalesce(ii.activo, true) = true
      on conflict do nothing;
    end if;

    get diagnostics v_insertados = row_count;
    raise notice 'Sembrado % · % → % artículos', r.nombre, r.seccion, v_insertados;
  end loop;
end $$;

-- ============================================================
-- Verificación
-- ============================================================
-- a) Hoteles activos que siguen sin material en alguna sección marcada
select p.nombre, s.seccion as seccion_vacia
  from puestos p
  cross join lateral (values ('botiquin'), ('desa'), ('oxigeno')) as s(seccion)
 where p.activo = true
   and case s.seccion
         when 'botiquin' then coalesce(p.tiene_botiquin, false)
         when 'desa'     then coalesce(p.tiene_desa, false)
         else                 coalesce(p.tiene_oxigeno, false)
       end
   and not exists (
     select 1 from inventario_puesto ip
       join inventario_items ii on ii.id = ip.item_id
      where ip.puesto_id = p.id and ii.seccion = s.seccion
   )
 order by p.nombre;

-- b) Policies resultantes de inventario_puesto
select policyname, cmd from pg_policies
 where tablename = 'inventario_puesto' order by policyname;

-- c) Recuento de artículos por hotel
select p.nombre, ii.seccion, count(*) as items
  from inventario_puesto ip
  join puestos p on p.id = ip.puesto_id
  join inventario_items ii on ii.id = ip.item_id
 where p.activo = true
 group by p.nombre, ii.seccion
 order by p.nombre, ii.seccion;
