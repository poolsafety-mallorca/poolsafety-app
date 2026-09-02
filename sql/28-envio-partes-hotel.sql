-- ==========================================================================
-- PoolSafety · sql/28 · Registro del envío de partes al hotel
--
-- Deja constancia de a quién y cuándo se ha mandado cada parte de incidencia.
-- Sirve para tres cosas:
--   1) No mandar dos veces el mismo parte al mismo hotel.
--   2) Poder demostrar (ante el hotel o ante una reclamación) que el parte
--      se comunicó, a qué dirección y en qué fecha.
--   3) Saber cuáles quedaron pendientes y por qué.
--
-- Ejecutar con Role postgres en el SQL Editor de Supabase. Idempotente.
-- Requiere haber ejecutado antes sql/27 (columna puestos.email_direccion).
-- ==========================================================================

alter table incidencias add column if not exists email_enviado_at timestamptz;
alter table incidencias add column if not exists email_enviado_a   text;
alter table incidencias add column if not exists email_modo        text;
alter table incidencias add column if not exists email_error       text;

comment on column incidencias.email_enviado_at is
  'Fecha y hora en que el parte se envió por correo a la dirección del hotel. Nulo = no enviado.';
comment on column incidencias.email_enviado_a is
  'Dirección de correo a la que se envió. Se guarda tal cual se usó, aunque luego cambie la ficha del hotel.';
comment on column incidencias.email_modo is
  'operativo = resumen sin identificar a la víctima. integro = parte completo en PDF adjunto.';
comment on column incidencias.email_error is
  'Último motivo por el que falló el envío, si falló. Se limpia al enviarse bien.';

-- Para localizar rápido los que quedan por mandar.
create index if not exists incidencias_email_pendiente_idx
  on incidencias (empresa_id, fecha_incidente desc)
  where email_enviado_at is null;

-- --------------------------------------------------------------------------
-- COMPROBACIÓN · qué partes hay pendientes de mandar y a dónde irían
-- --------------------------------------------------------------------------
select i.numero_parte,
       i.fecha_incidente::date          as fecha,
       p.nombre                          as hotel,
       coalesce(p.email_direccion, '— sin correo —') as destino,
       case when i.email_enviado_at is null then 'PENDIENTE'
            else 'enviado ' || i.email_enviado_at::date end as estado
from incidencias i
left join puestos p on p.id = i.puesto_id
where i.estado = 'firmada'
order by i.fecha_incidente desc;
