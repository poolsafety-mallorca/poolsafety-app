-- ============================================================
-- PoolSafety · Parte de incidencias/accidentes
-- Ejecutar en Supabase SQL Editor. Idempotente (usa IF NOT EXISTS).
-- ============================================================

-- 1) Tabla incidencias
create table if not exists incidencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  empleado_id uuid references empleados(id) on delete set null,
  puesto_id uuid references puestos(id) on delete set null,
  numero_parte text,                       -- formato INC-2026-0001 (autogenerado)
  fecha_incidente timestamptz not null default now(),
  fecha_creado timestamptz not null default now(),

  -- Datos de la víctima
  victima_nombre text,
  victima_edad int,
  victima_sexo text,                       -- 'hombre','mujer','otro','ns'
  victima_dni text,
  victima_telefono text,
  victima_nacionalidad text,
  victima_hotel_habitacion text,
  es_menor boolean default false,
  familiar_avisado boolean default false,
  familiar_hora timestamptz,
  familiar_nombre text,

  -- Circunstancias
  tipo_incidente text,                     -- 'ahogamiento','caida','corte','golpe','insolacion','picadura','alergia','otros'
  ubicacion_descripcion text,              -- p.ej. "Piscina infantil, esquina noreste"
  circunstancias text,                     -- descripción libre de qué pasó
  testigos text,                           -- nombres/contactos

  -- Estado víctima al llegar el socorrista
  consciente boolean,
  respira boolean,
  sangrado boolean,
  dolor_zonas jsonb default '[]'::jsonb,   -- array de zonas marcadas: ["cabeza-frontal","torso-izq",...]
  observaciones_medicas text,

  -- Actuación realizada
  actuacion text,
  tecnicas_aplicadas jsonb default '[]'::jsonb,  -- ["rcp","desa","oxigeno","vendaje","pls","hemostasia","posicion_seguridad"]
  material_usado jsonb default '[]'::jsonb,      -- [{item_id, nombre, cantidad, unidad}]

  -- Derivación
  derivacion text,                         -- 'atendida_puesto','traslado_propio','ambulancia','hospital','rechaza_atencion'
  ambulancia_numero text,                  -- matrícula o identificativo
  ambulancia_hora timestamptz,
  hospital text,

  -- Firma del socorrista
  firma_nombre text,
  firma_dni text,
  firma_imagen text,                       -- base64 PNG del canvas
  firma_gps_lat numeric(10,7),
  firma_gps_lng numeric(10,7),
  dispositivo text,                        -- p.ej. "móvil socorrista"

  -- PDF generado
  archivo_pdf_url text,

  -- Estado del parte
  estado text not null default 'firmada',  -- 'borrador','firmada','archivada'
  observaciones_admin text                 -- notas internas del admin (no imprimir en PDF si no se quiere)
);

-- 2) Índices para búsqueda por empresa/fecha/estado
create index if not exists incidencias_empresa_idx on incidencias(empresa_id, fecha_incidente desc);
create index if not exists incidencias_empleado_idx on incidencias(empleado_id);
create index if not exists incidencias_puesto_idx on incidencias(puesto_id);
create index if not exists incidencias_estado_idx on incidencias(estado) where estado <> 'archivada';

-- 3) RLS
alter table incidencias enable row level security;

drop policy if exists incidencias_select on incidencias;
create policy incidencias_select on incidencias
  for select using (
    empresa_id = auth_empresa()
    and (auth_es_admin() or empleado_id = auth_empleado_id())
  );

drop policy if exists incidencias_insert on incidencias;
create policy incidencias_insert on incidencias
  for insert with check (
    empresa_id = auth_empresa()
    and (auth_es_admin() or empleado_id = auth_empleado_id())
  );

drop policy if exists incidencias_update on incidencias;
create policy incidencias_update on incidencias
  for update using (
    empresa_id = auth_empresa()
    and (auth_es_admin() or (empleado_id = auth_empleado_id() and estado = 'borrador'))
  );

drop policy if exists incidencias_delete on incidencias;
create policy incidencias_delete on incidencias
  for delete using (
    empresa_id = auth_empresa() and auth_es_dueno()
  );

-- 4) Realtime para que aparezcan al momento en el panel del coord
alter publication supabase_realtime add table incidencias;

-- 5) Auto-generar numero_parte tipo INC-2026-0001 al insertar
create or replace function generar_numero_parte()
returns trigger as $$
declare
  anio int := extract(year from new.fecha_incidente);
  seq int;
begin
  if new.numero_parte is null or new.numero_parte = '' then
    select coalesce(max(cast(regexp_replace(numero_parte, '^INC-\d+-', '') as int)), 0) + 1
      into seq
      from incidencias
      where empresa_id = new.empresa_id
        and numero_parte ~ ('^INC-' || anio::text || '-\d+$');
    new.numero_parte := 'INC-' || anio || '-' || lpad(seq::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists incidencias_numero on incidencias;
create trigger incidencias_numero
  before insert on incidencias
  for each row execute function generar_numero_parte();

-- 6) Función helper: descontar stock del botiquín cuando se usa material.
--    Llamada desde la app tras crear la incidencia. Es idempotente por item_id.
create or replace function descontar_material_incidencia(
  p_puesto_id uuid,
  p_material jsonb                        -- [{item_id, cantidad}, ...]
) returns void as $$
declare
  m jsonb;
begin
  for m in select * from jsonb_array_elements(p_material) loop
    update inventario_puesto
      set stock = greatest(0, stock - coalesce((m->>'cantidad')::int, 0))
      where puesto_id = p_puesto_id
        and item_id = (m->>'item_id')::uuid;
  end loop;
end;
$$ language plpgsql;

-- ============================================================
-- Verificación
-- select column_name, data_type from information_schema.columns where table_name='incidencias' order by ordinal_position;
-- select * from pg_policies where tablename='incidencias';
-- ============================================================
