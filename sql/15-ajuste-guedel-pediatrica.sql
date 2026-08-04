-- ============================================================
-- PoolSafety · Cánula Guedel pediátrica → mínimo 1 (antes 2)
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- ============================================================
-- Baja el mínimo de "Cánulas Guedel pediátrico" a 1 unidad en:
--   · Catálogo maestro (inventario_items.minimo_recomendado)
--   · TODOS los inventarios de puesto (inventario_puesto.minimo)
--     — incluidas las unidades duplicadas de v101.
-- Si el stock actual estaba a 2 (default), lo baja también a 1.
-- ============================================================

-- 1) Catálogo maestro
update inventario_items
  set minimo_recomendado = 1
  where codigo = 'ox-guedel-p';

-- 2) Todos los inventarios de puesto — mínimo a 1
update inventario_puesto
  set minimo = 1
  where item_id in (select id from inventario_items where codigo = 'ox-guedel-p');

-- 3) Si el stock actual es 2 (default), lo bajamos también a 1
--    (respeta stock manual: si el socorrista lo puso a 5, no lo tocamos)
update inventario_puesto
  set stock = 1
  where stock = 2
    and item_id in (select id from inventario_items where codigo = 'ox-guedel-p');

-- ============================================================
-- Verificación
-- ============================================================
select p.nombre as hotel, um.nombre as unidad, ip.stock, ip.minimo
  from inventario_puesto ip
  join inventario_items i on i.id = ip.item_id
  join puestos p on p.id = ip.puesto_id
  left join unidades_material um on um.id = ip.unidad_id
  where i.codigo = 'ox-guedel-p'
  order by p.nombre, um.numero nulls first;
