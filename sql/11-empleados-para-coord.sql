-- ============================================================
-- PoolSafety · Asegurar ficha "empleados" para dueño/coordinador
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Motivo: los coordinadores y el dueño son trabajadores igual que
-- los socorristas y también deben firmar el Kit Alta laboral. Para
-- que puedan firmarlo, necesitan una fila en la tabla `empleados`
-- (la firma se guarda con empleado_id).
--
-- Este SQL crea de forma idempotente una ficha empleado mínima para
-- todo usuario dueño/coordinador que aún no la tenga. No pisa datos
-- de las fichas que ya existen.
-- ============================================================

insert into empleados (empresa_id, usuario_id, nombre, email, estado, fecha_alta)
select
  u.empresa_id,
  u.id,
  coalesce(u.nombre, split_part(u.email, '@', 1)),
  u.email,
  'activo',
  coalesce(u.created_at::date, current_date)
from usuarios u
where u.rol in ('dueno','coordinador')
  and u.activo is not false
  and not exists (select 1 from empleados e where e.usuario_id = u.id)
;

-- Verificación
select u.rol, u.email, u.nombre,
  (select id from empleados e where e.usuario_id = u.id) as empleado_id,
  (select fecha_firma from firmas_documentos f where f.empleado_id = (select id from empleados e where e.usuario_id = u.id) and f.documento_codigo = 'kit-alta' order by fecha_firma desc limit 1) as kit_alta_firmado
from usuarios u
where u.rol in ('dueno','coordinador')
order by u.rol, u.nombre;
