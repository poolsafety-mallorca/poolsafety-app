-- ============================================================
-- PoolSafety · Diagnóstico + reparación de unidades material
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Bug reportado en Cala Gran: "solo les deja revisar Botiquín 1, del
-- resto no lo resolvemos". Cala Gran tiene 2 botiquines (según sql/14)
-- pero puede que la duplicación no haya copiado items a Botiquín 2 o
-- que la unidad #2 no exista siquiera.
--
-- Este script:
-- 1) Diagnóstico: muestra qué unidades tiene cada hotel y cuántos items.
-- 2) Reparación: por cada hotel con >1 unidad en una sección, garantiza
--    que cada unidad tiene los mismos items que la unidad #1
--    (con stock inicial = mínimo).
-- ============================================================

-- 1) DIAGNÓSTICO — ver qué tiene Cala Gran (y todos los hoteles con
--    varias unidades) actualmente.
select p.nombre as hotel, um.seccion, um.numero, um.nombre as unidad,
       um.activo,
       (select count(*) from inventario_puesto ip where ip.unidad_id = um.id) as items
  from unidades_material um
  join puestos p on p.id = um.puesto_id
  where p.activo and um.activo
  order by p.nombre, um.seccion, um.numero;

-- 2) REPARACIÓN — Por cada hotel/sección con >1 unidad, para las unidades
--    #2, #3… que tengan MENOS items que la #1, copiar los items faltantes.
--    Esto arregla el caso Cala Gran donde Botiquín 2 se creó sin items.
do $$
declare
  v_puesto record;
  v_seccion text;
  v_unidad_base record;
  v_unidad record;
begin
  for v_puesto in select id, nombre from puestos where activo loop
    for v_seccion in select unnest(array['botiquin','desa','oxigeno']) loop
      -- Unidad base (numero=1)
      select id into v_unidad_base
        from unidades_material
        where puesto_id = v_puesto.id and seccion = v_seccion and numero = 1 and activo
        limit 1;
      if v_unidad_base.id is null then continue; end if;

      -- Por cada unidad numero>1, copiar items faltantes
      for v_unidad in
        select id, nombre from unidades_material
          where puesto_id = v_puesto.id and seccion = v_seccion and numero > 1 and activo
      loop
        insert into inventario_puesto (puesto_id, item_id, stock, minimo, unidad_id)
        select v_puesto.id, ip.item_id, ip.minimo, ip.minimo, v_unidad.id
          from inventario_puesto ip
          where ip.unidad_id = v_unidad_base.id
            and not exists (
              select 1 from inventario_puesto ip2
              where ip2.unidad_id = v_unidad.id and ip2.item_id = ip.item_id
            )
        on conflict do nothing;
        -- (con la constraint UNIQUE(puesto_id, item_id, unidad_id) de sql/14)
      end loop;
    end loop;
  end loop;
end $$;

-- 3) VERIFICACIÓN POSTERIOR — ver Cala Gran otra vez
select p.nombre as hotel, um.seccion, um.numero, um.nombre as unidad,
       (select count(*) from inventario_puesto ip where ip.unidad_id = um.id) as items
  from unidades_material um
  join puestos p on p.id = um.puesto_id
  where p.nombre ilike '%cala gran%' and um.activo
  order by um.seccion, um.numero;
