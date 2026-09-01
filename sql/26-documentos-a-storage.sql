-- ==========================================================================
-- PoolSafety · sql/26 · Documentos laborales fuera de la base de datos
--
-- HOY: los DNI, contratos, nóminas y certificados se guardan como data URL en
-- base64 dentro de `titulaciones_empleado.documento_url`. Hasta 20 MB por
-- fichero (~27 MB ya en base64) metidos en una fila de Postgres.
--
-- OBJETIVO: guardarlos en Supabase Storage y dejar en la BD solo la ruta.
--
-- POR QUÉ UN BUCKET NUEVO Y PRIVADO:
-- El bucket existente `empleados-media` es PÚBLICO. Sirve para fotos de perfil
-- y PDFs firmados, pero un DNI o un contrato en un bucket público queda
-- accesible para cualquiera que tenga el enlace. Hoy esos documentos están
-- protegidos por RLS: solo los ven el propio trabajador y admin/coordinación.
-- Moverlos a un bucket público sería EMPEORAR su protección, no mejorarla.
-- Así que van a un bucket privado con sus propias políticas, y se leen con
-- enlaces firmados que caducan.
--
-- Idempotente. Ejecutar con Role postgres en el SQL Editor de Supabase.
-- ==========================================================================

-- 1) Columna con la ruta dentro del bucket. Se añade SIN tocar `documento_url`:
--    la migración es en dos fases y el base64 no se borra hasta comprobar que
--    la copia en Storage se descarga bien.
alter table titulaciones_empleado add column if not exists documento_storage_path text;

comment on column titulaciones_empleado.documento_storage_path is
  'Ruta del fichero en el bucket privado documentos-laborales. Si está puesta, manda sobre documento_url.';

-- 2) Bucket privado
insert into storage.buckets (id, name, public)
values ('documentos-laborales', 'documentos-laborales', false)
on conflict (id) do update set public = false;

-- 3) Políticas de acceso al bucket.
--    Ruta: titulaciones/{empleado_id}/{titulacion_id}.{ext}
--    → (storage.foldername(name))[2] es el empleado_id.
--    auth_es_admin() ya devuelve true para 'dueno' y 'coordinador'.

drop policy if exists docs_lab_select on storage.objects;
create policy docs_lab_select on storage.objects for select
  using (
    bucket_id = 'documentos-laborales' and (
      auth_es_admin()
      or (storage.foldername(name))[2] = auth_empleado_id()::text
    )
  );

drop policy if exists docs_lab_insert on storage.objects;
create policy docs_lab_insert on storage.objects for insert
  with check (
    bucket_id = 'documentos-laborales' and (
      auth_es_admin()
      or (storage.foldername(name))[2] = auth_empleado_id()::text
    )
  );

drop policy if exists docs_lab_update on storage.objects;
create policy docs_lab_update on storage.objects for update
  using (
    bucket_id = 'documentos-laborales' and (
      auth_es_admin()
      or (storage.foldername(name))[2] = auth_empleado_id()::text
    )
  );

-- Borrar del bucket: solo administración. Un fichero borrado no se recupera.
drop policy if exists docs_lab_delete on storage.objects;
create policy docs_lab_delete on storage.objects for delete
  using (bucket_id = 'documentos-laborales' and auth_es_admin());

-- Comprobación tras ejecutar:
--   select id, public from storage.buckets where id = 'documentos-laborales';
--   select count(*) filter (where documento_url like 'data:%') as en_base64,
--          count(*) filter (where documento_storage_path is not null) as en_storage
--   from titulaciones_empleado;
