-- ============================================================
-- PoolSafety · Socorrista puede ver a los coordinadores/admin
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Bug histórico silencioso: la policy `usuarios_select` solo dejaba
-- al socorrista verse a sí mismo (id = auth.uid()). Por eso el bloque
-- "Contactar coordinador" del socorrista SIEMPRE aparecía vacío con
-- el mensaje "Ningún coordinador disponible" aunque Adam/Alex/Óscar
-- estuvieran activos y disponibles.
--
-- Añadimos una policy adicional que permite a CUALQUIER usuario ver
-- a los dueno/coordinador de SU MISMA empresa. Los datos sensibles
-- (ultimo_login, activo) los seguiría filtrando el frontend; el
-- socorrista solo lee nombre/email/telefono/disponible/rol para
-- llamar o escribir.
-- ============================================================

-- Refuerzo: mantenemos la policy original (usuario ve su propio row
-- y admin/coord ven todos) y AÑADIMOS una nueva para socorristas.
drop policy if exists usuarios_select_para_contactar on usuarios;
create policy usuarios_select_para_contactar on usuarios
  for select
  using (
    rol in ('dueno','coordinador')
    and empresa_id = auth_empresa()
    and activo = true
  );

-- ============================================================
-- Verificación (ejecutar desde el rol del socorrista para probar)
-- Debería devolver las filas de Adam + Alex + Óscar.
-- ============================================================
select id, nombre, rol, disponible
  from usuarios
  where rol in ('dueno','coordinador')
    and activo = true
  order by rol, nombre;
