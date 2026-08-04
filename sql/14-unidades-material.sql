-- ============================================================
-- PoolSafety · Múltiples botiquines/oxígenos por hotel
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Hasta hoy cada hotel tenía UN inventario por sección (botiquin/desa
-- /oxigeno). En hoteles con más de una piscina hace falta que cada
-- botiquín / oxígeno se revise independientemente y aparezca como
-- "Botiquín 1", "Botiquín 2", "Oxígeno pool infantil", etc.
--
-- Esta migración añade el concepto de UNIDAD DE MATERIAL:
--   · Tabla unidades_material (puesto + seccion + nombre + numero)
--   · inventario_puesto.unidad_id apunta a la unidad concreta.
--   · Backfill: se crea "Botiquín 1" / "DESA 1" / "Oxígeno 1" para
--     cada hotel/seccion existente y se asignan todos los items
--     actuales a esa unidad.
--   · Para los hoteles con más de una piscina, se crean las
--     unidades adicionales (Botiquín 2, Oxígeno 2, etc.) DUPLICANDO
--     los items+minimos de la Unidad 1 con stock inicial = mínimo.
--
-- La app v100 sigue funcionando sin cambios; en v101 se enseña un
-- selector desplegable cuando el puesto tiene >1 unidad por sección.
-- ============================================================

-- 1) Tabla unidades_material
create table if not exists unidades_material (
  id uuid primary key default gen_random_uuid(),
  puesto_id uuid not null references puestos(id) on delete cascade,
  seccion text not null check (seccion in ('botiquin','desa','oxigeno')),
  nombre text not null,           -- "Botiquín 1", "Botiquín pool infantil"…
  numero int default 1,           -- para ordenar 1, 2, 3…
  activo boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists unidades_material_puesto_idx on unidades_material(puesto_id, seccion) where activo;

alter table unidades_material enable row level security;
drop policy if exists unidades_material_select on unidades_material;
create policy unidades_material_select on unidades_material
  for select using (
    exists (select 1 from puestos p where p.id = unidades_material.puesto_id and p.empresa_id = auth_empresa())
  );
drop policy if exists unidades_material_write on unidades_material;
create policy unidades_material_write on unidades_material
  for all using (
    auth_es_admin() and exists (select 1 from puestos p where p.id = unidades_material.puesto_id and p.empresa_id = auth_empresa())
  ) with check (
    auth_es_admin() and exists (select 1 from puestos p where p.id = unidades_material.puesto_id and p.empresa_id = auth_empresa())
  );

-- Realtime para que la app vea cambios al momento
alter publication supabase_realtime add table unidades_material;

-- 2) Añadir unidad_id a inventario_puesto (nullable al inicio)
alter table inventario_puesto add column if not exists unidad_id uuid references unidades_material(id) on delete set null;
create index if not exists inventario_puesto_unidad_idx on inventario_puesto(unidad_id) where unidad_id is not null;

-- 2.5) Cambiar la constraint UNIQUE de (puesto_id, item_id) a
-- (puesto_id, item_id, unidad_id) para permitir el MISMO item en
-- distintas unidades del mismo hotel (Botiquín 1, Botiquín 2…).
alter table inventario_puesto
  drop constraint if exists inventario_puesto_puesto_id_item_id_key;
alter table inventario_puesto
  add constraint inventario_puesto_puesto_item_unidad_key
  unique (puesto_id, item_id, unidad_id);

-- 3) Backfill: crear "Botiquín 1" / "DESA 1" / "Oxígeno 1" por cada
--    combinación (puesto, seccion) que YA tenga inventario.
--    Solo lo hacemos si no existe todavía una unidad #1.
insert into unidades_material (puesto_id, seccion, nombre, numero)
select distinct
  ip.puesto_id,
  i.seccion,
  case i.seccion when 'botiquin' then 'Botiquín 1'
                 when 'desa'     then 'DESA 1'
                 when 'oxigeno'  then 'Oxígeno 1' end,
  1
from inventario_puesto ip
join inventario_items i on i.id = ip.item_id
where not exists (
  select 1 from unidades_material um
  where um.puesto_id = ip.puesto_id and um.seccion = i.seccion and um.numero = 1
);

-- 4) Asignar cada inventario_puesto existente a su unidad #1
update inventario_puesto ip
  set unidad_id = um.id
  from inventario_items i, unidades_material um
  where ip.item_id = i.id
    and um.puesto_id = ip.puesto_id
    and um.seccion = i.seccion
    and um.numero = 1
    and ip.unidad_id is null;

-- ============================================================
-- 5) Función helper: duplicar una unidad al mismo puesto+seccion.
--    Copia todos los items, minimos y stock inicial = minimo.
-- ============================================================
create or replace function duplicar_unidad_material(
  p_puesto_id uuid,
  p_seccion text,
  p_nuevo_nombre text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nueva_id uuid;
  v_siguiente_numero int;
begin
  -- Permite ejecutar desde SQL Editor postgres (auth.uid() null) O si es admin
  if auth.uid() is not null and not auth_es_admin() then
    raise exception 'Solo admin';
  end if;
  select coalesce(max(numero),0) + 1 into v_siguiente_numero
    from unidades_material where puesto_id = p_puesto_id and seccion = p_seccion;
  insert into unidades_material (puesto_id, seccion, nombre, numero)
    values (p_puesto_id, p_seccion, p_nuevo_nombre, v_siguiente_numero)
    returning id into v_nueva_id;
  -- Copiar items de la unidad #1 al nuevo, con stock = minimo
  insert into inventario_puesto (puesto_id, item_id, stock, minimo, unidad_id)
  select ip.puesto_id, ip.item_id, ip.minimo, ip.minimo, v_nueva_id
    from inventario_puesto ip
    join unidades_material um on um.id = ip.unidad_id
    where um.puesto_id = p_puesto_id and um.seccion = p_seccion and um.numero = 1;
  return v_nueva_id;
end $$;
grant execute on function duplicar_unidad_material(uuid, text, text) to authenticated;

-- ============================================================
-- 6) Crear las unidades adicionales que ha pedido el cliente:
--    Cala Gran:      2 botiquines + 2 oxígenos → +1 botiq +1 oxi
--    Cala Romani:    3 botiquines + 1 oxígeno  → +2 botiquines
--    Ona Luna Park:  2 botiquines + 2 oxígenos → +1 botiq +1 oxi
--    Esmeralda Park: 2 botiquines + 2 oxígenos → +1 botiq +1 oxi
--    Cala Esmeralda: 2 botiquines + 2 oxígenos → +1 botiq +1 oxi
--
-- Nota: los nombres nuevos son "Botiquín 2", "Oxígeno 2", etc.
-- El admin puede renombrarlos después ("Botiquín piscina infantil"
-- o lo que quieran) editando directamente la columna `nombre`.
-- ============================================================

do $$
declare
  v_puesto record;
  v_nombre_norm text;
  v_extra_botiquines int;
  v_extra_oxigenos int;
  v_num int;
  v_nueva uuid;
begin
  for v_puesto in
    select id, nombre from puestos where activo
  loop
    -- Normaliza el nombre a minúsculas y sin tildes/acentos, sin depender
    -- de la extensión `unaccent` (que puede no estar instalada en Supabase Free)
    v_nombre_norm := lower(translate(coalesce(v_puesto.nombre, ''),
      'áàäâãÁÀÄÂÃéèëêÉÈËÊíìïîÍÌÏÎóòöôõÓÒÖÔÕúùüûÚÙÜÛñÑçÇ',
      'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnNcC'));
    -- Definimos cuántos EXTRA de cada tipo (además de la #1)
    v_extra_botiquines := 0; v_extra_oxigenos := 0;
    if v_nombre_norm ~ 'gavimar.*cala gran' or v_nombre_norm ~ '^cala gran' or v_nombre_norm ~ 'gran$' then
      -- Cala Gran (Gavimar): 2 botiquines + 2 oxigenos → 1 extra de cada
      v_extra_botiquines := 1; v_extra_oxigenos := 1;
    elsif v_nombre_norm ~ 'cala romani' or v_nombre_norm ~ 'romani' then
      -- Cala Romani: 3 botiquines + 1 oxigeno → 2 botiquines extra
      v_extra_botiquines := 2; v_extra_oxigenos := 0;
    elsif v_nombre_norm ~ 'ona luna park' or v_nombre_norm ~ 'luna park' then
      v_extra_botiquines := 1; v_extra_oxigenos := 1;
    elsif v_nombre_norm ~ 'esmeralda park' then
      v_extra_botiquines := 1; v_extra_oxigenos := 1;
    elsif v_nombre_norm ~ 'cala esmeralda' then
      v_extra_botiquines := 1; v_extra_oxigenos := 1;
    end if;

    -- Crear botiquines extra
    if v_extra_botiquines > 0 then
      for v_num in 2 .. (1 + v_extra_botiquines) loop
        if not exists (select 1 from unidades_material where puesto_id = v_puesto.id and seccion = 'botiquin' and numero = v_num) then
          v_nueva := duplicar_unidad_material(v_puesto.id, 'botiquin', 'Botiquín ' || v_num);
          raise notice 'Creado Botiquín % en %', v_num, v_puesto.nombre;
        end if;
      end loop;
    end if;

    -- Crear oxígenos extra
    if v_extra_oxigenos > 0 then
      for v_num in 2 .. (1 + v_extra_oxigenos) loop
        if not exists (select 1 from unidades_material where puesto_id = v_puesto.id and seccion = 'oxigeno' and numero = v_num) then
          v_nueva := duplicar_unidad_material(v_puesto.id, 'oxigeno', 'Oxígeno ' || v_num);
          raise notice 'Creado Oxígeno % en %', v_num, v_puesto.nombre;
        end if;
      end loop;
    end if;
  end loop;
end $$;

-- ============================================================
-- VERIFICACIÓN: unidades por hotel para las 3 secciones
-- Deberías ver:
--   Cala Gran (Gavimar):    Botiquín 1, 2 · DESA 1 · Oxígeno 1, 2
--   Cala Romani:            Botiquín 1, 2, 3 · DESA 1 · Oxígeno 1
--   Ona Luna Park:          Botiquín 1, 2 · DESA 1 · Oxígeno 1, 2
--   Esmeralda Park:         Botiquín 1, 2 · DESA 1 · Oxígeno 1, 2
--   Cala Esmeralda:         Botiquín 1, 2 · DESA 1 · Oxígeno 1, 2
-- ============================================================
select p.nombre as hotel, um.seccion, um.numero, um.nombre
  from unidades_material um
  join puestos p on p.id = um.puesto_id
  where um.activo
    and (p.nombre ilike '%cala gran%' or p.nombre ilike '%romani%'
      or p.nombre ilike '%luna park%' or p.nombre ilike '%esmeralda%')
  order by p.nombre, um.seccion, um.numero;
