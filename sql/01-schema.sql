-- ==========================================================================
-- PoolSafety · Esquema de base de datos v1
-- Ejecutar UNA VEZ en Supabase → SQL Editor → New query → pega todo → Run
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 1. EMPRESAS (multi-tenant preparado, hoy solo PoolSafety)
-- ---------------------------------------------------------------------------
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  razon_social text,
  cif text unique,
  domicilio text,
  email_contacto text,
  telefono text,
  logo_url text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 2. USUARIOS · extiende auth.users con rol y empresa
-- ---------------------------------------------------------------------------
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  rol text not null check (rol in ('dueno','coordinador','socorrista')),
  email text not null,
  activo boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_usuarios_empresa on usuarios(empresa_id);

-- ---------------------------------------------------------------------------
-- 3. PUESTOS (hoteles / piscinas / comunidades donde hay socorristas)
-- ---------------------------------------------------------------------------
create table if not exists puestos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  zona text,
  direccion text,
  hora_inicio_default time default '10:00',
  duracion_default int default 8,
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  gps_radio_m int default 50,
  contacto_hotel_nombre text,
  contacto_hotel_tel text,
  activo boolean default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 4. EMPLEADOS (ficha completa - un empleado por usuario tipo 'socorrista')
-- ---------------------------------------------------------------------------
create table if not exists empleados (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid unique references usuarios(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  dni text,
  email text,
  telefono text,
  direccion text,
  numero_ss text,
  iban text,
  contacto_emergencia_nombre text,
  contacto_emergencia_tel text,
  fecha_alta date default current_date,
  fecha_baja date,
  tipo_contrato text default 'Indefinido' check (tipo_contrato in ('Indefinido','Fijo discontinuo','Temporal 6 meses','Prácticas')),
  estado text default 'alta-pendiente' check (estado in ('activo','baja','alta-pendiente','eliminado')),
  foto_url text,
  puesto_id uuid references puestos(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_empleados_empresa on empleados(empresa_id);
create index if not exists idx_empleados_puesto on empleados(puesto_id);
create index if not exists idx_empleados_estado on empleados(estado);

-- ---------------------------------------------------------------------------
-- 5. HORARIOS (asignación empleado -> puesto con turno y días)
-- ---------------------------------------------------------------------------
create table if not exists horarios (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  puesto_id uuid not null references puestos(id) on delete cascade,
  hora_inicio time not null,
  duracion int not null default 8,
  dias text default 'Lun-Vie',
  fecha_desde date default current_date,
  fecha_hasta date,
  activo boolean default true,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_horarios_empleado on horarios(empleado_id, activo);

-- ---------------------------------------------------------------------------
-- 6. FICHAJES (entradas / salidas con GPS)
-- ---------------------------------------------------------------------------
create table if not exists fichajes (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  puesto_id uuid references puestos(id) on delete set null,
  tipo text not null check (tipo in ('entrada','salida')),
  hora timestamptz not null default now(),
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  gps_ok boolean,
  fuera_de_zona boolean default false,
  distancia_m int,
  observaciones text,
  created_at timestamptz default now()
);
create index if not exists idx_fichajes_empleado on fichajes(empleado_id, hora desc);

-- ---------------------------------------------------------------------------
-- 7. DOCUMENTOS EMPRESA (plantillas base: kit-alta, jornada, finiquito)
-- ---------------------------------------------------------------------------
create table if not exists documentos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null,
  titulo text not null,
  subtitulo text,
  contenido_html text,
  grupo text check (grupo in ('alta','mensual','baja','opcional')),
  obligatorio boolean default false,
  norma text,
  orden int default 0,
  activo boolean default true,
  unique(empresa_id, codigo)
);

-- ---------------------------------------------------------------------------
-- 8. FIRMAS DE DOCUMENTOS
-- ---------------------------------------------------------------------------
create table if not exists firmas_documentos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  documento_codigo text not null,
  firma_nombre text not null,
  dni text,
  dispositivo text,
  ip_firma inet,
  aceptados_json jsonb default '{}'::jsonb,
  campos_json jsonb default '{}'::jsonb,
  archivo_pdf_url text,
  fecha_firma timestamptz default now()
);
create index if not exists idx_firmas_empleado on firmas_documentos(empleado_id);

-- ---------------------------------------------------------------------------
-- 9. DOCUMENTOS SUBIDOS (contratos, nóminas, anexos - por coordinador)
-- ---------------------------------------------------------------------------
create table if not exists documentos_subidos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  subido_por uuid references usuarios(id) on delete set null,
  tipo text not null,
  nombre_archivo text not null,
  url_storage text not null,
  pendiente_firma boolean default false,
  firmado_el timestamptz,
  subido_el timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 10. REGISTRO MENSUAL DE JORNADA (uno por empleado/mes)
-- ---------------------------------------------------------------------------
create table if not exists registro_jornada (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  mes int not null check (mes between 1 and 12),
  anio int not null,
  dias_json jsonb default '{}'::jsonb,
  horas_ordinarias numeric(5,2) default 0,
  horas_complementarias numeric(5,2) default 0,
  firmado boolean default false,
  fecha_firma timestamptz,
  firma_nombre text,
  unique(empleado_id, mes, anio)
);

-- ---------------------------------------------------------------------------
-- 11. INVENTARIO ITEMS (plantilla global · Decretos 53/1995 y 137/2008)
-- ---------------------------------------------------------------------------
create table if not exists inventario_items (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  seccion text not null check (seccion in ('botiquin','desa','oxigeno','custom')),
  categoria text,
  obligatorio boolean default false,
  normativa text,
  unidad text default 'ud',
  minimo_recomendado int default 1,
  activo boolean default true
);

-- ---------------------------------------------------------------------------
-- 12. INVENTARIO POR PUESTO (stock real de cada hotel)
-- ---------------------------------------------------------------------------
create table if not exists inventario_puesto (
  id uuid primary key default gen_random_uuid(),
  puesto_id uuid not null references puestos(id) on delete cascade,
  item_id uuid not null references inventario_items(id) on delete cascade,
  stock int default 0,
  minimo int default 1,
  ultima_revision timestamptz,
  revisado_hoy boolean default false,
  caducidad date,
  carga_bala text,
  actualizado_por uuid references usuarios(id) on delete set null,
  updated_at timestamptz default now(),
  unique(puesto_id, item_id)
);
create index if not exists idx_inv_puesto on inventario_puesto(puesto_id);

-- ---------------------------------------------------------------------------
-- 13. ALERTAS (automáticas de stock + manuales del socorrista)
-- ---------------------------------------------------------------------------
create table if not exists alertas (
  id uuid primary key default gen_random_uuid(),
  puesto_id uuid references puestos(id) on delete cascade,
  empleado_id uuid references empleados(id) on delete set null,
  item_id uuid references inventario_items(id) on delete set null,
  tipo text default 'stock_bajo' check (tipo in ('stock_bajo','manual','desa_revision','oxigeno_carga','otro')),
  origen text default 'auto' check (origen in ('auto','socorrista','coordinador')),
  criticidad text default 'media' check (criticidad in ('baja','media','alta')),
  mensaje text,
  cantidad_pedida int,
  resuelto boolean default false,
  fecha_creacion timestamptz default now(),
  resuelto_por uuid references usuarios(id) on delete set null,
  fecha_resolucion timestamptz
);
create index if not exists idx_alertas_abiertas on alertas(resuelto, fecha_creacion desc);

-- ---------------------------------------------------------------------------
-- 14. TAREAS (asignadas por coordinador al socorrista)
-- ---------------------------------------------------------------------------
create table if not exists tareas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id) on delete cascade,
  puesto_id uuid references puestos(id) on delete set null,
  titulo text not null,
  descripcion text,
  prioridad text default 'media' check (prioridad in ('baja','media','alta')),
  fecha date default current_date,
  hecha boolean default false,
  hecha_el timestamptz,
  asignada_por uuid references usuarios(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_tareas_empleado on tareas(empleado_id, fecha desc);

-- ---------------------------------------------------------------------------
-- 15. NOTAS (mensajes informativos del coordinador)
-- ---------------------------------------------------------------------------
create table if not exists notas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id) on delete cascade,
  puesto_id uuid references puestos(id) on delete cascade,
  autor_id uuid references usuarios(id) on delete set null,
  autor_nombre text,
  mensaje text not null,
  leida boolean default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Trigger para actualizar updated_at automáticamente
-- ---------------------------------------------------------------------------
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_empleados_updated on empleados;
create trigger trg_empleados_updated before update on empleados for each row execute function update_updated_at();
drop trigger if exists trg_inventario_updated on inventario_puesto;
create trigger trg_inventario_updated before update on inventario_puesto for each row execute function update_updated_at();
