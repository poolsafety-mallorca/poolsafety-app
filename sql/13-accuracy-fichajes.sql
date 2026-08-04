-- ============================================================
-- PoolSafety · Añadir columna accuracy_m a fichajes
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- ============================================================
-- Guarda la precisión (en metros) del GPS reportada por el móvil
-- del socorrista al fichar. Útil para distinguir:
--   · accuracy ≤ 20m → GPS bueno (satélites)
--   · accuracy 30-100m → GPS regular (WiFi + AGPS)
--   · accuracy > 200m → GPS malo (solo celda), el fichaje "fuera de
--     zona" probablemente es del móvil, no del socorrista
--
-- La app v98 ya la usa: intenta guardar accuracy_m; si la columna no
-- existe hace fallback silencioso. Cuando ejecutes este SQL,
-- automáticamente se empieza a guardar en los fichajes nuevos.
-- ============================================================

alter table fichajes add column if not exists accuracy_m int;
create index if not exists fichajes_accuracy_idx
  on fichajes(accuracy_m) where accuracy_m is not null;

-- Verificación
select column_name, data_type from information_schema.columns
  where table_name = 'fichajes' and column_name = 'accuracy_m';
