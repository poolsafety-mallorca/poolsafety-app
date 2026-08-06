-- ============================================================
-- PoolSafety · Visitas coord — añadir SALIDA (cierre)
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Hasta ahora una "visita" era un solo momento: la llegada. Ahora
-- el coordinador ficha ENTRADA al llegar y SALIDA al irse, para
-- que el admin sepa cuánto tiempo estuvo en el hotel.
-- ============================================================

alter table visitas_hoteles
  add column if not exists fecha_hora_salida timestamptz;
alter table visitas_hoteles
  add column if not exists gps_lat_salida numeric(10,7);
alter table visitas_hoteles
  add column if not exists gps_lng_salida numeric(10,7);

-- Índice para localizar visitas ABIERTAS (sin cerrar todavía) del
-- coordinador en curso. Útil para el botón "Cerrar visita".
create index if not exists idx_visitas_abiertas
  on visitas_hoteles(coordinador_id, puesto_id)
  where fecha_hora_salida is null;

-- ============================================================
-- Verificación
-- ============================================================
select column_name, data_type
  from information_schema.columns
  where table_name = 'visitas_hoteles'
    and column_name in ('fecha_hora_llegada','fecha_hora_salida','gps_lat_salida','gps_lng_salida')
  order by column_name;
