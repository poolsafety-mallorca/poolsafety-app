-- ==========================================================================
-- PoolSafety · sql/31 · Fecha prevista de fin de contrato
--
-- POR QUÉ
-- Muchas bajas se saben con meses de antelación: los hoteles cierran a final
-- de temporada y ese día se acaba el servicio. Gestoría necesita esa fecha
-- por adelantado para preparar los papeles, pero en la ficha sólo se podía
-- apuntar la fecha de alta.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO `fecha_baja`
-- `fecha_baja` significa "esta persona YA NO ESTÁ". La app la usa en todas
-- partes para sacar a alguien de las listas: horarios, cuadrantes, estado del
-- equipo, recuentos de plantilla, partes de hotel. Si se rellenara con la
-- fecha de fin prevista, un socorrista que trabaja hasta octubre desaparecería
-- HOY de los cuadrantes y dejaría hoteles sin cubrir sobre el papel.
--
-- Por eso son dos cosas distintas y separadas:
--   · fecha_fin_prevista → un plan. No cambia nada, sólo informa y sale en el
--     informe de altas y bajas.
--   · fecha_baja         → un hecho. Saca a la persona de los listados.
--
-- Cuando llegue el día, la baja se sigue dando a mano desde la ficha, como
-- hasta ahora. A propósito: que un contrato se extinga solo, sin que nadie lo
-- mire, es justo lo que no se quiere en algo que afecta a una nómina.
--
-- Ejecutar con Role postgres en el SQL Editor de Supabase. Idempotente.
-- ==========================================================================

alter table empleados add column if not exists fecha_fin_prevista date;

comment on column empleados.fecha_fin_prevista is
  'Fin de contrato previsto (fin de temporada, cierre de hotel). Es sólo un plan: NO saca a la persona de listados ni cuadrantes. La baja real es fecha_baja.';
