-- ============================================================
-- PoolSafety · Limpiar inventario DESA a lo REAL que usa la empresa
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- ============================================================
-- El cliente ha indicado que en la sección DESA solo tienen:
--   · Desfibrilador DESA (el equipo)
--   · Parches de adulto
--   · Parches pediátricos
--   · 1 Batería de repuesto
--
-- HAY QUE QUITAR:
--   · Rasuradora desechable  (desa-rasura)
--   · Toalla no conductora   (desa-toalla)
--   · Mascarilla RCP         (desa-rcp-mask)
--   · Libro registro DESA    (desa-registro)
--
-- Se borran tanto del inventario de cada puesto como del catálogo.
-- ============================================================

-- Revisión previa: cuántos items DESA hay por puesto AHORA
select p.nombre, count(*) as items_desa
  from puestos p
  join inventario_puesto ip on ip.puesto_id = p.id
  join inventario_items i on i.id = ip.item_id
  where i.seccion = 'desa' and p.activo
  group by p.nombre
  order by p.nombre;

-- 1) Eliminar los items sobrantes del INVENTARIO DE CADA PUESTO
delete from inventario_puesto
  where item_id in (
    select id from inventario_items
      where seccion = 'desa'
        and codigo in ('desa-rasura','desa-toalla','desa-rcp-mask','desa-registro')
  );

-- 2) Eliminar los items del CATÁLOGO maestro
delete from inventario_items
  where seccion = 'desa'
    and codigo in ('desa-rasura','desa-toalla','desa-rcp-mask','desa-registro');

-- 3) Asegurar que la batería está bien: 1 unidad mínimo (no cambia stock, solo mínimo)
update inventario_puesto
  set minimo = 1
  where item_id in (select id from inventario_items where codigo = 'desa-bateria');

-- ============================================================
-- Verificación: debe quedar 4 items DESA por hotel
--   Desfibrilador · Parches adulto · Parches pediátricos · Batería
-- ============================================================
select p.nombre, i.nombre as producto, ip.stock, ip.minimo
  from puestos p
  join inventario_puesto ip on ip.puesto_id = p.id
  join inventario_items i on i.id = ip.item_id
  where i.seccion = 'desa' and p.activo
  order by p.nombre, i.nombre;
