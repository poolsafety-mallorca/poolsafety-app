-- ==========================================================================
-- PoolSafety · Row Level Security (RLS)
-- Ejecutar DESPUÉS del schema.
-- Reglas:
--   - Dueño y coordinador: acceso total a datos de SU empresa
--   - Socorrista: solo sus propios datos + datos públicos (puestos, plantillas)
-- ==========================================================================

-- Función helper: obtiene el rol del usuario actual
create or replace function auth_rol()
returns text as $$
  select rol from usuarios where id = auth.uid();
$$ language sql stable security definer;

-- Función helper: obtiene la empresa del usuario actual
create or replace function auth_empresa()
returns uuid as $$
  select empresa_id from usuarios where id = auth.uid();
$$ language sql stable security definer;

-- Función helper: ¿es dueño o coordinador?
create or replace function auth_es_admin()
returns boolean as $$
  select rol in ('dueno','coordinador') from usuarios where id = auth.uid();
$$ language sql stable security definer;

-- Función helper: obtiene el empleado_id del usuario actual
create or replace function auth_empleado_id()
returns uuid as $$
  select id from empleados where usuario_id = auth.uid();
$$ language sql stable security definer;

-- ---------------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------------
alter table empresas enable row level security;
alter table usuarios enable row level security;
alter table puestos enable row level security;
alter table empleados enable row level security;
alter table horarios enable row level security;
alter table fichajes enable row level security;
alter table documentos_empresa enable row level security;
alter table firmas_documentos enable row level security;
alter table documentos_subidos enable row level security;
alter table registro_jornada enable row level security;
alter table inventario_items enable row level security;
alter table inventario_puesto enable row level security;
alter table alertas enable row level security;
alter table tareas enable row level security;
alter table notas enable row level security;

-- ---------------------------------------------------------------------------
-- EMPRESAS
-- ---------------------------------------------------------------------------
drop policy if exists empresas_select on empresas;
create policy empresas_select on empresas for select using (id = auth_empresa());

-- ---------------------------------------------------------------------------
-- USUARIOS
-- ---------------------------------------------------------------------------
drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios for select using (
  id = auth.uid() or (auth_es_admin() and empresa_id = auth_empresa())
);
drop policy if exists usuarios_insert on usuarios;
create policy usuarios_insert on usuarios for insert with check (auth_es_admin());
drop policy if exists usuarios_update on usuarios;
create policy usuarios_update on usuarios for update using (auth_es_admin() and empresa_id = auth_empresa());

-- ---------------------------------------------------------------------------
-- PUESTOS (todos los de la empresa pueden ver, solo admin edita)
-- ---------------------------------------------------------------------------
drop policy if exists puestos_select on puestos;
create policy puestos_select on puestos for select using (empresa_id = auth_empresa());
drop policy if exists puestos_admin on puestos;
create policy puestos_admin on puestos for all using (auth_es_admin() and empresa_id = auth_empresa()) with check (auth_es_admin() and empresa_id = auth_empresa());

-- ---------------------------------------------------------------------------
-- EMPLEADOS
-- ---------------------------------------------------------------------------
drop policy if exists empleados_select on empleados;
create policy empleados_select on empleados for select using (
  empresa_id = auth_empresa() and (auth_es_admin() or usuario_id = auth.uid())
);
drop policy if exists empleados_admin on empleados;
create policy empleados_admin on empleados for all using (
  auth_es_admin() and empresa_id = auth_empresa()
) with check (auth_es_admin() and empresa_id = auth_empresa());
-- El propio empleado puede actualizar su foto y algunos campos
drop policy if exists empleados_self_update on empleados;
create policy empleados_self_update on empleados for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ---------------------------------------------------------------------------
-- HORARIOS
-- ---------------------------------------------------------------------------
drop policy if exists horarios_select on horarios;
create policy horarios_select on horarios for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists horarios_admin on horarios;
create policy horarios_admin on horarios for all using (auth_es_admin()) with check (auth_es_admin());

-- ---------------------------------------------------------------------------
-- FICHAJES (socorrista solo ve/crea los suyos; admin ve todos)
-- ---------------------------------------------------------------------------
drop policy if exists fichajes_select on fichajes;
create policy fichajes_select on fichajes for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists fichajes_insert on fichajes;
create policy fichajes_insert on fichajes for insert with check (
  empleado_id = auth_empleado_id() or auth_es_admin()
);

-- ---------------------------------------------------------------------------
-- DOCUMENTOS EMPRESA (plantillas visibles a todos, solo admin edita)
-- ---------------------------------------------------------------------------
drop policy if exists doce_select on documentos_empresa;
create policy doce_select on documentos_empresa for select using (empresa_id = auth_empresa());
drop policy if exists doce_admin on documentos_empresa;
create policy doce_admin on documentos_empresa for all using (auth_es_admin() and empresa_id = auth_empresa()) with check (auth_es_admin() and empresa_id = auth_empresa());

-- ---------------------------------------------------------------------------
-- FIRMAS DOCUMENTOS
-- ---------------------------------------------------------------------------
drop policy if exists firmas_select on firmas_documentos;
create policy firmas_select on firmas_documentos for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists firmas_insert on firmas_documentos;
create policy firmas_insert on firmas_documentos for insert with check (
  empleado_id = auth_empleado_id() or auth_es_admin()
);

-- ---------------------------------------------------------------------------
-- DOCUMENTOS SUBIDOS
-- ---------------------------------------------------------------------------
drop policy if exists docsub_select on documentos_subidos;
create policy docsub_select on documentos_subidos for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists docsub_admin on documentos_subidos;
create policy docsub_admin on documentos_subidos for all using (auth_es_admin()) with check (auth_es_admin());

-- ---------------------------------------------------------------------------
-- REGISTRO JORNADA
-- ---------------------------------------------------------------------------
drop policy if exists rjornada_select on registro_jornada;
create policy rjornada_select on registro_jornada for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists rjornada_write on registro_jornada;
create policy rjornada_write on registro_jornada for all using (
  auth_es_admin() or empleado_id = auth_empleado_id()
) with check (
  auth_es_admin() or empleado_id = auth_empleado_id()
);

-- ---------------------------------------------------------------------------
-- INVENTARIO ITEMS (plantilla global visible a todos)
-- ---------------------------------------------------------------------------
drop policy if exists invitems_select on inventario_items;
create policy invitems_select on inventario_items for select using (true);
drop policy if exists invitems_admin on inventario_items;
create policy invitems_admin on inventario_items for all using (auth_es_admin()) with check (auth_es_admin());

-- ---------------------------------------------------------------------------
-- INVENTARIO POR PUESTO (socorrista lee su puesto, admin todo)
-- ---------------------------------------------------------------------------
drop policy if exists invp_select on inventario_puesto;
create policy invp_select on inventario_puesto for select using (
  auth_es_admin() or puesto_id in (select puesto_id from empleados where usuario_id = auth.uid())
);
drop policy if exists invp_write on inventario_puesto;
create policy invp_write on inventario_puesto for all using (
  auth_es_admin() or puesto_id in (select puesto_id from empleados where usuario_id = auth.uid())
) with check (
  auth_es_admin() or puesto_id in (select puesto_id from empleados where usuario_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- ALERTAS
-- ---------------------------------------------------------------------------
drop policy if exists alertas_select on alertas;
create policy alertas_select on alertas for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists alertas_insert on alertas;
create policy alertas_insert on alertas for insert with check (true);
drop policy if exists alertas_admin on alertas;
create policy alertas_admin on alertas for update using (auth_es_admin()) with check (auth_es_admin());

-- ---------------------------------------------------------------------------
-- TAREAS
-- ---------------------------------------------------------------------------
drop policy if exists tareas_select on tareas;
create policy tareas_select on tareas for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists tareas_admin on tareas;
create policy tareas_admin on tareas for all using (auth_es_admin()) with check (auth_es_admin());
drop policy if exists tareas_self_update on tareas;
create policy tareas_self_update on tareas for update using (empleado_id = auth_empleado_id()) with check (empleado_id = auth_empleado_id());

-- ---------------------------------------------------------------------------
-- NOTAS
-- ---------------------------------------------------------------------------
drop policy if exists notas_select on notas;
create policy notas_select on notas for select using (
  auth_es_admin() or empleado_id = auth_empleado_id()
);
drop policy if exists notas_admin on notas;
create policy notas_admin on notas for all using (auth_es_admin()) with check (auth_es_admin());
