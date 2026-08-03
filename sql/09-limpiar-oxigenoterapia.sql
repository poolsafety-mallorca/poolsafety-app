-- ============================================================
-- PoolSafety · Ajustar inventario de OXIGENOTERAPIA al real
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- ============================================================
-- Cliente indica:
--   QUITAR: Bala de oxígeno de repuesto  (ox-bala-r)
--   QUITAR: Mascarilla no-rebreather adulto — tamaño L (ox-mask-a)
--   AÑADIR: Manta térmica
--   AÑADIR: Abrebocas
--   AÑADIR: Pinza de lengua
-- ============================================================

-- 1) QUITAR de inventario de cada puesto
delete from inventario_puesto
  where item_id in (
    select id from inventario_items
      where seccion = 'oxigeno'
        and codigo in ('ox-bala-r','ox-mask-a')
  );

-- 2) QUITAR del catálogo maestro
delete from inventario_items
  where seccion = 'oxigeno'
    and codigo in ('ox-bala-r','ox-mask-a');

-- 3) AÑADIR nuevos items al catálogo (idempotente por codigo)
insert into inventario_items (codigo, nombre, seccion, categoria, obligatorio, normativa, unidad, minimo_recomendado) values
  ('ox-manta',      'Manta térmica de emergencia', 'oxigeno', 'Oxígeno', true,  'Decreto 53/1995', 'ud', 2),
  ('ox-abrebocas',  'Abrebocas',                    'oxigeno', 'Oxígeno', true,  'Decreto 53/1995', 'ud', 1),
  ('ox-pinza-leng', 'Pinza de lengua',              'oxigeno', 'Oxígeno', true,  'Decreto 53/1995', 'ud', 1)
on conflict (codigo) do nothing;

-- 4) Añadir los tres nuevos al INVENTARIO de todos los puestos activos
--    con el mínimo recomendado como stock inicial.
insert into inventario_puesto (puesto_id, item_id, stock, minimo)
select p.id, i.id, i.minimo_recomendado, i.minimo_recomendado
  from puestos p
  cross join inventario_items i
  where p.activo
    and i.codigo in ('ox-manta','ox-abrebocas','ox-pinza-leng')
on conflict (puesto_id, item_id) do nothing;

-- ============================================================
-- VERIFICACIÓN — debe quedar 1 bala principal, regulador, ambús,
-- mascarilla pediátrica, cánulas Guedel, aspirador, manta, abrebocas,
-- pinza de lengua. NO debe salir bala de repuesto ni mascarilla adulto.
-- ============================================================
select p.nombre, i.nombre as producto, ip.stock, ip.minimo
  from puestos p
  join inventario_puesto ip on ip.puesto_id = p.id
  join inventario_items i on i.id = ip.item_id
  where i.seccion = 'oxigeno' and p.activo
  order by p.nombre, i.nombre;
