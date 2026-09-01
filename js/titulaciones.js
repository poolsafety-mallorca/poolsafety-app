/* ==========================================================================
   PoolSafety · Módulo de Titulaciones y Documentación laboral
   Usado tanto por socorrista.js como coordinador.js
   ========================================================================== */

window.PSTit = (function () {

  const TIPOS = {
    dni:                  { label: 'DNI',                       icon: '🆔', obligatorio: true,  color: '#B91C1C', needCaducidad: true,  needReciclaje: false, needObtencion: false },
    socorrismo_acuatico:  { label: 'Socorrismo Acuático',       icon: '🏊', obligatorio: true,  color: '#0EA5E9', needCaducidad: true,  needReciclaje: true,  needObtencion: true  },
    svb:                  { label: 'SVB (Soporte Vital Básico)', icon: '❤️', obligatorio: true, color: '#DC2626', needCaducidad: true,  needReciclaje: true,  needObtencion: true  },
    dea:                  { label: 'DEA (Desfibrilador)',        icon: '⚡', obligatorio: true,  color: '#F59E0B', needCaducidad: true,  needReciclaje: true,  needObtencion: true  },
    prl:                  { label: 'Prevención Riesgos Laborales',icon: '🛡️',obligatorio: true, color: '#7C3AED', needCaducidad: true,  needReciclaje: false, needObtencion: true  },
    contrato:             { label: 'Contrato de trabajo',        icon: '📄', obligatorio: true,  color: '#059669', needCaducidad: false, needReciclaje: false, needObtencion: true  },
    nomina:               { label: 'Nómina',                     icon: '💰', obligatorio: false, color: '#0F172A', needCaducidad: false, needReciclaje: false, needObtencion: true  },
    otro:                 { label: 'Otro documento',             icon: '📎', obligatorio: false, color: '#64748B', needCaducidad: false, needReciclaje: false, needObtencion: false }
  };

  const ORDEN_TIPOS = ['dni','socorrismo_acuatico','svb','dea','prl','contrato','nomina','otro'];

  /* NO pedir `documento_url` al listar.
     Los documentos (DNI, PRL, contrato, certificados) se guardan como data URL
     en base64 dentro de esa columna, hasta 20 MB por fichero (~27 MB ya en
     base64). Un `select('*')` descargaba TODOS los documentos del trabajador
     cada vez que se abría la lista, aunque no se abriera ninguno. Eso es lo que
     dispara el Egress de Supabase.

     En su lugar se listan las columnas ligeras y se pregunta aparte qué filas
     TIENEN documento, trayendo solo los `id` (unos bytes). El contenido se
     descarga al pulsar "Ver", que es cuando de verdad hace falta. */
  const COLS_LIGERAS = 'id, empleado_id, tipo, nombre, entidad_emisora, numero_referencia, ' +
                       'fecha_obtencion, fecha_caducidad, fecha_reciclaje, notas, documento_nombre, created_at';

  async function cargar(empleadoId) {
    if (!window.sb || !empleadoId) return [];
    try {
      const { data, error } = await window.sb
        .from('titulaciones_empleado')
        .select(COLS_LIGERAS)
        .eq('empleado_id', empleadoId)
        .order('tipo')
        .order('fecha_caducidad', { ascending: false });
      if (error) throw error;
      const filas = data || [];

      // Qué filas tienen documento adjunto. Solo ids: pesa nada.
      try {
        const { data: conDoc } = await window.sb
          .from('titulaciones_empleado')
          .select('id')
          .eq('empleado_id', empleadoId)
          .not('documento_url', 'is', null);
        const set = new Set((conDoc || []).map(x => x.id));
        filas.forEach(f => { f.tieneDocumento = set.has(f.id); });
      } catch (_) {
        // Si falla, se asume que sí hay documento: mejor mostrar el botón de más
        // que esconder un documento que existe.
        filas.forEach(f => { f.tieneDocumento = true; });
      }
      return filas;
    } catch (err) {
      console.warn('[PSTit]', err.message);
      return [];
    }
  }

  /* Descarga el documento SOLO cuando el usuario lo pide. */
  async function abrirDocumento(id) {
    if (!window.sb) return;
    try {
      const { data, error } = await window.sb
        .from('titulaciones_empleado')
        .select('documento_url, documento_nombre')
        .eq('id', id).single();
      if (error) throw error;
      if (!data || !data.documento_url) {
        alert('Esta titulación no tiene ningún documento adjunto.');
        return;
      }
      const a = document.createElement('a');
      a.href = data.documento_url;
      a.download = data.documento_nombre || 'documento';
      a.target = '_blank';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) {
      alert('No se ha podido abrir el documento: ' + err.message);
    }
  }

  async function guardar(empleadoId, payload) {
    const row = {
      empleado_id: empleadoId,
      tipo: payload.tipo,
      nombre: payload.nombre || TIPOS[payload.tipo]?.label || 'Documento',
      entidad_emisora: payload.entidad_emisora || null,
      numero_referencia: payload.numero_referencia || null,
      fecha_obtencion: payload.fecha_obtencion || null,
      fecha_caducidad: payload.fecha_caducidad || null,
      fecha_reciclaje: payload.fecha_reciclaje || null,
      notas: payload.notas || null
    };
    /* El documento SOLO se toca si viene uno nuevo.
       Antes se hacía `documento_url: payload.documento_url || null`, y quien
       edita una titulación sin volver a subir el fichero manda `undefined`:
       el UPDATE ponía la columna a null y BORRABA el DNI o el contrato ya
       subido. Pérdida de datos silenciosa al corregir una simple fecha.
       Pasando `null` explícito sí se puede quitar el documento a propósito. */
    if (payload.documento_url !== undefined) {
      row.documento_url = payload.documento_url || null;
      row.documento_nombre = payload.documento_nombre || null;
    }
    if (payload.id) {
      const { error } = await window.sb.from('titulaciones_empleado').update(row).eq('id', payload.id);
      if (error) throw error;
    } else {
      const { error } = await window.sb.from('titulaciones_empleado').insert(row);
      if (error) throw error;
    }
  }

  async function eliminar(id) {
    const { error } = await window.sb.from('titulaciones_empleado').delete().eq('id', id);
    if (error) throw error;
  }

  function estadoCaducidad(t) {
    if (!t.fecha_caducidad) return { estado: 'ok', txt: '' };
    const hoy = new Date();
    const cad = new Date(t.fecha_caducidad);
    const dias = Math.floor((cad - hoy) / (1000 * 60 * 60 * 24));
    if (dias < 0) return { estado: 'caducado', txt: `Caducado hace ${Math.abs(dias)} días`, dias };
    if (dias <= 30) return { estado: 'proximo', txt: `Caduca en ${dias} días`, dias };
    if (dias <= 90) return { estado: 'cerca', txt: `Caduca en ${dias} días`, dias };
    return { estado: 'ok', txt: `Válido hasta ${cad.toLocaleDateString('es-ES')}`, dias };
  }

  function formatFecha(f) {
    if (!f) return '—';
    return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function renderCard(t, opts) {
    const info = TIPOS[t.tipo] || TIPOS.otro;
    const est = estadoCaducidad(t);
    let badge = '';
    if (est.estado === 'caducado') badge = `<span class="tit-badge caducado">⚠️ ${est.txt}</span>`;
    else if (est.estado === 'proximo') badge = `<span class="tit-badge proximo">⏰ ${est.txt}</span>`;
    else if (est.estado === 'cerca') badge = `<span class="tit-badge cerca">${est.txt}</span>`;
    else if (t.fecha_caducidad) badge = `<span class="tit-badge ok">✓ ${est.txt}</span>`;

    const filas = [];
    if (t.fecha_obtencion) filas.push(`<div class="tit-fecha-row"><span>Obtención</span><b>${formatFecha(t.fecha_obtencion)}</b></div>`);
    if (t.fecha_caducidad) filas.push(`<div class="tit-fecha-row"><span>Caducidad</span><b>${formatFecha(t.fecha_caducidad)}</b></div>`);
    if (t.fecha_reciclaje) filas.push(`<div class="tit-fecha-row"><span>Reciclaje</span><b>${formatFecha(t.fecha_reciclaje)}</b></div>`);
    if (t.entidad_emisora) filas.push(`<div class="tit-fecha-row"><span>Emitido por</span><b>${t.entidad_emisora}</b></div>`);
    if (t.numero_referencia) filas.push(`<div class="tit-fecha-row"><span>Nº ref.</span><b>${t.numero_referencia}</b></div>`);

    const acciones = opts?.canEdit ? `
      <div class="tit-actions">
        ${t.tieneDocumento ? `<button class="btn btn-outline btn-sm" onclick="PSTit.abrirDocumento('${t.id}')">📎 Ver/descargar</button>` : ''}
        <button class="btn btn-outline btn-sm" data-editar="${t.id}">✏️ Editar</button>
        <button class="btn btn-outline btn-sm" data-eliminar="${t.id}" style="color:var(--danger);border-color:var(--danger);">✕</button>
      </div>` : (t.tieneDocumento ? `<div class="tit-actions"><button class="btn btn-outline btn-sm" onclick="PSTit.abrirDocumento('${t.id}')">📎 Ver</button></div>` : '');

    return `
      <div class="tit-card ${est.estado}" data-id="${t.id}">
        <div class="tit-head">
          <div class="tit-icon" style="background:${info.color};">${info.icon}</div>
          <div class="tit-title-wrap">
            <div class="tit-title">${t.nombre}</div>
            <div class="tit-sub">${info.label}${info.obligatorio ? ' · obligatorio' : ''}</div>
          </div>
          ${badge}
        </div>
        <div class="tit-body">${filas.join('')}</div>
        ${t.notas ? `<div class="tit-notas">${t.notas}</div>` : ''}
        ${acciones}
      </div>`;
  }

  function renderLista(items, opts) {
    if (!items || items.length === 0) {
      return `<div class="tit-empty">
        <div style="font-size:32px; margin-bottom:8px;">📄</div>
        <div><b>Sin documentación aún</b></div>
        <div class="small text-muted mt-1">Añade tus titulaciones y documentos para tenerlos siempre a mano.</div>
      </div>`;
    }
    // Agrupamos por tipo
    const grupos = {};
    items.forEach(t => {
      if (!grupos[t.tipo]) grupos[t.tipo] = [];
      grupos[t.tipo].push(t);
    });
    // Detecta obligatorios que faltan
    const faltan = ORDEN_TIPOS.filter(tp => TIPOS[tp].obligatorio && !grupos[tp]);
    let alertFaltan = '';
    if (faltan.length > 0 && opts?.mostrarFaltan !== false) {
      alertFaltan = `<div class="tit-alert-faltan">
        <b>⚠️ Faltan documentos obligatorios:</b><br>
        ${faltan.map(tp => TIPOS[tp].icon + ' ' + TIPOS[tp].label).join(' · ')}
      </div>`;
    }
    let html = alertFaltan;
    ORDEN_TIPOS.forEach(tp => {
      if (grupos[tp]) {
        html += grupos[tp].map(t => renderCard(t, opts)).join('');
      }
    });
    return html;
  }

  function modalHTML(t) {
    const tipoActual = t?.tipo || 'dni';
    const info = TIPOS[tipoActual];
    return `
      <div class="modal-head">
        <div>
          <h3>${t ? 'Editar' : 'Añadir'} documento</h3>
          <p class="small text-muted mt-1" style="margin:4px 0 0;">Se guarda en tu ficha con fecha, caducidad y (si subes archivo) el documento adjunto.</p>
        </div>
        <button class="modal-close" onclick="closeTitulacionModal()">
          <svg class="ic ic-16"><use href="#ic-x"/></svg>
        </button>
      </div>
      <div class="field">
        <label>Tipo de documento *</label>
        <select id="titTipo" onchange="onTitTipoChange()">
          ${ORDEN_TIPOS.map(tp => `<option value="${tp}" ${tp===tipoActual?'selected':''}>${TIPOS[tp].icon} ${TIPOS[tp].label}${TIPOS[tp].obligatorio?' (obligatorio)':''}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Nombre del documento</label>
        <input type="text" id="titNombre" value="${t?.nombre || ''}" placeholder="Deja vacío para usar el nombre del tipo" />
      </div>
      <div class="row gap-2">
        <div class="field" style="flex:1;">
          <label>Entidad emisora</label>
          <input type="text" id="titEntidad" value="${t?.entidad_emisora || ''}" placeholder="p.ej. Cruz Roja, DGT..." />
        </div>
        <div class="field" style="flex:1;">
          <label>Nº referencia</label>
          <input type="text" id="titRef" value="${t?.numero_referencia || ''}" placeholder="Nº certificado/DNI" />
        </div>
      </div>
      <div class="row gap-2">
        <div class="field" style="flex:1;">
          <label id="titLblObt">Fecha obtención</label>
          <input type="date" id="titObt" value="${t?.fecha_obtencion || ''}" />
        </div>
        <div class="field" style="flex:1;">
          <label id="titLblCad">Fecha caducidad</label>
          <input type="date" id="titCad" value="${t?.fecha_caducidad || ''}" />
        </div>
        <div class="field" style="flex:1;">
          <label id="titLblRec">Próximo reciclaje</label>
          <input type="date" id="titRec" value="${t?.fecha_reciclaje || ''}" />
        </div>
      </div>
      <div class="field">
        <label>Documento (PDF, JPG, PNG)</label>
        <div class="row gap-2" style="align-items:center;">
          <label class="btn btn-outline" style="flex:1;">
            <svg class="ic ic-16"><use href="#ic-download"/></svg>
            <span id="titFileName">${t?.documento_nombre || 'Seleccionar archivo…'}</span>
            <input type="file" id="titFile" style="display:none;" accept=".pdf,.jpg,.jpeg,.png" onchange="onTitFileChange(event)" />
          </label>
          ${(t?.tieneDocumento || t?.documento_nombre) ? `<button type="button" class="btn btn-outline" onclick="PSTit.abrirDocumento('${t.id}')">👁️ Ver actual</button>` : ''}
        </div>
        <div class="small text-muted mt-1">Se guarda en tu ficha. Máximo 20 MB por archivo (PDF, JPG o PNG).</div>
      </div>
      <div class="field">
        <label>Notas (opcional)</label>
        <textarea id="titNotas" placeholder="Cualquier detalle relevante...">${t?.notas || ''}</textarea>
      </div>
      <input type="hidden" id="titId" value="${t?.id || ''}" />
      <input type="hidden" id="titFileData" value="" />
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="closeTitulacionModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="submitTitulacion()">
          <svg class="ic ic-16"><use href="#ic-check"/></svg>
          Guardar
        </button>
      </div>
    `;
  }

  return {
    TIPOS, ORDEN_TIPOS,
    cargar, guardar, eliminar, abrirDocumento,
    estadoCaducidad, formatFecha,
    renderCard, renderLista, modalHTML
  };
})();
