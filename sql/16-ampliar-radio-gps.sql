-- ============================================================
-- PoolSafety · Ampliar radio GPS de fichaje a 100 m
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Muchos socorristas están fichando "fuera de zona" por precisión
-- del GPS del móvil (±30-80 m es normal en interior). Se amplía
-- el radio a 100 m para todos los hoteles activos, EXCEPTO los
-- que ya estén configurados EXACTAMENTE a 30 m (esos se dejan
-- como están porque el cliente pidió mantenerlos así).
--
-- Hoteles con radio 30 m → intocados.
-- Hoteles con radio < 100 m (o NULL) → suben a 100 m.
-- Hoteles con radio ≥ 100 m → intocados.
-- ============================================================

-- 1) Ver estado ANTES (para copiar salida y comparar)
select nombre, coalesce(gps_radio_m, 0) as radio_actual
  from puestos
  where activo
  order by nombre;

-- 2) Aplicar el update
update puestos
  set gps_radio_m = 100
  where activo
    and (gps_radio_m is null or gps_radio_m < 100)
    and coalesce(gps_radio_m, -1) <> 30;

-- 3) Verificación DESPUÉS
select nombre, gps_radio_m
  from puestos
  where activo
  order by gps_radio_m nulls first, nombre;

-- ============================================================
-- Notas:
--   · Si algún hotel específico necesita otro radio (p. ej. el
--     de Artá si sigue dando problemas), actualízalo directo:
--       update puestos set gps_radio_m = 150 where nombre ilike '%ankaa%';
--   · El valor por defecto en el código JS (cuando el hotel no
--     tiene radio configurado) sigue siendo 50 m — este SQL lo
--     sobrescribe a 100 m para hoteles activos que estaban por
--     debajo.
-- ============================================================
