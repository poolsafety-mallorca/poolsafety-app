/* ==========================================================================
   PoolSafety · Presupuestos (sql/32) · SOLO ADMINISTRADOR
   --------------------------------------------------------------------------
   Crear presupuestos para clientes y sacar el PDF de presentación.

   NO SE GUARDA NINGÚN TOTAL, y es a propósito: el presupuesto fija número de
   socorristas y precio/hora, y se factura sobre horas realmente prestadas al
   cierre de mes. Un total impreso invita a que el cliente lo tome por precio
   cerrado, y el horario varía con la temporada, los turnos y la ocupación.

   DICTADO POR VOZ
   Usa SpeechRecognition del propio navegador: gratis, sin servidor y sin
   clave de API. Importa porque este repositorio es PÚBLICO — una clave de
   pago aquí se la gasta cualquiera. El texto se interpreta con reglas en
   castellano (abajo, GRAMATICA) y SIEMPRE se enseña lo entendido para que el
   administrador lo revise antes de guardar. Nunca crea nada a ciegas.
   ========================================================================== */
window.PSPresup = (function () {

  const sb = () => window.sb;
  const esAdmin = () => ((window.PS_SESSION || {}).rol === 'dueno');
  const toast = (m) => (window.toast ? window.toast(m) : console.log(m));
  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  let lista = [];
  let actual = null;        // presupuesto en edición
  let faltaSQL = false;     // sql/32 sin ejecutar

  /* Cómo se cobra un extra. Antes había dos controles para lo mismo (una
     casilla "incluido" y un desplegable de periodicidad) y podían
     contradecirse: se marcaba incluido Y mensual a la vez. Ahora es UN campo.
     `modoDe()` traduce los presupuestos viejos para que sigan abriéndose. */
  const MODOS = [
    { v:'incluido', lab:'Incluido sin coste', corto:'Incluido' },
    { v:'hora',     lab:'Por hora',           corto:'€/hora' },
    { v:'servicio', lab:'Por servicio',       corto:'€/servicio' },
    { v:'mes',      lab:'Al mes',             corto:'€/mes' },
    { v:'contrato', lab:'Pago único (contrato)', corto:'Pago único' }
  ];
  function modoDe(e) {
    if (e && e.modo) return e.modo;
    if (!e) return 'contrato';
    if (e.incluido) return 'incluido';
    if (/mensual|mes/i.test(e.periodicidad || '')) return 'mes';
    if (/hora/i.test(e.periodicidad || '')) return 'hora';
    if (/servicio/i.test(e.periodicidad || '')) return 'servicio';
    return 'contrato';
  }

  /* Tipos de trabajador. `trabajo` es sólo la sugerencia que se rellena sola
     al elegir el tipo: siempre se puede reescribir, es un campo libre.
     OJO: las líneas guardadas antes de esto no llevan `tipo`, así que
     `tipoDe()` las lee como socorrista y los presupuestos viejos se abren
     igual que siempre. */
  const TIPOS = [
    { v:'socorrista',  lab:'Socorrista',  plural:'Socorristas',
      trabajo:'Vigilancia y rescate en la lámina de agua durante todo el horario de apertura, con revisión diaria de botiquín y material.' },
    { v:'monitor',     lab:'Monitor',     plural:'Monitores',
      trabajo:'Actividades acuáticas dirigidas y apoyo al socorrista de puesto.' },
    { v:'supervisor',  lab:'Supervisor',  plural:'Supervisores',
      trabajo:'Cubrir todos los turnos de comida con el fin de no dejar ninguna piscina vacía.' },
    { v:'coordinador', lab:'Coordinador', plural:'Coordinadores',
      trabajo:'Coordinación del equipo en la isla, sustituciones y enlace permanente con Dirección.' },
    { v:'vigilante',   lab:'Vigilante',   plural:'Vigilantes',
      trabajo:'Control de acceso y aforo de la zona de baño.' }
  ];
  function tipoDe(s) {
    const v = (s && s.tipo) || 'socorrista';
    return TIPOS.some(t => t.v === v) ? v : 'socorrista';
  }
  const tipoLab = (v, n) => {
    const t = TIPOS.find(x => x.v === v) || TIPOS[0];
    return (n === 1) ? t.lab : t.plural;
  };
  /* Precio/hora de un tipo. `precio_hora` ES el del socorrista: es lo que ha
     significado siempre y lo que imprime el PDF, así que no se toca. Los
     demás tipos viven en `precios_tipo`. */
  function precioTipo(pr, v) {
    if (v === 'socorrista') return pr.precio_hora;
    const m = pr.precios_tipo || {};
    return m[v] == null ? null : m[v];
  }
  /* Tipos realmente usados en este presupuesto, en el orden del catálogo. */
  function tiposEnUso(pr) {
    const usados = new Set((pr.servicios || []).map(tipoDe));
    return TIPOS.filter(t => usados.has(t.v)).map(t => t.v);
  }

  /* ------------------------------------------------------------------
     APRENDER LAS FUNCIONES DE CADA PERFIL
     El cliente escribe una vez qué hace un supervisor y a partir de ahí
     quiere que salga solo. No hace falta ni tabla ni columna: `cargar()`
     ya se trae los últimos 200 presupuestos con sus `servicios`, así que
     la descripción se saca de ahí. Cero consultas extra — importante, que
     la cuota de egress de Supabase ya dio un aviso.

     Gana LA MÁS RECIENTE, no la más repetida: así, si corrige el texto una
     vez, el siguiente presupuesto ya sale corregido. Con la más repetida
     habría que escribirla varias veces para que cambiara.

     `fecha` no sirve para ordenar: es la fecha del presupuesto y varios
     caen el mismo día. Se usa `updated_at`, que es la hora real de la
     última edición.
     ------------------------------------------------------------------ */
  const cuando = (pr) => Date.parse(pr.updated_at || pr.created_at || pr.fecha || 0) || 0;
  /* Para comparar nombres de instalación: sin tildes, sin mayúsculas y con los
     espacios de dentro colapsados. «Hotel  Palmira» y «hotel palmira» son el
     mismo sitio, y escribir dos espacios sin querer es facilísimo. */
  const claveInst = (x) => sinTildes(x || '').trim().replace(/\s+/g, ' ');

  function trabajoAprendido(tipoV, instalacion) {
    const cands = [];
    (lista || []).forEach(pr => {
      (pr.servicios || []).forEach(sv => {
        const txt = (sv.trabajo || '').trim();
        if (txt && tipoDe(sv) === tipoV) {
          cands.push({ txt: txt, inst: claveInst(sv.instalacion), t: cuando(pr) });
        }
      });
    });
    if (!cands.length) return null;
    cands.sort((a, b) => b.t - a.t);
    // Si ya hay escrito algo para ESTA misma instalación, eso manda: el
    // trabajo del socorrista del Luna Park puede no ser el del Palmira.
    const inst = claveInst(instalacion);
    if (inst) {
      const mismo = cands.find(c => c.inst === inst);
      if (mismo) return mismo.txt;
    }
    return cands[0].txt;
  }

  /* Lo que se pone en el campo al elegir un perfil: primero lo aprendido de
     presupuestos anteriores y, si es la primera vez, el texto de partida del
     catálogo. Devuelve también de dónde salió, para poder decírselo. */
  function sugerenciaTrabajo(tipoV, instalacion) {
    const ap = trabajoAprendido(tipoV, instalacion);
    if (ap) return { txt: ap, aprendido: true };
    const t = TIPOS.find(x => x.v === tipoV) || TIPOS[0];
    return { txt: t.trabajo, aprendido: false };
  }

  const EXTRAS_SUGERIDOS = [
    { concepto: 'Desfibrilador (DESA)',        detalle: 'Equipo homologado por establecimiento. Baterías y parches incluidos durante toda la vigencia del contrato.', modo: 'contrato' },
    { concepto: 'Formación en DESA',           detalle: 'Uso del desfibrilador y primeros auxilios para personal del hotel.', modo: 'incluido' },
    { concepto: 'Equipo de oxigenoterapia',    detalle: 'Botella, caudalímetro, mascarillas y revisión periódica de carga.', modo: 'contrato' },
    { concepto: 'Sistema de intercomunicación',detalle: 'Emisoras para comunicación directa entre socorristas y con recepción.', modo: 'mes' },
    { concepto: 'App de gestión · Dirección',  detalle: 'Acceso del hotel a fichajes, revisiones de material y partes en tiempo real.', modo: 'incluido' }
  ];

  const vacio = () => ({
    numero: '', fecha: new Date().toISOString().slice(0,10), validez_dias: 30,
    estado: 'borrador', cliente_nombre: '', cliente_att: '', cliente_direccion: '',
    cliente_cif: '', cliente_instalaciones: '', precio_hora: null, iva_pct: 21, precios_tipo: {},
    servicios: [], extras: [], notas: ''
  });

  /* ======================= CARGA Y GUARDADO ======================= */

  async function cargar() {
    if (!sb() || !esAdmin()) return;
    try {
      const { data, error } = await sb().from('presupuestos')
        .select('*').order('fecha', { ascending: false }).limit(200);
      if (error) throw error;
      lista = data || []; faltaSQL = false;
    } catch (err) {
      // La tabla puede no existir todavía (sql/32 sin ejecutar). En vez de
      // soltar un error en crudo, se enseña el paso que falta.
      if (/presupuestos/i.test(err.message || '') &&
          /(does not exist|schema cache|relation)/i.test(err.message || '')) {
        faltaSQL = true; lista = [];
      } else { throw err; }
    }
  }

  // PS_SESSION guarda `empresa_id`, NO `empresaId`. Leer el camelCase daba
  // siempre null, y como la policy de insert exige
  // `empresa_id = auth_empresa()`, la base de datos rechazaba el guardado:
  // no se guardaba ni un presupuesto, y por eso la lista salía vacía.
  let empresaCache = null;
  async function empresaActual() {
    const psSes = window.PS_SESSION || {};
    if (psSes.empresa_id) return psSes.empresa_id;
    if (empresaCache) return empresaCache;
    try {
      const { data } = await sb().from('usuarios')
        .select('empresa_id').eq('id', psSes.userId).single();
      empresaCache = (data || {}).empresa_id || null;
    } catch (_) { empresaCache = null; }
    return empresaCache;
  }

  async function siguienteNumero() {
    try {
      const { data, error } = await sb().rpc('siguiente_numero_presupuesto');
      if (!error && data) return data;
    } catch (_) {}
    // Respaldo si la RPC no está: el siguiente al MAYOR number del año, no
    // "cuántos hay + 1" — contar se repite en cuanto se borra alguno.
    const anio = new Date().getFullYear();
    const re = new RegExp('^PRE-' + anio + '-(\\d+)$');
    const ultimo = lista.reduce((max, p) => {
      const m = re.exec(p.numero || '');
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    return `PRE-${anio}-${String(ultimo + 1).padStart(4, '0')}`;
  }

  /* sql/33 añade la columna `precios_tipo`. Si el cliente todavía no lo ha
     ejecutado, la columna no existe y el guardado fallaría entero. Antes que
     volver a dejarle sin poder guardar NADA —que es justo el fallo que se
     acaba de corregir—, se guarda sin esa columna y se avisa. Lo único que
     se pierde hasta que ejecute el SQL es el precio de los tipos que no son
     socorrista; todo lo demás se guarda igual. */
  let faltaSQL33 = false;
  const faltaColumnaPrecios = (err) => {
    const m = (err && err.message) || '';
    return /precios_tipo/i.test(m) && /(column|schema cache|does not exist)/i.test(m);
  };

  async function guardar() {
    if (!esAdmin()) { toast('Solo el administrador puede crear presupuestos'); return false; }
    const p = actual;
    if (!p.cliente_nombre || !p.cliente_nombre.trim()) { toast('Falta el nombre del cliente'); return false; }
    if (p.precio_hora == null || isNaN(p.precio_hora)) { toast('Falta el precio por hora'); return false; }
    // Si hay un supervisor en la lista pero nadie le ha puesto precio, el PDF
    // saldría con un hueco delante del cliente. Mejor avisar al guardar.
    const sinPrecio = tiposEnUso(p).filter(v => {
      const x = precioTipo(p, v);
      return x == null || isNaN(x);
    });
    if (sinPrecio.length) {
      toast('Falta el precio por hora de: ' + sinPrecio.map(v => tipoLab(v, 2).toLowerCase()).join(', '));
      return false;
    }

    const psSes = window.PS_SESSION || {};
    const fila = {
      numero: p.numero, fecha: p.fecha, validez_dias: p.validez_dias || 30,
      estado: p.estado || 'borrador',
      cliente_nombre: p.cliente_nombre.trim(), cliente_att: p.cliente_att || null,
      cliente_direccion: p.cliente_direccion || null, cliente_cif: p.cliente_cif || null,
      cliente_instalaciones: p.cliente_instalaciones || null,
      precio_hora: p.precio_hora, iva_pct: p.iva_pct == null ? 21 : p.iva_pct,
      servicios: p.servicios || [], extras: p.extras || [],
      notas: p.notas || null, updated_at: new Date().toISOString()
    };
    if (!faltaSQL33) fila.precios_tipo = p.precios_tipo || {};
    try {
      if (p.id) {
        let r = await sb().from('presupuestos').update(fila).eq('id', p.id).select();
        if (r.error && faltaColumnaPrecios(r.error)) {
          faltaSQL33 = true; delete fila.precios_tipo;
          r = await sb().from('presupuestos').update(fila).eq('id', p.id).select();
        }
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) { toast('No se guardó: 0 filas. ¿Sigues siendo administrador?'); return false; }
        actual = r.data[0];
      } else {
        const empresaId = await empresaActual();
        if (!empresaId) {
          toast('No se ha podido identificar tu empresa. Cierra sesión, vuelve a entrar e inténtalo otra vez.');
          return false;
        }
        fila.empresa_id = empresaId;
        fila.creado_por = psSes.userId || null;

        // El número definitivo se pide JUSTO ahora, no al abrir el formulario:
        // así va correlativo de verdad según se guardan, aunque se dejen
        // borradores a medias o se abran dos a la vez.
        let intento = 0, data = null;
        while (intento < 3) {
          fila.numero = await siguienteNumero();
          let r = await sb().from('presupuestos').insert(fila).select();
          if (r.error && faltaColumnaPrecios(r.error)) {
            faltaSQL33 = true; delete fila.precios_tipo;
            r = await sb().from('presupuestos').insert(fila).select();
          }
          if (!r.error) { data = r.data; break; }
          // idx_presupuestos_numero es único por (empresa_id, numero): si dos
          // guardados caen a la vez, se reintenta con el siguiente libre.
          if (/duplicate key|already exists|23505/i.test(r.error.message || '')) { intento++; continue; }
          throw r.error;
        }
        if (!data) { toast('No se pudo asignar número al presupuesto. Inténtalo otra vez.'); return false; }
        if (!data.length) { toast('No se guardó: 0 filas. ¿Sigues siendo administrador?'); return false; }
        actual = data[0];
      }
      await cargar();
      toast(faltaSQL33
        ? '✓ Guardado, pero falta ejecutar sql/33 en Supabase: el precio de los perfiles que no son socorrista no se ha guardado. Avisa al desarrollador.'
        : '✓ Presupuesto guardado');
      return true;
    } catch (err) {
      const m = err.message || '';
      // El rechazo de RLS llega con un texto que no dice nada al usuario.
      if (/row-level security|violates row-level/i.test(m)) {
        toast('La base de datos ha rechazado el guardado: tu usuario no consta como administrador de la empresa. Avisa al desarrollador.');
      } else {
        toast('Error guardando: ' + m);
      }
      return false;
    }
  }

  async function borrar(id) {
    if (!confirm('¿Borrar este presupuesto? No se puede deshacer.')) return;
    try {
      const { data, error } = await sb().from('presupuestos').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) { toast('No se pudo borrar'); return; }
      toast('✓ Borrado'); await cargar(); render();
    } catch (err) { toast('Error: ' + err.message); }
  }

  /* ======================= DICTADO POR VOZ ======================= */

  const NUM = {
    cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7,
    ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15,
    dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20,
    veintiuno:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25,
    treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80,
    noventa:90, cien:100, ciento:100
  };
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                 'agosto','septiembre','octubre','noviembre','diciembre'];

  function sinTildes(t) {
    return String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function aNumero(txt) {
    const t = sinTildes(txt).trim();
    const d = t.match(/-?\d+(?:[.,]\d+)?/);
    if (d) return parseFloat(d[0].replace(',', '.'));
    // "quince con sesenta" / "quince sesenta"
    const partes = t.split(/\s+con\s+|\s+coma\s+|\s+/).filter(Boolean);
    const n = partes.map(p => NUM[p]).filter(v => v != null);
    if (!n.length) return null;
    if (n.length === 1) return n[0];
    if (n[0] >= 20 && n[1] < 10) return n[0] + n[1];      // "treinta y dos"
    return parseFloat(n[0] + '.' + String(n[1]).padStart(2,'0'));
  }
  function aMes(txt) {
    const t = sinTildes(txt);
    const i = MESES.findIndex(m => t.includes(sinTildes(m)));
    return i < 0 ? null : String(i+1).padStart(2,'0');
  }

  /* Gramática: cada entrada reconoce "<palabra clave> <valor>" dentro del
     dictado. El orden importa — las claves más largas van antes para que
     "precio hora" no lo capture "precio". */
  const GRAMATICA = [
    { campo:'cliente_nombre',       claves:['cliente','para el cliente'] },
    { campo:'cliente_att',          claves:['a la atencion de','atencion','att'] },
    { campo:'cliente_cif',          claves:['cif','ce i efe'], limpia: v => v.replace(/\s+/g,'').toUpperCase() },
    { campo:'cliente_direccion',    claves:['direccion','domicilio'] },
    { campo:'cliente_instalaciones',claves:['instalaciones'] },
    { campo:'precio_hora',          claves:['precio hora','precio por hora','precio'], num:true },
    { campo:'iva_pct',              claves:['iva'], num:true },
    { campo:'validez_dias',         claves:['validez'], num:true },
    { campo:'notas',                claves:['nota','observaciones'] }
  ];

  function interpretar(textoCrudo) {
    /* "por servicio" y "por hora" llevan dentro palabras que abren bloque
       ("servicio") o son clave ("hora"), así que se pegan ANTES de partir el
       texto. Sin esto, "350 euros por servicio" cortaba el extra en seco y
       abría un servicio fantasma. Se hace pegándolas y no con lookbehind
       porque el Safari de los iPhone viejos no lo soporta. */
    const texto = ' ' + sinTildes(textoCrudo).replace(/[.;]/g, ' ')
      .replace(/\bpor\s+servicio\b/g, 'porservicio')
      .replace(/\bpor\s+hora\b/g, 'porhora')
      .replace(/\bal\s+mes\b/g, 'almes')
      .replace(/\bpor\s+mes\b/g, 'almes') + ' ';
    const out = { campos:{}, servicios:[], extras:[], noEntendido:[] };

    // --- campos simples ---
    const marcas = [];
    GRAMATICA.forEach(g => g.claves.forEach(c => {
      let i = texto.indexOf(' ' + c + ' ');
      while (i >= 0) { marcas.push({ i, fin: i + c.length + 2, g, c }); i = texto.indexOf(' ' + c + ' ', i + 1); }
    }));
    marcas.sort((a,b) => a.i - b.i || b.c.length - a.c.length);
    const usados = [];
    marcas.forEach(m => {
      if (usados.some(u => m.i < u.fin && m.fin > u.i)) return;
      if (out.campos[m.g.campo] != null) return;
      const sig = marcas.find(x => x.i >= m.fin && !usados.some(u => x.i < u.fin && x.fin > u.i));
      let bruto = texto.slice(m.fin, sig ? sig.i : texto.length).trim();
      // "servicio" y "extra" abren sus propios bloques: ningún campo simple
      // puede tragárselos. Sin este corte, "precio hora quince con sesenta
      // servicio ... de 10 a 18" se quedaba con el 10 del horario.
      const corte = bruto.search(/\b(servicio|extra)\b/);
      if (corte > 0) bruto = bruto.slice(0, corte).trim();
      // Un número no se dicta en diez palabras: con las tres primeras basta y
      // así no arrastra lo que venga detrás.
      if (m.g.num) bruto = bruto.split(/\s+/).slice(0, 3).join(' ');
      if (!bruto) return;
      usados.push(m);
      let v = m.g.num ? aNumero(bruto) : bruto;
      if (v == null || v === '') return;
      if (m.g.limpia) v = m.g.limpia(String(v));
      out.campos[m.g.campo] = v;
    });

    // --- servicios: "servicio <nombre> <N> socorristas de <mes> a <mes> de <h> a <h>" ---
    const reSvc = /\bservicio\s+(.+?)(?=\s+\bservicio\s+|\s+\bextra\s+|$)/g;
    let m2;
    while ((m2 = reSvc.exec(texto)) !== null) {
      const t = m2[1].trim(); if (!t) continue;
      const soc = t.match(/(\d+|un|dos|tres|cuatro|cinco|seis|siete|ocho)\s+socorrista/);
      const mesA = t.match(/\bde\s+([a-z]+)\s+a\s+([a-z]+)/);
      const hor  = t.match(/de\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s+a\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?/);
      let nombre = t
        .replace(/\s*(\d+|un|dos|tres|cuatro|cinco|seis|siete|ocho)\s+socorristas?.*/,'')
        .replace(/\s*\bde\s+[a-z]+\s+a\s+[a-z]+.*/,'').trim();
      const m1 = mesA && aMes(mesA[1]), mFin = mesA && aMes(mesA[2]);
      out.servicios.push({
        instalacion: nombre || '(sin nombre)',
        periodo: (m1 && mFin) ? `01/${m1} – 30/${mFin}` : '',
        horario: hor ? `${String(hor[1]).padStart(2,'0')}:${hor[2]||'00'}–${String(hor[3]).padStart(2,'0')}:${hor[4]||'00'}` : '',
        socorristas: soc ? (aNumero(soc[1]) || 1) : 1
      });
    }

    // --- extras: "extra <concepto> <N> unidades <P> euros mensual|contrato" ---
    const reExt = /\bextra\s+(.+?)(?=\s+\bextra\s+|\s+\bservicio\s+|$)/g;
    while ((m2 = reExt.exec(texto)) !== null) {
      const t = m2[1].trim(); if (!t) continue;
      const uds = t.match(/(\d+|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:unidades?|uds)/);
      const eur = t.match(/([\d.,]+|[a-z\s]+?)\s*euros/);
      const inc = /incluid|gratis|sin coste|sin cargo/.test(t);
      const modo = inc ? 'incluido'
        : /porhora/.test(t) ? 'hora'
        : /porservicio/.test(t) ? 'servicio'
        : /mensual|almes/.test(t) ? 'mes'
        : 'contrato';
      let concepto = t
        .replace(/\s*(\d+|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:unidades?|uds).*/,'')
        .replace(/\s*([\d.,]+)\s*euros.*/,'')
        .replace(/\s*(mensual|almes|porhora|porservicio|contrato|incluido|incluida|gratis|sin coste|sin cargo)\b.*/,'').trim();
      const sug = EXTRAS_SUGERIDOS.find(e => sinTildes(e.concepto).includes(concepto) || concepto.includes(sinTildes(e.concepto).slice(0,8)));
      out.extras.push({
        concepto: sug ? sug.concepto : (concepto || '(sin nombre)'),
        detalle: sug ? sug.detalle : '',
        uds: uds ? (aNumero(uds[1]) || 1) : 1,
        precio: inc ? null : (eur ? aNumero(eur[1]) : null),
        modo: modo
      });
    }
    return out;
  }

  function hayVoz() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  let reco = null;
  function dictar(onTexto, onEstado) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Este navegador no permite dictado por voz'); return null; }
    if (reco) { try { reco.stop(); } catch(_){} reco = null; onEstado && onEstado('parado'); return null; }
    reco = new SR();
    reco.lang = 'es-ES';
    reco.continuous = true;
    reco.interimResults = true;
    let finalTxt = '';
    reco.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalTxt += r[0].transcript + ' '; else interim += r[0].transcript;
      }
      onTexto(finalTxt, interim);
    };
    reco.onerror = (ev) => {
      reco = null;
      onEstado && onEstado('parado');
      if (ev.error === 'not-allowed') toast('Hay que dar permiso al micrófono');
      else if (ev.error === 'no-speech') toast('No se oyó nada');
      else toast('Dictado: ' + ev.error);
    };
    reco.onend = () => { reco = null; onEstado && onEstado('parado'); };
    try { reco.start(); onEstado && onEstado('grabando'); }
    catch (err) { reco = null; toast('No se pudo arrancar el dictado'); }
    return reco;
  }
  function pararDictado() { if (reco) { try { reco.stop(); } catch(_){} reco = null; } }


  /* ======================= INTERFAZ ======================= */

  const $ = (id) => document.getElementById(id);
  const eur = (n) => (n == null || n === '' || isNaN(n)) ? '—'
    : Number(n).toLocaleString('es-ES',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';

  function render() {
    const cont = $('presupuestosBody');
    if (!cont) return;
    if (!esAdmin()) {
      cont.innerHTML = '<div class="alert-strip warn" style="margin:10px;">Esta sección es sólo para el administrador.</div>';
      return;
    }
    if (faltaSQL) {
      cont.innerHTML = `
        <div style="margin:10px;padding:14px;border:1px solid #F59E0B;background:#FFFBEB;border-radius:10px;">
          <div style="font-weight:700;color:#78350F;margin-bottom:6px;">Falta un paso en la base de datos</div>
          <div style="font-size:13px;color:#78350F;line-height:1.5;">
            Los presupuestos necesitan una tabla que todavía no existe. En Supabase →
            <b>SQL Editor</b> → <b>New query</b>, pega entero el fichero
            <code>sql/32-presupuestos.sql</code> del proyecto y dale a <b>Run</b>.
            Luego recarga esta página.
          </div>
        </div>`;
      return;
    }
    cont.innerHTML = actual ? editorHTML() : listaHTML();
    if (actual) enlazarEditor(); else enlazarLista();
  }

  function listaHTML() {
    const filas = lista.map(p => `
      <tr>
        <td style="font-family:monospace;font-weight:700;">${esc(p.numero)}</td>
        <td>${new Date(p.fecha).toLocaleDateString('es-ES')}</td>
        <td><b>${esc(p.cliente_nombre)}</b>${p.cliente_instalaciones ? '<div class="small text-muted">'+esc(p.cliente_instalaciones)+'</div>' : ''}</td>
        <td class="n">${eur(p.precio_hora)}<span class="small text-muted">/h</span></td>
        <td><span class="badge ${p.estado==='aceptado'?'badge-ok':p.estado==='rechazado'?'badge-danger':'badge-neutral'}">${esc(p.estado)}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-outline btn-sm" data-abrir="${p.id}">Abrir</button>
          <button class="btn btn-outline btn-sm" data-pdf="${p.id}">PDF</button>
          <button class="btn-icon" data-borrar="${p.id}" title="Borrar"
            style="width:30px;height:30px;background:#FEF2F2;color:#DC2626;border-radius:6px;border:none;cursor:pointer;">
            <svg class="ic ic-14"><use href="#ic-x"/></svg></button>
        </td>
      </tr>`).join('');

    return `
      <div class="row gap-2" style="padding:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-primary" id="pNuevo">
          <svg class="ic ic-16"><use href="#ic-plus"/></svg> Nuevo presupuesto</button>
        <button class="btn btn-outline" id="pVoz" ${hayVoz()?'':'disabled title="Este navegador no permite dictado"'}>
          🎙️ Crear dictando</button>
        <div style="flex:1"></div>
        <span class="small text-muted">${lista.length} presupuesto${lista.length===1?'':'s'}</span>
      </div>
      ${lista.length === 0 ? `
        <div class="text-muted small" style="padding:26px;text-align:center;">
          Todavía no hay presupuestos. Crea el primero con el botón de arriba, o dictándolo con la voz.
        </div>` : `
        <div style="overflow-x:auto;padding:0 10px 12px;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="text-align:left;">
              <th style="padding:6px;border-bottom:2px solid #B91C1C;">Nº</th>
              <th style="padding:6px;border-bottom:2px solid #B91C1C;">Fecha</th>
              <th style="padding:6px;border-bottom:2px solid #B91C1C;">Cliente</th>
              <th style="padding:6px;border-bottom:2px solid #B91C1C;text-align:right;">Precio/h</th>
              <th style="padding:6px;border-bottom:2px solid #B91C1C;">Estado</th>
              <th style="border-bottom:2px solid #B91C1C;"></th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`}`;
  }

  function enlazarLista() {
    const b = $('pNuevo');
    if (b) b.onclick = async () => { actual = vacio(); actual.numero = await siguienteNumero(); render(); };
    const v = $('pVoz');
    if (v) v.onclick = abrirDictado;
    document.querySelectorAll('[data-abrir]').forEach(el => el.onclick = () => {
      actual = JSON.parse(JSON.stringify(lista.find(x => x.id === el.dataset.abrir)));
      actual.servicios = actual.servicios || []; actual.extras = actual.extras || [];
      render();
    });
    document.querySelectorAll('[data-pdf]').forEach(el => el.onclick = () => descargarPdf(lista.find(x => x.id === el.dataset.pdf)));
    document.querySelectorAll('[data-borrar]').forEach(el => el.onclick = () => borrar(el.dataset.borrar));
  }

  function filaServicio(s, i) {
    const tv = tipoDe(s);
    return `<tr>
      <td><input class="in" data-s="${i}" data-k="instalacion" value="${esc(s.instalacion)}" placeholder="Hotel · Piscina"></td>
      <td><input class="in" data-s="${i}" data-k="periodo" value="${esc(s.periodo)}" placeholder="01/05 – 31/10" style="width:120px"></td>
      <td><input class="in" data-s="${i}" data-k="horario" value="${esc(s.horario)}" placeholder="10:00–18:00" style="width:110px"></td>
      <td><select class="in" data-s="${i}" data-k="tipo" style="width:124px">
        ${TIPOS.map(t => `<option value="${t.v}"${t.v===tv?' selected':''}>${esc(t.lab)}</option>`).join('')}
      </select></td>
      <td><input class="in" type="number" min="1" data-s="${i}" data-k="socorristas" value="${s.socorristas||1}" style="width:70px"></td>
      <td><button class="btn-icon" data-qs="${i}" title="Quitar" style="width:28px;height:28px;background:#FEF2F2;color:#DC2626;border:none;border-radius:6px;cursor:pointer;">✕</button></td>
    </tr>
    <tr>
      <td colspan="6" style="padding-top:0;border-top:none;">
        <input class="in" data-s="${i}" data-k="trabajo" value="${esc(s.trabajo||'')}"
               placeholder="Trabajo a realizar por ${esc(tipoLab(tv,1).toLowerCase())} — sale tal cual en el presupuesto"
               style="width:100%;font-size:12.5px;">
      </td>
    </tr>`;
  }
  /* Sólo pide precio de los tipos que de verdad se usan en este presupuesto:
     si no hay ningún supervisor, no tiene sentido pedir su precio/hora. */
  function precioTipoHTML(pr) {
    const usados = tiposEnUso(pr);
    if (!usados.length) {
      return `<p class="small text-muted" style="margin:4px 0 0;">
        Añade primero un servicio y aquí aparecerá el precio/hora de cada tipo de trabajador.</p>`;
    }
    const filas = usados.map(v => {
      const t = TIPOS.find(x => x.v === v);
      const val = precioTipo(pr, v);
      return `<tr>
        <td><b>${esc(t.plural)}</b></td>
        <td><input class="in" type="number" step="0.01" min="0"
             ${v === 'socorrista' ? 'data-p="precio_hora"' : `data-pt="${v}"`}
             value="${val == null ? '' : val}" placeholder="0,00" style="width:110px"> €/h</td>
      </tr>`;
    }).join('');
    return `<div style="overflow-x:auto"><table class="tb">
        <thead><tr><th>Tipo de trabajador</th><th>Precio por hora</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
      <p class="small text-muted" style="margin:7px 0 0;">
        Sigue sin haber ningún importe total: se factura sobre las horas realmente
        prestadas de cada perfil, al precio/hora que pongas aquí.</p>`;
  }

  function filaExtra(e, i) {
    return `<tr>
      <td><input class="in" data-e="${i}" data-k="concepto" value="${esc(e.concepto)}" placeholder="Concepto"></td>
      <td><input class="in" data-e="${i}" data-k="detalle" value="${esc(e.detalle)}" placeholder="Detalle"></td>
      <td><input class="in" type="number" min="0" data-e="${i}" data-k="uds" value="${e.uds||1}" style="width:66px"></td>
      <td><input class="in" type="number" step="0.01" data-e="${i}" data-k="precio"
          value="${modoDe(e)==='incluido'?'':(e.precio==null?'':e.precio)}"
          placeholder="${modoDe(e)==='incluido'?'gratis':'0,00'}" ${modoDe(e)==='incluido'?'disabled':''} style="width:86px"></td>
      <td><select class="in" data-e="${i}" data-k="modo" style="width:150px">
        ${MODOS.map(o => `<option value="${o.v}" ${modoDe(e)===o.v?'selected':''}>${o.lab}</option>`).join('')}
      </select></td>
      <td><button class="btn-icon" data-qe="${i}" title="Quitar" style="width:28px;height:28px;background:#FEF2F2;color:#DC2626;border:none;border-radius:6px;cursor:pointer;">✕</button></td>
    </tr>`;
  }

  function editorHTML() {
    const p = actual;
    const campo = (k, lab, tipo, extra) => `
      <label style="display:block;min-width:0;">
        <span class="small text-muted" style="display:block;margin-bottom:2px;">${lab}</span>
        <input class="in" data-p="${k}" type="${tipo||'text'}" value="${esc(p[k]==null?'':p[k])}" ${extra||''} style="width:100%">
      </label>`;
    return `
      <style>
        #presupuestosBody .in{padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:13px;background:#fff}
        #presupuestosBody .in:focus{outline:2px solid #B91C1C;outline-offset:1px;border-color:#B91C1C}
        #presupuestosBody .gr{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
        #presupuestosBody .tb{width:100%;border-collapse:collapse;font-size:13px}
        #presupuestosBody .tb th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#64748B;padding:0 4px 4px}
        #presupuestosBody .tb td{padding:3px 4px}
        #presupuestosBody h4{margin:16px 0 7px;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:#B91C1C;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
      </style>
      <div style="padding:10px;">
        <div class="row gap-2" style="align-items:center;flex-wrap:wrap;margin-bottom:10px;">
          <button class="btn btn-outline btn-sm" id="pVolver">← Volver</button>
          <b style="font-family:monospace;">${esc(p.numero)}</b>
          <div style="flex:1"></div>
          <button class="btn btn-outline btn-sm" id="pVoz2" ${hayVoz()?'':'disabled'}>🎙️ Dictar</button>
          <button class="btn btn-outline btn-sm" id="pPdf">PDF</button>
          <button class="btn btn-primary btn-sm" id="pGuardar">Guardar</button>
        </div>

        <h4>Cliente</h4>
        <div class="gr">
          ${campo('cliente_nombre','Razón social')}
          ${campo('cliente_cif','CIF')}
          ${campo('cliente_att','A la atención de')}
          ${campo('cliente_direccion','Dirección')}
          ${campo('cliente_instalaciones','Instalaciones')}
        </div>

        <h4>Presupuesto</h4>
        <div class="gr">
          ${campo('fecha','Fecha','date')}
          ${campo('validez_dias','Validez (días)','number')}
          ${campo('precio_hora','Precio hora (€, sin IVA)','number','step="0.01"')}
          ${campo('iva_pct','IVA (%)','number','step="0.01"')}
          <label style="display:block;">
            <span class="small text-muted" style="display:block;margin-bottom:2px;">Estado</span>
            <select class="in" data-p="estado" style="width:100%">
              ${['borrador','enviado','aceptado','rechazado'].map(o=>`<option ${p.estado===o?'selected':''}>${o}</option>`).join('')}
            </select></label>
        </div>

        <h4>Servicios a cubrir</h4>
        <div style="overflow-x:auto"><table class="tb">
          <thead><tr><th>Instalación</th><th>Periodo</th><th>Horario</th><th>Tipo</th><th>Cantidad</th><th></th></tr></thead>
          <tbody id="pSvc">${(p.servicios||[]).map(filaServicio).join('')}</tbody>
        </table></div>
        <button class="btn btn-outline btn-sm" id="pAddSvc" style="margin-top:6px">+ Añadir servicio</button>
        <p class="small text-muted" style="margin:7px 0 0;">
          Debajo de cada línea puedes describir <b>el trabajo que hace ese perfil</b>. Sale tal cual
          en el presupuesto. Si una línea no es de una piscina concreta (un supervisor que cubre
          varias), escribe en Instalación lo que quieras: «Todas las piscinas», «Zona norte»…
        </p>
        <p class="small" style="margin:5px 0 0;color:#166534;">
          💡 <b>Se va aprendiendo solo.</b> Al elegir un perfil se rellena con lo que escribiste
          la última vez para ese mismo perfil en otro presupuesto, y si ya habías escrito algo
          para esa misma instalación, usa eso. La primera vez sale un texto de partida.
          Reescríbelo cuando quieras: lo que escribas manda, y a partir de ahí será lo que salga.
        </p>

        <h4>Precio por hora de cada tipo</h4>
        ${precioTipoHTML(p)}

        <h4>Extras (opcionales)</h4>
        <div style="overflow-x:auto"><table class="tb">
          <thead><tr><th>Concepto</th><th>Detalle</th><th>Uds.</th><th>Cómo se cobra</th><th>Precio/ud.</th><th></th></tr></thead>
          <tbody id="pExt">${(p.extras||[]).map(filaExtra).join('')}</tbody>
        </table></div>
        <div class="row gap-2" style="margin-top:6px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="pAddExt">+ Crear extra nuevo</button>
          <span class="small text-muted">o coge uno de los habituales:</span>
          <select class="in" id="pSugExt"><option value="">Elegir…</option>
            ${EXTRAS_SUGERIDOS.map((e,i)=>`<option value="${i}">${esc(e.concepto)}</option>`).join('')}
          </select>
        </div>
        <p class="small text-muted" style="margin:7px 0 0;">
          «Crear extra nuevo» deja una fila en blanco: escribe el concepto que quieras,
          no tiene por qué estar en la lista. Si eliges <b>Incluido sin coste</b>, el precio
          se desactiva y en el presupuesto sale como «Incluido».
        </p>

        <h4>Notas</h4>
        <textarea class="in" data-p="notas" rows="2" style="width:100%">${esc(p.notas||'')}</textarea>

        <div style="margin-top:12px;padding:9px 12px;background:#FEF7F6;border:1px solid #B91C1C;border-radius:8px;font-size:12.5px;color:#7F1212;">
          El presupuesto <b>no lleva importes totales</b>: fija socorristas y precio/hora. Se factura sobre horas realmente prestadas al cierre de mes. Los extras van aparte, cada uno con su forma de cobro.
        </div>
      </div>`;
  }

  function enlazarEditor() {
    const p = actual;
    $('pVolver').onclick = () => { if (confirm('¿Salir sin guardar los cambios no guardados?')) { actual = null; render(); } };
    $('pGuardar').onclick = async () => { if (await guardar()) render(); };
    $('pPdf').onclick = () => descargarPdf(actual);
    const v2 = $('pVoz2'); if (v2) v2.onclick = abrirDictado;

    document.querySelectorAll('[data-p]').forEach(el => {
      el.onchange = () => {
        const k = el.dataset.p;
        p[k] = (el.type === 'number') ? (el.value === '' ? null : parseFloat(el.value)) : el.value;
      };
    });
    const relee = (sel, arr) => document.querySelectorAll(sel).forEach(el => {
      el.onchange = () => {
        const i = parseInt(el.dataset.s != null ? el.dataset.s : el.dataset.e);
        const k = el.dataset.k;
        arr[i][k] = el.type === 'checkbox' ? el.checked
                  : el.type === 'number' ? (el.value === '' ? null : parseFloat(el.value))
                  : el.value;
      };
    });
    relee('[data-s]', p.servicios);
    relee('[data-e]', p.extras);
    // Cambiar "cómo se cobra" repinta: si pasa a gratis hay que desactivar el
    // precio, y si deja de serlo hay que volver a activarlo.
    document.querySelectorAll('[data-e][data-k="modo"]').forEach(el => {
      el.onchange = () => {
        const i = parseInt(el.dataset.e);
        p.extras[i].modo = el.value;
        if (el.value === 'incluido') p.extras[i].precio = null;
        render();
      };
    });

    // Precio/hora de los tipos que no son socorrista (el del socorrista va por
    // data-p, porque es la columna `precio_hora` de siempre).
    document.querySelectorAll('[data-pt]').forEach(el => {
      el.onchange = () => {
        if (!p.precios_tipo) p.precios_tipo = {};
        const v = el.value === '' ? null : parseFloat(el.value);
        if (v == null) delete p.precios_tipo[el.dataset.pt];
        else p.precios_tipo[el.dataset.pt] = v;
      };
    });
    // Cambiar el tipo repinta: cambia qué precios se piden y, si el trabajo
    // estaba vacío, se rellena con lo aprendido de presupuestos anteriores.
    // Sólo si está vacío: lo que haya escrito a mano no se toca nunca.
    document.querySelectorAll('[data-s][data-k="tipo"]').forEach(el => {
      el.onchange = () => {
        const i = parseInt(el.dataset.s);
        p.servicios[i].tipo = el.value;
        if (!(p.servicios[i].trabajo || '').trim()) {
          p.servicios[i].trabajo = sugerenciaTrabajo(el.value, p.servicios[i].instalacion).txt;
        }
        render();
      };
    });
    // Al escribir la instalación, si el trabajo sigue vacío se vuelve a mirar:
    // puede haber una descripción aprendida para ESE hotel en concreto.
    document.querySelectorAll('[data-s][data-k="instalacion"]').forEach(el => {
      el.onchange = () => {
        const i = parseInt(el.dataset.s);
        p.servicios[i].instalacion = el.value;
        if (!(p.servicios[i].trabajo || '').trim()) {
          p.servicios[i].trabajo = sugerenciaTrabajo(tipoDe(p.servicios[i]), el.value).txt;
          render();
        }
      };
    });

    $('pAddSvc').onclick = () => {
      p.servicios.push({instalacion:'',periodo:'',horario:'',socorristas:1,
                        tipo:'socorrista', trabajo:sugerenciaTrabajo('socorrista','').txt});
      render();
    };
    $('pAddExt').onclick = () => { p.extras.push({concepto:'',detalle:'',uds:1,precio:null,modo:'contrato'}); render(); };
    $('pSugExt').onchange = (e) => {
      const i = e.target.value; if (i === '') return;
      const s = EXTRAS_SUGERIDOS[parseInt(i)];
      p.extras.push({ concepto:s.concepto, detalle:s.detalle, uds:1, precio:null, modo:s.modo });
      render();
    };
    document.querySelectorAll('[data-qs]').forEach(el => el.onclick = () => { p.servicios.splice(parseInt(el.dataset.qs),1); render(); });
    document.querySelectorAll('[data-qe]').forEach(el => el.onclick = () => { p.extras.splice(parseInt(el.dataset.qe),1); render(); });
  }

  /* ---------- ventana de dictado ---------- */
  function abrirDictado() {
    let m = $('pVozModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'pVozModal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;';
      document.body.appendChild(m);
    }
    m.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);">
        <div style="padding:13px 16px;border-bottom:1px solid #e2e8f0;background:#FEF7F6;">
          <div style="font-weight:700;font-size:15px;">Dictar el presupuesto</div>
          <div class="small text-muted" style="margin-top:2px;">Habla con normalidad. Revisa lo entendido antes de aplicarlo.</div>
        </div>
        <div style="padding:14px 16px;">
          <div style="background:#F8FAFC;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:12.3px;line-height:1.5;margin-bottom:11px;">
            <b>Cómo dictarlo</b><br>
            «<i>cliente</i> Hoteles Playa Sol <i>cif</i> B07103286 <i>atención</i> Susana De Juan
            <i>precio hora</i> quince con sesenta <i>iva</i> veintiuno
            <i>servicio</i> Piscina principal dos socorristas de mayo a octubre de 10 a 18
            <i>extra</i> desfibrilador 7 unidades 980 euros contrato»
          </div>
          <button class="btn btn-primary btn-block" id="pRec" style="width:100%">🎙️ Empezar a hablar</button>
          <div id="pTxt" style="margin-top:10px;min-height:54px;padding:9px;border:1px dashed #cbd5e1;border-radius:8px;font-size:13px;color:#334155;white-space:pre-wrap;">…</div>
          <div id="pPrev" style="margin-top:10px;"></div>
        </div>
        <div style="padding:11px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-outline" id="pCerrar">Cerrar</button>
          <button class="btn btn-primary" id="pAplicar" disabled>Aplicar al presupuesto</button>
        </div>
      </div>`;

    let dicho = '', leido = null;
    const txt = $('pTxt'), prev = $('pPrev'), btn = $('pRec'), apl = $('pAplicar');

    const pinta = () => {
      leido = interpretar(dicho);
      const c = leido.campos;
      const filas = Object.keys(c).map(k => `<li><b>${k.replace(/_/g,' ')}:</b> ${esc(c[k])}</li>`).join('')
        + leido.servicios.map(s => `<li><b>servicio:</b> ${esc(s.instalacion)} · ${s.socorristas} socorrista(s) · ${esc(s.periodo)} ${esc(s.horario)}</li>`).join('')
        + leido.extras.map(e => {
            const md = MODOS.find(x => x.v === modoDe(e));
            return `<li><b>extra:</b> ${esc(e.concepto)} · ${e.uds} ud · ${modoDe(e)==='incluido' ? 'incluido sin coste' : eur(e.precio) + ' ' + (md ? md.corto : '')}</li>`;
          }).join('');
      const hay = !!filas;
      prev.innerHTML = hay
        ? `<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:9px 12px;">
             <div style="font-weight:700;font-size:12px;color:#166534;margin-bottom:5px;">Esto es lo que he entendido</div>
             <ul style="margin:0;padding-left:17px;font-size:12.5px;line-height:1.55;">${filas}</ul></div>`
        : '<div class="small text-muted">Todavía no he reconocido ningún dato.</div>';
      apl.disabled = !hay;
    };

    btn.onclick = () => {
      dictar((fin, interim) => { dicho = fin; txt.textContent = (fin + interim) || '…'; pinta(); },
             (estado) => { btn.textContent = estado === 'grabando' ? '⏹ Parar' : '🎙️ Empezar a hablar'; });
    };
    $('pCerrar').onclick = () => { pararDictado(); m.remove(); };
    apl.onclick = async () => {
      pararDictado();
      if (!actual) { actual = vacio(); actual.numero = await siguienteNumero(); }
      Object.assign(actual, leido.campos);
      actual.servicios = (actual.servicios || []).concat(leido.servicios);
      actual.extras = (actual.extras || []).concat(leido.extras);
      m.remove(); render();
      toast('Dictado aplicado — revisa y guarda');
    };
  }

  async function descargarPdf(p) {
    if (!p) return;
    if (!window.PSPdf || !window.PSPdf.descargarPresupuesto) { toast('Generador de PDF no disponible'); return; }
    try {
      toast('Generando PDF…');
      await window.PSPdf.descargarPresupuesto(p);
    } catch (err) { toast('Error generando el PDF: ' + err.message); }
  }

  async function iniciar() {
    if (!esAdmin()) { render(); return; }
    try { await cargar(); } catch (err) { toast('Error cargando presupuestos: ' + err.message); }
    render();
  }

  return { cargar, guardar, borrar, siguienteNumero, vacio, interpretar, dictar, MODOS, modoDe,
           TIPOS, tipoDe, tipoLab, precioTipo, tiposEnUso, trabajoAprendido, sugerenciaTrabajo,
           pararDictado, hayVoz, sinTildes, aNumero,
           get lista(){ return lista; }, get faltaSQL(){ return faltaSQL; },
           get actual(){ return actual; }, set actual(v){ actual = v; },
           EXTRAS_SUGERIDOS, esc, esAdmin, render, iniciar, descargarPdf };
})();
