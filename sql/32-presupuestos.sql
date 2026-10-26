-- ==========================================================================
-- PoolSafety · sql/32 · Presupuestos para clientes
--
-- POR QUÉ
-- Los presupuestos se hacían en un Excel que se copiaba y se editaba a mano.
-- No quedaba registro de qué se ofreció a quién ni a qué precio, y el número
-- de presupuesto se llevaba de memoria. Esto lo guarda en la app, con su
-- numeración, y permite sacar el PDF de presentación.
--
-- DECISIONES
-- · `servicios` y `extras` van en jsonb y no en tablas aparte. Son líneas que
--   sólo tienen sentido dentro de su presupuesto, nunca se consultan sueltas
--   y no se cruzan con nada. Dos tablas más con sus RLS no aportaban nada.
-- · NO se guarda ningún total. El presupuesto fija número de socorristas y
--   precio/hora; se factura sobre horas realmente prestadas al cierre de mes.
--   Guardar un total invitaría a que alguien lo tomara por precio cerrado.
-- · Sólo el dueño. Un coordinador no ve ni crea presupuestos: son precios.
--
-- Ejecutar con Role postgres en el SQL Editor de Supabase. Idempotente.
-- ==========================================================================

create table if not exists presupuestos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,

  numero text not null,
  fecha date not null default current_date,
  validez_dias int default 30,
  estado text default 'borrador' check (estado in ('borrador','enviado','aceptado','rechazado')),

  -- Datos del cliente, tal cual se imprimen en el documento.
  cliente_nombre text not null,
  cliente_att text,
  cliente_direccion text,
  cliente_cif text,
  cliente_instalaciones text,

  precio_hora numeric(8,2),
  iva_pct numeric(5,2) default 21,

  -- [{instalacion, periodo, horario, socorristas}]
  servicios jsonb default '[]'::jsonb,
  -- [{concepto, detalle, uds, precio, periodicidad, incluido}]
  extras jsonb default '[]'::jsonb,

  notas text,
  creado_por uuid references usuarios(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_presupuestos_empresa on presupuestos(empresa_id, fecha desc);
create unique index if not exists idx_presupuestos_numero on presupuestos(empresa_id, numero);

alter table presupuestos enable row level security;

-- SOLO EL DUEÑO. Aquí hay precios: el coordinador no entra.
drop policy if exists presupuestos_select on presupuestos;
create policy presupuestos_select on presupuestos for select
  using (auth_es_dueno() and empresa_id = auth_empresa());

drop policy if exists presupuestos_insert on presupuestos;
create policy presupuestos_insert on presupuestos for insert
  with check (auth_es_dueno() and empresa_id = auth_empresa());

drop policy if exists presupuestos_update on presupuestos;
create policy presupuestos_update on presupuestos for update
  using (auth_es_dueno() and empresa_id = auth_empresa())
  with check (auth_es_dueno() and empresa_id = auth_empresa());

drop policy if exists presupuestos_delete on presupuestos;
create policy presupuestos_delete on presupuestos for delete
  using (auth_es_dueno() and empresa_id = auth_empresa());

-- Siguiente número libre del año en curso: PRE-2026-0001, PRE-2026-0002…
create or replace function siguiente_numero_presupuesto()
returns text as $$
declare
  anio text := to_char(current_date, 'YYYY');
  ultimo int;
begin
  select coalesce(max((regexp_replace(numero, '^PRE-\d{4}-', ''))::int), 0)
    into ultimo
    from presupuestos
   where empresa_id = auth_empresa()
     and numero ~ ('^PRE-' || anio || '-\d+$');
  return 'PRE-' || anio || '-' || lpad((ultimo + 1)::text, 4, '0');
end;
$$ language plpgsql security definer;
