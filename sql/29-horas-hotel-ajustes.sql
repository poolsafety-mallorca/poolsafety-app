-- ==========================================================================
-- PoolSafety · sql/29 · Corregir a mano las horas facturables de un hotel
--
-- POR QUÉ
-- El parte de horas de un hotel se calcula solo a partir de los fichajes y del
-- horario contratado. Cuando algo no cuadra (un socorrista se olvidó de fichar,
-- una entrada quedó mal, se acordó otra cosa con el hotel) no había forma de
-- tocarlo desde la app: había que exportar el CSV, corregirlo en Excel y
-- mandarlo a mano. Y al hacerlo así los totales de abajo se quedaban con las
-- cifras viejas, porque nadie recalcula un Excel: el de Inturotel Cala Azul de
-- agosto de 2026 decía 327,5 h facturadas cuando la suma de sus propias filas
-- daba 372 h. Casi 45 horas de diferencia en una factura.
--
-- Esta tabla guarda la corrección DÍA A DÍA, sin tocar los fichajes. Así:
--   · El fichaje original queda intacto (es el registro horario del trabajador,
--     y ese no se toca para cuadrar una factura del hotel).
--   · Queda constancia de qué día se corrigió, a qué valor, quién y cuándo.
--   · El total se recalcula siempre sumando lo que se ve, así que no puede
--     volver a pasar que el pie diga una cosa y las filas otra.
--
-- Ejecutar con Role postgres en el SQL Editor de Supabase. Idempotente.
-- ==========================================================================

create table if not exists horas_hotel_ajustes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  puesto_id  uuid not null references puestos(id) on delete cascade,
  mes        text not null,          -- 'YYYY-MM'
  dia        int  not null check (dia between 1 and 31),

  -- Valores corregidos. Un nulo significa "este dato no se toca, vale el que
  -- calcule la app": así se puede corregir sólo lo facturado y dejar el
  -- control tal cual, que es lo más habitual.
  facturado_h numeric(6,2) check (facturado_h is null or (facturado_h >= 0 and facturado_h <= 48)),
  control_h   numeric(6,2) check (control_h   is null or (control_h   >= 0 and control_h   <= 48)),
  socorristas int check (socorristas is null or (socorristas >= 0 and socorristas <= 50)),
  personal    text,
  nota        text,

  actualizado_por uuid references usuarios(id) on delete set null,
  actualizado_at  timestamptz not null default now(),

  unique (puesto_id, mes, dia)
);

create index if not exists horas_hotel_ajustes_idx
  on horas_hotel_ajustes (puesto_id, mes);

comment on table horas_hotel_ajustes is
  'Correcciones manuales del parte de horas de un hotel, día a día. No modifica los fichajes.';
comment on column horas_hotel_ajustes.facturado_h is
  'Horas facturadas de ese día. Nulo = usar lo que calcule la app.';
comment on column horas_hotel_ajustes.control_h is
  'Horas de control y fichaje de ese día. Nulo = usar lo que calcule la app.';

-- --------------------------------------------------------------------------
-- Permisos
--   Leer  : administrador y coordinadores (necesitan ver el parte completo).
--   Tocar : SÓLO el administrador. Esto es lo que va en una factura; que lo
--           cambie una sola persona. Si algún día quieres que los
--           coordinadores también puedan, cambia auth_es_dueno() por
--           auth_es_admin() en las tres políticas de abajo.
-- --------------------------------------------------------------------------
alter table horas_hotel_ajustes enable row level security;

drop policy if exists hha_select on horas_hotel_ajustes;
create policy hha_select on horas_hotel_ajustes
  for select using (empresa_id = auth_empresa() and auth_es_admin());

drop policy if exists hha_insert on horas_hotel_ajustes;
create policy hha_insert on horas_hotel_ajustes
  for insert with check (empresa_id = auth_empresa() and auth_es_dueno());

drop policy if exists hha_update on horas_hotel_ajustes;
create policy hha_update on horas_hotel_ajustes
  for update using (empresa_id = auth_empresa() and auth_es_dueno());

drop policy if exists hha_delete on horas_hotel_ajustes;
create policy hha_delete on horas_hotel_ajustes
  for delete using (empresa_id = auth_empresa() and auth_es_dueno());

-- ==========================================================================
-- COMPROBACIÓN · ejecuta esto y debe devolver las 4 políticas y 0 filas
-- ==========================================================================
select policyname, cmd from pg_policies where tablename = 'horas_hotel_ajustes' order by policyname;
select count(*) as correcciones_guardadas from horas_hotel_ajustes;
