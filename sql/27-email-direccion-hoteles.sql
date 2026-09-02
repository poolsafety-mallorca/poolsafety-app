-- ==========================================================================
-- PoolSafety · sql/27 · Correo de dirección de cada hotel
--
-- Para poder enviarles los partes de incidencia que ocurren en su instalación.
--
-- Ejecutar con Role postgres en el SQL Editor de Supabase. Idempotente.
-- ==========================================================================

alter table puestos add column if not exists email_direccion text;

comment on column puestos.email_direccion is
  'Correo de la dirección del hotel. Destino de los partes de incidencia de ese hotel.';

-- --------------------------------------------------------------------------
-- Correos facilitados por el cliente el 2026-09-01.
-- Se buscan por nombre con ILIKE porque en la BD pueden estar con el prefijo
-- del grupo ("Inturotel Esmeralda Park"). Al final hay un SELECT para
-- comprobar QUÉ hoteles han quedado con correo: si alguno sale vacío es que
-- el nombre no coincide y hay que ponerlo a mano.
-- --------------------------------------------------------------------------
update puestos set email_direccion = 'direccio.epark@inturotel.es'
  where nombre ilike '%esmeralda%park%';

update puestos set email_direccion = 'direccio.cazul@inturotel.es'
  where nombre ilike '%dragoland%';

-- COMPROBACIÓN · ejecuta esto y mira el resultado:
--   · Si "Esmeralda Park" o "Dragoland" NO aparecen con su correo, el nombre
--     en la BD es distinto del que buscamos. Dímelo y lo ajustamos.
--   · El resto de hoteles saldrán con el correo vacío, que es lo esperado
--     hasta que se vayan rellenando.
select nombre, coalesce(email_direccion, '— sin correo —') as correo
from puestos
where activo = true
order by (email_direccion is null), nombre;
