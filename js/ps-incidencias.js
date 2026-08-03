/* ==========================================================================
   PoolSafety · Partes de incidencia — helpers compartidos
   ==========================================================================
   API:
     PSInc.TIPOS_INCIDENTE      → array de {value,label,icono}
     PSInc.TECNICAS             → array de {value,label}
     PSInc.DERIVACIONES         → array de {value,label}
     PSInc.ZONAS_CUERPO         → mapa id → {label, side}
     PSInc.siluetaSVG(seleccionadas, editable) → HTML string con silueta
     PSInc.parseZonas(el, cb)   → engancha listeners a la silueta editable
     PSInc.formatTipo(tipo)     → label bonito
   ========================================================================== */

(function () {
  const TIPOS_INCIDENTE = [
    { value: 'ahogamiento',      label: 'Ahogamiento / sumersión',    color: '#DC2626' },
    { value: 'caida',            label: 'Caída / traumatismo',        color: '#F59E0B' },
    { value: 'corte',            label: 'Corte / herida sangrante',   color: '#DC2626' },
    { value: 'golpe',            label: 'Golpe / contusión',          color: '#F59E0B' },
    { value: 'insolacion',       label: 'Insolación / golpe de calor',color: '#F59E0B' },
    { value: 'quemadura',        label: 'Quemadura (sol o química)',  color: '#F59E0B' },
    { value: 'picadura',         label: 'Picadura / mordedura',       color: '#F59E0B' },
    { value: 'alergia',          label: 'Reacción alérgica',          color: '#DC2626' },
    { value: 'crisis',           label: 'Crisis (epilepsia, diabetes…)', color: '#DC2626' },
    { value: 'lipotimia',        label: 'Lipotimia / mareo',          color: '#F59E0B' },
    { value: 'malestar',         label: 'Malestar / dolor',           color: '#3B82F6' },
    { value: 'otros',            label: 'Otros',                      color: '#64748B' }
  ];

  const TECNICAS = [
    { value: 'rcp',                 label: 'RCP (masaje cardiaco)' },
    { value: 'desa',                label: 'DESA / desfibrilador' },
    { value: 'oxigeno',             label: 'Oxigenoterapia' },
    { value: 'ambu',                label: 'Ambú / ventilación asistida' },
    { value: 'via_aerea',           label: 'Apertura vía aérea (frente-mentón)' },
    { value: 'posicion_seguridad',  label: 'Posición lateral de seguridad (PLS)' },
    { value: 'hemostasia',          label: 'Presión / hemostasia' },
    { value: 'vendaje',             label: 'Vendaje / cura' },
    { value: 'inmovilizacion',      label: 'Inmovilización de zona' },
    { value: 'traslado',            label: 'Traslado seguro fuera del agua' },
    { value: 'observacion',         label: 'Observación / vigilancia' },
    { value: 'aviso_112',           label: 'Aviso al 112' },
    { value: 'aviso_familia',       label: 'Aviso a familia' }
  ];

  const DERIVACIONES = [
    { value: 'atendida_puesto',  label: 'Atendida en el puesto — víctima se retira por su pie', color: '#059669' },
    { value: 'traslado_propio',  label: 'La víctima o familia se traslada por medios propios',  color: '#3B82F6' },
    { value: 'ambulancia',       label: 'Traslado en ambulancia (llamada al 112)',              color: '#DC2626' },
    { value: 'hospital',         label: 'Traslado directo a hospital',                          color: '#DC2626' },
    { value: 'rechaza_atencion', label: 'La víctima rechaza atención (firma renuncia aparte)', color: '#F59E0B' }
  ];

  // Zonas del cuerpo — id: {label, side ('front','back','both')}
  // Coordenadas dentro del viewBox 200×400 del SVG. Cada zona es un círculo interactivo.
  const ZONAS_CUERPO = {
    // FRONTAL
    'cabeza-f':     { label: 'Cabeza (frontal)',    cx: 100, cy: 30,  r: 20, side: 'front' },
    'cuello-f':     { label: 'Cuello',              cx: 100, cy: 60,  r: 10, side: 'front' },
    'hombro-der-f': { label: 'Hombro derecho',      cx: 74,  cy: 78,  r: 12, side: 'front' },
    'hombro-izq-f': { label: 'Hombro izquierdo',    cx: 126, cy: 78,  r: 12, side: 'front' },
    'torax':        { label: 'Tórax / pecho',       cx: 100, cy: 100, r: 18, side: 'front' },
    'abdomen':      { label: 'Abdomen',             cx: 100, cy: 140, r: 18, side: 'front' },
    'brazo-der-f':  { label: 'Brazo derecho',       cx: 60,  cy: 118, r: 12, side: 'front' },
    'brazo-izq-f':  { label: 'Brazo izquierdo',     cx: 140, cy: 118, r: 12, side: 'front' },
    'mano-der-f':   { label: 'Mano derecha',        cx: 46,  cy: 168, r: 10, side: 'front' },
    'mano-izq-f':   { label: 'Mano izquierda',      cx: 154, cy: 168, r: 10, side: 'front' },
    'muslo-der-f':  { label: 'Muslo derecho',       cx: 85,  cy: 200, r: 14, side: 'front' },
    'muslo-izq-f':  { label: 'Muslo izquierdo',     cx: 115, cy: 200, r: 14, side: 'front' },
    'rodilla-der':  { label: 'Rodilla derecha',     cx: 85,  cy: 250, r: 10, side: 'front' },
    'rodilla-izq':  { label: 'Rodilla izquierda',   cx: 115, cy: 250, r: 10, side: 'front' },
    'pierna-der-f': { label: 'Pierna derecha',      cx: 85,  cy: 290, r: 12, side: 'front' },
    'pierna-izq-f': { label: 'Pierna izquierda',    cx: 115, cy: 290, r: 12, side: 'front' },
    'pie-der':      { label: 'Pie derecho',         cx: 85,  cy: 350, r: 10, side: 'front' },
    'pie-izq':      { label: 'Pie izquierdo',       cx: 115, cy: 350, r: 10, side: 'front' },
    // POSTERIOR
    'cabeza-b':     { label: 'Cabeza (posterior)',  cx: 100, cy: 30,  r: 20, side: 'back' },
    'nuca':         { label: 'Nuca',                cx: 100, cy: 62,  r: 10, side: 'back' },
    'espalda-alta': { label: 'Espalda alta',        cx: 100, cy: 100, r: 20, side: 'back' },
    'espalda-baja': { label: 'Espalda baja / lumbar', cx: 100, cy: 145, r: 18, side: 'back' },
    'gluteos':      { label: 'Glúteos',             cx: 100, cy: 180, r: 18, side: 'back' },
    'brazo-der-b':  { label: 'Brazo derecho (post.)', cx: 60,  cy: 118, r: 12, side: 'back' },
    'brazo-izq-b':  { label: 'Brazo izquierdo (post.)', cx: 140, cy: 118, r: 12, side: 'back' },
    'muslo-der-b':  { label: 'Muslo derecho (post.)', cx: 85,  cy: 210, r: 14, side: 'back' },
    'muslo-izq-b':  { label: 'Muslo izquierdo (post.)', cx: 115, cy: 210, r: 14, side: 'back' },
    'pierna-der-b': { label: 'Pierna derecha (post.)', cx: 85,  cy: 290, r: 12, side: 'back' },
    'pierna-izq-b': { label: 'Pierna izquierda (post.)', cx: 115, cy: 290, r: 12, side: 'back' }
  };

  // Silueta vectorial simple del cuerpo humano (frontal y posterior)
  // Contorno pensado para representar figura genérica sin género.
  function siluetaContorno() {
    return `
      <path d="M 100 12
               C 80 12, 78 40, 88 55
               L 74 68 L 60 82 L 48 130 L 44 175 L 50 178
               L 60 130 L 68 130 L 68 172 L 78 180
               L 80 220 L 78 300 L 82 360 L 92 366 L 96 300 L 100 220
               L 104 300 L 108 366 L 118 360 L 122 300 L 120 220
               L 122 180 L 132 172 L 132 130 L 140 130
               L 150 178 L 156 175 L 152 130 L 140 82 L 126 68 L 112 55
               C 122 40, 120 12, 100 12 Z"
            fill="rgba(203,213,225,.35)"
            stroke="#94A3B8"
            stroke-width="1.5"
            stroke-linejoin="round"/>`;
  }

  function siluetaSVG(seleccionadas, editable, side) {
    side = side || 'front';
    seleccionadas = seleccionadas || [];
    const zonas = Object.entries(ZONAS_CUERPO).filter(([, z]) => z.side === side);
    const editableCls = editable ? 'cursor:pointer;' : '';
    const circles = zonas.map(([id, z]) => {
      const activa = seleccionadas.includes(id);
      const fill = activa ? '#DC2626' : 'rgba(255,255,255,.35)';
      const stroke = activa ? '#7F1D1D' : '#94A3B8';
      const opacity = activa ? '.85' : '.55';
      return `<circle data-zona="${id}" cx="${z.cx}" cy="${z.cy}" r="${z.r}"
        fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1"
        style="transition:all .15s;${editableCls}"><title>${z.label}${activa ? ' · MARCADA' : ''}</title></circle>`;
    }).join('');
    return `
      <svg viewBox="0 0 200 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:220px;height:auto;display:block;margin:0 auto;background:#F8FAFC;border-radius:10px;">
        ${siluetaContorno()}
        ${circles}
      </svg>`;
  }

  // Engancha listeners para toggling en la silueta editable
  function engancharSilueta(container, seleccionadasRef, onChange) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const c = e.target.closest('circle[data-zona]');
      if (!c) return;
      const id = c.dataset.zona;
      const idx = seleccionadasRef.indexOf(id);
      if (idx >= 0) seleccionadasRef.splice(idx, 1);
      else seleccionadasRef.push(id);
      onChange && onChange(seleccionadasRef);
    });
  }

  function formatTipo(tipo) {
    const t = TIPOS_INCIDENTE.find(x => x.value === tipo);
    return t ? t.label : (tipo || '—');
  }
  function colorTipo(tipo) {
    const t = TIPOS_INCIDENTE.find(x => x.value === tipo);
    return t ? t.color : '#64748B';
  }
  function formatTecnica(v) {
    const t = TECNICAS.find(x => x.value === v);
    return t ? t.label : v;
  }
  function formatDerivacion(v) {
    const d = DERIVACIONES.find(x => x.value === v);
    return d ? d.label : (v || '—');
  }
  function zonaLabel(id) {
    return ZONAS_CUERPO[id]?.label || id;
  }

  window.PSInc = {
    TIPOS_INCIDENTE, TECNICAS, DERIVACIONES, ZONAS_CUERPO,
    siluetaSVG, engancharSilueta,
    formatTipo, colorTipo, formatTecnica, formatDerivacion, zonaLabel
  };
})();
