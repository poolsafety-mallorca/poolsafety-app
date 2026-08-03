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

  // Silueta anatómica compuesta con formas simples pero proporcionadas.
  // Sirve tanto para frontal como para posterior (variaciones sutiles en detalles).
  // viewBox 220x540. Fill uniforme desde el gradient `bodyGrad`.
  function siluetaContorno(side) {
    const F = 'url(#bodyGrad)';
    const S = '#94A3B8';
    const detalles = side === 'front' ? `
      <!-- Rasgos faciales sutiles -->
      <ellipse cx="102" cy="35" rx="2" ry="2.6" fill="#64748B" opacity=".6"/>
      <ellipse cx="118" cy="35" rx="2" ry="2.6" fill="#64748B" opacity=".6"/>
      <path d="M 104 48 Q 110 51 116 48" stroke="#64748B" stroke-width="1.1" fill="none" opacity=".6" stroke-linecap="round"/>
      <!-- Esternón sutil -->
      <path d="M 110 92 L 110 155" stroke="${S}" stroke-width=".7" fill="none" opacity=".35"/>
      <!-- Ombligo -->
      <circle cx="110" cy="188" r="1.6" fill="#64748B" opacity=".55"/>
      <!-- Línea de cintura suave -->
      <path d="M 92 210 Q 110 214 128 210" stroke="${S}" stroke-width=".6" fill="none" opacity=".3"/>
    ` : `
      <!-- Columna dashed -->
      <path d="M 110 70 L 110 250" stroke="${S}" stroke-width=".9" fill="none" opacity=".55" stroke-dasharray="3 3"/>
      <!-- Omóplatos -->
      <path d="M 82 105 Q 96 100 106 118" stroke="${S}" stroke-width=".8" fill="none" opacity=".45"/>
      <path d="M 138 105 Q 124 100 114 118" stroke="${S}" stroke-width=".8" fill="none" opacity=".45"/>
      <!-- Separación glúteos -->
      <path d="M 110 215 L 110 258" stroke="${S}" stroke-width="1" fill="none" opacity=".5"/>
    `;
    return `
      <!-- ===== Silueta anatómica compuesta ===== -->
      <!-- Cabeza -->
      <ellipse cx="110" cy="36" rx="22" ry="26" fill="${F}" stroke="${S}" stroke-width="1.3"/>
      <!-- Cuello -->
      <path d="M 100 60 Q 100 72 96 78 L 124 78 Q 120 72 120 60 Z" fill="${F}" stroke="${S}" stroke-width="1.3" stroke-linejoin="round"/>
      <!-- Torso (trapecio con curva en cintura y cadera) -->
      <path d="M 82 82
               Q 80 80 78 82
               C 70 88 66 98 66 108
               L 62 168
               C 62 190 68 208 74 220
               L 78 250
               L 82 268
               Q 110 274 138 268
               L 142 250
               L 146 220
               C 152 208 158 190 158 168
               L 154 108
               C 154 98 150 88 142 82
               Q 140 80 138 82
               L 128 80
               L 92 80 Z"
            fill="${F}" stroke="${S}" stroke-width="1.3" stroke-linejoin="round"/>
      <!-- Brazo izquierdo (viewer's left = anatomical right) -->
      <path d="M 66 108
               C 52 116 46 130 44 148
               L 40 195
               L 36 235
               L 34 258
               Q 34 268 40 268
               Q 46 268 48 260
               L 52 235
               L 58 195
               L 62 148 Z"
            fill="${F}" stroke="${S}" stroke-width="1.3" stroke-linejoin="round"/>
      <!-- Brazo derecho -->
      <path d="M 154 108
               C 168 116 174 130 176 148
               L 180 195
               L 184 235
               L 186 258
               Q 186 268 180 268
               Q 174 268 172 260
               L 168 235
               L 162 195
               L 158 148 Z"
            fill="${F}" stroke="${S}" stroke-width="1.3" stroke-linejoin="round"/>
      <!-- Manos -->
      <ellipse cx="41" cy="278" rx="11" ry="14" fill="${F}" stroke="${S}" stroke-width="1.3"/>
      <ellipse cx="179" cy="278" rx="11" ry="14" fill="${F}" stroke="${S}" stroke-width="1.3"/>
      <!-- Pierna izquierda (viewer's left) -->
      <path d="M 82 270
               C 78 290 78 320 82 350
               L 84 400
               L 84 460
               L 82 490
               Q 82 500 90 500
               Q 100 500 102 495
               L 104 480
               Q 106 460 106 430
               L 108 380
               L 108 330
               L 110 280
               L 110 270 Z"
            fill="${F}" stroke="${S}" stroke-width="1.3" stroke-linejoin="round"/>
      <!-- Pierna derecha -->
      <path d="M 138 270
               C 142 290 142 320 138 350
               L 136 400
               L 136 460
               L 138 490
               Q 138 500 130 500
               Q 120 500 118 495
               L 116 480
               Q 114 460 114 430
               L 112 380
               L 112 330
               L 110 280
               L 110 270 Z"
            fill="${F}" stroke="${S}" stroke-width="1.3" stroke-linejoin="round"/>
      <!-- Pies -->
      <ellipse cx="80" cy="510" rx="16" ry="10" fill="${F}" stroke="${S}" stroke-width="1.3"/>
      <ellipse cx="140" cy="510" rx="16" ry="10" fill="${F}" stroke="${S}" stroke-width="1.3"/>
      ${detalles}
    `;
  }

  // Ruta a la imagen anatómica realista del cliente (ChatGPT-generated, 1536×1024)
  // Contiene las 2 vistas (frontal a la izquierda, posterior a la derecha) con
  // sombreado muscular. La usamos como fondo del SVG, cada vista recortada por
  // CSS background-position, con los círculos cliqueables SVG encima.
  const IMG_MAPA_DOLOR = 'assets/mapa-dolor.png';

  function siluetaSVG(seleccionadas, editable, side) {
    side = side || 'front';
    seleccionadas = seleccionadas || [];
    const zonas = Object.entries(ZONAS_CUERPO).filter(([, z]) => z.side === side);
    const editableCls = editable ? 'cursor:pointer;' : '';
    // Círculos cliqueables (fondo transparente cuando no está marcada)
    const circles = zonas.map(([id, z]) => {
      const activa = seleccionadas.includes(id);
      const fill = activa ? '#DC2626' : 'transparent';
      const stroke = activa ? '#FFFFFF' : (editable ? 'rgba(255,255,255,.7)' : 'transparent');
      const strokeW = activa ? 2.2 : (editable ? 1.2 : 0);
      const opacity = activa ? '.85' : (editable ? '.35' : '0');
      const strokeDash = editable && !activa ? 'stroke-dasharray="3 3"' : '';
      return `<circle data-zona="${id}" cx="${z.cx}" cy="${z.cy}" r="${z.r}"
        fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeW}" ${strokeDash}
        style="transition:all .15s;${editableCls}"><title>${z.label}${activa ? ' · MARCADA' : ''}</title></circle>`;
    }).join('');
    // X blanca encima de las zonas marcadas para máximo contraste
    const marks = zonas.filter(([id]) => seleccionadas.includes(id)).map(([, z]) => `
      <g stroke="#fff" stroke-width="2.6" stroke-linecap="round">
        <line x1="${z.cx-5}" y1="${z.cy-5}" x2="${z.cx+5}" y2="${z.cy+5}"/>
        <line x1="${z.cx+5}" y1="${z.cy-5}" x2="${z.cx-5}" y2="${z.cy+5}"/>
      </g>`).join('');

    // Posicionamiento de la imagen: la PNG mide 1536×1024 con la frontal en la
    // mitad izquierda y la posterior en la mitad derecha, con título y etiquetas
    // arriba. Con background-size:230% y background-position afinado dejamos
    // visible solo el cuerpo entero de cada vista.
    // - front: mostrar el trozo x≈180..760 y≈180..1024 → posición 0% 100%
    // - back : mostrar el trozo x≈820..1400 y≈180..1024 → posición 100% 100%
    const bgPos = side === 'front' ? '18% 100%' : '82% 100%';

    return `
      <div style="position:relative;width:100%;max-width:240px;margin:0 auto;aspect-ratio:220 / 540;background:#F8FAFC;border-radius:12px;overflow:hidden;">
        <div style="position:absolute;inset:0;background-image:url('${IMG_MAPA_DOLOR}');background-repeat:no-repeat;background-size:250% auto;background-position:${bgPos};"></div>
        <svg viewBox="0 0 220 540" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;">
          ${circles}
          ${marks}
        </svg>
      </div>`;
  }

  // Versión SVG puro (sin imagen de fondo PNG) para el PDF con jsPDF.
  // Usa el contorno anatómico dibujado (siluetaContorno) porque svgToPdf en
  // ps-pdf.js no puede embeber la PNG a través del SVG (CORS/data URI).
  function siluetaParaPDF(seleccionadas, side) {
    side = side || 'front';
    seleccionadas = seleccionadas || [];
    const zonas = Object.entries(ZONAS_CUERPO).filter(([, z]) => z.side === side);
    const circles = zonas.map(([id, z]) => {
      const activa = seleccionadas.includes(id);
      const fill = activa ? '#DC2626' : 'transparent';
      const stroke = activa ? '#7F1D1D' : 'transparent';
      const opacity = activa ? '.75' : '0';
      return `<circle cx="${z.cx}" cy="${z.cy}" r="${z.r}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1"/>`;
    }).join('');
    const marks = zonas.filter(([id]) => seleccionadas.includes(id)).map(([, z]) => `
      <g stroke="#fff" stroke-width="2.2" stroke-linecap="round">
        <line x1="${z.cx-5}" y1="${z.cy-5}" x2="${z.cx+5}" y2="${z.cy+5}"/>
        <line x1="${z.cx+5}" y1="${z.cy-5}" x2="${z.cx-5}" y2="${z.cy+5}"/>
      </g>`).join('');
    return `
      <svg viewBox="0 0 220 540" xmlns="http://www.w3.org/2000/svg" style="background:#F8FAFC;">
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
    siluetaSVG, siluetaParaPDF, engancharSilueta,
    formatTipo, colorTipo, formatTecnica, formatDerivacion, zonaLabel
  };
})();
