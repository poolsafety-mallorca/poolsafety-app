/* ==========================================================================
   PoolSafety — Datos simulados del prototipo
   Todo mock. Se persiste ligeramente en localStorage para dar sensación real.
   ========================================================================== */

const PS = (function () {
  const STORAGE_KEY = 'poolsafety-mock-v1';

  /* ---------- Puestos (30 de muestra, dashboard dice 80 totales) ---------- */
  const puestos = [
    { id: 'p01', nombre: 'Hotel Bellamar', zona: 'Palma', hora: '10:00', duracion: 8 },
    { id: 'p02', nombre: 'Resort Cala Millor', zona: 'Cala Millor', hora: '10:00', duracion: 8 },
    { id: 'p03', nombre: 'Residencial Son Vida', zona: 'Palma', hora: '11:00', duracion: 6 },
    { id: 'p04', nombre: 'Hotel Playa Muro', zona: 'Muro', hora: '10:00', duracion: 8 },
    { id: 'p05', nombre: 'Aparthotel Illetas', zona: 'Illetes', hora: '10:00', duracion: 8 },
    { id: 'p06', nombre: 'Club Náutico Alcúdia', zona: 'Alcúdia', hora: '09:30', duracion: 8 },
    { id: 'p07', nombre: 'Hotel Cala d\'Or', zona: 'Cala d\'Or', hora: '10:00', duracion: 8 },
    { id: 'p08', nombre: 'Resort Magaluf Bay', zona: 'Magaluf', hora: '10:00', duracion: 9 },
    { id: 'p09', nombre: 'Hotel Portals Nous', zona: 'Portals Nous', hora: '10:00', duracion: 8 },
    { id: 'p10', nombre: 'Comunidad Sa Coma', zona: 'Sa Coma', hora: '11:00', duracion: 6 },
    { id: 'p11', nombre: 'Hotel Puerto Pollença', zona: 'Pollença', hora: '10:00', duracion: 8 },
    { id: 'p12', nombre: 'Aparthotel Cala Ratjada', zona: 'Cala Ratjada', hora: '10:00', duracion: 8 },
    { id: 'p13', nombre: 'Hotel Palmanova Beach', zona: 'Palmanova', hora: '10:00', duracion: 9 },
    { id: 'p14', nombre: 'Resort Santa Ponsa', zona: 'Santa Ponsa', hora: '10:00', duracion: 8 },
    { id: 'p15', nombre: 'Hotel Es Trenc', zona: 'Campos', hora: '10:00', duracion: 7 },
    { id: 'p16', nombre: 'Villa Deià Retreat', zona: 'Deià', hora: '11:00', duracion: 6 },
    { id: 'p17', nombre: 'Hotel Sóller Marina', zona: 'Port de Sóller', hora: '10:00', duracion: 8 },
    { id: 'p18', nombre: 'Aparthotel Colònia', zona: 'Colònia de Sant Jordi', hora: '10:00', duracion: 8 },
    { id: 'p19', nombre: 'Resort Andratx', zona: 'Port d\'Andratx', hora: '10:00', duracion: 8 },
    { id: 'p20', nombre: 'Hotel Can Picafort', zona: 'Can Picafort', hora: '10:00', duracion: 8 },
    { id: 'p21', nombre: 'Comunidad Bendinat', zona: 'Bendinat', hora: '11:00', duracion: 6 },
    { id: 'p22', nombre: 'Hotel Camp de Mar', zona: 'Camp de Mar', hora: '10:00', duracion: 8 },
    { id: 'p23', nombre: 'Aparthotel Costa d\'en Blanes', zona: 'Costa d\'en Blanes', hora: '10:00', duracion: 8 },
    { id: 'p24', nombre: 'Hotel Peguera Sol', zona: 'Peguera', hora: '10:00', duracion: 8 },
    { id: 'p25', nombre: 'Resort Palma Nova', zona: 'Palma Nova', hora: '10:00', duracion: 9 },
    { id: 'p26', nombre: 'Hotel Formentor Vista', zona: 'Formentor', hora: '10:00', duracion: 8 },
    { id: 'p27', nombre: 'Comunidad Sa Torre', zona: 'Llucmajor', hora: '11:00', duracion: 6 },
    { id: 'p28', nombre: 'Hotel Portocolom', zona: 'Portocolom', hora: '10:00', duracion: 7 },
    { id: 'p29', nombre: 'Aparthotel Cales de Mallorca', zona: 'Cales de Mallorca', hora: '10:00', duracion: 8 },
    { id: 'p30', nombre: 'Hotel Costa Norte', zona: 'Cala Sant Vicenç', hora: '10:00', duracion: 8 }
  ];

  /* ---------- Socorristas (40 de muestra + estadísticas para 150) ---------- */
  const nombres = [
    'María Fernández', 'Joan Ribas', 'Laura Torres', 'Marc Serra', 'Alba Pons',
    'Nico Martín', 'Carla Vidal', 'Pau Company', 'Elena Reus', 'Óscar Bauzá',
    'Aina Salom', 'Diego Ramos', 'Cristina Mut', 'Toni Amengual', 'Berta Coll',
    'Lucía Gómez', 'David Cifre', 'Marta Estelrich', 'Jordi Fiol', 'Sara Bosch',
    'Rubén Nadal', 'Andrea Palou', 'Iván Barceló', 'Paula Riera', 'Adrià Font',
    'Núria Alorda', 'Sergi Homar', 'Mireia Vaquer', 'Xavi Roig', 'Judith Sansó',
    'Álvaro Perelló', 'Clara Bibiloni', 'Guille Vives', 'Nerea Colom', 'Roger Truyol',
    'Irene Massanet', 'Bruno Rossell', 'Vera Llompart', 'Aleix Segura', 'Marina Adrover'
  ];

  const initials = (n) => n.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();

  const socorristas = nombres.map((nombre, i) => ({
    id: `s${String(i + 1).padStart(2, '0')}`,
    nombre,
    iniciales: initials(nombre),
    telefono: `+34 6${Math.floor(10000000 + Math.random() * 89999999)}`,
    // asignamos puesto rotativo (algunos puestos sin socorrista para simular vacantes)
    puestoId: i < puestos.length ? puestos[i].id : null,
    horasNormales: 140 + Math.floor(Math.random() * 40),  // 140-180
    horasExtra: Math.floor(Math.random() * 22),           // 0-22
    diasTrabajados: 18 + Math.floor(Math.random() * 6)    // 18-24 del mes
  }));

  /* ---------- Fichajes de hoy ----------
     Estados posibles:
       - ok       : fichó a tiempo y está en el puesto
       - tarde    : fichó fuera de hora
       - fuera    : fichó pero fuera del área GPS
       - pendiente: no ha fichado aún
       - vacante  : puesto sin socorrista
  */
  const estados = ['ok','ok','ok','ok','ok','ok','ok','ok','ok','ok',
                   'ok','ok','ok','ok','ok','ok','ok','ok','ok',
                   'tarde','tarde','tarde','tarde',
                   'fuera','fuera',
                   'pendiente','pendiente','pendiente'];

  const fichajes = puestos.map((p, i) => {
    const soc = socorristas.find(s => s.puestoId === p.id);
    if (!soc) return { puestoId: p.id, estado: 'vacante', socorristaId: null };

    const estado = estados[i % estados.length];
    let horaFichaje = null;
    if (estado === 'ok') {
      const [h, m] = p.hora.split(':');
      horaFichaje = `${h}:${String(Math.floor(Math.random() * 5)).padStart(2, '0')}`;
    } else if (estado === 'tarde') {
      const [h] = p.hora.split(':');
      horaFichaje = `${h}:${15 + Math.floor(Math.random() * 20)}`;
    } else if (estado === 'fuera') {
      horaFichaje = p.hora;
    }
    return {
      puestoId: p.id,
      socorristaId: soc.id,
      estado,
      horaFichaje,
      gpsOk: estado !== 'fuera'
    };
  });

  /* ---------- Notas / tareas del coordinador al socorrista ---------- */
  const tareas = [
    { id: 't01', puestoId: 'p01', socorristaId: 's01', titulo: 'Revisar salvavidas de repuesto', descripcion: 'Contar los 4 flotadores adicionales del almacén.', hecha: false, prioridad: 'alta', fecha: 'hoy' },
    { id: 't02', puestoId: 'p01', socorristaId: 's01', titulo: 'Comprobar cloración a las 12:00', descripcion: 'Anotar valor en el parte diario.', hecha: false, prioridad: 'media', fecha: 'hoy' },
    { id: 't03', puestoId: 'p01', socorristaId: 's01', titulo: 'Fotografiar puesto al abrir', descripcion: 'Subir foto al parte del día.', hecha: true, prioridad: 'baja', fecha: 'hoy' },
    { id: 't04', puestoId: 'p01', socorristaId: 's01', titulo: 'Firmar hoja de incidencias', descripcion: 'Revisar y firmar al cierre del turno.', hecha: false, prioridad: 'media', fecha: 'mañana' }
  ];

  const notas = [
    { id: 'n01', puestoId: 'p01', socorristaId: 's01', autor: 'Coordinador Jaume', mensaje: 'Recordad que el próximo lunes viene inspección municipal. Botiquín completo obligatorio.', fecha: 'Hoy, 08:14' },
    { id: 'n02', puestoId: 'p01', socorristaId: 's01', autor: 'Coordinador Marta', mensaje: 'El cliente ha pedido que cerremos el toldo al terminar el turno. Gracias.', fecha: 'Ayer, 18:22' }
  ];

  /* ---------- Inventario del botiquín (Decreto 53/1995 Baleares) ---------- */
  /* seccion: 'botiquin' | 'desa' | 'oxigeno' | 'custom'
     Decreto 137/2008 regula el DESA.                                        */
  const inventario = [
    // === BOTIQUÍN GENERAL — curas y vendaje ===
    { id: 'i01', puestoId: 'p01', seccion: 'botiquin', nombre: 'Gasas estériles', categoria: 'Curas', stock: 15, minimo: 10, unidad: 'sobre', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 3 días', revisadoHoy: true },
    { id: 'i02', puestoId: 'p01', seccion: 'botiquin', nombre: 'Vendas elásticas', categoria: 'Curas', stock: 6, minimo: 4, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 3 días', revisadoHoy: true },
    { id: 'i03', puestoId: 'p01', seccion: 'botiquin', nombre: 'Vendas cohesivas (tensoplast)', categoria: 'Curas', stock: 3, minimo: 3, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 5 días', revisadoHoy: false },
    { id: 'i04', puestoId: 'p01', seccion: 'botiquin', nombre: 'Esparadrapo hipoalergénico', categoria: 'Curas', stock: 4, minimo: 2, unidad: 'rollo', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 5 días', revisadoHoy: false },
    { id: 'i05', puestoId: 'p01', seccion: 'botiquin', nombre: 'Tiritas / apósitos surtidos', categoria: 'Curas', stock: 30, minimo: 20, unidad: 'ud', obligatorio: false, normativa: 'Recomendado', ultimaRepo: 'hace 3 días', revisadoHoy: false },
    { id: 'i06', puestoId: 'p01', seccion: 'botiquin', nombre: 'Algodón hidrófilo', categoria: 'Curas', stock: 2, minimo: 1, unidad: 'bolsa', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 5 días', revisadoHoy: false },
    { id: 'i07', puestoId: 'p01', seccion: 'botiquin', nombre: 'Suturas adhesivas (steri-strip)', categoria: 'Curas', stock: 5, minimo: 3, unidad: 'sobre', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 10 días', revisadoHoy: false },
    // === BOTIQUÍN GENERAL — antisépticos y lavado ===
    { id: 'i08', puestoId: 'p01', seccion: 'botiquin', nombre: 'Povidona yodada (Betadine)', categoria: 'Antiséptico', stock: 2, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 8 días', revisadoHoy: false },
    { id: 'i09', puestoId: 'p01', seccion: 'botiquin', nombre: 'Antiséptico clorhexidina', categoria: 'Antiséptico', stock: 1, minimo: 2, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 10 días', revisadoHoy: false },
    { id: 'i10', puestoId: 'p01', seccion: 'botiquin', nombre: 'Alcohol 96°', categoria: 'Antiséptico', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 15 días', revisadoHoy: false },
    { id: 'i11', puestoId: 'p01', seccion: 'botiquin', nombre: 'Agua oxigenada', categoria: 'Antiséptico', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 15 días', revisadoHoy: false },
    { id: 'i12', puestoId: 'p01', seccion: 'botiquin', nombre: 'Suero fisiológico 500ml', categoria: 'Lavado', stock: 1, minimo: 3, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 12 días', revisadoHoy: false },
    // === BOTIQUÍN GENERAL — protección e instrumental ===
    { id: 'i13', puestoId: 'p01', seccion: 'botiquin', nombre: 'Guantes nitrilo talla M', categoria: 'Protección', stock: 24, minimo: 20, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 5 días', revisadoHoy: true },
    { id: 'i14', puestoId: 'p01', seccion: 'botiquin', nombre: 'Guantes estériles', categoria: 'Protección', stock: 10, minimo: 6, unidad: 'par', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 5 días', revisadoHoy: false },
    { id: 'i15', puestoId: 'p01', seccion: 'botiquin', nombre: 'Tijeras acero inoxidable', categoria: 'Instrumental', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'i16', puestoId: 'p01', seccion: 'botiquin', nombre: 'Pinzas acero inoxidable', categoria: 'Instrumental', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'i17', puestoId: 'p01', seccion: 'botiquin', nombre: 'Pinzas de lengua', categoria: 'Instrumental', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'i18', puestoId: 'p01', seccion: 'botiquin', nombre: 'Termómetro digital', categoria: 'Instrumental', stock: 1, minimo: 1, unidad: 'ud', obligatorio: false, normativa: 'Recomendado', ultimaRepo: 'ok', revisadoHoy: false },
    // === BOTIQUÍN GENERAL — emergencia / traumatismo ===
    { id: 'i19', puestoId: 'p01', seccion: 'botiquin', nombre: 'Manta térmica', categoria: 'Emergencia', stock: 0, minimo: 2, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 20 días', revisadoHoy: false },
    { id: 'i20', puestoId: 'p01', seccion: 'botiquin', nombre: 'Bolsa hielo instantáneo', categoria: 'Emergencia', stock: 3, minimo: 3, unidad: 'ud', obligatorio: false, normativa: 'Recomendado', ultimaRepo: 'hace 5 días', revisadoHoy: false },
    { id: 'i21', puestoId: 'p01', seccion: 'botiquin', nombre: 'Collarín cervical ajustable', categoria: 'Emergencia', stock: 1, minimo: 1, unidad: 'ud', obligatorio: false, normativa: 'Recomendado', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'i22', puestoId: 'p01', seccion: 'botiquin', nombre: 'Antiinflamatorio tópico', categoria: 'Medicación', stock: 2, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 12 días', revisadoHoy: false },
    { id: 'i23', puestoId: 'p01', seccion: 'botiquin', nombre: 'Neutralizante picaduras medusas', categoria: 'Medicación', stock: 1, minimo: 1, unidad: 'ud', obligatorio: false, normativa: 'Recomendado litoral', ultimaRepo: 'ok', revisadoHoy: false },

    // === DESA (Decreto 137/2008 Baleares) ===
    { id: 'd01', puestoId: 'p01', seccion: 'desa', nombre: 'Desfibrilador DESA', categoria: 'DESA', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 137/2008', ultimaRepo: 'Revisado hoy', revisadoHoy: true, revisionMensual: true, proximaRevision: '15 días' },
    { id: 'd02', puestoId: 'p01', seccion: 'desa', nombre: 'Parches adulto DESA', categoria: 'DESA', stock: 2, minimo: 2, unidad: 'par', obligatorio: true, normativa: 'Decreto 137/2008', ultimaRepo: 'ok', revisadoHoy: true, caducidad: '12/2027' },
    { id: 'd03', puestoId: 'p01', seccion: 'desa', nombre: 'Parches pediátricos DESA', categoria: 'DESA', stock: 1, minimo: 1, unidad: 'par', obligatorio: true, normativa: 'Decreto 137/2008', ultimaRepo: 'ok', revisadoHoy: false, caducidad: '08/2027' },
    { id: 'd04', puestoId: 'p01', seccion: 'desa', nombre: 'Batería DESA de repuesto', categoria: 'DESA', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 137/2008', ultimaRepo: 'ok', revisadoHoy: false, caducidad: '06/2028' },
    { id: 'd05', puestoId: 'p01', seccion: 'desa', nombre: 'Rasuradora desechable', categoria: 'DESA', stock: 3, minimo: 2, unidad: 'ud', obligatorio: true, normativa: 'Decreto 137/2008', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'd06', puestoId: 'p01', seccion: 'desa', nombre: 'Toalla no conductora / secante', categoria: 'DESA', stock: 2, minimo: 1, unidad: 'ud', obligatorio: false, normativa: 'Recomendado', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'd07', puestoId: 'p01', seccion: 'desa', nombre: 'Mascarilla RCP con válvula', categoria: 'DESA', stock: 2, minimo: 2, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'hace 15 días', revisadoHoy: false },
    { id: 'd08', puestoId: 'p01', seccion: 'desa', nombre: 'Libro de registro de uso DESA', categoria: 'DESA', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 137/2008', ultimaRepo: 'ok', revisadoHoy: false },

    // === OXIGENOTERAPIA (Decreto 53/1995 Baleares) ===
    { id: 'o01', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Bala de oxígeno 5L (principal)', categoria: 'Oxígeno', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'llena', revisadoHoy: true, revisionMensual: true, cargaBala: '95%' },
    { id: 'o02', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Bala de oxígeno de repuesto', categoria: 'Oxígeno', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'llena', revisadoHoy: false, cargaBala: '100%' },
    { id: 'o03', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Regulador con manómetro', categoria: 'Oxígeno', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: true, revisionMensual: true },
    { id: 'o04', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Ambú adulto (bolsa autoinflable)', categoria: 'Oxígeno', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: true },
    { id: 'o05', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Ambú pediátrico', categoria: 'Oxígeno', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'o06', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Mascarilla no-rebreather adulto', categoria: 'Oxígeno', stock: 2, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'o07', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Mascarilla no-rebreather pediátrica', categoria: 'Oxígeno', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'o08', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Cánulas Guedel adulto (surtido)', categoria: 'Oxígeno', stock: 3, minimo: 2, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'o09', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Cánulas Guedel pediátrico', categoria: 'Oxígeno', stock: 2, minimo: 2, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false },
    { id: 'o10', puestoId: 'p01', seccion: 'oxigeno', nombre: 'Aspirador de secreciones', categoria: 'Oxígeno', stock: 1, minimo: 1, unidad: 'ud', obligatorio: true, normativa: 'Decreto 53/1995', ultimaRepo: 'ok', revisadoHoy: false, revisionMensual: true }
  ];

  /* ---------- Alertas de inventario del sistema ---------- */
  const alertas = [
    { id: 'a01', puestoId: 'p06', puestoNombre: 'Club Náutico Alcúdia', item: 'Manta térmica', reportado: 'hace 15 min', criticidad: 'alta' },
    { id: 'a02', puestoId: 'p13', puestoNombre: 'Hotel Palmanova Beach', item: 'Suero fisiológico', reportado: 'hace 42 min', criticidad: 'media' },
    { id: 'a03', puestoId: 'p22', puestoNombre: 'Hotel Camp de Mar', item: 'Vendas elásticas', reportado: 'hace 1 h', criticidad: 'media' },
    { id: 'a04', puestoId: 'p04', puestoNombre: 'Hotel Playa Muro', item: 'Mascarilla RCP', reportado: 'hace 2 h', criticidad: 'alta' },
    { id: 'a05', puestoId: 'p18', puestoNombre: 'Aparthotel Colònia', item: 'Antiséptico clorhexidina', reportado: 'hace 3 h', criticidad: 'baja' }
  ];

  /* ==========================================================================
     DOCUMENTACIÓN LABORAL — Kit Alta Empresa + Jornada + Baja
     Basado en normativa: RGPD (UE 2016/679), LOPDGDD 3/2018, Ley 31/1995 PRL,
     Real Decreto-ley 8/2019 (registro horario), art. 90 LOPDGDD (geolocalización).
     ========================================================================== */

  const EMPRESA = {
    razonSocial: 'Pool Safety Des Llevant, S.L.',
    cif: 'B75828418',
    domicilio: 'C/ Hernán Cortés, 8, 2º Dcha., 07670, Portocolom, Baleares',
    email: 'info@poolsafety.es'
  };

  /* Kit Alta · 7 sub-documentos que firma el trabajador al alta.
     `textoCompleto` es el texto legal que debe leer el trabajador antes
     de aceptar. `epis` (solo en ka-epis) es editable por coordinador/socorrista. */
  const kitAltaSubdocs = [
    {
      id: 'ka-privacidad',
      titulo: 'Política de privacidad · RGPD',
      resumen: 'Tratamiento de tus datos personales por Pool Safety Des Llevant, S.L. — cómo se recogen, con qué finalidad, con quién se comparten y qué derechos tienes.',
      obligatorio: true,
      norma: 'Reglamento UE 2016/679 (RGPD) · Ley Orgánica 3/2018 (LOPDGDD)',
      textoCompleto: `AVISOS LEGALES Y CLÁUSULAS CON TRABAJADORES DE LA EMPRESA

Mediante el siguiente documento la empresa cumple con el deber de informar que ostenta en virtud de la normativa vigente en materia de protección de datos. La firma del presente documento será necesaria con el fin de poder acreditar que efectivamente la empresa ha cumplido con el deber de informar.

POLÍTICA DE PRIVACIDAD PARA EMPLEADOS

El objetivo de la presente Política de Privacidad es informarle de forma transparente sobre los tratamientos de datos personales que realiza Pool Safety Des Llevant, S.L.

RESPONSABLE DE LOS DATOS PERSONALES DE EMPLEADOS
• Nombre de la empresa: Pool Safety Des Llevant, S.L.
• NIF: B75828418
• Domicilio: Hernán Cortés, 8, 2º Dcha., 07670, Portocolom, Baleares

DEFINICIÓN DE DATO PERSONAL
Un dato personal es toda información sobre una persona física identificada o identificable. El tratamiento implica cualquier operación (recogida, registro, organización, conservación, adaptación, extracción, consulta, utilización, comunicación, difusión, cotejo, limitación, supresión o destrucción).

DATOS PERSONALES CAPTADOS POR LA EMPRESA
Únicamente los necesarios para la gestión de la relación laboral:
• Datos identificativos y de contacto (nombre, apellidos, firma, teléfono).
• Copia del DNI/Pasaporte.
• Nº de Seguridad Social, cuenta bancaria, información tributaria.
• Copia del carnet de conducir.
• Nómina.
• Contacto de emergencia.
• Información del proceso de selección (referencias, CV, permiso de trabajo).
• Datos del control de presencia.
• Historial de apercibimientos, sanciones y expedientes disciplinarios.
• Bajas.
• Afiliación sindical.
• Datos de geolocalización.
• Imagen.

Categorías especiales (salud, origen étnico, orientación sexual, religión, etc.) solo con consentimiento expreso, revocable en cualquier momento. El empleado puede decidir libremente si facilita esta información sin consecuencia alguna.

FINALIDADES DEL TRATAMIENTO
• Gestión de la relación laboral: decisión de contratación, pago de nómina, deducciones y retenciones, revisiones salariales, evaluación de infracciones y faltas disciplinarias, evaluaciones profesionales y promociones, procesos de formación.
• Cumplimiento legal: gestión de incidentes y accidentes de trabajo, bajas o ausencias, salud y prevención de riesgos, control horario, gestiones administrativas y de geolocalización.
• Captación y uso de imagen en web, redes sociales o intranet.

BASE DE LEGITIMACIÓN
• Ejecución del contrato de trabajo.
• Cumplimiento de una obligación legal.
• Consentimiento expreso para tratamientos adicionales (p. ej. imagen).

TERCEROS CON ACCESO
Bancos, proveedores con contrato de encargo, aseguradoras y mutuas, agencias de viaje/aerolíneas/hoteles cuando aplique. Sin transferencias internacionales. Se podrá facilitar información a la Administración Pública, autoridades competentes y Juzgados y Tribunales.

CONSERVACIÓN
Durante la vigencia de la relación laboral y, tras su finalización, un máximo de 4 años (excepciones legales aplicables).

DERECHOS DEL EMPLEADO
Acceso, rectificación, oposición, supresión, portabilidad, limitación del tratamiento y minimización. Ejercicio mediante escrito acreditado al correo info@poolsafety.es. Reclamación ante la Agencia Española de Protección de Datos.`
    },
    {
      id: 'ka-geoloc',
      titulo: 'Tratamiento de geolocalización del móvil',
      resumen: 'Consentimiento para tratar los datos de GPS del dispositivo móvil personal — exclusivamente para el registro digital del fichaje.',
      obligatorio: true,
      norma: 'Art. 90 LOPDGDD · Art. 9 RGPD',
      resaltado: true,
      textoCompleto: `TRATAMIENTO DE DATOS DE GEOLOCALIZACIÓN DE LOS EMPLEADOS

De conformidad con lo dispuesto en el art. 9 del Reglamento (UE) 2016/679, de 27 de abril de 2016 (RGPD), y el art. 90 de la Ley Orgánica 3/2018 (LOPDGDD), Pool Safety Des Llevant, S.L. (B75828418), con domicilio en Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, Baleares, le informa de que, en base a la relación laboral que nos vincula, tratará y recabará datos de geolocalización recogidos a través de:

☑ Sistema de geolocalización en el dispositivo electrónico propio del trabajador (aplicación PoolSafety instalada en su teléfono móvil personal).

FINALIDAD
El tratamiento de sus datos de geolocalización tiene como finalidad exclusiva el registro digital del fichaje de jornada (entrada y salida del puesto de trabajo) y la verificación de la presencia efectiva del socorrista en el puesto asignado (geocerca según radio establecido para cada hotel).

Los datos de geolocalización se capturan ÚNICAMENTE en el momento del fichaje (pulsar Fichar entrada / Fichar salida) o al registrar una alerta desde el móvil. La aplicación NO rastrea la posición del trabajador de forma continua fuera de esos momentos.

CESIÓN Y CONSERVACIÓN
Sus datos de geolocalización no serán transmitidos a terceros sin su consentimiento, salvo obligación legal, y serán conservados durante un plazo máximo de dos meses, mientras usted no solicite su supresión.

DERECHOS
Puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad mediante escrito a Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, Baleares, o por correo electrónico a info@poolsafety.es.`
    },
    {
      id: 'ka-electronica',
      titulo: 'Recepción de documentación por medios electrónicos',
      resumen: 'Autorización para recibir nóminas, avisos y notificaciones por correo electrónico y teléfono móvil (SMS, WhatsApp).',
      obligatorio: true,
      requiereCampos: ['emailPersonal','telefonoPersonal'],
      textoCompleto: `CONSENTIMIENTO EXPRESO PARA LA RECEPCIÓN DE DOCUMENTACIÓN LABORAL POR MEDIOS ELECTRÓNICOS

Datos de la Empresa
• Denominación social: POOL SAFETY DES LLEVANT, S.L.
• CIF: B75828418
• Domicilio: Calle Hernán Cortés, nº 8, 2º Derecha, CP 07670 Portocolom-Felanitx

Por medio del presente documento, la persona trabajadora arriba identificada autoriza expresamente a la empresa a remitirle toda la documentación relativa a su relación laboral, incluyendo, pero no limitándose a:
• Contrato de trabajo y sus posibles modificaciones.
• Recibos de salarios (nóminas).
• Comunicaciones sobre prevención de riesgos laborales.
• Notificaciones de carácter general o particular.
• Cualquier otra documentación legalmente exigible.

MEDIOS ELECTRÓNICOS AUTORIZADOS
• Correo electrónico personal facilitado por el trabajador.
• Teléfono móvil (llamadas, SMS o aplicaciones de mensajería instantánea, ej. WhatsApp).

El trabajador declara que los medios indicados son de su titularidad y que tiene acceso habitual a los mismos.

PROTECCIÓN DE DATOS
En cumplimiento del RGPD y de la LOPDGDD, los datos personales serán tratados con la finalidad de gestionar la relación laboral y las comunicaciones. El trabajador puede ejercer sus derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad mediante escrito a la empresa. Los datos no serán cedidos a terceros salvo obligación legal.

REVOCACIÓN
El trabajador puede revocar en cualquier momento el presente consentimiento, mediante notificación escrita, sin que afecte a la licitud del tratamiento previo.

REMISIÓN FEHACIENTE
Se entenderá que cualquier documentación remitida por la Empresa a través de los medios autorizados ha sido recibida de forma fehaciente por el trabajador, siempre que la Empresa pueda acreditar el envío.`
    },
    {
      id: 'ka-imagen',
      titulo: 'Captación y uso de la imagen del empleado',
      resumen: 'Consentimiento para que la empresa capte y use tu imagen en su web, redes sociales y otros medios. Revocable en cualquier momento.',
      obligatorio: false,
      textoCompleto: `CAPTACIÓN DE LA IMAGEN DE EMPLEADOS

Responsable del tratamiento:
• Pool Safety Des Llevant, S.L. · NIF B75828418
• Domicilio: Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, Baleares

1. Doy mi consentimiento para que la empresa pueda captar y emplear mi imagen en su página web, redes sociales y en cualquier otro medio.

2. Conforme a la Ley Orgánica 3/2018 (LOPDGDD), le informamos de que su imagen será tratada por el responsable del tratamiento:
   • Finalidad: captación y publicación de su imagen en el sitio web y/o redes sociales del responsable del tratamiento, siendo la base de legitimación su consentimiento.
   • Conservación: mientras no se oponga o ejerza su derecho de supresión.
   • Cesión: sus datos no serán cedidos a terceros sin consentimiento previo, salvo obligación legal o comunicación necesaria para dar cumplimiento a la relación que nos vincula.
   • Derechos: acceso, rectificación, supresión, portabilidad, limitación y oposición contactando a info@poolsafety.es.
   • En caso de divergencias, puede presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).`
    },
    {
      id: 'ka-vigilancia-salud',
      titulo: 'Vigilancia de la salud laboral (Anexo II)',
      resumen: 'Información sobre el derecho y deber de vigilancia de la salud (art. 22 Ley 31/1995 PRL). Reconocimientos médicos por PREVIS Gestión de Riesgos S.L.U.',
      obligatorio: true,
      norma: 'Ley 31/1995 Prevención de Riesgos Laborales',
      textoCompleto: `ANEXO II · VIGILANCIA DE LA SALUD LABORAL
Empresa: POOL SAFETY DES LLEVANT, S.L.

Mediante el presente escrito, dando conformidad al artículo 22 de la Ley 31/1995 de Prevención de Riesgos Laborales, se le informa del derecho a la vigilancia de su estado de salud en función de los riesgos inherentes al trabajo.

Los exámenes de salud laboral serán realizados por personal sanitario de PREVIS GESTIÓN DE RIESGOS S.L.U., respetando siempre el derecho a su intimidad y a la confidencialidad de toda la información relacionada con su estado de salud. Las pruebas médicas y complementarias a realizar obedecen a los protocolos específicos según los factores de riesgo a los que esté expuesto en su puesto de trabajo.

Los resultados del reconocimiento médico le serán entregados a Usted (puede disponer de acceso privado a través de https://previsonline.previs.es).

EXENTOS DE VOLUNTARIEDAD
Tienen la consideración de exentos de voluntariedad los exámenes de salud laboral:
• Iniciales.
• Por asignación de tareas específicas con nuevos riesgos.
• Por reincorporación tras ausencia prolongada por motivos de salud.
• De personas especialmente sensibles.
• De puestos de trabajo con riesgo de enfermedad profesional.
• Para verificar si el estado de salud puede constituir un peligro para sí misma o para terceros.
• Cuando así esté establecido en disposiciones legales.

PUESTO DE TRABAJO CON VIGILANCIA REQUERIDA
Analizada la evaluación de riesgos y los posibles estudios higiénicos, ergonómicos y psicosociales realizados, el médico del trabajo encargado de la disciplina sanitaria en materia de PRL ha estimado necesaria e imprescindible la vigilancia de la salud de las personas trabajadoras que ocupen el puesto de: SOCORRISTA DE PISCINA.

La persona trabajadora identificada ha sido informada para proceder a su citación al examen de salud laboral.`
    },
    {
      id: 'ka-desconexion',
      titulo: 'Comunicación de desconexión digital',
      resumen: 'Reconocimiento del derecho a la desconexión digital fuera del horario laboral establecido.',
      obligatorio: true,
      norma: 'Art. 88 LOPDGDD',
      textoCompleto: `COMUNICACIÓN DE DESCONEXIÓN DIGITAL

Comunicación a la plantilla de la Implantación del Protocolo de Desconexión Digital.
Empresa: Pool Safety Des Llevant, S.L.

Toda la plantilla de Pool Safety Des Llevant, S.L. tiene derecho a la desconexión digital de acuerdo con todos los parámetros establecidos y desarrollados en este documento.

De acuerdo con estos principios, Pool Safety Des Llevant, S.L. manifiesta su compromiso total al cumplimiento íntegro de este protocolo. Con este propósito se intentará que la persona trabajadora cumpla de forma fiel y fidedigna con el horario y calendario laboral establecido por la empresa.

Mediante el presente documento el trabajador confirma que:
• Ha sido informado sobre la implantación del protocolo de desconexión digital en la empresa.
• Se le han comunicado las medidas y principios que deben cumplirse a la hora de realizar las diferentes modalidades de trabajo (presencial, a distancia, teletrabajo o parcial).
• Tiene derecho a no atender comunicaciones profesionales fuera de su horario laboral.
• Fuera del horario establecido, la empresa se compromete a no exigir respuesta a comunicaciones, salvo situaciones de emergencia debidamente justificadas.`
    },
    {
      id: 'ka-epis',
      titulo: 'Entrega de EPIs (Equipos de Protección Individual)',
      resumen: 'Recibí los equipos que se detallan a continuación. Uso exclusivo y personal según art. 29 Ley PRL y RD 773/1997. Las cantidades pueden ajustarse si te entregan más o menos unidades.',
      obligatorio: true,
      norma: 'RD 773/1997 · Ley 31/1995 PRL',
      esListaEpis: true,
      epis: [
        { id: 'sudadera',     nombre: 'Sudadera',           color: 'Roja',           modelo: 'Roly', unidades: 1 },
        { id: 'camiseta',     nombre: 'Camiseta',           color: 'Blanca',         modelo: 'Roly', unidades: 3 },
        { id: 'banador',      nombre: 'Bañador',            color: 'Rojo',           modelo: 'Roly', unidades: 2 },
        { id: 'pantalon',     nombre: 'Pantalón largo',     color: 'Negro',          modelo: 'Roly', unidades: 1 },
        { id: 'gafas',        nombre: 'Gafas de sol',       color: 'Negras',         modelo: 'Roly', unidades: 1 },
        { id: 'gorra',        nombre: 'Gorra',              color: 'Roja y blanca',  modelo: 'Roly', unidades: 1 },
        { id: 'crema-solar',  nombre: 'Crema solar',        color: '—',              modelo: '—',    unidades: 1 }
      ],
      textoCompleto: `ENTREGA DE EQUIPOS DE PROTECCIÓN INDIVIDUAL

El/la trabajador/a reconoce haber recibido de la empresa Pool Safety Des Llevant, S.L. los Equipos de Protección Individual detallados en la tabla superior.

Los equipos de protección individual (en adelante EPI) son propiedad de la empresa y se ponen a disposición de la persona firmante para su uso exclusivo y personal, y en estricto cumplimiento de las obligaciones establecidas en el artículo 29 de la Ley de Prevención de Riesgos Laborales y el artículo 10 del R.D. 773/1997. En particular:

• Utilizar correctamente los medios y EPI facilitados de acuerdo con las instrucciones recibidas. Se deben leer las instrucciones de uso y seguir sus indicaciones, utilizando estos equipos en todas aquellas zonas y trabajos en los que sea obligatorio o aconsejable su uso.
• Utilizar los EPI única y exclusivamente para los fines para los que han sido diseñados.
• Cuidar adecuadamente los EPI entregados, manteniéndolos en buenas condiciones de uso.
• Informar de inmediato a su superior de cualquier defecto, anomalía o daño apreciado en el EPI utilizado que, a su juicio, pueda entrañar una pérdida de su eficacia, a fin de que se pueda proceder a su sustitución o reparación.

Asimismo, se deberá participar y atender a las instrucciones y formaciones impartidas por expertos de la empresa, empresa suministradora, o técnicos del servicio de prevención.

Con la firma de este documento reconozco haber recibido el/los equipo/s de protección individual y acepto las condiciones de uso. He sido informado de las obligaciones que en cuanto a su utilización se refieren.`
    }
  ];

  /* Documentos que ve el empleado (agrupados por bloque) */
  const documentos = [
    {
      id: 'kit-alta',
      grupo: 'alta',
      titulo: 'Kit Alta Empresa',
      subtitulo: 'Documentación laboral inicial (RGPD, geolocalización, EPIs, salud)',
      obligatorioAlAlta: true,
      subdocs: kitAltaSubdocs.map(s => s.id)
    },
    {
      id: 'jornada-2026-07',
      grupo: 'mensual',
      titulo: 'Registro jornada · julio 2026',
      subtitulo: 'Firma obligatoria el último día trabajado del mes',
      mes: 'julio',
      anio: 2026,
      firmaObligatoriaEl: '2026-07-31'
    },
    {
      id: 'jornada-2026-06',
      grupo: 'mensual',
      titulo: 'Registro jornada · junio 2026',
      subtitulo: 'Firmado el 30/06/2026',
      mes: 'junio',
      anio: 2026,
      yaFirmado: true
    }
  ];

  /* Estado de firmas por socorrista (persistido en localStorage) */
  function getFirmas() {
    const raw = localStorage.getItem('poolsafety-firmas-v1');
    return raw ? JSON.parse(raw) : {};
  }
  function saveFirmas(f) { localStorage.setItem('poolsafety-firmas-v1', JSON.stringify(f)); }

  function firmasDeSocorrista(socId) {
    const all = getFirmas();
    return all[socId] || {};
  }
  function firmarDocumento(socId, docId, meta) {
    const all = getFirmas();
    if (!all[socId]) all[socId] = {};
    all[socId][docId] = { ...meta, fecha: meta.fecha || new Date().toISOString() };
    saveFirmas(all);
  }
  function haFirmadoKitAlta(socId) {
    const f = firmasDeSocorrista(socId);
    return f['kit-alta'] && f['kit-alta'].completado === true;
  }

  /* ---------- Números globales para el dashboard ---------- */
  const totales = {
    puestosCubiertos: 80,
    puestosOK: 62,
    puestosTarde: 8,
    puestosFuera: 5,
    puestosPendientes: 5,
    socorristasPlantilla: 150,
    coordinadores: 2,
    alertasAbiertas: alertas.length
  };

  /* ---------- Sesión (rol y usuario actual) ---------- */
  function getSession() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  function setSession(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(STORAGE_KEY); }

  /* ---------- Estado dinámico del socorrista logueado (localStorage) ---------- */
  function getSocorristaState() {
    const key = 'poolsafety-soc-state';
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    return {
      fichado: false,
      horaEntrada: null,
      horaSalida: null,
      tareasHechas: ['t03']
    };
  }
  function setSocorristaState(s) { localStorage.setItem('poolsafety-soc-state', JSON.stringify(s)); }

  /* ---------- Helpers ---------- */
  function socorristaByPuesto(puestoId) {
    return socorristas.find(s => s.puestoId === puestoId);
  }
  function puestoById(id) { return puestos.find(p => p.id === id); }

  function ahora() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function fechaLarga() {
    const d = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]}`;
  }

  return {
    puestos, socorristas, fichajes, tareas, notas, inventario, alertas, totales,
    EMPRESA, documentos, kitAltaSubdocs,
    getSession, setSession, clearSession,
    getSocorristaState, setSocorristaState,
    getFirmas, saveFirmas, firmasDeSocorrista, firmarDocumento, haFirmadoKitAlta,
    socorristaByPuesto, puestoById, ahora, fechaLarga
  };
})();
