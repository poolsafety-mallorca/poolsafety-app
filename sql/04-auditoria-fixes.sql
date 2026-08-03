-- ==========================================================================
-- PoolSafety · FIXES DE AUDITORÍA (seguridad + funcionalidad)
-- Fecha: 2026-08-03
--
-- ⚠️ IMPORTANTE: ejecutar por BLOQUES, no todo de golpe.
-- Cada bloque es independiente e idempotente (se puede repetir sin romper).
-- Lee el comentario de cada bloque antes de ejecutarlo.
-- ==========================================================================


-- ==========================================================================
-- BLOQUE 1 · CRÍTICO · Políticas que FALTAN y rompen funcionalidad
-- Sin esto: editar/borrar fichajes NO funciona, reenviar Kit Alta NO archiva,
-- el socorrista NO puede subir su documentación. Fallan en SILENCIO (0 filas).
-- ==========================================================================

-- FICHAJES · faltaba UPDATE y DELETE (editor de fichajes admin)
drop policy if exists fichajes_update on fichajes;
create policy fichajes_update on fichajes for update
  using (auth_es_admin()) with check (auth_es_admin());

drop policy if exists fichajes_delete on fichajes;
create policy fichajes_delete on fichajes for delete
  using (auth_es_admin());

-- FIRMAS_DOCUMENTOS · faltaba UPDATE
-- Necesario para: reenviar Kit Alta (archiva cambiando documento_codigo),
-- guardar archivo_pdf_url tras generar el PDF.
drop policy if exists firmas_update on firmas_documentos;
create policy firmas_update on firmas_documentos for update
  using (auth_es_admin()) with check (auth_es_admin());

drop policy if exists firmas_delete on firmas_documentos;
create policy firmas_delete on firmas_documentos for delete
  using (auth_es_admin());

-- DOCUMENTOS_SUBIDOS · el socorrista debe poder subir SUS propios documentos
drop policy if exists docsub_self_insert on documentos_subidos;
create policy docsub_self_insert on documentos_subidos for insert
  with check (empleado_id = auth_empleado_id());


-- ==========================================================================
-- BLOQUE 2 · CRÍTICO SEGURIDAD · Separar permisos DUEÑO vs COORDINADOR
--
-- PROBLEMA ACTUAL: auth_es_admin() devuelve true para 'dueno' Y 'coordinador'.
-- Todas las políticas usan esa función → el coordinador tiene los MISMOS
-- permisos que el dueño A NIVEL DE BASE DE DATOS.
-- Las restricciones ("coord no puede dar de baja / eliminar / borrar coords")
-- están SOLO en el JavaScript, y eso se salta abriendo F12 → Consola:
--     await window.sb.from('usuarios').delete().eq('id','<id-del-dueño>')
--     await window.sb.from('empleados').delete().eq('id','<cualquiera>')
--
-- SOLUCIÓN: nueva función auth_es_dueno() y políticas de borrado/baja
-- restringidas solo al dueño.
-- ==========================================================================

create or replace function auth_es_dueno()
returns boolean as $$
  select rol = 'dueno' from usuarios where id = auth.uid();
$$ language sql stable security definer;

-- USUARIOS · solo el DUEÑO puede borrar cuentas (antes: también coordinador)
drop policy if exists usuarios_delete on usuarios;
create policy usuarios_delete on usuarios for delete
  using (auth_es_dueno() and empresa_id = auth_empresa());

-- USUARIOS · quién puede hacer UPDATE
-- OJO: la policy se mantiene SIMPLE a propósito. auth-guard.js hace un UPDATE
-- de ultimo_login en CADA login; si esta policy fuera compleja (subconsultas a
-- la propia tabla usuarios) podría entrar en recursión y dejar a todos fuera.
-- La protección del campo 'rol' se hace con un TRIGGER, más abajo.
drop policy if exists usuarios_update on usuarios;
create policy usuarios_update on usuarios for update
  using (
    id = auth.uid()                                    -- su propio perfil
    or (auth_es_admin() and empresa_id = auth_empresa())  -- admin/coord de su empresa
  )
  with check (
    id = auth.uid()
    or (auth_es_admin() and empresa_id = auth_empresa())
  );

-- TRIGGER · nadie salvo el DUEÑO puede cambiar el rol de un usuario.
-- Esto impide que un coordinador se auto-promocione a 'dueno' desde la consola.
create or replace function usuarios_proteger_rol()
returns trigger as $$
begin
  if new.rol is distinct from old.rol then
    if not (select rol = 'dueno' from usuarios where id = auth.uid()) then
      new.rol := old.rol;   -- se ignora el cambio de rol
    end if;
  end if;
  -- Un no-dueño tampoco puede reactivarse a sí mismo si le cortaron el acceso
  if new.activo is distinct from old.activo then
    if not (select rol = 'dueno' from usuarios where id = auth.uid()) then
      new.activo := old.activo;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_usuarios_proteger_rol on usuarios;
create trigger trg_usuarios_proteger_rol
  before update on usuarios
  for each row execute function usuarios_proteger_rol();

-- EMPLEADOS · separar: coordinador CREA y EDITA, solo dueño BORRA
drop policy if exists empleados_admin on empleados;

drop policy if exists empleados_insert on empleados;
create policy empleados_insert on empleados for insert
  with check (auth_es_admin() and empresa_id = auth_empresa());

drop policy if exists empleados_update on empleados;
create policy empleados_update on empleados for update
  using (auth_es_admin() and empresa_id = auth_empresa())
  with check (auth_es_admin() and empresa_id = auth_empresa());

drop policy if exists empleados_delete on empleados;
create policy empleados_delete on empleados for delete
  using (auth_es_dueno() and empresa_id = auth_empresa());


-- ==========================================================================
-- BLOQUE 3 · SEGURIDAD · El socorrista NO debe poder auto-editarse campos
-- sensibles (estado, puesto, empresa).
--
-- PROBLEMA ACTUAL: empleados_self_update permite UPDATE de CUALQUIER columna.
-- Desde F12 un socorrista dado de baja puede hacer:
--     await window.sb.from('empleados').update({estado:'activo'}).eq('usuario_id', miId)
-- y recuperar el acceso. O auto-asignarse a otro hotel.
--
-- SOLUCIÓN: trigger que ignora cambios en columnas sensibles cuando el que
-- edita NO es admin. (Postgres/RLS no permite restringir por columna en la
-- propia policy, hay que usar trigger.)
-- ==========================================================================

create or replace function empleados_proteger_campos()
returns trigger as $$
begin
  -- Si quien edita NO es admin/coord, revertimos los campos sensibles
  if not auth_es_admin() then
    new.estado          := old.estado;
    new.puesto_id       := old.puesto_id;
    new.empresa_id      := old.empresa_id;
    new.usuario_id      := old.usuario_id;
    new.fecha_alta      := old.fecha_alta;
    new.fecha_baja      := old.fecha_baja;
    new.tipo_contrato   := old.tipo_contrato;
    new.es_correturnos  := old.es_correturnos;
    new.activo          := old.activo;
    new.dni             := coalesce(new.dni, old.dni);
    new.numero_ss       := coalesce(new.numero_ss, old.numero_ss);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_empleados_proteger on empleados;
create trigger trg_empleados_proteger
  before update on empleados
  for each row execute function empleados_proteger_campos();


-- ==========================================================================
-- BLOQUE 4 · SEGURIDAD · Cerrar el INSERT abierto de alertas
--
-- PROBLEMA ACTUAL: alertas_insert tiene "with check (true)" → cualquier
-- usuario autenticado puede crear alertas en nombre de CUALQUIER empleado
-- y CUALQUIER puesto, incluso de otra empresa.
-- ==========================================================================

drop policy if exists alertas_insert on alertas;
create policy alertas_insert on alertas for insert
  with check (
    auth_es_admin()
    or empleado_id = auth_empleado_id()   -- el socorrista solo en su nombre
  );

-- Además: permitir al admin BORRAR alertas antiguas (limpieza)
drop policy if exists alertas_delete on alertas;
create policy alertas_delete on alertas for delete
  using (auth_es_admin());


-- ==========================================================================
-- BLOQUE 5 · SEGURIDAD MULTI-EMPRESA · Añadir filtro de empresa donde falta
--
-- PROBLEMA: varias políticas usan solo auth_es_admin() sin comprobar que el
-- registro pertenece a la empresa del usuario. Hoy solo hay UNA empresa, así
-- que no hay fuga real, PERO si vendéis la app a otra empresa de socorrismo
-- (que es el plan), un admin de la empresa A podría leer/editar datos de la B.
--
-- Ejecutar ANTES de dar de alta la segunda empresa.
-- ==========================================================================

-- HORARIOS
drop policy if exists horarios_admin on horarios;
create policy horarios_admin on horarios for all
  using (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
  with check (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()));

-- TAREAS
drop policy if exists tareas_admin on tareas;
create policy tareas_admin on tareas for all
  using (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
  with check (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()));

-- NOTAS
drop policy if exists notas_admin on notas;
create policy notas_admin on notas for all
  using (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
  with check (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()));

-- DOCUMENTOS SUBIDOS
drop policy if exists docsub_admin on documentos_subidos;
create policy docsub_admin on documentos_subidos for all
  using (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
  with check (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()));

-- FICHAJES · select y update también filtrados por empresa
drop policy if exists fichajes_select on fichajes;
create policy fichajes_select on fichajes for select using (
  empleado_id = auth_empleado_id()
  or (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
);

drop policy if exists fichajes_update on fichajes;
create policy fichajes_update on fichajes for update
  using (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
  with check (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()));

drop policy if exists fichajes_delete on fichajes;
create policy fichajes_delete on fichajes for delete
  using (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()));

-- FIRMAS · idem
drop policy if exists firmas_select on firmas_documentos;
create policy firmas_select on firmas_documentos for select using (
  empleado_id = auth_empleado_id()
  or (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
);


-- ==========================================================================
-- BLOQUE 6 · RLS de tablas que NO estaban documentadas en el repo
-- (existen en la BD real pero no en 02-rls.sql → riesgo de quedar abiertas
--  o de bloquear al socorrista sin que nos demos cuenta)
-- ==========================================================================

-- TITULACIONES_EMPLEADO (DNI, SVB, DEA, socorrismo, PRL, contrato, nómina)
alter table if exists titulaciones_empleado enable row level security;

drop policy if exists tit_select on titulaciones_empleado;
create policy tit_select on titulaciones_empleado for select using (
  empleado_id = auth_empleado_id()
  or (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
);

drop policy if exists tit_write_self on titulaciones_empleado;
create policy tit_write_self on titulaciones_empleado for all
  using (empleado_id = auth_empleado_id())
  with check (empleado_id = auth_empleado_id());

drop policy if exists tit_write_admin on titulaciones_empleado;
create policy tit_write_admin on titulaciones_empleado for all
  using (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()))
  with check (auth_es_admin() and empleado_id in (select id from empleados where empresa_id = auth_empresa()));

-- VISITAS_HOTELES (registro de visitas del coordinador a los hoteles)
alter table if exists visitas_hoteles enable row level security;

drop policy if exists visitas_select on visitas_hoteles;
create policy visitas_select on visitas_hoteles for select
  using (auth_es_admin() and empresa_id = auth_empresa());

drop policy if exists visitas_write on visitas_hoteles;
create policy visitas_write on visitas_hoteles for all
  using (auth_es_admin() and empresa_id = auth_empresa())
  with check (auth_es_admin() and empresa_id = auth_empresa());


-- ==========================================================================
-- BLOQUE 7 · RENDIMIENTO · Índices que faltan
--
-- Con 150 socorristas × 2 fichajes × 365 días ≈ 110.000 filas/año.
-- El panel de admin consulta fichajes filtrando SOLO por fecha, y el índice
-- actual es (empleado_id, hora) → no sirve → escaneo completo de tabla
-- cada 25 segundos, por cada admin/coordinador conectado.
-- ==========================================================================

-- Panel "Puestos en vivo" y "Fichajes del día": filtran por rango de hora
create index if not exists idx_fichajes_hora on fichajes(hora desc);

-- Panel por puesto
create index if not exists idx_fichajes_puesto_hora on fichajes(puesto_id, hora desc);

-- Campana de alertas: solo las abiertas
create index if not exists idx_alertas_pendientes on alertas(fecha_creacion desc) where resuelto = false;

-- Tareas pendientes del socorrista
create index if not exists idx_tareas_pendientes on tareas(empleado_id) where hecha = false;

-- Firmas por código de documento (kit-alta, jornada-YYYY-MM)
create index if not exists idx_firmas_codigo on firmas_documentos(empleado_id, documento_codigo);

-- Inventario: consultas por sección
create index if not exists idx_inv_item on inventario_puesto(item_id);


-- ==========================================================================
-- BLOQUE 8 · SINCRONIZAR SCHEMA · Columnas que existen en la BD real pero
-- NO estaban en sql/01-schema.sql (riesgo: si alguien recrea la BD desde el
-- repo, la app se rompe).
-- Estas líneas son idempotentes, se pueden ejecutar siempre.
-- ==========================================================================

alter table usuarios  add column if not exists nombre text;
alter table usuarios  add column if not exists ultimo_login timestamptz;
alter table usuarios  add column if not exists telefono text;
alter table usuarios  add column if not exists disponible boolean default true;

alter table fichajes  add column if not exists origen_manual boolean default false;
alter table fichajes  add column if not exists registrado_por uuid references usuarios(id) on delete set null;
alter table fichajes  add column if not exists motivo_manual text;


-- ==========================================================================
-- BLOQUE 9 · VERIFICACIÓN · Ejecuta esto al final para comprobar que todo
-- quedó bien. Debe devolver filas para cada tabla crítica.
-- ==========================================================================

select
  tablename,
  policyname,
  cmd as operacion
from pg_policies
where schemaname = 'public'
  and tablename in ('fichajes','firmas_documentos','empleados','usuarios','alertas','documentos_subidos','titulaciones_empleado')
order by tablename, cmd, policyname;

-- Comprobar que existen las funciones helper
select proname as funcion
from pg_proc
where proname in ('auth_rol','auth_empresa','auth_es_admin','auth_es_dueno','auth_empleado_id')
order by proname;
