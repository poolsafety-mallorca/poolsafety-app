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

  // Zonas del cuerpo — id: {label, side ('front','back'), cx, cy, r}
  // Coordenadas dentro del viewBox 220×540 del SVG. Se han recolocado sobre el
  // nuevo contorno anatómico (proporciones humanas 7,5 cabezas de altura aprox).
  const ZONAS_CUERPO = {
    // FRONTAL (viewBox 220x540, cabeza ~35 diámetro centrada en x=110, y=32)
    'cabeza-f':      { label: 'Cabeza (frontal)',    cx: 110, cy: 34,  r: 22, side: 'front' },
    'cara':          { label: 'Cara',                cx: 110, cy: 46,  r: 12, side: 'front' },
    'cuello-f':      { label: 'Cuello',              cx: 110, cy: 72,  r: 10, side: 'front' },
    'hombro-der-f':  { label: 'Hombro derecho',      cx: 78,  cy: 92,  r: 14, side: 'front' },
    'hombro-izq-f':  { label: 'Hombro izquierdo',    cx: 142, cy: 92,  r: 14, side: 'front' },
    'pecho-der':     { label: 'Pecho / pectoral der.', cx: 92, cy: 118, r: 13, side: 'front' },
    'pecho-izq':     { label: 'Pecho / pectoral izq.', cx: 128, cy: 118, r: 13, side: 'front' },
    'abdomen-alto':  { label: 'Abdomen alto (estómago)', cx: 110, cy: 158, r: 15, side: 'front' },
    'abdomen-bajo':  { label: 'Abdomen bajo (vientre)',  cx: 110, cy: 190, r: 15, side: 'front' },
    'brazo-der-f':   { label: 'Brazo derecho',       cx: 58,  cy: 140, r: 12, side: 'front' },
    'brazo-izq-f':   { label: 'Brazo izquierdo',     cx: 162, cy: 140, r: 12, side: 'front' },
    'codo-der-f':    { label: 'Codo derecho',        cx: 50,  cy: 175, r: 10, side: 'front' },
    'codo-izq-f':    { label: 'Codo izquierdo',      cx: 170, cy: 175, r: 10, side: 'front' },
    'antebrazo-der': { label: 'Antebrazo derecho',   cx: 45,  cy: 210, r: 11, side: 'front' },
    'antebrazo-izq': { label: 'Antebrazo izquierdo', cx: 175, cy: 210, r: 11, side: 'front' },
    'mano-der-f':    { label: 'Mano derecha',        cx: 40,  cy: 248, r: 11, side: 'front' },
    'mano-izq-f':    { label: 'Mano izquierda',      cx: 180, cy: 248, r: 11, side: 'front' },
    'muslo-der-f':   { label: 'Muslo derecho',       cx: 92,  cy: 280, r: 15, side: 'front' },
    'muslo-izq-f':   { label: 'Muslo izquierdo',     cx: 128, cy: 280, r: 15, side: 'front' },
    'rodilla-der':   { label: 'Rodilla derecha',     cx: 90,  cy: 340, r: 12, side: 'front' },
    'rodilla-izq':   { label: 'Rodilla izquierda',   cx: 130, cy: 340, r: 12, side: 'front' },
    'espinilla-der': { label: 'Espinilla derecha',   cx: 88,  cy: 388, r: 12, side: 'front' },
    'espinilla-izq': { label: 'Espinilla izquierda', cx: 132, cy: 388, r: 12, side: 'front' },
    'tobillo-der':   { label: 'Tobillo derecho',     cx: 86,  cy: 450, r: 10, side: 'front' },
    'tobillo-izq':   { label: 'Tobillo izquierdo',   cx: 134, cy: 450, r: 10, side: 'front' },
    'pie-der':       { label: 'Pie derecho',         cx: 80,  cy: 485, r: 12, side: 'front' },
    'pie-izq':       { label: 'Pie izquierdo',       cx: 140, cy: 485, r: 12, side: 'front' },
    // POSTERIOR
    'cabeza-b':      { label: 'Cabeza (posterior)',  cx: 110, cy: 34,  r: 22, side: 'back' },
    'nuca':          { label: 'Nuca / cervicales',   cx: 110, cy: 68,  r: 12, side: 'back' },
    'omoplato-der':  { label: 'Omóplato derecho',    cx: 88,  cy: 108, r: 14, side: 'back' },
    'omoplato-izq':  { label: 'Omóplato izquierdo',  cx: 132, cy: 108, r: 14, side: 'back' },
    'columna':       { label: 'Columna torácica',    cx: 110, cy: 132, r: 10, side: 'back' },
    'lumbar':        { label: 'Zona lumbar',         cx: 110, cy: 175, r: 14, side: 'back' },
    'gluteo-der':    { label: 'Glúteo derecho',      cx: 92,  cy: 220, r: 15, side: 'back' },
    'gluteo-izq':    { label: 'Glúteo izquierdo',    cx: 128, cy: 220, r: 15, side: 'back' },
    'brazo-der-b':   { label: 'Brazo derecho (post.)', cx: 58,  cy: 140, r: 12, side: 'back' },
    'brazo-izq-b':   { label: 'Brazo izquierdo (post.)', cx: 162, cy: 140, r: 12, side: 'back' },
    'antebrazo-der-b': { label: 'Antebrazo derecho (post.)', cx: 45,  cy: 210, r: 11, side: 'back' },
    'antebrazo-izq-b': { label: 'Antebrazo izquierdo (post.)', cx: 175, cy: 210, r: 11, side: 'back' },
    'muslo-der-b':   { label: 'Muslo derecho (post.)', cx: 92,  cy: 285, r: 15, side: 'back' },
    'muslo-izq-b':   { label: 'Muslo izquierdo (post.)', cx: 128, cy: 285, r: 15, side: 'back' },
    'corva-der':     { label: 'Corva/rodilla post. der.', cx: 90,  cy: 340, r: 11, side: 'back' },
    'corva-izq':     { label: 'Corva/rodilla post. izq.', cx: 130, cy: 340, r: 11, side: 'back' },
    'gemelo-der':    { label: 'Gemelo derecho',      cx: 88,  cy: 388, r: 13, side: 'back' },
    'gemelo-izq':    { label: 'Gemelo izquierdo',    cx: 132, cy: 388, r: 13, side: 'back' },
    'talon-der':     { label: 'Talón derecho',       cx: 88,  cy: 465, r: 10, side: 'back' },
    'talon-izq':     { label: 'Talón izquierdo',     cx: 132, cy: 465, r: 10, side: 'back' }
  };

  // Silueta anatómica realista con curvas Bezier suaves. viewBox 220x540.
  // Vista frontal y posterior comparten el mismo contorno base con pequeñas
  // variaciones (rasgos faciales frontales / musculatura posterior).
  function siluetaContorno(side) {
    const facial = side === 'front' ? `
      <!-- Rasgos faciales sutiles -->
      <ellipse cx="102" cy="34" rx="2" ry="2.6" fill="#64748B" opacity=".55"/>
      <ellipse cx="118" cy="34" rx="2" ry="2.6" fill="#64748B" opacity=".55"/>
      <path d="M 105 45 Q 110 48 115 45" stroke="#64748B" stroke-width="1.2" fill="none" opacity=".55"/>
      <!-- Línea del pecho / esternón -->
      <path d="M 110 90 L 110 155" stroke="#94A3B8" stroke-width=".8" fill="none" opacity=".4"/>
      <!-- Ombligo -->
      <circle cx="110" cy="185" r="1.6" fill="#64748B" opacity=".5"/>
    ` : `
      <!-- Rasgos posteriores: columna -->
      <path d="M 110 70 L 110 220" stroke="#94A3B8" stroke-width="1" fill="none" opacity=".55" stroke-dasharray="2 2"/>
      <!-- Trazo omoplatos -->
      <path d="M 90 100 Q 100 96 108 108" stroke="#94A3B8" stroke-width=".9" fill="none" opacity=".4"/>
      <path d="M 130 100 Q 120 96 112 108" stroke="#94A3B8" stroke-width=".9" fill="none" opacity=".4"/>
      <!-- Separación glúteos -->
      <path d="M 110 210 L 110 250" stroke="#94A3B8" stroke-width="1" fill="none" opacity=".45"/>
    `;
    return `
      <!-- Contorno principal del cuerpo (proporciones anatómicas ~7,5 cabezas) -->
      <path d="
        M 110 12
        C 92 12, 82 24, 82 40
        C 82 52, 88 60, 96 64
        L 92 76
        L 78 82
        C 62 88, 54 98, 50 116
        L 42 168
        C 40 180, 42 200, 46 220
        L 40 258
        C 38 268, 42 274, 50 272
        L 55 254
        L 58 220
        L 64 190
        L 68 130
        L 76 118
        L 78 158
        L 80 210
        L 82 265
        L 82 310
        L 86 370
        L 86 445
        L 84 480
        C 82 495, 84 500, 90 502
        L 100 500
        C 108 498, 108 490, 106 480
        L 100 445
        L 100 380
        L 105 310
        L 110 260
        L 115 310
        L 120 380
        L 120 445
        L 114 480
        C 112 490, 112 498, 120 500
        L 130 502
        C 136 500, 138 495, 136 480
        L 134 445
        L 134 370
        L 138 310
        L 138 265
        L 140 210
        L 142 158
        L 144 118
        L 152 130
        L 156 190
        L 162 220
        L 165 254
        L 170 272
        C 178 274, 182 268, 180 258
        L 174 220
        C 178 200, 180 180, 178 168
        L 170 116
        C 166 98, 158 88, 142 82
        L 128 76
        L 124 64
        C 132 60, 138 52, 138 40
        C 138 24, 128 12, 110 12 Z"
        fill="url(#bodyGrad)"
        stroke="#94A3B8"
        stroke-width="1.4"
        stroke-linejoin="round"
        stroke-linecap="round"/>
      ${facial}
    `;
  }

  function siluetaSVG(seleccionadas, editable, side) {
    side = side || 'front';
    seleccionadas = seleccionadas || [];
    const zonas = Object.entries(ZONAS_CUERPO).filter(([, z]) => z.side === side);
    const editableCls = editable ? 'cursor:pointer;' : '';
    const circles = zonas.map(([id, z]) => {
      const activa = seleccionadas.includes(id);
      // Zona no marcada: casi invisible (guía sutil). Marcada: rojo intenso.
      const fill = activa ? '#DC2626' : 'transparent';
      const stroke = activa ? '#7F1D1D' : (editable ? '#CBD5E1' : 'transparent');
      const opacity = activa ? '.75' : (editable ? '.6' : '0');
      const strokeDash = editable && !activa ? 'stroke-dasharray="3 3"' : '';
      return `<circle data-zona="${id}" cx="${z.cx}" cy="${z.cy}" r="${z.r}"
        fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1" ${strokeDash}
        style="transition:all .15s;${editableCls}"><title>${z.label}${activa ? ' · MARCADA' : ''}</title></circle>`;
    }).join('');
    // Marca X roja adicional sobre las zonas seleccionadas para mayor contraste
    const marks = zonas.filter(([id]) => seleccionadas.includes(id)).map(([, z]) => `
      <g stroke="#fff" stroke-width="2.2" stroke-linecap="round">
        <line x1="${z.cx-5}" y1="${z.cy-5}" x2="${z.cx+5}" y2="${z.cy+5}"/>
        <line x1="${z.cx+5}" y1="${z.cy-5}" x2="${z.cx-5}" y2="${z.cy+5}"/>
      </g>`).join('');
    return `
      <svg viewBox="0 0 220 540" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:240px;height:auto;display:block;margin:0 auto;background:linear-gradient(180deg,#F8FAFC,#EFF6FF);border-radius:12px;">
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#E2E8F0" stop-opacity=".55"/>
            <stop offset=".5" stop-color="#F1F5F9" stop-opacity=".85"/>
            <stop offset="1" stop-color="#E2E8F0" stop-opacity=".55"/>
          </linearGradient>
        </defs>
        ${siluetaContorno(side)}
        ${circles}
        ${marks}
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
