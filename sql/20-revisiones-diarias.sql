-- ============================================================
-- PoolSafety · Tabla de revisiones diarias (auditoría)
-- Ejecutar en Supabase SQL Editor con Role postgres. Idempotente.
-- ============================================================
-- Hasta ahora al guardar una revisión de botiquín / DESA / oxígeno
-- solo se actualizaba `inventario_puesto.ultima_revision` (sin dejar
-- rastro de QUIÉN hizo la revisión) y se insertaba una alerta SÓLO
-- si había observaciones.
--
-- Con esta tabla auditamos cada revisión: quién, cuándo, en qué
-- hotel y unidad, cuántos items marcó y sus observaciones. Sirve
-- para el nuevo panel del admin y para el resumen exportable.
-- ============================================================

create table if not exists revisiones_diarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  puesto_id uuid not null references puestos(id) on delete cascade,
  unidad_id uuid references unidades_material(id) on delete set null,
  seccion text not null check (seccion in ('botiquin','desa','oxigeno')),
  empleado_id uuid references empleados(id) on delete set null,
  empleado_nombre text,             -- cacheado para históricos aunque el empleado se borre
  fecha timestamptz not null default now(),
  items_ok int,                     -- cuántos artículos marcó el socorrista
  items_total int,                  -- cuántos había en total
  parcial boolean default false,    -- true si items_ok < items_total
  observaciones text,
  created_at timestamptz default now()
);

-- Índices útiles: filtro por hotel/fecha y por empresa/fecha
-- Nota: NO se puede usar un índice parcial con `current_date` porque
-- Postgres exige funciones IMMUTABLE en el WHERE (current_date es STABLE).
-- Los dos índices completos cubren bien las consultas del panel.
create index if not exists idx_revdiarias_puesto_fecha
  on revisiones_diarias(puesto_id, fecha desc);
create index if not exists idx_revdiarias_empresa_fecha
  on revisiones_diarias(empresa_id, fecha desc);

-- ============================================================
-- RLS: admin/coord de la empresa ve todo; socorrista solo lo suyo.
-- INSERT: cualquiera de la misma empresa (socorrista ficha sus revs).
-- ============================================================
alter table revisiones_diarias enable row level security;

drop policy if exists revdiarias_select on revisiones_diarias;
create policy revdiarias_select on revisiones_diarias
  for select using (
    empresa_id = auth_empresa()
    and (auth_es_admin() or empleado_id = auth_empleado_id())
  );

drop policy if exists revdiarias_insert on revisiones_diarias;
create policy revdiarias_insert on revisiones_diarias
  for insert with check (
    empresa_id = auth_empresa()
    and (auth_es_admin() or empleado_id = auth_empleado_id())
  );

drop policy if exists revdiarias_delete on revisiones_diarias;
create policy revdiarias_delete on revisiones_diarias
  for delete using (
    empresa_id = auth_empresa() and auth_es_dueno()
  );

-- Realtime para que el panel del admin vea las revisiones al momento
alter publication supabase_realtime add table revisiones_diarias;

-- ============================================================
-- Verificación
-- ============================================================
select column_name, data_type from information_schema.columns
  where table_name = 'revisiones_diarias' order by ordinal_position;
