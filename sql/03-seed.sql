-- ==========================================================================
-- PoolSafety · Datos iniciales
-- Empresa + inventario normativo Baleares + puestos de muestra
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 1. EMPRESA
-- ---------------------------------------------------------------------------
insert into empresas (nombre, razon_social, cif, domicilio, email_contacto)
values (
  'PoolSafety Mallorca',
  'Pool Safety Des Llevant, S.L.',
  'B75828418',
  'C/ Hernán Cortés, 8, 2º Dcha., 07670, Portocolom, Baleares',
  'info@poolsafety.es'
)
on conflict (cif) do nothing;

-- Captura el ID de la empresa (se usa abajo)
do $$
declare
  emp_id uuid;
begin
  select id into emp_id from empresas where cif = 'B75828418';

  -- ---------------------------------------------------------------------------
  -- 2. PUESTOS DE MUESTRA (los 5 principales del cliente)
  -- ---------------------------------------------------------------------------
  insert into puestos (empresa_id, nombre, zona, direccion, hora_inicio_default, duracion_default, gps_lat, gps_lng)
  values
    (emp_id, 'Hotel Bellamar',       'Palma',       'C/ Marbella 32, Palma de Mallorca',   '10:00', 8, 39.5696, 2.6502),
    (emp_id, 'Resort Cala Millor',    'Cala Millor', 'Avda Cala Millor, Sant Llorenç',      '10:00', 8, 39.5936, 3.3831),
    (emp_id, 'Hotel Playa Muro',      'Muro',        'Platja de Muro',                       '10:00', 8, 39.7729, 3.0870),
    (emp_id, 'Aparthotel Illetas',    'Illetes',     'Passeig Illetes, Calvià',              '10:00', 8, 39.5430, 2.5837),
    (emp_id, 'Hotel Cala d''Or',       'Cala d''Or',   'Cala d''Or, Santanyí',                  '10:00', 8, 39.3757, 3.2409)
  on conflict do nothing;

  -- ---------------------------------------------------------------------------
  -- 3. DOCUMENTOS DE LA EMPRESA (plantillas Kit Alta según normativa)
  -- ---------------------------------------------------------------------------
  insert into documentos_empresa (empresa_id, codigo, titulo, subtitulo, grupo, obligatorio, norma, orden) values
    (emp_id, 'kit-alta',           'Kit Alta Empresa', 'RGPD, geolocalización, EPIs, salud',        'alta',    true,  'RGPD · LOPDGDD · Ley 31/1995 PRL', 1),
    (emp_id, 'jornada-mensual',    'Registro mensual de jornada', 'Firma obligatoria último día del mes','mensual', true,  'RD-ley 8/2019 registro horario',   2),
    (emp_id, 'finiquito',           'Finiquito',                    'Solo aparece en caso de baja',      'baja',    false, 'Estatuto de los Trabajadores',      3)
  on conflict (empresa_id, codigo) do nothing;

end $$;

-- ---------------------------------------------------------------------------
-- 4. INVENTARIO GLOBAL (Decreto 53/1995 + Decreto 137/2008 Baleares)
-- ---------------------------------------------------------------------------
insert into inventario_items (codigo, nombre, seccion, categoria, obligatorio, normativa, unidad, minimo_recomendado) values
  -- Botiquín general
  ('bot-gasas',        'Gasas estériles',                    'botiquin', 'Curas',        true,  'Decreto 53/1995', 'sobre', 10),
  ('bot-vendas-el',    'Vendas elásticas',                   'botiquin', 'Curas',        true,  'Decreto 53/1995', 'ud',    4),
  ('bot-tensoplast',   'Vendas cohesivas (tensoplast)',      'botiquin', 'Curas',        true,  'Decreto 53/1995', 'ud',    3),
  ('bot-esparadrapo',  'Esparadrapo hipoalergénico',         'botiquin', 'Curas',        true,  'Decreto 53/1995', 'rollo', 2),
  ('bot-tiritas',      'Tiritas / apósitos surtidos',        'botiquin', 'Curas',        false, 'Recomendado',      'ud',    20),
  ('bot-algodon',      'Algodón hidrófilo',                  'botiquin', 'Curas',        true,  'Decreto 53/1995', 'bolsa', 1),
  ('bot-suturas',      'Suturas adhesivas (steri-strip)',    'botiquin', 'Curas',        true,  'Decreto 53/1995', 'sobre', 3),
  ('bot-betadine',     'Povidona yodada (Betadine)',         'botiquin', 'Antiséptico',  true,  'Decreto 53/1995', 'ud',    1),
  ('bot-clorhex',      'Antiséptico clorhexidina',           'botiquin', 'Antiséptico',  true,  'Decreto 53/1995', 'ud',    2),
  ('bot-alcohol',      'Alcohol 96°',                         'botiquin', 'Antiséptico',  true,  'Decreto 53/1995', 'ud',    1),
  ('bot-agua-ox',      'Agua oxigenada',                     'botiquin', 'Antiséptico',  true,  'Decreto 53/1995', 'ud',    1),
  ('bot-suero',        'Suero fisiológico 500ml',            'botiquin', 'Lavado',       true,  'Decreto 53/1995', 'ud',    3),
  ('bot-guantes-nit',  'Guantes nitrilo talla M',            'botiquin', 'Protección',   true,  'Decreto 53/1995', 'ud',    20),
  ('bot-guantes-est',  'Guantes estériles',                   'botiquin', 'Protección',   true,  'Decreto 53/1995', 'par',   6),
  ('bot-tijeras',      'Tijeras acero inoxidable',            'botiquin', 'Instrumental', true,  'Decreto 53/1995', 'ud',    1),
  ('bot-pinzas',       'Pinzas acero inoxidable',             'botiquin', 'Instrumental', true,  'Decreto 53/1995', 'ud',    1),
  ('bot-pinzas-len',   'Pinzas de lengua',                    'botiquin', 'Instrumental', true,  'Decreto 53/1995', 'ud',    1),
  ('bot-termometro',   'Termómetro digital',                  'botiquin', 'Instrumental', false, 'Recomendado',      'ud',    1),
  ('bot-manta-term',   'Manta térmica',                       'botiquin', 'Emergencia',   true,  'Decreto 53/1995', 'ud',    2),
  ('bot-hielo',        'Bolsa hielo instantáneo',             'botiquin', 'Emergencia',   false, 'Recomendado',      'ud',    3),
  ('bot-collarin',     'Collarín cervical ajustable',         'botiquin', 'Emergencia',   false, 'Recomendado',      'ud',    1),
  ('bot-antinflam',    'Antiinflamatorio tópico',             'botiquin', 'Medicación',   true,  'Decreto 53/1995', 'ud',    1),
  ('bot-medusas',      'Neutralizante picaduras medusas',     'botiquin', 'Medicación',   false, 'Recomendado litoral', 'ud',  1),
  -- DESA
  ('desa-equipo',      'Desfibrilador DESA',                  'desa',     'DESA',         true,  'Decreto 137/2008','ud',    1),
  ('desa-parches-a',   'Parches adulto DESA',                 'desa',     'DESA',         true,  'Decreto 137/2008','par',   2),
  ('desa-parches-p',   'Parches pediátricos DESA',            'desa',     'DESA',         true,  'Decreto 137/2008','par',   1),
  ('desa-bateria',     'Batería DESA de repuesto',            'desa',     'DESA',         true,  'Decreto 137/2008','ud',    1),
  ('desa-rasura',      'Rasuradora desechable',                'desa',     'DESA',         true,  'Decreto 137/2008','ud',    2),
  ('desa-toalla',      'Toalla no conductora / secante',       'desa',     'DESA',         false, 'Recomendado',      'ud',    1),
  ('desa-rcp-mask',    'Mascarilla RCP con válvula',           'desa',     'DESA',         true,  'Decreto 53/1995', 'ud',    2),
  ('desa-registro',    'Libro de registro de uso DESA',        'desa',     'DESA',         true,  'Decreto 137/2008','ud',    1),
  -- Oxigenoterapia
  ('ox-bala-p',        'Bala de oxígeno 5L (principal)',       'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1),
  ('ox-bala-r',        'Bala de oxígeno de repuesto',          'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1),
  ('ox-regulador',     'Regulador con manómetro',              'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1),
  ('ox-ambu-a',        'Ambú adulto (bolsa autoinflable)',     'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1),
  ('ox-ambu-p',        'Ambú pediátrico',                       'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1),
  ('ox-mask-a',        'Mascarilla no-rebreather adulto',      'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1),
  ('ox-mask-p',        'Mascarilla no-rebreather pediátrica',  'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1),
  ('ox-guedel-a',      'Cánulas Guedel adulto (surtido)',      'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    2),
  ('ox-guedel-p',      'Cánulas Guedel pediátrico',            'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    2),
  ('ox-aspirador',     'Aspirador de secreciones',             'oxigeno',  'Oxígeno',      true,  'Decreto 53/1995', 'ud',    1)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 5. STOCK INICIAL PARA CADA PUESTO (todos con el mínimo recomendado)
-- ---------------------------------------------------------------------------
insert into inventario_puesto (puesto_id, item_id, stock, minimo)
select p.id, i.id, i.minimo_recomendado, i.minimo_recomendado
from puestos p
cross join inventario_items i
where p.empresa_id = (select id from empresas where cif = 'B75828418')
on conflict (puesto_id, item_id) do nothing;
