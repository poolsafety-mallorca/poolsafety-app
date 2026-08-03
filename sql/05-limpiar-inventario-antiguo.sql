-- ==========================================================================
-- PoolSafety · Limpiar productos antiguos del BOTIQUÍN
--
-- Objetivo: dejar SOLO los 22 productos reales que usa la empresa y borrar
-- los que se cargaron al principio como plantilla genérica (los que están a 0).
--
-- ⚠️ NO toca las secciones DESA ni Oxigenoterapia — esas se quedan igual.
-- ⚠️ Ejecuta los pasos EN ORDEN. El paso 1 solo mira, no borra nada.
-- ==========================================================================


-- ==========================================================================
-- PASO 1 · MIRAR (no borra nada) · Qué productos se van a eliminar
-- Revisa la lista antes de continuar. Si ves alguno que SÍ queréis
-- conservar, dímelo y lo saco de la limpieza.
-- ==========================================================================
select
  i.nombre                       as producto_a_borrar,
  i.categoria,
  count(ip.id)                   as en_cuantos_hoteles,
  coalesce(sum(ip.stock), 0)     as stock_total_actual
from inventario_items i
left join inventario_puesto ip on ip.item_id = i.id
where i.seccion = 'botiquin'
  and i.nombre not in (
    'Agua oxigenada botella 250 ml','Alcohol 70º botella 250 ml','Algodón 100 g',
    'Caja tiritas 19x72 mm (20 uds)','Clorhexidina spray acuosa 2% 100 ml',
    'Esparadrapo papel hipoalergénico 1,25 cm x 5 m','Esparadrapo papel hipoalergénico 2,5 cm x 5 m',
    'Gasas estériles algodón 20x20 cm (sobres 5 uds)','Guantes de nitrilo talla M (par)',
    'Pinza de disección 11 cm','Suero fisiológico 5 ml (6 uds)','Tijera cirugía recta 11 cm',
    'Tiritas sin cortar plástico 1 m x 6 cm','Venda crepé 7 cm x 4 m',
    'Venda de algodón 5 cm x 5 m','Venda de algodón 7 cm x 5 m','Venda de algodón 10 cm x 5 m',
    'Diclofenaco','Tensoplast (venda adhesiva elástica)',
    'Steri-Strip (tiras aproximación heridas)','Povidona yodada 100 ml','Maletín botiquín'
  )
group by i.id, i.nombre, i.categoria
order by stock_total_actual desc, i.nombre;

-- 💡 Fíjate en la columna "stock_total_actual":
--    · Si es 0 → nadie lo ha usado nunca, se puede borrar tranquilamente.
--    · Si es > 0 → alguien apuntó existencias de ese producto. Piénsalo antes.


-- ==========================================================================
-- PASO 2 · BORRAR el stock por hotel de esos productos
-- (esto es lo que hace que desaparezcan de la app)
-- ==========================================================================
delete from inventario_puesto
where item_id in (
  select id from inventario_items
  where seccion = 'botiquin'
    and nombre not in (
      'Agua oxigenada botella 250 ml','Alcohol 70º botella 250 ml','Algodón 100 g',
      'Caja tiritas 19x72 mm (20 uds)','Clorhexidina spray acuosa 2% 100 ml',
      'Esparadrapo papel hipoalergénico 1,25 cm x 5 m','Esparadrapo papel hipoalergénico 2,5 cm x 5 m',
      'Gasas estériles algodón 20x20 cm (sobres 5 uds)','Guantes de nitrilo talla M (par)',
      'Pinza de disección 11 cm','Suero fisiológico 5 ml (6 uds)','Tijera cirugía recta 11 cm',
      'Tiritas sin cortar plástico 1 m x 6 cm','Venda crepé 7 cm x 4 m',
      'Venda de algodón 5 cm x 5 m','Venda de algodón 7 cm x 5 m','Venda de algodón 10 cm x 5 m',
      'Diclofenaco','Tensoplast (venda adhesiva elástica)',
      'Steri-Strip (tiras aproximación heridas)','Povidona yodada 100 ml','Maletín botiquín'
    )
);


-- ==========================================================================
-- PASO 3 · BORRAR los productos del catálogo maestro
-- Así ya no aparecen tampoco al añadir productos nuevos.
-- Las alertas antiguas que los mencionaran se quedan (su item_id pasa a
-- null automáticamente), no se pierde el histórico de avisos.
-- ==========================================================================
delete from inventario_items
where seccion = 'botiquin'
  and nombre not in (
    'Agua oxigenada botella 250 ml','Alcohol 70º botella 250 ml','Algodón 100 g',
    'Caja tiritas 19x72 mm (20 uds)','Clorhexidina spray acuosa 2% 100 ml',
    'Esparadrapo papel hipoalergénico 1,25 cm x 5 m','Esparadrapo papel hipoalergénico 2,5 cm x 5 m',
    'Gasas estériles algodón 20x20 cm (sobres 5 uds)','Guantes de nitrilo talla M (par)',
    'Pinza de disección 11 cm','Suero fisiológico 5 ml (6 uds)','Tijera cirugía recta 11 cm',
    'Tiritas sin cortar plástico 1 m x 6 cm','Venda crepé 7 cm x 4 m',
    'Venda de algodón 5 cm x 5 m','Venda de algodón 7 cm x 5 m','Venda de algodón 10 cm x 5 m',
    'Diclofenaco','Tensoplast (venda adhesiva elástica)',
    'Steri-Strip (tiras aproximación heridas)','Povidona yodada 100 ml','Maletín botiquín'
  );


-- ==========================================================================
-- PASO 4 · COMPROBAR que ha quedado bien
-- Cada hotel debe tener exactamente 22 productos de botiquín.
-- ==========================================================================
select
  p.nombre                                        as hotel,
  count(*) filter (where i.seccion = 'botiquin')  as botiquin,
  count(*) filter (where i.seccion = 'desa')      as desa,
  count(*) filter (where i.seccion = 'oxigeno')   as oxigeno
from puestos p
left join inventario_puesto ip on ip.puesto_id = p.id
left join inventario_items i   on i.id = ip.item_id
where p.activo = true
group by p.nombre
order by p.nombre;


-- ==========================================================================
-- PASO 5 (opcional) · Ver la lista final de productos del botiquín
-- ==========================================================================
select nombre, categoria, unidad, obligatorio
from inventario_items
where seccion = 'botiquin'
order by categoria, nombre;
