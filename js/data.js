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
      id: 'ka-marco',
      titulo: 'Marco laboral aplicable',
      resumen: 'Convenio colectivo, categoría profesional y datos de la empresa que rigen tu relación laboral.',
      obligatorio: true,
      norma: 'Convenio colectivo del sector de Vigilancia y Socorrismo de las Illes Balears · Estatuto de los Trabajadores',
      textoCompleto: `MARCO LABORAL APLICABLE

DATOS DE LA EMPRESA
• Denominación social: Pool Safety Des Llevant, S.L.
• NIF: B75828418
• Código de Cuenta de Cotización: 07132352204
• Domicilio: C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom (Felanitx), Illes Balears
• Correo corporativo: info@poolsafety.es
• Actividad: prestación de servicios de socorrismo acuático en piscinas y zonas de baño de establecimientos turísticos y municipales.

CONVENIO COLECTIVO APLICABLE
A la presente relación laboral le resulta de aplicación el Convenio colectivo del sector de Vigilancia y Socorrismo de las Illes Balears, así como, con carácter supletorio, el Estatuto de los Trabajadores (RDL 2/2015) y la normativa laboral y de prevención de riesgos vigente.

CATEGORÍA / GRUPO PROFESIONAL
Categoría profesional del trabajador: SOCORRISTA ACUÁTICO.
Grupo profesional según convenio: personal operativo de servicios de socorrismo.
Puesto asignado y centro de trabajo: los indicados en el contrato individual y comunicados al inicio de la relación laboral.

RECONOCIMIENTO DEL TRABAJADOR
Con la firma del presente documento el trabajador reconoce haber sido informado del convenio colectivo de aplicación, de la categoría/grupo profesional asignados y de la actividad y datos identificativos de la empresa. Cualquier modificación posterior del puesto o categoría se comunicará por escrito.`
    },
    {
      id: 'ka-privacidad',
      titulo: 'Política de privacidad · RGPD',
      resumen: 'Tratamiento de tus datos personales por Pool Safety Des Llevant, S.L., con la base legal concreta para cada finalidad (contrato, obligación legal o consentimiento).',
      obligatorio: true,
      norma: 'Reglamento UE 2016/679 (RGPD) · Ley Orgánica 3/2018 (LOPDGDD)',
      textoCompleto: `POLÍTICA DE PRIVACIDAD PARA EMPLEADOS

Mediante el siguiente documento la empresa cumple con el deber de información previsto en los arts. 13 y 14 RGPD y arts. 11 y 12 LOPDGDD. La firma acredita el cumplimiento del deber de informar, no constituye por sí sola consentimiento para tratamientos que no lo requieran (ver bases jurídicas más abajo).

RESPONSABLE DEL TRATAMIENTO
• Denominación: Pool Safety Des Llevant, S.L.
• NIF: B75828418
• Domicilio: C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom (Felanitx), Illes Balears
• Contacto en materia de protección de datos: info@poolsafety.es

DATOS PERSONALES QUE SE TRATAN
Únicamente los necesarios para la gestión de la relación laboral:
• Datos identificativos y de contacto (nombre, apellidos, firma, DNI/NIE, dirección, teléfono, correo).
• Datos de Seguridad Social, cuenta bancaria e información tributaria.
• Titulaciones profesionales (socorrismo, SVB, DEA, PRL) y permisos.
• Contrato, categoría profesional, nómina y variables retributivas.
• Contacto para emergencias.
• Datos del proceso de selección (CV, referencias, permiso de trabajo).
• Registro horario, fichajes y datos de geolocalización asociados al fichaje.
• Historial de amonestaciones, sanciones o expedientes disciplinarios (si los hubiera).
• Bajas médicas.
• Afiliación sindical (solo si el trabajador la comunica).
• Imagen (solo si otorga consentimiento — ver cláusula separada).

Categorías especiales (salud, origen étnico, orientación sexual, religión, opinión política, biometría…) sólo se tratarán con base jurídica específica (obligación legal PRL, consentimiento expreso u otra base del art. 9 RGPD). El trabajador puede no facilitar esta información salvo obligación legal, sin consecuencias.

FINALIDADES Y BASE JURÍDICA DE CADA TRATAMIENTO
La empresa distingue cada tratamiento con su base legal específica (art. 6 RGPD):

1) EJECUCIÓN DEL CONTRATO DE TRABAJO (art. 6.1.b RGPD):
   • Gestión del contrato, alta y baja del trabajador.
   • Pago de la nómina, deducciones, cotizaciones y variables retributivas.
   • Asignación de puesto, turnos y horario.
   • Gestión de titulaciones profesionales exigidas para el puesto.
   • Comunicaciones internas necesarias para el servicio.

2) OBLIGACIÓN LEGAL (art. 6.1.c RGPD):
   • Alta y afiliación en la Seguridad Social (LGSS).
   • Retenciones e ingresos a cuenta del IRPF (Ley 35/2006).
   • Registro horario obligatorio (RD-ley 8/2019).
   • Prevención de riesgos laborales y vigilancia de la salud (Ley 31/1995).
   • Notificaciones a autoridades laborales o judiciales cuando proceda.
   • Conservación documental por plazos legales (mínimo 4 años en materia laboral, 5 años SS).

3) INTERÉS LEGÍTIMO DE LA EMPRESA (art. 6.1.f RGPD):
   • Control del cumplimiento del horario y presencia efectiva en el puesto asignado (fichaje con GPS — véase cláusula específica).
   • Ejercicio de la potestad disciplinaria en base a la información objetiva registrada por los sistemas informados previamente al trabajador.
   • Prevención del fraude y garantía de la calidad del servicio.

4) CONSENTIMIENTO EXPRESO DEL TRABAJADOR (art. 6.1.a RGPD) — SÓLO para:
   • Captación y uso de imagen en web, redes sociales o material corporativo.
   • Comunicaciones a través de aplicaciones de mensajería no corporativa (WhatsApp).
   • Cualquier otro tratamiento accesorio que no esté cubierto por las bases anteriores.

   Estos consentimientos son voluntarios, revocables en cualquier momento y su denegación NO tendrá consecuencias laborales.

CESIONES / DESTINATARIOS
Sólo cuando exista base jurídica: entidades bancarias (nómina), Seguridad Social, AEAT, Mutua colaboradora, Servicio de Prevención Ajeno, autoridades y Juzgados. Ningún dato se cede a terceros con fines comerciales. No hay transferencias internacionales fuera del Espacio Económico Europeo.

CONSERVACIÓN
Durante la vigencia de la relación laboral y, tras su finalización, por los plazos legales exigidos (mínimo 4 años en materia laboral y 5 años en Seguridad Social). Los datos con base en consentimiento se suprimen si el trabajador lo revoca.

DERECHOS DEL TRABAJADOR
El trabajador puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad mediante escrito a info@poolsafety.es o por correo postal a la dirección arriba indicada. En caso de no obtener respuesta satisfactoria, puede presentar reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).`
    },
    {
      id: 'ka-geoloc',
      titulo: 'Tratamiento de geolocalización del móvil',
      resumen: 'Consentimiento para tratar los datos de GPS del dispositivo móvil personal — exclusivamente para el registro digital del fichaje.',
      obligatorio: true,
      norma: 'Art. 90 LOPDGDD · Art. 9 RGPD',
      resaltado: true,
      textoCompleto: `INFORMACIÓN SOBRE TRATAMIENTO DE DATOS DE GEOLOCALIZACIÓN

De conformidad con el art. 90 de la Ley Orgánica 3/2018 (LOPDGDD) y el Reglamento (UE) 2016/679 (RGPD), Pool Safety Des Llevant, S.L. (B75828418), con domicilio en C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, informa expresamente al trabajador de la existencia del siguiente sistema de geolocalización:

MEDIO UTILIZADO
Aplicación PoolSafety instalada en el dispositivo móvil del trabajador (propio o corporativo). El dato de posición se obtiene a través del GPS del sistema operativo, previa autorización de permisos por parte del trabajador.

CÓMO FUNCIONA EN LA PRÁCTICA
• La aplicación NO rastrea la posición del trabajador de forma continua ni fuera del horario de trabajo.
• La geolocalización se captura únicamente en momentos concretos e informados:
  1. Al pulsar "Fichar entrada" — para verificar que el trabajador se encuentra en el radio del centro de trabajo asignado (geocerca del hotel/piscina).
  2. Al pulsar "Fichar salida" — mismo fin.
  3. Al registrar una alerta desde el móvil (reporte de material, mensaje al coordinador) — para asociar la alerta al centro correspondiente.
• Fuera de esos momentos, la aplicación no accede al GPS. Al cerrar la sesión, no se recoge dato alguno.
• El trabajador puede en todo momento revocar el permiso de GPS desde los ajustes del sistema operativo. En tal caso, deberá utilizar los medios alternativos de fichaje que establezca la empresa.

FINALIDADES Y BASE JURÍDICA (art. 6 RGPD)
Los datos se tratan con finalidad exclusiva de:
1) Cumplimiento de la obligación legal de registro horario (RD-ley 8/2019) — art. 6.1.c RGPD.
2) Verificación de la presencia efectiva en el puesto asignado en cumplimiento del contrato — art. 6.1.b RGPD.
3) Ejercicio de la potestad disciplinaria empresarial en los términos legalmente previstos — art. 6.1.f RGPD.

PROPORCIONALIDAD Y DERECHOS
El sistema respeta los principios de necesidad, proporcionalidad y minimización: solo se registra la coordenada aproximada del momento del fichaje, no se realiza seguimiento continuo, y la información se limita al centro de trabajo y su entorno inmediato.

USO A EFECTOS DISCIPLINARIOS
El trabajador queda expresamente informado de que los datos de geolocalización obtenidos mediante este sistema podrán ser tenidos en cuenta a efectos disciplinarios en caso de incumplimientos laborales (por ejemplo, fichaje fuera de la zona asignada, ausencia sin justificar del puesto, fichaje simulado), en los términos previstos en el Estatuto de los Trabajadores y en el Convenio colectivo aplicable, siempre que el sistema haya sido implantado e informado correctamente al trabajador — como se hace en el presente documento — y con respeto a los principios de proporcionalidad y a los derechos fundamentales del trabajador.

CONSERVACIÓN
Los registros de geolocalización asociados a un fichaje se conservarán durante un plazo máximo de 4 años, junto con el resto de la documentación del registro horario, en cumplimiento de las obligaciones laborales y de prescripción de infracciones.

DERECHOS DEL TRABAJADOR
Acceso, rectificación, oposición, supresión, limitación y portabilidad, mediante escrito a info@poolsafety.es o correo postal a la dirección de la empresa. Puede reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`
    },
    {
      id: 'ka-electronica',
      titulo: 'Recepción de documentación por medios electrónicos',
      resumen: 'Autorización para recibir nóminas, avisos y notificaciones por correo electrónico y teléfono móvil (SMS, WhatsApp).',
      obligatorio: true,
      requiereCampos: ['emailPersonal','telefonoPersonal'],
      textoCompleto: `CONSENTIMIENTO PARA RECIBIR DOCUMENTACIÓN LABORAL POR MEDIOS ELECTRÓNICOS

Datos de la empresa
• Denominación: Pool Safety Des Llevant, S.L.
• NIF: B75828418
• Domicilio: C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom (Felanitx), Illes Balears

DATOS DEL TRABAJADOR (a rellenar por el propio trabajador en el paso siguiente)
El trabajador FACILITARÁ, para poder ejecutar esta autorización, un correo electrónico personal y un teléfono móvil personal, ambos de su titularidad y a los que tenga acceso habitual y privado. Estos datos figurarán expresamente en el ejemplar firmado del presente documento.

OBJETO
El trabajador autoriza a la empresa a remitirle por los medios electrónicos indicados la documentación relativa a su relación laboral, incluyendo:
• Contrato de trabajo y modificaciones.
• Recibos de salarios (nóminas).
• Comunicaciones sobre prevención de riesgos laborales.
• Notificaciones generales o individuales.
• Cualquier otra documentación legalmente exigible.

MEDIOS ELECTRÓNICOS AUTORIZADOS
1) Correo electrónico personal facilitado por el trabajador.
2) Teléfono móvil personal (llamadas, SMS o aplicaciones de mensajería instantánea, p. ej. WhatsApp).

CONDICIONES DE ENVÍO Y ACREDITACIÓN DE RECEPCIÓN
La empresa se compromete a utilizar los medios anteriores sólo para los fines aquí descritos. Para poder considerar realizada la notificación se seguirá el siguiente criterio:
• En envíos que legalmente exijan constancia (nóminas, comunicaciones sancionadoras, extinción del contrato, etc.), la empresa procurará acuse de recibo o respuesta del trabajador (correo electrónico con confirmación, mensaje leído, respuesta expresa), o utilizará vías con acreditación reforzada (correo certificado, burofax) cuando la relevancia del documento así lo requiera.
• En envíos ordinarios (nóminas periódicas, comunicaciones informativas, avisos operativos, cambios menores de calendario o turno) se entenderá razonablemente cumplida la comunicación cuando la empresa pueda acreditar el envío correcto al medio autorizado y no haya devolución o error técnico.
• En ningún caso se presume la recepción de comunicaciones que no puedan siquiera acreditarse como enviadas o cuyo destino esté manifiestamente inactivo (buzón lleno, número dado de baja, etc.).
• El trabajador se compromete a comunicar cualquier cambio de correo o teléfono.

PROTECCIÓN DE DATOS
Los datos se tratan conforme al RGPD y a la LOPDGDD, con la finalidad de gestionar las comunicaciones laborales, con base jurídica en la ejecución del contrato (art. 6.1.b RGPD), en las obligaciones legales aplicables (art. 6.1.c) y, cuando corresponda, en el consentimiento del trabajador (art. 6.1.a — típicamente para el uso de aplicaciones de mensajería no corporativa como WhatsApp).

REVOCACIÓN
El trabajador puede revocar en cualquier momento este consentimiento mediante notificación escrita a info@poolsafety.es. La revocación no afecta a la licitud de las comunicaciones anteriores. Tras la revocación, la empresa utilizará medios alternativos legalmente válidos.`
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
      textoCompleto: `INFORMACIÓN SOBRE VIGILANCIA DE LA SALUD (art. 22 Ley 31/1995 PRL)
Empresa: Pool Safety Des Llevant, S.L.

De conformidad con el artículo 22 de la Ley 31/1995 de Prevención de Riesgos Laborales, se informa al trabajador de que tiene derecho a la vigilancia periódica de su estado de salud en función de los riesgos inherentes al trabajo.

REGLA GENERAL: VOLUNTARIEDAD
Los reconocimientos médicos laborales son, con carácter general, VOLUNTARIOS. El trabajador puede aceptarlos o renunciar a ellos sin que su decisión pueda tener consecuencias negativas ni ser motivo de discriminación laboral.

Los exámenes de salud, cuando se realicen, se llevarán a cabo por personal sanitario del Servicio de Prevención Ajeno concertado por la empresa (actualmente PREVIS GESTIÓN DE RIESGOS S.L.U.), respetando en todo momento el derecho a la intimidad, la dignidad y la confidencialidad de la información. Las pruebas médicas se ajustarán a los protocolos específicos según los riesgos del puesto. Los resultados individuales sólo se comunican al propio trabajador; a la empresa únicamente se le informa de la aptitud/no aptitud para el puesto.

SUPUESTOS EN LOS QUE PUEDE NO REGIR LA VOLUNTARIEDAD
Excepcionalmente, la Ley 31/1995 y las normas específicas de PRL exceptúan la regla de voluntariedad, PREVIO INFORME DE LOS REPRESENTANTES DE LOS TRABAJADORES y siempre que sea imprescindible, en los siguientes supuestos:

a) Cuando la realización del reconocimiento sea imprescindible para EVALUAR LOS EFECTOS DE LAS CONDICIONES DE TRABAJO sobre la salud del trabajador.

b) Cuando sea necesario para VERIFICAR SI EL ESTADO DE SALUD DEL TRABAJADOR PUEDE CONSTITUIR UN PELIGRO para él mismo, para los demás trabajadores o para otras personas relacionadas con la empresa.

c) Cuando así esté ESTABLECIDO EN UNA DISPOSICIÓN LEGAL específica en relación con la protección de riesgos concretos y actividades de especial peligrosidad.

En cualquiera de estos supuestos, la obligatoriedad debe estar debidamente justificada por escrito por el Servicio de Prevención y no puede aplicarse de forma genérica o preventiva.

DECISIÓN DEL TRABAJADOR (a firmar en la pantalla siguiente)
Se solicita al trabajador que indique expresamente si acepta someterse al reconocimiento médico voluntario propuesto por la empresa. La respuesta negativa NO exime al trabajador de someterse, en su caso, a los reconocimientos que sean legalmente obligatorios conforme a los supuestos anteriores, si concurren los requisitos para ello.

Puesto de trabajo evaluado: SOCORRISTA ACUÁTICO en piscinas y zonas de baño.`
    },
    {
      id: 'ka-desconexion',
      titulo: 'Comunicación de desconexión digital',
      resumen: 'Reconocimiento del derecho a la desconexión digital fuera del horario laboral establecido.',
      obligatorio: true,
      norma: 'Art. 88 LOPDGDD',
      textoCompleto: `ACUSE DE RECIBO — DERECHO A LA DESCONEXIÓN DIGITAL

Empresa: Pool Safety Des Llevant, S.L.
Norma aplicable: art. 88 LOPDGDD y, en su caso, política interna de desconexión digital vigente en la empresa.

OBJETO DE ESTE DOCUMENTO
Este documento constituye un ACUSE DE RECIBO por parte del trabajador de la información básica sobre su derecho a la desconexión digital. No sustituye por sí solo la política interna completa de desconexión digital, que la empresa mantiene a disposición del personal y que desarrolla en detalle:
• El horario en el que rige la desconexión (fuera de jornada, descansos, vacaciones, permisos, incapacidad temporal).
• Los canales autorizados y no autorizados para comunicaciones profesionales.
• Los supuestos excepcionales que puedan justificar comunicaciones fuera de jornada (emergencias sanitarias, evacuación, situaciones críticas del servicio).
• Los responsables y procedimiento para incidencias.

DECLARACIÓN DEL TRABAJADOR
El trabajador declara, con la firma del presente documento, que ha sido informado con carácter general de que:
• Tiene derecho a la desconexión digital fuera de su horario de trabajo establecido, así como durante los períodos legales de descanso, vacaciones y permisos.
• Puede no atender llamadas, correos electrónicos o mensajes profesionales fuera de su horario laboral, sin que dicha conducta pueda ser objeto de sanción ni de trato desfavorable.
• La empresa se compromete, por su parte, a no dirigir al trabajador comunicaciones profesionales fuera de jornada, salvo situaciones de emergencia debidamente justificadas.
• Puede consultar en cualquier momento la política interna completa de desconexión digital solicitándola al correo info@poolsafety.es o al responsable de coordinación.

Nada de lo previsto aquí puede interpretarse como una renuncia del trabajador al derecho a la desconexión digital reconocido por la ley.`
    },
    {
      id: 'ka-epis',
      titulo: 'Entrega de EPIs y uniforme de trabajo',
      resumen: 'Recepción de Equipos de Protección Individual (EPIs) y de la ropa de trabajo/uniforme corporativo, con obligaciones diferenciadas según su naturaleza jurídica.',
      obligatorio: true,
      norma: 'RD 773/1997 y Ley 31/1995 PRL (EPIs) · Estatuto de los Trabajadores y convenio colectivo (uniforme)',
      esListaEpis: true,
      epis: [
        // EPIs — Equipos de Protección Individual (RD 773/1997)
        { id: 'gafas',        tipo: 'epi',      nombre: 'Gafas de sol (protección UV)',       color: 'Negras',         modelo: 'Roly', unidades: 1 },
        { id: 'gorra',        tipo: 'epi',      nombre: 'Gorra (protección solar cabeza)',    color: 'Roja y blanca',  modelo: 'Roly', unidades: 1 },
        { id: 'crema-solar',  tipo: 'epi',      nombre: 'Crema solar (factor alto)',          color: '—',              modelo: '—',    unidades: 1 },
        // Uniforme / ropa de trabajo (identificativa)
        { id: 'sudadera',     tipo: 'uniforme', nombre: 'Sudadera corporativa',                color: 'Roja',           modelo: 'Roly', unidades: 1 },
        { id: 'camiseta',     tipo: 'uniforme', nombre: 'Camiseta identificativa',             color: 'Blanca',         modelo: 'Roly', unidades: 3 },
        { id: 'banador',      tipo: 'uniforme', nombre: 'Bañador identificativo',              color: 'Rojo',           modelo: 'Roly', unidades: 2 },
        { id: 'pantalon',     tipo: 'uniforme', nombre: 'Pantalón largo',                      color: 'Negro',          modelo: 'Roly', unidades: 1 }
      ],
      textoCompleto: `ENTREGA DE EQUIPOS DE PROTECCIÓN INDIVIDUAL Y UNIFORME

La empresa Pool Safety Des Llevant, S.L. hace entrega al trabajador de los elementos detallados en la tabla superior, distinguiendo dos categorías jurídicamente distintas:

1) EQUIPOS DE PROTECCIÓN INDIVIDUAL (EPIs) — RD 773/1997 y Ley 31/1995 PRL
   Son elementos destinados a protegerle frente a riesgos concretos del puesto: en el caso del socorrista, principalmente radiación solar (UV) y sobreexposición al sol. Incluyen: gafas de sol homologadas, gorra de protección solar y crema solar de alto factor.

   El trabajador está OBLIGADO a:
   • Utilizarlos correctamente y siempre en las condiciones en las que sean necesarios (radiación solar directa, condiciones de exposición al sol propias del puesto).
   • Emplearlos exclusivamente para los fines de protección para los que han sido diseñados.
   • Cuidarlos y mantenerlos en buenas condiciones.
   • Informar inmediatamente a su superior de cualquier defecto o pérdida de eficacia, para su sustitución.
   • Participar en las formaciones e instrucciones impartidas por la empresa o el Servicio de Prevención sobre su uso.

   Incumplimientos: el uso indebido, no uso o negligencia respecto de los EPIs podrá ser objeto de la potestad disciplinaria empresarial en los términos del Estatuto de los Trabajadores y del convenio colectivo aplicable, por afectar directamente a la prevención de riesgos y a la salud del propio trabajador.

2) UNIFORME / ROPA DE TRABAJO
   Incluye la sudadera, la camiseta identificativa, el bañador y el pantalón, con la función principal de identificación del trabajador como personal de socorrismo y de imagen corporativa. Aunque no son EPIs en sentido estricto, forman parte de las obligaciones derivadas de la relación laboral y del convenio colectivo, en cuanto a su uso durante la jornada, cuidado y devolución al finalizar la relación laboral.

CONDICIONES COMUNES
Tanto los EPIs como el uniforme son PROPIEDAD DE LA EMPRESA y se entregan al trabajador para su uso personal durante la vigencia de la relación laboral. A la finalización del contrato deberán ser devueltos en el estado normal de uso, salvo aquellos elementos consumibles (crema solar). Las reposiciones por desgaste normal serán proporcionadas por la empresa, previa comunicación del trabajador.

DECLARACIÓN
Con la firma de este documento el trabajador reconoce haber recibido los elementos detallados y haber sido informado de las obligaciones asociadas a cada categoría (EPI / uniforme). Las cantidades reflejadas en la tabla se ajustan a lo efectivamente entregado según el criterio del trabajador.`
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
window.PS = PS;
