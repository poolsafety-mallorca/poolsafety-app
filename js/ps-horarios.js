/* PoolSafety · PSHor
   Módulo compartido para gestionar horarios (tabla `horarios`) desde:
   - Ficha de hotel  → lista de socorristas asignados con entrada/salida/días
   - Ficha de socorrista → lista de puestos asignados con entrada/salida/días
*/
(function () {
  const DIAS_ORDEN = ['L','M','X','J','V','S','D'];
  const DIAS_LABEL = { L:'Lun', M:'Mar', X:'Mié', J:'Jue', V:'Vie', S:'Sáb', D:'Dom' };

  function sb() { return window.sb; }

  function toHHMM(t) {
    if (!t) return '';
    return String(t).slice(0,5);
  }

  function horaFin(horaInicio, duracion) {
    const [h, m] = toHHMM(horaInicio).split(':').map(Number);
    const total = (h || 0) * 60 + (m || 0) + (parseInt(duracion) || 0) * 60;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }

  function duracionEntre(horaIni, horaFin) {
    const [h1, m1] = toHHMM(horaIni).split(':').map(Number);
    const [h2, m2] = toHHMM(horaFin).split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins <= 0) mins += 24 * 60; // cruce medianoche
    return Math.max(1, Math.round(mins / 60));
  }

  function parseDias(str) {
    if (!str) return ['L','M','X','J','V'];
    const s = String(str).toUpperCase();
    // Rango tipo "Lun-Vie"
    if (/LUN.*VIE/.test(s)) return ['L','M','X','J','V'];
    if (/LUN.*DOM/.test(s)) return ['L','M','X','J','V','S','D'];
    if (/SAB.*DOM/.test(s) || /SÁB.*DOM/.test(s)) return ['S','D'];
    // Lista separada por comas o espacios: "L,M,X" o "L M X"
    const tokens = s.split(/[\s,;]+/).filter(Boolean);
    const found = tokens.filter(t => DIAS_ORDEN.includes(t));
    return found.length ? found : ['L','M','X','J','V'];
  }

  function serializeDias(arr) {
    if (!arr || !arr.length) return 'L,M,X,J,V';
    const clean = DIAS_ORDEN.filter(d => arr.includes(d));
    return clean.join(',');
  }

  function diasCortos(arr) {
    const set = new Set(arr);
    // Presentación bonita: "Lun–Vie", "Sáb–Dom", "L M X J V" etc.
    const laborables = ['L','M','X','J','V'];
    const finde = ['S','D'];
    const esLunVie = laborables.every(d => set.has(d)) && !set.has('S') && !set.has('D');
    const esFinde = finde.every(d => set.has(d)) && laborables.every(d => !set.has(d));
    const esTodos = DIAS_ORDEN.every(d => set.has(d));
    if (esTodos) return 'Todos los días';
    if (esLunVie) return 'Lun – Vie';
    if (esFinde) return 'Sáb – Dom';
    return DIAS_ORDEN.filter(d => set.has(d)).join(' · ');
  }

  async function listByPuesto(puestoId) {
    const { data, error } = await sb()
      .from('horarios')
      .select('id, empleado_id, puesto_id, hora_inicio, duracion, dias, activo, empleados(id, nombre)')
      .eq('puesto_id', puestoId)
      .eq('activo', true)
      .order('hora_inicio', { ascending: true });
    if (error) { console.warn('PSHor listByPuesto:', error.message); return []; }
    return data || [];
  }

  async function listByEmpleado(empleadoId) {
    const { data, error } = await sb()
      .from('horarios')
      .select('id, empleado_id, puesto_id, hora_inicio, duracion, dias, activo, puestos(id, nombre, zona)')
      .eq('empleado_id', empleadoId)
      .eq('activo', true)
      .order('hora_inicio', { ascending: true });
    if (error) { console.warn('PSHor listByEmpleado:', error.message); return []; }
    return data || [];
  }

  async function listEmpleadosActivos() {
    const { data, error } = await sb()
      .from('empleados')
      .select('id, nombre')
      .is('fecha_baja', null)
      .order('nombre', { ascending: true });
    if (error) { console.warn('PSHor listEmpleados:', error.message); return []; }
    return data || [];
  }

  async function listPuestosActivos() {
    const { data, error } = await sb()
      .from('puestos')
      .select('id, nombre, zona')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) { console.warn('PSHor listPuestos:', error.message); return []; }
    return data || [];
  }

  async function crear({ empleado_id, puesto_id, hora_inicio, duracion, dias }) {
    const payload = {
      empleado_id, puesto_id,
      hora_inicio: toHHMM(hora_inicio),
      duracion: parseInt(duracion) || 8,
      dias: serializeDias(dias),
      activo: true
    };
    const { data, error } = await sb().from('horarios').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function actualizar(id, patch) {
    const clean = { ...patch };
    if (clean.hora_inicio) clean.hora_inicio = toHHMM(clean.hora_inicio);
    if (clean.dias) clean.dias = serializeDias(clean.dias);
    const { data, error } = await sb().from('horarios').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async function eliminar(id) {
    const { error } = await sb().from('horarios').update({ activo: false }).eq('id', id);
    if (error) throw error;
  }

  /* ==========================================================================
     UI · Editor inline compartido
     ========================================================================== */

  function chipsDias(seleccion, idPrefix) {
    return `
      <div class="hor-dias-chips">
        ${DIAS_ORDEN.map(d => `
          <label class="hor-dia-chip ${seleccion.includes(d) ? 'on' : ''}">
            <input type="checkbox" data-dia="${d}" ${seleccion.includes(d) ? 'checked' : ''} />
            <span>${d}</span>
          </label>
        `).join('')}
      </div>
      <div class="hor-dias-shortcuts">
        <button type="button" class="btn-mini" data-shortcut="LV">Lun–Vie</button>
        <button type="button" class="btn-mini" data-shortcut="SD">Sáb–Dom</button>
        <button type="button" class="btn-mini" data-shortcut="ALL">Todos</button>
      </div>
    `;
  }

  function attachDiasShortcuts(rootEl) {
    rootEl.querySelectorAll('[data-shortcut]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inputs = rootEl.querySelectorAll('input[data-dia]');
        const preset = btn.dataset.shortcut === 'LV' ? ['L','M','X','J','V']
                    : btn.dataset.shortcut === 'SD' ? ['S','D']
                    : DIAS_ORDEN;
        inputs.forEach(i => {
          i.checked = preset.includes(i.dataset.dia);
          i.closest('label').classList.toggle('on', i.checked);
        });
      });
    });
    rootEl.querySelectorAll('input[data-dia]').forEach(inp => {
      inp.addEventListener('change', () => {
        inp.closest('label').classList.toggle('on', inp.checked);
      });
    });
  }

  function leerDiasFromForm(rootEl) {
    return Array.from(rootEl.querySelectorAll('input[data-dia]:checked')).map(i => i.dataset.dia);
  }

  /* -------- Renderizado dentro de la ficha de hotel -------- */
  async function renderPuestoBlock(containerEl, puestoId, opts = {}) {
    containerEl.innerHTML = `<div class="text-muted" style="padding:16px;text-align:center;">Cargando socorristas…</div>`;
    const [rows, empleados] = await Promise.all([listByPuesto(puestoId), listEmpleadosActivos()]);
    _renderPuestoUI(containerEl, puestoId, rows, empleados, opts);
  }

  function _renderPuestoUI(container, puestoId, rows, empleados, opts) {
    container.innerHTML = `
      <div class="hor-block">
        <div class="hor-block-head">
          <div class="hor-block-title">Servicios del puesto <span class="text-muted" style="font-weight:400;font-size:12px;">· ${rows.length} activo${rows.length === 1 ? '' : 's'}</span></div>
          <button class="btn btn-primary btn-sm" data-add>
            <svg class="ic ic-14"><use href="#ic-plus"/></svg>
            Añadir servicio
          </button>
        </div>
        ${rows.length ? `
        <div class="hor-table-wrap">
          <table class="hor-table">
            <thead>
              <tr><th>Servicio</th><th>Socorrista</th><th>Entrada</th><th>Salida</th><th>Días</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => `
                <tr data-id="${r.id}">
                  <td><span class="hor-badge">Servicio ${i + 1}</span></td>
                  <td>${(r.empleados && r.empleados.nombre) || '—'}</td>
                  <td>${toHHMM(r.hora_inicio)}</td>
                  <td>${horaFin(r.hora_inicio, r.duracion)}</td>
                  <td>${diasCortos(parseDias(r.dias))}</td>
                  <td class="hor-actions">
                    <button class="icon-btn-mini" data-edit title="Editar"><svg class="ic ic-14"><use href="#ic-pen"/></svg></button>
                    <button class="icon-btn-mini danger" data-del title="Quitar"><svg class="ic ic-14"><use href="#ic-x"/></svg></button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : `<div class="hor-empty">Aún no hay servicios configurados en este puesto. Añade uno para asignar socorrista + horario.</div>`}
        <div class="hor-form-slot"></div>
      </div>
    `;

    const formSlot = container.querySelector('.hor-form-slot');
    container.querySelector('[data-add]').addEventListener('click', () => {
      _openForm(formSlot, { mode: 'crear', puesto_id: puestoId, empleados }, async (payload) => {
        try { await crear(payload); }
        catch (e) { alert('Error: ' + e.message); return; }
        renderPuestoBlock(container, puestoId, opts);
      });
    });
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('tr').dataset.id;
        const row = rows.find(r => r.id === id);
        _openForm(formSlot, { mode: 'editar', row, puesto_id: puestoId, empleados }, async (payload) => {
          try { await actualizar(id, payload); }
          catch (e) { alert('Error: ' + e.message); return; }
          renderPuestoBlock(container, puestoId, opts);
        });
      });
    });
    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        const row = rows.find(r => r.id === id);
        if (!confirm(`¿Quitar a ${row.empleados?.nombre || 'este socorrista'} de este puesto?`)) return;
        try { await eliminar(id); }
        catch (e) { alert('Error: ' + e.message); return; }
        renderPuestoBlock(container, puestoId, opts);
      });
    });
  }

  /* -------- Renderizado dentro de la ficha de socorrista -------- */
  async function renderEmpleadoBlock(containerEl, empleadoId, opts = {}) {
    containerEl.innerHTML = `<div class="text-muted" style="padding:16px;text-align:center;">Cargando puestos…</div>`;
    const [rows, puestos] = await Promise.all([listByEmpleado(empleadoId), listPuestosActivos()]);
    _renderEmpleadoUI(containerEl, empleadoId, rows, puestos, opts);
  }

  function _renderEmpleadoUI(container, empleadoId, rows, puestos, opts) {
    container.innerHTML = `
      <div class="hor-block">
        <div class="hor-block-head">
          <div class="hor-block-title">Puestos y horarios</div>
          <button class="btn btn-primary btn-sm" data-add>
            <svg class="ic ic-14"><use href="#ic-plus"/></svg>
            Añadir
          </button>
        </div>
        ${rows.length ? `
        <div class="hor-table-wrap">
          <table class="hor-table">
            <thead>
              <tr><th>Puesto</th><th>Entrada</th><th>Salida</th><th>Días</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr data-id="${r.id}">
                  <td>${(r.puestos && r.puestos.nombre) || '—'}<div class="hor-td-sub">${(r.puestos && r.puestos.zona) || ''}</div></td>
                  <td>${toHHMM(r.hora_inicio)}</td>
                  <td>${horaFin(r.hora_inicio, r.duracion)}</td>
                  <td>${diasCortos(parseDias(r.dias))}</td>
                  <td class="hor-actions">
                    <button class="icon-btn-mini" data-edit title="Editar"><svg class="ic ic-14"><use href="#ic-pen"/></svg></button>
                    <button class="icon-btn-mini danger" data-del title="Quitar"><svg class="ic ic-14"><use href="#ic-x"/></svg></button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : `<div class="hor-empty">Este socorrista aún no tiene puestos asignados.</div>`}
        <div class="hor-form-slot"></div>
      </div>
    `;

    const formSlot = container.querySelector('.hor-form-slot');
    container.querySelector('[data-add]').addEventListener('click', () => {
      _openForm(formSlot, { mode: 'crear', empleado_id: empleadoId, puestos }, async (payload) => {
        try { await crear(payload); }
        catch (e) { alert('Error: ' + e.message); return; }
        renderEmpleadoBlock(container, empleadoId, opts);
      });
    });
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('tr').dataset.id;
        const row = rows.find(r => r.id === id);
        _openForm(formSlot, { mode: 'editar', row, empleado_id: empleadoId, puestos }, async (payload) => {
          try { await actualizar(id, payload); }
          catch (e) { alert('Error: ' + e.message); return; }
          renderEmpleadoBlock(container, empleadoId, opts);
        });
      });
    });
    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        const row = rows.find(r => r.id === id);
        if (!confirm(`¿Quitar el puesto "${row.puestos?.nombre || ''}" de este socorrista?`)) return;
        try { await eliminar(id); }
        catch (e) { alert('Error: ' + e.message); return; }
        renderEmpleadoBlock(container, empleadoId, opts);
      });
    });
  }

  /* -------- Formulario inline compartido -------- */
  function _openForm(slotEl, ctx, onSubmit) {
    const isPuestoView = !!ctx.puesto_id;   // estamos en ficha hotel → seleccionar empleado
    const isEmpleadoView = !!ctx.empleado_id; // estamos en ficha empleado → seleccionar puesto
    const row = ctx.row || null;
    const hi = row ? toHHMM(row.hora_inicio) : '10:00';
    const hf = row ? horaFin(row.hora_inicio, row.duracion) : '18:00';
    const diasSel = row ? parseDias(row.dias) : ['L','M','X','J','V'];

    const formTitle = isPuestoView
      ? (row ? 'Editar servicio' : 'Nuevo servicio')
      : (row ? 'Editar horario' : 'Nuevo horario');
    slotEl.innerHTML = `
      <div class="hor-form">
        <div class="hor-form-title">${formTitle}</div>
        <div class="hor-form-grid">
          ${isPuestoView ? `
            <div class="hor-field">
              <label>Socorrista</label>
              <select id="hor-emp">
                <option value="">— Seleccionar —</option>
                ${ctx.empleados.map(e => `<option value="${e.id}" ${row && row.empleado_id === e.id ? 'selected':''}>${e.nombre}</option>`).join('')}
              </select>
              ${row ? '<div class="small text-muted mt-1">Puedes cambiar el socorrista asignado a este servicio. Se reflejará en la ficha del nuevo socorrista.</div>' : ''}
            </div>
          ` : ''}
          ${isEmpleadoView ? `
            <div class="hor-field">
              <label>Puesto</label>
              <select id="hor-pue">
                <option value="">— Seleccionar —</option>
                ${ctx.puestos.map(p => `<option value="${p.id}" ${row && row.puesto_id === p.id ? 'selected':''}>${p.nombre}${p.zona ? ' · ' + p.zona : ''}</option>`).join('')}
              </select>
              ${row ? '<div class="small text-muted mt-1">Puedes cambiar el puesto. Se reflejará en la ficha del hotel destino.</div>' : ''}
            </div>
          ` : ''}
          <div class="hor-field">
            <label>Entrada</label>
            <input type="time" id="hor-ini" value="${hi}" />
          </div>
          <div class="hor-field">
            <label>Salida</label>
            <input type="time" id="hor-fin" value="${hf}" />
          </div>
        </div>
        <div class="hor-field">
          <label>Días de trabajo</label>
          ${chipsDias(diasSel)}
        </div>
        <div class="hor-form-actions">
          <button type="button" class="btn btn-outline btn-sm" data-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" data-save>
            <svg class="ic ic-14"><use href="#ic-check"/></svg>
            Guardar
          </button>
        </div>
      </div>
    `;

    attachDiasShortcuts(slotEl);

    slotEl.querySelector('[data-cancel]').addEventListener('click', () => { slotEl.innerHTML = ''; });
    slotEl.querySelector('[data-save]').addEventListener('click', async () => {
      const ini = slotEl.querySelector('#hor-ini').value;
      const fin = slotEl.querySelector('#hor-fin').value;
      const dias = leerDiasFromForm(slotEl);
      if (!ini || !fin) { alert('Introduce hora de entrada y salida.'); return; }
      if (!dias.length) { alert('Selecciona al menos un día.'); return; }
      const payload = {
        hora_inicio: ini,
        duracion: duracionEntre(ini, fin),
        dias
      };
      if (isPuestoView) {
        payload.puesto_id = ctx.puesto_id;
        const empSel = slotEl.querySelector('#hor-emp');
        if (!empSel.value) { alert('Selecciona un socorrista.'); return; }
        payload.empleado_id = empSel.value;
      }
      if (isEmpleadoView) {
        payload.empleado_id = ctx.empleado_id;
        const pueSel = slotEl.querySelector('#hor-pue');
        if (!pueSel.value) { alert('Selecciona un puesto.'); return; }
        payload.puesto_id = pueSel.value;
      }
      await onSubmit(payload);
    });
  }

  /* ---------- Export ---------- */
  window.PSHor = {
    listByPuesto, listByEmpleado, listEmpleadosActivos, listPuestosActivos,
    crear, actualizar, eliminar,
    renderPuestoBlock, renderEmpleadoBlock,
    parseDias, serializeDias, diasCortos, horaFin, duracionEntre, toHHMM
  };
})();
