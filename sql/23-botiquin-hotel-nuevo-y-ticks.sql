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
--    Fix aquí: bloque 3, siembra los hoteles ya creados vacíos.
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
--    Fix aquí: bloque 2, cualquier empleado activo de la empresa
--    puede marcar revisión y ajustar stock del material de
--    cualquier puesto de SU empresa. Crear/borrar artículos del
--    inventario sigue siendo sólo de dueño/coordinador.
--
-- NOTA: el esquema de producción se ha desviado de sql/01 (por
-- ejemplo `empleados.activo` no existe en prod aunque sí en el
-- fichero). Por eso todo lo que depende de columnas opcionales
-- se construye con SQL dinámico, comprobando antes si la columna
-- está. Así el script funciona en cualquier variante del esquema.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Helper: ¿el usuario actual es un empleado en activo?
-- ------------------------------------------------------------
-- SECURITY DEFINER a propósito: si la policy consultara `empleados`
-- directamente se le aplicaría el RLS de esa tabla dentro del propio
-- chequeo, que es justo el tipo de bloqueo silencioso que arreglamos.
-- El cuerpo se arma según existan `activo` y/o `estado`; si no hay
-- ninguna de las dos, basta con tener ficha de empleado.
do $$
declare
  v_cond text := 'true';
  v_sql  text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'empleados'
                and column_name = 'activo') then
    v_cond := v_cond || ' and coalesce(e.activo, true) = true';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'empleados'
                and column_name = 'estado') then
    v_cond := v_cond || ' and coalesce(e.estado, ''activo'') <> ''baja''';
  end if;

  v_sql := 'create or replace function auth_empleado_activo() returns boolean '
        || 'language sql stable security definer as '
        || quote_literal(
             'select coalesce((select ' || v_cond ||
             ' from empleados e where e.usuario_id = auth.uid() limit 1), false)'
           );
  execute v_sql;
  raise notice 'auth_empleado_activo() creada con la condición: %', v_cond;
end $$;

-- ------------------------------------------------------------
-- 2) RLS de inventario_puesto — separar UPDATE de INSERT/DELETE
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

-- UPDATE: marcar revisado_hoy / ultima_revision / stock en
-- cualquier puesto de la propia empresa. Cubre al segundo
-- socorrista, al correturnos y al que revisa antes de fichar.
drop policy if exists invp_update on inventario_puesto;
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
-- 3) Sembrar los hoteles que se crearon vacíos
-- ------------------------------------------------------------
-- Para cada puesto y cada sección que tenga marcada
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
  v_total int := 0;
  v_f_puestos text := '';
  v_f_items   text := '';
  v_f_ud      text := '';
  v_minimo    text := '1';
  v_sql       text;
begin
  select to_regclass('public.unidades_material') is not null into v_tiene_unidades;

  -- Filtros opcionales según el esquema realmente desplegado
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='puestos' and column_name='activo') then
    v_f_puestos := ' and coalesce(p.activo, true) = true';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='inventario_items' and column_name='activo') then
    v_f_items := ' and coalesce(ii.activo, true) = true';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='inventario_items' and column_name='minimo_recomendado') then
    v_minimo := 'coalesce(ii.minimo_recomendado, 1)';
  end if;

  if v_tiene_unidades and exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='unidades_material' and column_name='activo') then
    v_f_ud := ' and coalesce(um.activo, true) = true';
  end if;

  v_sql := '
    select p.id as puesto_id, p.nombre, s.seccion
      from puestos p
      cross join (values (''botiquin''), (''desa''), (''oxigeno'')) as s(seccion)
     where case s.seccion
             when ''botiquin'' then coalesce(p.tiene_botiquin, false)
             when ''desa''     then coalesce(p.tiene_desa, false)
             else                   coalesce(p.tiene_oxigeno, false)
           end' || v_f_puestos || '
       and not exists (
         select 1 from inventario_puesto ip
           join inventario_items ii on ii.id = ip.item_id
          where ip.puesto_id = p.id and ii.seccion = s.seccion
       )
     order by p.nombre, s.seccion';

  for r in execute v_sql loop
    v_unidad := null;

    if v_tiene_unidades then
      execute 'select um.id from unidades_material um
                where um.puesto_id = $1 and um.seccion = $2' || v_f_ud || '
                order by um.numero limit 1'
        into v_unidad using r.puesto_id, r.seccion;

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
      execute 'insert into inventario_puesto (puesto_id, item_id, stock, minimo, revisado_hoy, unidad_id)
               select $1, ii.id, 0, ' || v_minimo || ', false, $2
                 from inventario_items ii
                where ii.seccion = $3' || v_f_items || '
               on conflict do nothing'
        using r.puesto_id, v_unidad, r.seccion;
    else
      execute 'insert into inventario_puesto (puesto_id, item_id, stock, minimo, revisado_hoy)
               select $1, ii.id, 0, ' || v_minimo || ', false
                 from inventario_items ii
                where ii.seccion = $2' || v_f_items || '
               on conflict do nothing'
        using r.puesto_id, r.seccion;
    end if;

    get diagnostics v_insertados = row_count;
    v_total := v_total + v_insertados;
    raise notice 'Sembrado % · % → % artículos', r.nombre, r.seccion, v_insertados;
  end loop;

  raise notice 'TOTAL sembrado: % artículos', v_total;
end $$;

-- ============================================================
-- Verificación
-- ============================================================
-- a) Hoteles que SIGUEN sin material en alguna sección marcada.
--    Debe salir vacío. Si sale algo, es que el catálogo
--    inventario_items no tiene artículos de esa sección.
select p.nombre, s.seccion as seccion_vacia
  from puestos p
  cross join (values ('botiquin'), ('desa'), ('oxigeno')) as s(seccion)
 where case s.seccion
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

-- b) Policies resultantes: deben ser 4 (select, update, insert, delete)
--    y NO debe quedar `invp_write`.
select policyname, cmd from pg_policies
 where tablename = 'inventario_puesto' order by policyname;

-- c) Recuento de artículos por hotel y sección
select p.nombre, ii.seccion, count(*) as items
  from inventario_puesto ip
  join puestos p on p.id = ip.puesto_id
  join inventario_items ii on ii.id = ip.item_id
 group by p.nombre, ii.seccion
 order by p.nombre, ii.seccion;
