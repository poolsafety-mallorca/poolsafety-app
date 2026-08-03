-- ============================================================
-- PoolSafety · Fix: ultimo_login se queda a NULL por RLS
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- ============================================================
-- SÍNTOMA: el panel "Estado del equipo" pone "Sin entrar" para todos
-- los socorristas aunque hayan entrado. Adán aparece "Sin entrar".
--
-- CAUSA: la policy UPDATE de usuarios en sql/02-rls.sql solo deja
-- actualizar filas si eres admin. El auth-guard hace un UPDATE de
-- ultimo_login CADA vez que un usuario entra. Con esa policy el
-- update de un socorrista devuelve 0 filas sin error (RLS silencioso).
--
-- FIX:
--   1) Ampliar la policy UPDATE a "id = auth.uid() OR admin"
--      (lo que ya trae sql/04-auditoria-fixes.sql).
--   2) RPC `marcar_ultimo_login()` con security definer como fallback
--      superrobusto para el auth-guard: si la policy fallara, el
--      RPC actualiza igualmente (validando internamente que el
--      usuario solo puede tocar su propia fila).
--   3) Backfill inmediato: marcar ultimo_login = ahora para el
--      usuario que ejecuta este SQL (solo si es NULL) — para
--      arreglar el estado actual sin esperar a un nuevo login.
-- ============================================================

-- 1) Policy UPDATE ampliada (idempotente)
drop policy if exists usuarios_update on usuarios;
create policy usuarios_update on usuarios
  for update
  using (
    id = auth.uid()                                       -- su propio perfil
    or (auth_es_admin() and empresa_id = auth_empresa())  -- admin/coord de su empresa
  )
  with check (
    id = auth.uid()
    or (auth_es_admin() and empresa_id = auth_empresa())
  );

-- 2) RPC como red de seguridad — no depende de la policy anterior
create or replace function marcar_ultimo_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update usuarios set ultimo_login = now() where id = auth.uid();
end;
$$;
grant execute on function marcar_ultimo_login() to authenticated;

-- 3) Backfill del usuario que ejecuta el SQL (útil para admin al aplicar el fix)
--    Solo actualiza si estaba en NULL. No pisa timestamps existentes.
update usuarios set ultimo_login = coalesce(ultimo_login, now()) where id = auth.uid();

-- ============================================================
-- VERIFICACIÓN
-- Todos los usuarios con al menos un login → deberían tener ultimo_login
-- select id, email, ultimo_login from usuarios order by ultimo_login desc nulls last;
--
-- Debe ejecutarse una vez la RPC como cada usuario para que se marque,
-- o basta con que hagan login (el auth-guard actualizado la llamará).
-- ============================================================
