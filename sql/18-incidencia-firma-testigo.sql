-- ============================================================
-- PoolSafety · Segunda firma en el parte de incidencia
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Hasta ahora en el parte de incidencia solo firmaba el socorrista.
-- Se añade una SEGUNDA firma para reforzar el valor probatorio:
-- lo firma la persona atendida — si puede — o en su defecto un
-- familiar, la recepción del hotel o cualquier testigo.
-- ============================================================

alter table incidencias
  add column if not exists firma_testigo_tipo text;
  -- valores previstos: 'victima' | 'familiar' | 'hotel' | 'otro'

alter table incidencias
  add column if not exists firma_testigo_nombre text;
alter table incidencias
  add column if not exists firma_testigo_dni text;
alter table incidencias
  add column if not exists firma_testigo_relacion text;   -- p.ej. "esposa", "recepción", "director hotel"
alter table incidencias
  add column if not exists firma_testigo_imagen text;     -- base64 PNG del canvas
alter table incidencias
  add column if not exists firma_testigo_motivo_ausencia text;
  -- si no firma nadie: motivo — "víctima inconsciente y sin acompañantes", "traslado urgente al hospital", etc.

-- ============================================================
-- Verificación
-- ============================================================
select column_name, data_type
  from information_schema.columns
  where table_name = 'incidencias'
    and column_name like 'firma_testigo_%'
  order by column_name;
