-- ==========================================================================
-- PoolSafety · sql/33 · Tipo de trabajador en los presupuestos
--
-- POR QUÉ
-- El presupuesto sólo sabía contar socorristas. Pero en un hotel no va sólo
-- un socorrista: hay monitores, supervisores, coordinadores y vigilantes, y
-- cada perfil hace un trabajo distinto y cuesta un precio/hora distinto.
-- El cliente pedía poder decir, por ejemplo, que el supervisor cubre todos
-- los turnos de comida para no dejar ninguna piscina vacía.
--
-- DECISIONES
-- · El tipo y la descripción del trabajo van DENTRO de `servicios` (jsonb),
--   que ya existe. No hacen falta columnas nuevas para eso: cada línea pasa
--   a llevar `tipo` y `trabajo`. Las líneas guardadas antes no los tienen y
--   se leen como 'socorrista' con trabajo vacío, así que los presupuestos
--   viejos siguen abriéndose igual.
-- · El precio SÍ necesita columna, y es la única que se añade aquí.
--   `precio_hora` sigue siendo EL PRECIO DEL SOCORRISTA — es lo que siempre
--   ha significado (el PDF lo imprime como «PRECIO HORA SOCORRISTA»). Los
--   demás tipos van en `precios_tipo`, un jsonb {tipo: precio}. Así ningún
--   presupuesto existente cambia de significado ni hay que migrar datos.
-- · Sigue SIN guardarse ningún total: se fija cantidad por tipo y precio/hora
--   de cada tipo, y se factura sobre horas realmente prestadas.
--
-- Ejecutar con Role postgres en el SQL Editor de Supabase. Idempotente.
-- ==========================================================================

alter table presupuestos
  add column if not exists precios_tipo jsonb default '{}'::jsonb;

-- Las filas que ya existían se quedan con {} : todas sus líneas son
-- socorristas y su precio sigue siendo `precio_hora`. Nada que migrar.
update presupuestos set precios_tipo = '{}'::jsonb where precios_tipo is null;

-- Comprobación: debe listar la columna nueva.
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'presupuestos' and column_name = 'precios_tipo';
