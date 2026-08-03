-- ============================================================
-- PoolSafety · Cambiar email de un empleado desde el panel admin
-- (sin tener que ir a Supabase Dashboard → Auth → Users)
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Contexto: para cambiar el email de LOGIN de un empleado hay que
-- tocar auth.users, que la app cliente no puede hacer por RLS.
-- Esta función `admin_cambiar_email` corre con security definer
-- (permisos elevados) pero valida internamente que el que la llama
-- es el DUEÑO de la misma empresa, para que ni coord ni socorrista
-- puedan usarla.
--
-- Actualiza en cascada:
--   1) auth.users.email  (para que el empleado entre con el nuevo email)
--   2) auth.identities   (algunos providers lo cachean aquí)
--   3) usuarios.email    (lo que ve la app)
--   4) empleados.email   (ficha del empleado)
-- ============================================================

create or replace function admin_cambiar_email(
  p_empleado_id uuid,
  p_nuevo_email text
) returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_usuario_id uuid;
  v_empresa_id uuid;
  v_email_actual text;
  v_llamador_rol text;
  v_llamador_empresa uuid;
  v_ya_existe int;
begin
  -- 1) Validar que el que llama es DUEÑO de la misma empresa que el empleado
  select rol, empresa_id into v_llamador_rol, v_llamador_empresa
    from usuarios where id = auth.uid();
  if v_llamador_rol is null then
    raise exception 'No autenticado';
  end if;
  if v_llamador_rol <> 'dueno' then
    raise exception 'Solo el administrador puede cambiar emails';
  end if;

  -- 2) Buscar la ficha del empleado
  select e.usuario_id, e.empresa_id, e.email
    into v_usuario_id, v_empresa_id, v_email_actual
    from empleados e where e.id = p_empleado_id;
  if v_usuario_id is null then
    raise exception 'Empleado sin cuenta auth (no tiene usuario_id) — créale primero una cuenta';
  end if;
  if v_empresa_id <> v_llamador_empresa then
    raise exception 'El empleado no pertenece a tu empresa';
  end if;

  -- 3) Normalizar y validar el email
  p_nuevo_email := lower(trim(p_nuevo_email));
  if p_nuevo_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email no válido: %', p_nuevo_email;
  end if;
  if p_nuevo_email = lower(coalesce(v_email_actual, '')) then
    return 'Sin cambios: el email ya era ' || p_nuevo_email;
  end if;

  -- 4) Verificar que el email nuevo no esté en uso por otro usuario
  select count(*) into v_ya_existe
    from auth.users where lower(email) = p_nuevo_email and id <> v_usuario_id;
  if v_ya_existe > 0 then
    raise exception 'Ese email ya está en uso por otra cuenta';
  end if;

  -- 5) Actualizar auth.users (login)
  update auth.users
    set email = p_nuevo_email,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_usuario_id;

  -- 6) Sincronizar auth.identities (algunos providers lo cachean aquí)
  update auth.identities
    set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(p_nuevo_email))
    where user_id = v_usuario_id;

  -- 7) Actualizar tablas de aplicación
  update usuarios  set email = p_nuevo_email where id = v_usuario_id;
  update empleados set email = p_nuevo_email where id = p_empleado_id;

  return 'OK: email cambiado de ' || coalesce(v_email_actual,'(vacío)') || ' a ' || p_nuevo_email;
end;
$$;

grant execute on function admin_cambiar_email(uuid, text) to authenticated;

-- ============================================================
-- Verificación
-- Prueba desde el frontend con:
--   const { data, error } = await supabase.rpc('admin_cambiar_email',
--     { p_empleado_id: 'uuid-empleado', p_nuevo_email: 'nuevo@mail.com' });
-- Si no eres dueño devuelve error. Si funciona devuelve texto OK.
-- ============================================================
