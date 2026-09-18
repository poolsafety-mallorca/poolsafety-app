-- ==========================================================================
-- PoolSafety · sql/30 · Tareas de dirección para los coordinadores
--
-- POR QUÉ
-- El apartado Coordinación sólo iba en un sentido: Alex y Óscar apuntaban lo
-- que hacían y Adam lo miraba. Para mandarles algo había que llamarles o
-- escribirles por WhatsApp, y ahí se pierde: no queda quién lo pidió, cuándo,
-- ni si se hizo. Esta tabla guarda las tareas que dirección pone a un
-- coordinador, y si el coordinador las ha dado por hechas.
--
-- No se toca la tabla `tareas` que ya existe: aquélla va de coordinador hacia
-- socorrista y apunta a `empleados`. Los coordinadores no tienen ficha de
-- empleado, así que no cabían ahí. Son dos cosas distintas y conviene que
-- sigan separadas.
--
-- Ejecutar con Role postgres en el SQL Editor de Supabase. Idempotente:
-- se puede ejecutar varias veces sin romper nada.
-- ==========================================================================

create table if not exists tareas_coordinador (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,

  -- A quién va dirigida. Es un usuario (coordinador), no un empleado.
  coordinador_id uuid not null references usuarios(id) on delete cascade,

  titulo text not null,
  descripcion text,
  prioridad text default 'media' check (prioridad in ('baja','media','alta')),

  -- Opcional a propósito: muchas tareas son "cuando puedas".
  fecha_limite date,

  hecha boolean default false,
  hecha_el timestamptz,
  hecha_por uuid references usuarios(id) on delete set null,

  -- Quién la mandó, para que quede constancia.
  asignada_por uuid references usuarios(id) on delete set null,
  created_at timestamptz default now()
);

-- Lo que más se consulta: las pendientes de un coordinador, por fecha.
create index if not exists idx_tareas_coord_persona
  on tareas_coordinador(coordinador_id, hecha, fecha_limite);

alter table tareas_coordinador enable row level security;

-- LECTURA · el admin/coordinación de la empresa ve todas las de su empresa,
-- y cada coordinador ve además las suyas propias.
drop policy if exists tareas_coord_select on tareas_coordinador;
create policy tareas_coord_select on tareas_coordinador for select using (
  coordinador_id = auth.uid()
  or (auth_es_admin() and empresa_id = auth_empresa())
);

-- CREAR / BORRAR · sólo el dueño. Un coordinador no se pone tareas a sí mismo
-- ni se las borra: el sentido de esto es que dirección mande y quede rastro.
drop policy if exists tareas_coord_insert on tareas_coordinador;
create policy tareas_coord_insert on tareas_coordinador for insert
  with check (auth_es_dueno() and empresa_id = auth_empresa());

drop policy if exists tareas_coord_delete on tareas_coordinador;
create policy tareas_coord_delete on tareas_coordinador for delete
  using (auth_es_dueno() and empresa_id = auth_empresa());

-- ACTUALIZAR · el dueño puede cambiar lo que quiera. El coordinador puede
-- tocar su propia fila, pero el trigger de abajo le deja sólo marcarla como
-- hecha o deshecha: no puede reescribir la tarea que le han puesto.
drop policy if exists tareas_coord_update on tareas_coordinador;
create policy tareas_coord_update on tareas_coordinador for update
  using (
    coordinador_id = auth.uid()
    or (auth_es_dueno() and empresa_id = auth_empresa())
  )
  with check (
    coordinador_id = auth.uid()
    or (auth_es_dueno() and empresa_id = auth_empresa())
  );

-- El coordinador sólo puede mover el estado, no el contenido.
create or replace function tareas_coord_proteger_contenido()
returns trigger as $$
begin
  if (select rol from usuarios where id = auth.uid()) = 'dueno' then
    return new;
  end if;
  if new.titulo         is distinct from old.titulo
     or new.descripcion is distinct from old.descripcion
     or new.prioridad   is distinct from old.prioridad
     or new.fecha_limite is distinct from old.fecha_limite
     or new.coordinador_id is distinct from old.coordinador_id
     or new.asignada_por   is distinct from old.asignada_por then
    raise exception 'Sólo dirección puede cambiar el contenido de una tarea; tú puedes marcarla como hecha.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_tareas_coord_proteger on tareas_coordinador;
create trigger trg_tareas_coord_proteger
  before update on tareas_coordinador
  for each row execute function tareas_coord_proteger_contenido();
