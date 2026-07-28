/* ==========================================================================
   PoolSafety · Dashboard coordinador / dueño v2
   ========================================================================== */

(function () {
  // Fija cabecera desde la sesión actual — se llama al inicio y cada vez que se refresca desde la BD
  function pintarCabecera(session) {
    const rol = session.rol || session.role || 'coordinador';
    const email = session.email || 'usuario@poolsafety.es';
    let nombre = session.nombre;
    if (!nombre) {
      nombre = email.split('@')[0];
      nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
    }
    const rolLabel = rol === 'dueno' ? 'Administrador' : 'Coordinador';
    document.getElementById('userName').textContent = nombre;
    document.getElementById('userRoleLabel').textContent = rolLabel;
    document.getElementById('userAvatar').textContent = nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
  }

  // Pintar con lo que haya ahora (localStorage cache)
  pintarCabecera(window.PS_SESSION || PS.getSession() || {});

  // Cuando auth-guard termine de refrescar desde la BD, repintamos con datos reales
  document.addEventListener('ps-session-updated', (e) => pintarCabecera(e.detail));

  // Variables para el resto del código
  const psSession = window.PS_SESSION || PS.getSession() || {};
  const rol = psSession.rol || psSession.role || 'coordinador';
  const email = psSession.email || 'usuario@poolsafety.es';
  const nombre = psSession.nombre || (email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1).toLowerCase());
  const rolLabel = rol === 'dueno' ? 'Administrador' : 'Coordinador';
  const fecha = PS.fechaLarga();
  document.getElementById('dateText').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  /* ---------- Puestos ---------- */
  let currentFilter = 'todos';
  let currentSearch = '';

  function estadoInfo(estado) {
    switch (estado) {
      case 'ok':        return { cls: 'ok',       label: 'Fichado',        badge: 'badge-ok',     icon: 'ic-check-circle' };
      case 'tarde':     return { cls: 'tarde',    label: 'Tarde',          badge: 'badge-warn',   icon: 'ic-clock' };
      case 'fuera':     return { cls: 'fuera',    label: 'Fuera de zona',  badge: 'badge-danger', icon: 'ic-signal' };
      case 'pendiente': return { cls: 'pendiente',label: 'Sin fichar',     badge: 'badge-danger', icon: 'ic-alert-circle' };
      case 'vacante':   return { cls: 'vacante',  label: 'Vacante',        badge: 'badge-neutral',icon: 'ic-user' };
    }
  }

  function avatarClassFor(estado) {
    return estado === 'ok' ? 'sky' : estado === 'tarde' ? 'amber' : '';
  }

  function renderPosts() {
    const grid = document.getElementById('postsGrid');
    const items = PS.fichajes.filter(f => {
      const p = PS.puestoById(f.puestoId);
      const soc = f.socorristaId ? PS.socorristas.find(s => s.id === f.socorristaId) : null;
      const matchesFilter = currentFilter === 'todos' || currentFilter === f.estado;
      const q = currentSearch.toLowerCase();
      const matchesSearch = !q
        || p.nombre.toLowerCase().includes(q)
        || p.zona.toLowerCase().includes(q)
        || (soc && soc.nombre.toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1; padding: 40px 20px; text-align:center; color:var(--ink-500);">
          <svg class="ic ic-24" style="opacity:.5; margin: 0 auto 8px;"><use href="#ic-search"/></svg>
          <div>Sin resultados con este filtro.</div>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(f => {
      const p = PS.puestoById(f.puestoId);
      const soc = f.socorristaId ? PS.socorristas.find(s => s.id === f.socorristaId) : null;
      const info = estadoInfo(f.estado);
      return `
        <div class="post ${info.cls}" data-post="${f.puestoId}">
          <div class="post-top">
            <div style="min-width:0;">
              <p class="post-name">${p.nombre}</p>
              <p class="post-loc">
                <svg class="ic ic-14"><use href="#ic-pin"/></svg>
                ${p.zona} · turno ${p.hora}
              </p>
            </div>
            <span class="badge ${info.badge}">
              <svg class="ic ic-14"><use href="#${info.icon}"/></svg>
              ${info.label}
            </span>
          </div>
          ${soc ? `
            <div class="post-worker">
              <div class="mini-av ${avatarClassFor(f.estado)}">${soc.iniciales}</div>
              <div style="min-width:0; flex:1;">
                <div class="post-worker-name">${soc.nombre}</div>
                <div class="post-time ${f.gpsOk === false ? 'danger' : ''}">
                  <svg class="ic ic-14"><use href="#ic-clock"/></svg>
                  ${f.horaFichaje ? `Fichó a las ${f.horaFichaje}${f.gpsOk === false ? ' · GPS fuera' : ''}` : 'Sin fichaje'}
                </div>
              </div>
            </div>
          ` : `
            <div class="post-worker">
              <div class="mini-av" style="background: var(--ink-200); color: var(--ink-500);">
                <svg class="ic ic-14"><use href="#ic-user"/></svg>
              </div>
              <div>
                <div class="post-worker-name" style="color: var(--ink-500);">Sin socorrista asignado</div>
                <div class="post-time">Pendiente de asignar</div>
              </div>
            </div>
          `}
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.post').forEach(el => {
      el.addEventListener('click', () => openPostModal(el.dataset.post));
    });
  }

  document.querySelectorAll('#filterChips .chip').forEach(ch => {
    ch.addEventListener('click', () => {
      document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('active'));
      ch.classList.add('active');
      currentFilter = ch.dataset.filter;
      renderPosts();
    });
  });
  document.getElementById('postSearch').addEventListener('input', e => {
    currentSearch = e.target.value;
    renderPosts();
  });
  renderPosts();

  /* ---------- Modal detalle puesto ---------- */
  window.openPostModal = function (puestoId) {
    const p = PS.puestoById(puestoId);
    const f = PS.fichajes.find(x => x.puestoId === puestoId);
    const soc = f.socorristaId ? PS.socorristas.find(s => s.id === f.socorristaId) : null;
    const info = estadoInfo(f.estado);
    const body = document.getElementById('postModalBody');

    body.innerHTML = `
      <div class="modal-head">
        <div>
          <h3>${p.nombre}</h3>
          <p class="small text-muted" style="margin:4px 0 0;">
            <svg class="ic ic-14" style="vertical-align:-3px;"><use href="#ic-pin"/></svg>
            ${p.zona} · turno ${p.hora}–${(parseInt(p.hora)+p.duracion).toString().padStart(2,'0')}:00
          </p>
        </div>
        <button class="modal-close" onclick="closePostModal()">
          <svg class="ic ic-16"><use href="#ic-x"/></svg>
        </button>
      </div>

      <div style="margin: 4px 0 14px;">
        <span class="badge ${info.badge}" style="padding:6px 12px; font-size:12px;">
          <svg class="ic ic-14"><use href="#${info.icon}"/></svg>
          ${info.label}
        </span>
      </div>

      <div class="map-view" style="border-radius: var(--r-3); height: 140px;">
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <rect x="10" y="10" width="90" height="60" fill="#E8F0F7" rx="4"/>
          <rect x="110" y="10" width="70" height="50" fill="#E8F0F7" rx="4"/>
          <rect x="190" y="10" width="120" height="55" fill="#E8F0F7" rx="4"/>
          <rect x="320" y="10" width="70" height="65" fill="#E8F0F7" rx="4"/>
          <rect x="10" y="130" width="140" height="60" fill="#E8F0F7" rx="4"/>
          <rect x="160" y="120" width="110" height="70" fill="#E8F0F7" rx="4"/>
          <rect x="280" y="130" width="110" height="60" fill="#E8F0F7" rx="4"/>
          <path d="M0 80 L400 80" stroke="#fff" stroke-width="10"/>
          <path d="M0 110 L400 110" stroke="#fff" stroke-width="8"/>
          <path d="M105 0 L105 200" stroke="#fff" stroke-width="8"/>
          <path d="M275 0 L275 200" stroke="#fff" stroke-width="8"/>
        </svg>
        <div class="map-radius"></div>
        <svg class="map-pin" viewBox="0 0 32 40">
          <path d="M16 40 C16 40 2 22 2 14 A14 14 0 0 1 30 14 C30 22 16 40 16 40 Z" fill="#EF4444"/>
          <circle cx="16" cy="14" r="5" fill="#fff"/>
        </svg>
      </div>

      ${soc ? `
        <div class="li" style="margin-top: 14px;">
          <div class="mini-av" style="width:40px; height:40px; font-size:13px;">${soc.iniciales}</div>
          <div class="li-body">
            <div class="li-title">${soc.nombre}</div>
            <div class="li-sub">${soc.telefono}</div>
          </div>
          <button class="btn-icon" title="Llamar">
            <svg class="ic ic-16"><use href="#ic-phone"/></svg>
          </button>
        </div>

        <div class="metrics-grid mt-3">
          <div class="metric">
            <div class="metric-label">Horas mes</div>
            <div class="metric-value">${soc.horasNormales}<span class="unit">h</span></div>
          </div>
          <div class="metric">
            <div class="metric-label">Extras</div>
            <div class="metric-value">${soc.horasExtra}<span class="unit">h</span></div>
          </div>
        </div>

        <div class="notice mt-3">
          <div class="notice-icon ${f.gpsOk === false ? 'amber' : 'sky'}" style="background: ${f.gpsOk === false ? 'var(--warning-bg)' : 'var(--info-bg)'}; color: ${f.gpsOk === false ? '#B45309' : 'var(--sky-700)'};">
            <svg class="ic ic-18"><use href="#ic-signal"/></svg>
          </div>
          <div class="notice-body">
            <div class="notice-title">${f.horaFichaje ? `Fichaje ${f.horaFichaje}` : 'Aún no ha fichado hoy'}</div>
            <div class="notice-sub">${f.horaFichaje ? (f.gpsOk ? 'GPS dentro del área del puesto' : 'GPS registrado fuera del área') : 'Turno ya debería haber comenzado'}</div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-outline" onclick="closePostModal()">Cerrar</button>
          <button class="btn btn-primary" onclick="closePostModal(); openTareaModal('${soc.id}')">
            <svg class="ic ic-16"><use href="#ic-message"/></svg>
            Enviar tarea
          </button>
        </div>
      ` : `
        <p class="mt-3 text-muted" style="font-size: 14px;">Este puesto no tiene socorrista asignado hoy.</p>
        <div class="modal-actions">
          <button class="btn btn-outline" onclick="closePostModal()">Cerrar</button>
          <button class="btn btn-primary" onclick="toast('Abriendo asignador…')">
            <svg class="ic ic-16"><use href="#ic-users"/></svg>
            Asignar socorrista
          </button>
        </div>
      `}
    `;
    document.getElementById('postModal').classList.add('open');
  };
  window.closePostModal = () => document.getElementById('postModal').classList.remove('open');

  /* ---------- Alertas botiquín (manuales + automáticas por stock bajo) ---------- */
  const alertsList = document.getElementById('alertsList');

  function renderAlertas() {
    // Alertas automáticas: cualquier item por debajo del mínimo, agrupado por puesto
    const auto = PS.inventario
      .filter(it => it.stock < it.minimo)
      .map(it => ({
        id: 'auto-' + it.id,
        puestoId: it.puestoId,
        puestoNombre: PS.puestoById(it.puestoId)?.nombre || '—',
        item: it.nombre,
        reportado: it.stock === 0 ? 'sin stock' : `${it.stock}/${it.minimo}`,
        criticidad: it.stock === 0 ? 'alta' : it.obligatorio ? 'media' : 'baja',
        automatica: true,
        seccion: it.seccion
      }));

    const todas = [...auto, ...PS.alertas];
    document.getElementById('alertsCount').innerHTML = `<span class="dot"></span>${todas.length} abiertas`;

    alertsList.innerHTML = todas.map(a => {
      const cls = a.criticidad === 'alta' ? 'high' : a.criticidad === 'media' ? 'med' : 'low';
      const critBadge = a.criticidad === 'alta' ? 'badge-danger'
                      : a.criticidad === 'media' ? 'badge-warn' : 'badge-info';
      const origen = a.automatica
        ? `<span class="badge badge-info small"><svg class="ic ic-14"><use href="#ic-signal"/></svg>Auto</span>`
        : `<span class="badge badge-neutral small"><svg class="ic ic-14"><use href="#ic-user"/></svg>Socorrista</span>`;
      const secTag = a.seccion === 'desa' ? ' · DESA' : a.seccion === 'oxigeno' ? ' · Oxígeno' : '';
      return `
        <div class="alert ${cls}">
          <div class="alert-icon">
            <svg class="ic ic-18"><use href="#ic-alert"/></svg>
          </div>
          <div class="alert-body">
            <div class="alert-title-row">
              <span class="alert-title">${a.item}${secTag}</span>
              <span class="badge ${critBadge}"><span class="dot"></span>${a.criticidad}</span>
            </div>
            <div class="alert-sub">
              <svg class="ic ic-14"><use href="#ic-pin"/></svg>
              ${a.puestoNombre} · ${a.reportado}
            </div>
            <div class="row gap-1 mt-1">${origen}</div>
          </div>
          <button class="alert-action" onclick="resolveAlert(this)">Reponer</button>
        </div>
      `;
    }).join('');
  }

  window.resolveAlert = function (btn) {
    btn.innerHTML = '<svg class="ic ic-14" style="vertical-align:-3px;"><use href="#ic-check"/></svg> Repuesto';
    btn.classList.add('done');
    toast('Alerta resuelta y stock actualizado');
  };
  renderAlertas();

  /* ---------- Gestión de botiquines (selector de puesto + inventario) ---------- */
  const botiquinPuestoSelect = document.getElementById('botiquinPuestoSelect');
  const botiquinAdminList = document.getElementById('botiquinAdminList');
  const botiquinPuestoLabel = document.getElementById('botiquinPuestoLabel');
  let currentBotPuesto = 'p01';
  let currentBotSeccion = 'botiquin';

  // Llenar selector con todos los puestos
  if (botiquinPuestoSelect) {
    botiquinPuestoSelect.innerHTML = PS.puestos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    botiquinPuestoSelect.value = currentBotPuesto;
    botiquinPuestoSelect.addEventListener('change', e => {
      currentBotPuesto = e.target.value;
      renderBotiquinAdmin();
    });
  }

  function itemsPuestoSeccion(puestoId, sec) {
    return PS.inventario.filter(it => it.puestoId === puestoId && it.seccion === sec);
  }

  function renderBotiquinAdmin() {
    if (!botiquinAdminList) return;
    const p = PS.puestoById(currentBotPuesto);
    if (botiquinPuestoLabel) botiquinPuestoLabel.textContent = `— ${p.nombre}`;

    ['botiquin','desa','oxigeno'].forEach(sec => {
      const el = document.getElementById(`admin-cnt-${sec}`);
      if (el) el.textContent = itemsPuestoSeccion(currentBotPuesto, sec).length;
    });
    document.querySelectorAll('#botiquinAdminTabs .chip-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.sec === currentBotSeccion);
    });

    const items = itemsPuestoSeccion(currentBotPuesto, currentBotSeccion);
    if (items.length === 0) {
      botiquinAdminList.innerHTML = `<div style="padding: 30px 20px; text-align:center; color: var(--ink-500); font-size: 13.5px;">No hay productos en esta sección para este puesto.</div>`;
      return;
    }
    botiquinAdminList.innerHTML = items.map(it => {
      const level = it.stock === 0 ? 'low' : it.stock < it.minimo ? 'warn' : 'ok';
      const badge = it.stock === 0
        ? '<span class="badge badge-danger"><span class="dot"></span>Sin stock</span>'
        : it.stock < it.minimo
        ? '<span class="badge badge-warn"><span class="dot"></span>Bajo mínimo</span>'
        : '<span class="badge badge-ok"><span class="dot"></span>OK</span>';
      const oblig = it.obligatorio
        ? `<span class="badge badge-info small" title="${it.normativa}"><svg class="ic ic-14"><use href="#ic-shield"/></svg>Obligatorio</span>`
        : `<span class="badge badge-neutral small">Opcional</span>`;
      const delBtn = it.obligatorio
        ? ''
        : `<button class="btn-icon" data-del="${it.id}" title="Eliminar producto"><svg class="ic ic-14"><use href="#ic-x"/></svg></button>`;

      return `
        <div class="bot-admin-row">
          <div class="bot-admin-main">
            <div class="row between">
              <div class="bot-admin-name">${it.nombre}</div>
              ${badge}
            </div>
            <div class="row gap-1 mt-1">${oblig}<span class="badge badge-neutral small">${it.categoria}</span></div>
          </div>
          <div class="bot-admin-controls">
            <label class="bot-mini-label">Stock</label>
            <input type="number" class="bot-num" data-field="stock" data-id="${it.id}" value="${it.stock}" min="0" />
            <label class="bot-mini-label">Mín</label>
            <input type="number" class="bot-num" data-field="minimo" data-id="${it.id}" value="${it.minimo}" min="0" />
            ${delBtn}
          </div>
        </div>
      `;
    }).join('');

    // Editar stock / mínimo
    botiquinAdminList.querySelectorAll('.bot-num').forEach(inp => {
      inp.addEventListener('change', e => {
        const it = PS.inventario.find(x => x.id === inp.dataset.id);
        if (!it) return;
        it[inp.dataset.field] = parseInt(e.target.value) || 0;
        renderAlertas();
        renderBotiquinAdmin();
        toast(`${it.nombre} actualizado`);
      });
    });
    // Eliminar (solo opcionales)
    botiquinAdminList.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.del;
        if (!confirm('¿Quitar este producto del inventario del puesto?')) return;
        const idx = PS.inventario.findIndex(x => x.id === id);
        if (idx >= 0) PS.inventario.splice(idx, 1);
        renderAlertas();
        renderBotiquinAdmin();
        toast('Producto eliminado');
      });
    });
  }

  document.querySelectorAll('#botiquinAdminTabs .chip-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentBotSeccion = btn.dataset.sec;
      renderBotiquinAdmin();
    });
  });
  renderBotiquinAdmin();

  /* ---------- Modal añadir producto ---------- */
  window.openAddItemModal = function () {
    document.getElementById('newItemSeccion').value = currentBotSeccion;
    document.getElementById('addItemModal').classList.add('open');
  };
  window.closeAddItemModal = function () {
    document.getElementById('addItemModal').classList.remove('open');
  };
  window.submitAddItem = function () {
    const nombre = document.getElementById('newItemName').value.trim();
    if (!nombre) { toast('Escribe un nombre para el producto'); return; }
    const seccion = document.getElementById('newItemSeccion').value;
    const categoria = document.getElementById('newItemCategoria').value;
    const stock = parseInt(document.getElementById('newItemStock').value) || 0;
    const minimo = parseInt(document.getElementById('newItemMin').value) || 0;
    const unidad = document.getElementById('newItemUnidad').value;

    const nuevo = {
      id: 'c' + Date.now(),
      puestoId: currentBotPuesto,
      seccion, nombre, categoria, stock, minimo, unidad,
      obligatorio: false,
      normativa: 'Añadido por coordinador',
      ultimaRepo: 'nuevo',
      revisadoHoy: false,
      custom: true
    };
    PS.inventario.push(nuevo);
    document.getElementById('newItemName').value = '';
    closeAddItemModal();
    currentBotSeccion = seccion;
    renderBotiquinAdmin();
    renderAlertas();
    toast(`"${nombre}" añadido al inventario`);
  };

  /* ---------- Horas mes ---------- */
  function renderHours(mode) {
    const tbody = document.querySelector('#hoursTable tbody');
    let list = PS.socorristas.map(s => ({
      ...s,
      total: s.horasNormales + s.horasExtra,
      puesto: s.puestoId ? PS.puestoById(s.puestoId).nombre : '—'
    }));
    if (mode === 'extra') list = list.filter(s => s.horasExtra > 0).sort((a,b) => b.horasExtra - a.horasExtra);
    else if (mode === 'top') list = list.sort((a,b) => b.total - a.total).slice(0, 10);
    else list = list.slice(0, 20);

    tbody.innerHTML = list.map(s => `
      <tr>
        <td>
          <div class="hours-name">
            <div class="mini-av sky">${s.iniciales}</div>
            <span style="font-weight:500;">${s.nombre}</span>
          </div>
        </td>
        <td class="text-muted">${s.puesto}</td>
        <td class="num">${s.diasTrabajados}</td>
        <td class="num">${s.horasNormales}</td>
        <td class="num">
          <span class="hours-extras ${s.horasExtra > 0 ? '' : 'zero'}">${s.horasExtra}</span>
        </td>
        <td class="num"><span class="hours-total">${s.total}h</span></td>
      </tr>
    `).join('');
  }
  renderHours('all');
  document.getElementById('hourFilter').addEventListener('change', e => renderHours(e.target.value));

  /* ---------- Modal asignar tarea ---------- */
  const socSelect = document.getElementById('taskSocorrista');
  socSelect.innerHTML = PS.socorristas.slice(0, 30).map(s => {
    const p = s.puestoId ? PS.puestoById(s.puestoId).nombre : 'sin puesto';
    return `<option value="${s.id}">${s.nombre} — ${p}</option>`;
  }).join('');

  window.openTareaModal = function (socId) {
    if (socId) socSelect.value = socId;
    document.getElementById('tareaModal').classList.add('open');
  };
  window.closeTareaModal = () => document.getElementById('tareaModal').classList.remove('open');
  window.submitTarea = function () {
    const socId = socSelect.value;
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) { toast('Escribe un título antes de enviar'); return; }
    const soc = PS.socorristas.find(s => s.id === socId);
    closeTareaModal();
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    toast(`Enviado a ${soc.nombre}`);
  };

  /* ---------- Toast ---------- */
  const toastEl = document.getElementById('toast');
  const toastTx = document.getElementById('toastText');
  let toastT = null;
  window.toast = function (msg) {
    toastTx.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
  };

  /* ==========================================================================
     DOCUMENTACIÓN LABORAL (vista coordinador)
     ========================================================================== */

  const docsAdminList = document.getElementById('docsAdminList');
  const docsStats = document.getElementById('docsStats');
  const docsFilter = document.getElementById('docsFilter');
  let docsCurrentFilter = 'pendientes';

  function estadoDocsSocorrista(socId) {
    const firmas = PS.firmasDeSocorrista(socId);
    const kitOk = firmas['kit-alta']?.completado === true;
    const jornadasPend = PS.documentos
      .filter(d => d.grupo === 'mensual' && !d.yaFirmado && !firmas[d.id]).length;
    const total = (kitOk ? 0 : 1) + jornadasPend;
    return { kitOk, jornadasPend, total, firmas };
  }

  function renderDocsAdmin() {
    if (!docsAdminList) return;
    const rows = PS.socorristas.slice(0, 30).map(s => {
      const st = estadoDocsSocorrista(s.id);
      const puesto = s.puestoId ? PS.puestoById(s.puestoId).nombre : '—';
      return { s, st, puesto };
    });

    const alDia = rows.filter(r => r.st.total === 0).length;
    const pendTotal = rows.filter(r => r.st.total > 0).length;
    if (docsStats) docsStats.textContent = `${alDia}/${rows.length} al día · ${pendTotal} pendientes`;

    let visibles = rows;
    if (docsCurrentFilter === 'pendientes') visibles = rows.filter(r => r.st.total > 0);
    else if (docsCurrentFilter === 'firmados') visibles = rows.filter(r => r.st.total === 0);

    if (visibles.length === 0) {
      docsAdminList.innerHTML = `<div style="padding: 30px; text-align:center; color: var(--ink-500); font-size: 13.5px;">
        <svg class="ic ic-24" style="opacity:.5; margin: 0 auto 8px;"><use href="#ic-check-circle"/></svg>
        <div>${docsCurrentFilter === 'pendientes' ? '¡Todos los socorristas al día!' : 'Sin resultados'}</div>
      </div>`;
      return;
    }

    docsAdminList.innerHTML = visibles.map(({s, st, puesto}) => {
      const kitBadge = st.kitOk
        ? `<span class="badge badge-ok"><span class="dot"></span>Kit Alta ✓</span>`
        : `<span class="badge badge-danger"><span class="dot"></span>Kit Alta pendiente</span>`;
      const jornBadge = st.jornadasPend === 0
        ? `<span class="badge badge-ok"><span class="dot"></span>Jornadas al día</span>`
        : `<span class="badge badge-warn"><span class="dot"></span>${st.jornadasPend} jornada${st.jornadasPend>1?'s':''} pend.</span>`;
      return `
        <div class="doc-admin-row">
          <div class="doc-admin-main">
            <div class="mini-av sky">${s.iniciales}</div>
            <div style="min-width:0;flex:1;">
              <div class="doc-admin-name">${s.nombre}</div>
              <div class="doc-admin-sub">${puesto}</div>
            </div>
          </div>
          <div class="doc-admin-badges">
            ${kitBadge}
            ${jornBadge}
          </div>
          <div class="doc-admin-actions">
            ${!st.kitOk ? `<button class="btn btn-primary btn-sm" data-tablet-kit="${s.id}">
              <svg class="ic ic-14"><use href="#ic-pen"/></svg>
              Firmar en tablet
            </button>` : ''}
            <button class="btn btn-outline btn-sm" data-view="${s.id}">
              Ver docs
            </button>
          </div>
        </div>
      `;
    }).join('');

    docsAdminList.querySelectorAll('[data-tablet-kit]').forEach(btn => {
      btn.addEventListener('click', () => firmarKitEnTablet(btn.dataset.tabletKit));
    });
    docsAdminList.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => verDocsSocorrista(btn.dataset.view));
    });
  }

  function firmarKitEnTablet(socId) {
    const s = PS.socorristas.find(x => x.id === socId);
    if (!s) return;
    if (!confirm(`Vas a firmar el Kit Alta en nombre de ${s.nombre} desde la tablet del coordinador. El sistema registrará el origen "tablet coordinador".\n\n¿Continuar?`)) return;
    // Registro simplificado desde coordinador (todos aceptados por defecto, requiere firma escrita)
    const firma = prompt(`Escribe el nombre completo del empleado (${s.nombre}) tal como debe firmar:`);
    if (!firma) return;
    const dni = prompt('DNI del empleado:');
    if (!dni) return;
    const aceptados = {};
    PS.kitAltaSubdocs.forEach(sub => { aceptados[sub.id] = true; });
    PS.firmarDocumento(socId, 'kit-alta', {
      completado: true,
      firma, dni,
      dispositivo: 'tablet coordinador · ' + (nombre || 'coordinador'),
      aceptados
    });
    toast(`Kit Alta firmado para ${s.nombre}`);
    renderDocsAdmin();
  }

  function verDocsSocorrista(socId) {
    const s = PS.socorristas.find(x => x.id === socId);
    const firmas = PS.firmasDeSocorrista(socId);
    const kitOk = firmas['kit-alta']?.completado === true;
    const jornadasFirmadas = Object.keys(firmas).filter(k => k.startsWith('jornada-'));
    const msg = `Documentación de ${s.nombre}:
- Kit Alta: ${kitOk ? '✓ Firmado el ' + new Date(firmas['kit-alta'].fecha).toLocaleDateString('es-ES') + ' desde ' + firmas['kit-alta'].dispositivo : '✗ Pendiente'}
- Jornadas firmadas: ${jornadasFirmadas.length}
- Pendientes de firma este mes: ${estadoDocsSocorrista(socId).jornadasPend}`;
    alert(msg);
  }

  if (docsFilter) {
    docsFilter.addEventListener('change', e => {
      docsCurrentFilter = e.target.value;
      renderDocsAdmin();
    });
  }
  renderDocsAdmin();

  /* ==========================================================================
     NAVEGACIÓN POR SECCIONES DEL DASHBOARD
     ========================================================================== */

  document.querySelectorAll('.dash-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      document.querySelectorAll('.dash-menu-item').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== sec));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Actualizar badge del menú Documentación con nº pendientes
  function actualizarBadgeDocs() {
    const badge = document.getElementById('menuBadgeDocs');
    if (!badge) return;
    const pendientes = PS.socorristas.slice(0, 30).filter(s => estadoDocsSocorrista(s.id).total > 0).length;
    if (pendientes > 0) {
      badge.textContent = pendientes;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
  actualizarBadgeDocs();

  /* ==========================================================================
     SUBIR DOCUMENTO PARA UN SOCORRISTA (contrato, nómina, etc.)
     ========================================================================== */

  const docUploadSoc = document.getElementById('docUploadSoc');
  if (docUploadSoc) {
    docUploadSoc.innerHTML = PS.socorristas.slice(0, 30).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  }
  const docUploadFile = document.getElementById('docUploadFile');
  if (docUploadFile) {
    docUploadFile.addEventListener('change', e => {
      const f = e.target.files[0];
      document.getElementById('docUploadFileName').textContent = f ? f.name : 'Seleccionar archivo';
    });
  }
  window.subirDocumentoSocorrista = function () {
    const socId = document.getElementById('docUploadSoc').value;
    const tipo = document.getElementById('docUploadTipo').value;
    const file = document.getElementById('docUploadFile').files[0];
    if (!file) { toast('Selecciona un archivo primero'); return; }
    const s = PS.socorristas.find(x => x.id === socId);
    // Guardamos en localStorage la lista de docs enviados por el coordinador (mock)
    const key = 'poolsafety-docs-empresa-v1';
    const raw = localStorage.getItem(key);
    const all = raw ? JSON.parse(raw) : {};
    if (!all[socId]) all[socId] = [];
    all[socId].push({
      id: 'de-' + Date.now(),
      tipo,
      nombre: file.name,
      subidoEl: new Date().toISOString(),
      pendienteFirma: tipo === 'contrato' || tipo === 'anexo'
    });
    localStorage.setItem(key, JSON.stringify(all));
    document.getElementById('docUploadFile').value = '';
    document.getElementById('docUploadFileName').textContent = 'Seleccionar archivo';
    toast(`"${file.name}" enviado a ${s.nombre}`);
  };

  /* ==========================================================================
     HORARIOS — subida masiva PDF/Excel + asignación manual
     ========================================================================== */

  // Cargar horarios personalizados desde localStorage (persiste)
  function getHorarios() {
    const raw = localStorage.getItem('poolsafety-horarios-v1');
    return raw ? JSON.parse(raw) : {};
  }
  function saveHorarios(h) { localStorage.setItem('poolsafety-horarios-v1', JSON.stringify(h)); }

  function horarioSocorrista(socId) {
    const h = getHorarios();
    if (h[socId]) return h[socId];
    // Por defecto usar el puesto asignado en data.js
    const soc = PS.socorristas.find(s => s.id === socId);
    if (!soc || !soc.puestoId) return null;
    const p = PS.puestoById(soc.puestoId);
    return { puestoId: soc.puestoId, hora: p.hora, duracion: p.duracion, dias: 'Lun-Vie' };
  }

  // Selectores del formulario manual
  const hmSoc = document.getElementById('hmSoc');
  const hmPuesto = document.getElementById('hmPuesto');
  if (hmSoc) hmSoc.innerHTML = PS.socorristas.slice(0, 30).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  if (hmPuesto) hmPuesto.innerHTML = PS.puestos.map(p => `<option value="${p.id}">${p.nombre} — ${p.zona}</option>`).join('');

  function renderHorariosTable() {
    const tbody = document.querySelector('#horariosTable tbody');
    if (!tbody) return;
    const rows = PS.socorristas.slice(0, 30).map(s => {
      const h = horarioSocorrista(s.id);
      if (!h) return null;
      const p = PS.puestoById(h.puestoId);
      const finTurno = `${(parseInt(h.hora) + h.duracion).toString().padStart(2,'0')}:00`;
      return { s, p, hora: h.hora, fin: finTurno, dur: h.duracion, dias: h.dias };
    }).filter(Boolean);

    const stats = document.getElementById('horariosStats');
    if (stats) stats.textContent = `${rows.length} asignaciones activas`;

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><div class="hours-name"><div class="mini-av sky">${r.s.iniciales}</div><span style="font-weight:500;">${r.s.nombre}</span></div></td>
        <td class="text-muted">${r.p.nombre}<br><span class="small">${r.p.zona}</span></td>
        <td class="num"><b>${r.hora}–${r.fin}</b><br><span class="small text-muted">${r.dur}h</span></td>
        <td>${r.dias}</td>
        <td><button class="btn-icon" data-hdel="${r.s.id}" title="Quitar asignación"><svg class="ic ic-14"><use href="#ic-x"/></svg></button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-hdel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.hdel;
        const h = getHorarios();
        delete h[id];
        saveHorarios(h);
        renderHorariosTable();
        toast('Asignación eliminada');
      });
    });
  }
  renderHorariosTable();

  window.asignarHorarioManual = function () {
    const socId = document.getElementById('hmSoc').value;
    const puestoId = document.getElementById('hmPuesto').value;
    const hora = document.getElementById('hmHora').value;
    const dur = parseInt(document.getElementById('hmDur').value);
    const dias = document.getElementById('hmDias').value;
    const h = getHorarios();
    h[socId] = { puestoId, hora, duracion: dur, dias };
    saveHorarios(h);
    const s = PS.socorristas.find(x => x.id === socId);
    const p = PS.puestoById(puestoId);
    // También lo reflejamos en el modelo en memoria para que renderPosts lo use
    s.puestoId = puestoId;
    renderHorariosTable();
    renderPosts();
    toast(`Horario asignado: ${s.nombre} → ${p.nombre} ${hora}`);
  };

  /* ---------- Drag-drop upload de horario masivo (PDF/Excel/CSV) ---------- */
  const uploadDrop = document.getElementById('uploadDrop');
  const uploadInput = document.getElementById('uploadInput');
  const horarioPreview = document.getElementById('horarioPreview');

  if (uploadDrop && uploadInput) {
    uploadDrop.addEventListener('click', () => uploadInput.click());
    uploadDrop.addEventListener('dragover', e => { e.preventDefault(); uploadDrop.classList.add('dragover'); });
    uploadDrop.addEventListener('dragleave', () => uploadDrop.classList.remove('dragover'));
    uploadDrop.addEventListener('drop', e => {
      e.preventDefault();
      uploadDrop.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) procesarArchivoHorario(f);
    });
    uploadInput.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) procesarArchivoHorario(f);
    });
  }

  async function procesarArchivoHorario(file) {
    horarioPreview.style.display = 'block';
    horarioPreview.innerHTML = `
      <div class="horario-preview-box">
        <div class="horario-preview-head">
          <svg class="ic ic-22" style="color: var(--sky-500);"><use href="#ic-file-text"/></svg>
          <div>
            <div class="horario-preview-title">Procesando ${file.name}…</div>
            <div class="horario-preview-sub">Extrayendo socorristas, hoteles y turnos del archivo</div>
          </div>
        </div>
        <div class="processing-spinner"></div>
      </div>`;

    try {
      const extraidos = await parseArchivoHorarios(file);
      mostrarPreviewExtraido(file, extraidos);
    } catch (err) {
      horarioPreview.innerHTML = `<div class="horario-preview-box">
        <div class="alert-strip warn"><svg class="ic ic-16"><use href="#ic-alert"/></svg>
        <div><b>No se pudo procesar el archivo</b><br>${err.message}</div></div>
        <button class="btn btn-outline mt-3" onclick="cancelarImportHorario()">Cerrar</button>
      </div>`;
    }
  }

  async function parseArchivoHorarios(file) {
    const nombre = file.name.toLowerCase();
    let filas = [];
    if (nombre.endsWith('.csv')) {
      const text = await file.text();
      const rows = text.split(/\r?\n/).filter(r => r.trim()).map(r => r.split(/[,;\t]/));
      filas = rows;
    } else if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
      if (!window.XLSX) throw new Error('Librería XLSX no cargada');
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      filas = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    } else if (nombre.endsWith('.pdf')) {
      throw new Error('Los PDFs necesitan procesamiento manual. Sube el mismo cuadrante en Excel o CSV.');
    } else {
      throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
    }

    // Detectar columnas en las primeras filas
    let idxNombre = -1, idxHotel = -1, idxHorario = -1, idxDias = -1;
    let filaCabecera = -1;
    for (let r = 0; r < Math.min(filas.length, 5); r++) {
      const row = filas[r].map(c => String(c || '').toLowerCase());
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell.includes('nombre') || cell.includes('socorrista') || cell.includes('empleado') || cell.includes('establec')) idxNombre = c;
        if (cell.includes('hotel') || cell.includes('puesto') || cell.includes('establec') || cell.includes('lugar')) idxHotel = c;
        if (cell.includes('horario') || cell.includes('turno') || cell.includes('hora')) idxHorario = c;
        if (cell.includes('dia')) idxDias = c;
      }
      if (idxNombre >= 0 || idxHotel >= 0) { filaCabecera = r; break; }
    }
    if (filaCabecera === -1) filaCabecera = 0;

    // Fallback razonable: 1ª col = hotel, 2ª col = horario si no reconoce
    if (idxHotel === -1) idxHotel = 0;
    if (idxHorario === -1) idxHorario = 1;
    if (idxNombre === -1) idxNombre = -1; // puede no venir

    const extraidos = [];
    for (let r = filaCabecera + 1; r < filas.length; r++) {
      const row = filas[r];
      if (!row || row.every(c => !c || !String(c).trim())) continue;
      const hotelRaw = String(row[idxHotel] || '').trim();
      const horarioRaw = String(row[idxHorario] || '').trim();
      if (!hotelRaw || hotelRaw.toLowerCase().includes('semana') || hotelRaw.toLowerCase() === 'hoteles') continue;
      if (!horarioRaw) continue;

      // Match hotel con puestos existentes
      let puesto = PS.puestos.find(p => normaliza(p.nombre).includes(normaliza(hotelRaw))
        || normaliza(hotelRaw).includes(normaliza(p.nombre.split(' ')[0])));
      if (!puesto) {
        // Buscar por grupo hotel
        puesto = PS.puestos.find(p => p._raw?.grupo_hotel && normaliza(p._raw.grupo_hotel) === normaliza(hotelRaw));
      }
      if (!puesto && PS.puestos.length > 0) {
        // Si no encuentra, usar el primer puesto sin match como fallback
        continue;
      }

      // Parse horario "10:00-18:00" o "10:00 - 18:00"
      const m = horarioRaw.match(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/);
      let hIni = '10:00', hFin = '18:00', dur = 8;
      if (m) {
        hIni = m[1].replace('.', ':');
        hFin = m[2].replace('.', ':');
        dur = parseInt(hFin.split(':')[0]) - parseInt(hIni.split(':')[0]);
        if (dur <= 0) dur = 8;
      }

      // Match socorrista si viene columna nombre
      let socId = null, nombreSoc = '';
      if (idxNombre >= 0 && row[idxNombre]) {
        nombreSoc = String(row[idxNombre]).trim();
        const s = empleadosDB.find(e => normaliza(e.nombre).includes(normaliza(nombreSoc.split(' ')[0]))
          || normaliza(nombreSoc).includes(normaliza(e.nombre.split(' ')[0])));
        if (s) socId = s.id;
      }
      // Si no hay nombre, dejamos vacío (turno sin asignar)
      extraidos.push({
        socId,
        nombre: nombreSoc || '(sin asignar)',
        puestoId: puesto.id,
        puesto: puesto.nombre,
        hora: hIni,
        dur,
        dias: idxDias >= 0 ? String(row[idxDias] || 'Lun-Vie') : 'Lun-Vie'
      });
    }

    if (extraidos.length === 0) throw new Error('No se detectaron horarios válidos en el archivo. Revisa que tenga columnas de hotel y horario tipo "10:00-18:00".');
    return extraidos;
  }

  function normaliza(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function mostrarPreviewExtraido(file, extraidos) {

    horarioPreview.innerHTML = `
      <div class="horario-preview-box">
        <div class="horario-preview-head">
          <svg class="ic ic-22" style="color: #10B981;"><use href="#ic-check-circle"/></svg>
          <div style="flex:1;">
            <div class="horario-preview-title">Archivo procesado correctamente</div>
            <div class="horario-preview-sub">${file.name} · ${extraidos.length} asignaciones detectadas</div>
          </div>
          <span class="badge badge-ok"><span class="dot"></span>Listo para revisar</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="hours-table">
            <thead>
              <tr>
                <th>Socorrista detectado</th>
                <th>Hotel / puesto</th>
                <th class="num">Turno</th>
                <th class="num">Duración</th>
                <th>Días</th>
              </tr>
            </thead>
            <tbody>
              ${extraidos.slice(0, 15).map(e => `
                <tr>
                  <td><b>${e.nombre}</b></td>
                  <td>${e.puesto}</td>
                  <td class="num"><b>${e.hora}</b></td>
                  <td class="num">${e.dur} h</td>
                  <td>${e.dias}</td>
                </tr>
              `).join('')}
              ${extraidos.length > 15 ? `<tr><td colspan="5" class="text-muted" style="text-align:center; padding:12px;">…y ${extraidos.length-15} filas más</td></tr>` : ''}
            </tbody>
          </table>
        </div>
        <div class="modal-actions" style="margin-top: 14px; padding: 0;">
          <button class="btn btn-outline" onclick="cancelarImportHorario()">Descartar</button>
          <button class="btn btn-primary" onclick='aplicarImportHorario(${JSON.stringify(extraidos).replace(/'/g,"&#39;")})'>
            <svg class="ic ic-16"><use href="#ic-check"/></svg>
            Aplicar a los ${extraidos.length} socorristas
          </button>
        </div>
      </div>`;
  }

  window.cancelarImportHorario = function () {
    horarioPreview.style.display = 'none';
    horarioPreview.innerHTML = '';
    uploadInput.value = '';
    toast('Importación cancelada');
  };

  window.aplicarImportHorario = async function (rows) {
    let creados = 0, actualizados = 0, saltados = 0;
    for (const r of rows) {
      if (!r.socId) { saltados++; continue; } // sin socorrista asignado
      try {
        // Desactivar horarios activos anteriores del empleado
        await window.sb.from('horarios').update({ activo: false })
          .eq('empleado_id', r.socId).eq('activo', true);
        // Crear nuevo horario activo
        const { error } = await window.sb.from('horarios').insert({
          empleado_id: r.socId,
          puesto_id: r.puestoId,
          hora_inicio: r.hora + ':00',
          duracion: r.dur,
          dias: r.dias,
          activo: true
        });
        if (error) throw error;
        // Actualizar puesto_id en empleados (asignación actual)
        await window.sb.from('empleados').update({ puesto_id: r.puestoId }).eq('id', r.socId);
        creados++;
      } catch (err) {
        console.warn('horario:', err.message);
        saltados++;
      }
    }
    horarioPreview.style.display = 'none';
    horarioPreview.innerHTML = '';
    uploadInput.value = '';
    await cargarEmpleadosDB();
    renderHorariosTable();
    renderPosts();
    toast(`✓ ${creados} horarios aplicados${saltados ? ' · ' + saltados + ' saltados (sin match)' : ''}`);
  };

  /* ==========================================================================
     MÓDULO EMPLEADOS — CONECTADO A BD REAL (Supabase)
     ========================================================================== */

  let empleadosDB = []; // cache de la última query a Supabase

  // Convierte row de Supabase al formato que usa el resto del código
  function rowToEmp(r) {
    const nombre = r.nombre || '(sin nombre)';
    return {
      id: r.id,
      usuarioId: r.usuario_id,
      nombre,
      iniciales: nombre.split(' ').map(p => p[0]).join('').substring(0,2).toUpperCase(),
      dni: r.dni || '',
      email: r.email || '',
      telefono: r.telefono || '',
      direccion: r.direccion || '',
      ss: r.numero_ss || '',
      fechaAlta: r.fecha_alta || new Date().toISOString().slice(0,10),
      contrato: r.tipo_contrato || 'Indefinido',
      estado: r.estado || 'activo',
      fotoUrl: r.foto_url || null,
      puestoId: r.puesto_id,
      horasNormales: 0, horasExtra: 0, diasTrabajados: 0
    };
  }

  window.cargarEmpleadosDB = cargarEmpleadosDB;
  async function cargarEmpleadosDB() {
    if (!window.sb) { setTimeout(cargarEmpleadosDB, 300); return; }
    try {
      const { data, error } = await window.sb
        .from('empleados')
        .select('*')
        .neq('estado', 'eliminado')
        .order('nombre');
      if (error) throw error;
      empleadosDB = (data || []).map(rowToEmp);
      renderEmpleadosGrid();
    } catch (err) {
      console.error('[Empleados]', err);
      if (empleadosGrid) empleadosGrid.innerHTML = `<div style="grid-column:1/-1; padding:30px; text-align:center; color: var(--danger);">Error cargando empleados: ${err.message}</div>`;
    }
  }

  function empleadoData(id) {
    return empleadosDB.find(e => e.id === id) || null;
  }

  async function actualizarEmpleado(id, patch) {
    // Mapea claves del frontend a nombres de columna de BD
    const dbPatch = {};
    if ('nombre' in patch) dbPatch.nombre = patch.nombre;
    if ('dni' in patch) dbPatch.dni = patch.dni;
    if ('email' in patch) dbPatch.email = patch.email;
    if ('telefono' in patch) dbPatch.telefono = patch.telefono;
    if ('direccion' in patch) dbPatch.direccion = patch.direccion;
    if ('ss' in patch) dbPatch.numero_ss = patch.ss;
    if ('fechaAlta' in patch) dbPatch.fecha_alta = patch.fechaAlta;
    if ('contrato' in patch) dbPatch.tipo_contrato = patch.contrato;
    if ('estado' in patch) dbPatch.estado = patch.estado;
    if ('fotoUrl' in patch) dbPatch.foto_url = patch.fotoUrl;
    if ('puestoId' in patch) dbPatch.puesto_id = patch.puestoId;

    try {
      const { error } = await window.sb.from('empleados').update(dbPatch).eq('id', id);
      if (error) throw error;
      // Actualiza cache local para respuesta inmediata
      const idx = empleadosDB.findIndex(e => e.id === id);
      if (idx >= 0) empleadosDB[idx] = { ...empleadosDB[idx], ...patch };
    } catch (err) {
      toast('Error guardando: ' + err.message);
      throw err;
    }
  }

  /* ---------- Grid de empleados ---------- */
  const empleadosGrid = document.getElementById('empleadosGrid');
  const empleadoSearch = document.getElementById('empleadoSearch');
  const empleadoFilter = document.getElementById('empleadoFilter');
  let empQuery = '';
  let empFiltro = 'todos';

  function renderEmpleadosGrid() {
    if (!empleadosGrid) return;
    const empleados = empleadosDB;

    const stats = document.getElementById('empleadosStats');
    const activos = empleados.filter(e => e.estado === 'activo').length;
    const bajas = empleados.filter(e => e.estado === 'baja').length;
    const pend = empleados.filter(e => e.estado === 'alta-pendiente').length;
    if (stats) stats.textContent = `${empleados.length} totales · ${activos} activos · ${pend} pendientes · ${bajas} baja`;

    let visibles = empleados;
    if (empFiltro !== 'todos') visibles = visibles.filter(e => e.estado === empFiltro);
    if (empQuery) {
      const q = empQuery.toLowerCase();
      visibles = visibles.filter(e =>
        e.nombre.toLowerCase().includes(q) ||
        (e.dni || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.puestoId && (PS.puestos.find(p => p.id === e.puestoId)?.nombre || '').toLowerCase().includes(q))
      );
    }

    if (visibles.length === 0) {
      const empty = empleados.length === 0
        ? `<div style="grid-column:1/-1; padding: 40px; text-align:center; color: var(--ink-500);">
             <svg class="ic ic-24" style="opacity:.4; margin: 0 auto 10px;"><use href="#ic-users"/></svg>
             <div>Aún no hay empleados. Pulsa <b>"+ Nuevo empleado"</b> para dar de alta al primero.</div>
           </div>`
        : `<div style="grid-column:1/-1; padding: 40px; text-align:center; color: var(--ink-500);">Sin resultados con este filtro</div>`;
      empleadosGrid.innerHTML = empty;
      return;
    }

    empleadosGrid.innerHTML = visibles.map(e => {
      const puestoObj = e.puestoId ? PS.puestos.find(p => p.id === e.puestoId) : null;
      const puesto = puestoObj ? puestoObj.nombre : 'Sin puesto';
      const photoStyle = e.fotoUrl ? `style="background-image:url('${e.fotoUrl}');"` : '';
      const photoClass = e.fotoUrl ? 'has-photo' : '';
      const photoContent = e.fotoUrl ? '' : e.iniciales;
      const badges = [];
      if (e.estado === 'baja') badges.push(`<span class="badge badge-neutral small"><span class="dot"></span>Baja</span>`);
      else if (e.estado === 'alta-pendiente') badges.push(`<span class="badge badge-warn small"><span class="dot"></span>Alta pendiente</span>`);
      else badges.push(`<span class="badge badge-ok small"><span class="dot"></span>Activo</span>`);
      return `
        <div class="emp-card ${e.estado === 'baja' ? 'baja' : ''}" data-emp="${e.id}">
          <span class="emp-card-status ${e.estado}"></span>
          <div class="emp-card-photo ${photoClass}" ${photoStyle}>${photoContent}</div>
          <div class="emp-card-name">${e.nombre}</div>
          <div class="emp-card-role">${puesto}</div>
          <div class="emp-card-badges">${badges.join('')}</div>
        </div>`;
    }).join('');

    empleadosGrid.querySelectorAll('.emp-card').forEach(c => {
      c.addEventListener('click', () => openEmpleadoModal(c.dataset.emp));
    });
  }

  if (empleadoSearch) empleadoSearch.addEventListener('input', e => { empQuery = e.target.value; renderEmpleadosGrid(); });
  if (empleadoFilter) empleadoFilter.addEventListener('change', e => { empFiltro = e.target.value; renderEmpleadosGrid(); });

  // Cargar empleados reales de la BD al iniciar
  cargarEmpleadosDB();
  document.addEventListener('ps-session-updated', () => cargarEmpleadosDB());

  /* ---------- Modal ficha ---------- */
  let fichaActualId = null;
  let fichaTabActual = 'datos';

  window.openEmpleadoModal = function (empId) {
    fichaActualId = empId;
    fichaTabActual = 'datos';
    renderFicha();
    document.getElementById('empleadoModal').classList.add('open');
  };
  window.closeEmpleadoModal = () => document.getElementById('empleadoModal').classList.remove('open');

  document.querySelectorAll('.ficha-tab').forEach(t => {
    t.addEventListener('click', () => {
      fichaTabActual = t.dataset.ftab;
      document.querySelectorAll('.ficha-tab').forEach(x => x.classList.toggle('active', x === t));
      renderFichaBody();
    });
  });

  document.getElementById('fichaPhotoInput')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('El archivo debe ser una imagen'); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = ev => { img.src = ev.target.result; };
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const maxSize = 500;
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      try {
        toast('Subiendo foto...');
        let urlFinal = dataUrl;
        if (window.PSStorage) {
          const path = `fotos/${fichaActualId}.jpg`;
          urlFinal = await window.PSStorage.subir(path, dataUrl, 'image/jpeg');
        }
        await actualizarEmpleado(fichaActualId, { fotoUrl: urlFinal });
        renderFicha();
        renderEmpleadosGrid();
        toast('✓ Foto guardada en la nube');
      } catch (err) { toast('Error: ' + err.message); }
    };
    reader.readAsDataURL(f);
  });

  function renderFicha() {
    const e = empleadoData(fichaActualId);
    if (!e) return;
    const puesto = e.puestoId ? PS.puestoById(e.puestoId)?.nombre : 'Sin puesto';

    document.getElementById('fichaNombre').textContent = e.nombre;
    const photoEl = document.getElementById('fichaPhoto');
    if (e.fotoUrl) {
      photoEl.style.backgroundImage = `url('${e.fotoUrl}')`;
      photoEl.textContent = '';
    } else {
      photoEl.style.backgroundImage = '';
      photoEl.textContent = e.iniciales;
    }

    const estBadge = document.getElementById('fichaEstadoBadge');
    if (e.estado === 'activo') estBadge.className = 'badge badge-ok', estBadge.innerHTML = '<span class="dot"></span>Activo';
    else if (e.estado === 'baja') estBadge.className = 'badge badge-neutral', estBadge.innerHTML = '<span class="dot"></span>Baja';
    else estBadge.className = 'badge badge-warn', estBadge.innerHTML = '<span class="dot"></span>Alta pendiente';

    document.getElementById('fichaSubinfo').textContent = `${puesto} · Alta el ${new Date(e.fechaAlta).toLocaleDateString('es-ES')}`;

    // Reset tabs to datos on open
    document.querySelectorAll('.ficha-tab').forEach(t => t.classList.toggle('active', t.dataset.ftab === fichaTabActual));
    renderFichaBody();
  }

  function renderFichaBody() {
    const e = empleadoData(fichaActualId);
    const body = document.getElementById('fichaBody');
    if (!body || !e) return;

    if (fichaTabActual === 'datos') {
      body.innerHTML = `
        <div class="ficha-body-title">Datos personales</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Nombre completo</div>
          <div class="ficha-data-value"><input type="text" id="ed-nombre" value="${e.nombre}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">DNI</div>
          <div class="ficha-data-value"><input type="text" id="ed-dni" value="${e.dni}" placeholder="00000000A" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Email</div>
          <div class="ficha-data-value"><input type="email" id="ed-email" value="${e.email}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Teléfono</div>
          <div class="ficha-data-value"><input type="tel" id="ed-tel" value="${e.telefono}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Dirección</div>
          <div class="ficha-data-value"><input type="text" id="ed-dir" value="${e.direccion}" placeholder="Calle, número, CP, ciudad" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Nº Seg. Social</div>
          <div class="ficha-data-value"><input type="text" id="ed-ss" value="${e.ss}" /></div>
        </div>

        <div class="ficha-body-title">Datos laborales</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Fecha de alta</div>
          <div class="ficha-data-value"><input type="date" id="ed-fecha" value="${e.fechaAlta}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Tipo de contrato</div>
          <div class="ficha-data-value">
            <select id="ed-contrato">
              ${['Indefinido','Fijo discontinuo','Temporal 6 meses','Prácticas'].map(t => `<option ${e.contrato===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row gap-2 mt-3">
          <button class="btn btn-outline" onclick="closeEmpleadoModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarFichaDatos()">
            <svg class="ic ic-16"><use href="#ic-check"/></svg>
            Guardar cambios
          </button>
        </div>`;
    }
    else if (fichaTabActual === 'horario') {
      body.innerHTML = `
        <div class="ficha-body-title">Resumen del mes</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Horas del mes</div>
          <div class="ficha-data-value">${e.horasNormales}h ordinarias · ${e.diasTrabajados} días</div>
        </div>
        <div id="empleadoHorariosBlock"></div>`;
      if (window.PSHor) {
        // fichaActualId es el empleado_id real de BD
        window.PSHor.renderEmpleadoBlock(document.getElementById('empleadoHorariosBlock'), fichaActualId);
      }
    }
    else if (fichaTabActual === 'docs') {
      body.innerHTML = `<div class="text-muted" style="padding:20px;text-align:center;">Cargando firmas…</div>`;
      // Cargar firmas reales de la BD
      (async () => {
        let firmasBD = [];
        try {
          const { data } = await window.sb.from('firmas_documentos')
            .select('*')
            .eq('empleado_id', fichaActualId)
            .order('fecha_firma', { ascending: false });
          firmasBD = data || [];
        } catch (err) { console.warn('firmas:', err.message); }

        const kitFirma = firmasBD.find(f => f.documento_codigo === 'kit-alta');
        const jornadas = firmasBD.filter(f => f.documento_codigo.startsWith('jornada'));

        body.innerHTML = `
        <div class="ficha-action-row ${kitFirma ? 'ok' : 'warn'}" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-shield"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Kit Alta Empresa</div>
              <div class="ficha-action-sub">${kitFirma ? 'Firmado el ' + new Date(kitFirma.fecha_firma).toLocaleString('es-ES') + '<br>Desde: ' + (kitFirma.dispositivo || 'móvil') : 'Pendiente de firma'}</div>
              ${kitFirma?.firma_imagen ? `<img src="${kitFirma.firma_imagen}" class="firma-imagen" style="max-width:220px;margin-top:8px;" alt="Firma"/>` : ''}
              ${kitFirma?.ubicacion_lat ? `<div class="small text-muted mt-1">📍 <a href="https://www.google.com/maps?q=${kitFirma.ubicacion_lat},${kitFirma.ubicacion_lng}" target="_blank">${(+kitFirma.ubicacion_lat).toFixed(4)}, ${(+kitFirma.ubicacion_lng).toFixed(4)}</a></div>` : ''}
            </div>
            ${!kitFirma ? `<button class="btn btn-primary btn-sm" onclick="firmarKitEnTablet('${e.id}')">Firmar en tablet</button>` : ''}
          </div>
          ${kitFirma ? `
            <div class="row gap-2 mt-3" style="justify-content:flex-end;">
              <button class="btn btn-primary btn-sm" onclick="descargarPdfFirma('${kitFirma.id}','kit-alta')">
                <svg class="ic ic-16"><use href="#ic-download"/></svg>
                Descargar PDF
              </button>
              ${kitFirma.archivo_pdf_url ? `<a class="btn btn-outline btn-sm" href="${kitFirma.archivo_pdf_url}" target="_blank">📎 Ver PDF guardado</a>` : ''}
            </div>` : ''}
        </div>
        ${jornadas.map(j => `
          <div class="ficha-action-row ok" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <div class="icon"><svg class="ic ic-18"><use href="#ic-clock"/></svg></div>
              <div class="ficha-action-body">
                <div class="ficha-action-title">${j.documento_codigo}</div>
                <div class="ficha-action-sub">Firmado el ${new Date(j.fecha_firma).toLocaleString('es-ES')}</div>
                ${j.firma_imagen ? `<img src="${j.firma_imagen}" class="firma-imagen" style="max-width:180px;margin-top:8px;" alt="Firma"/>` : ''}
              </div>
            </div>
            <div class="row gap-2 mt-3" style="justify-content:flex-end;">
              <button class="btn btn-primary btn-sm" onclick="descargarPdfFirma('${j.id}','jornada')">
                <svg class="ic ic-16"><use href="#ic-download"/></svg>
                Descargar PDF
              </button>
            </div>
          </div>
        `).join('')}
        ${jornadas.length === 0 ? `
          <div class="ficha-action-row warn">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-clock"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Registro mensual de jornada</div>
              <div class="ficha-action-sub">Sin firmas mensuales aún. Se firma el último día trabajado del mes.</div>
            </div>
          </div>` : ''}
        `;
      })();
    }
    else if (fichaTabActual === 'titulaciones') {
      body.innerHTML = `
        <div class="section-eyebrow" style="margin-top:0;">
          <span class="eyebrow">Titulaciones, DNI, PRL y contrato</span>
          <button class="btn btn-primary btn-sm" onclick="openTitulacionCoord()">
            <svg class="ic ic-14"><use href="#ic-plus"/></svg>
            Añadir documento
          </button>
        </div>
        <div id="titsCoordList"><div class="tit-empty">Cargando…</div></div>`;
      (async () => {
        const items = await window.PSTit.cargar(fichaActualId);
        const el = document.getElementById('titsCoordList');
        if (!el) return;
        el.innerHTML = window.PSTit.renderLista(items, { canEdit: true });
        el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
          const t = items.find(x => x.id === b.dataset.editar);
          openTitulacionCoord(t);
        }));
        el.querySelectorAll('[data-eliminar]').forEach(b => b.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este documento?')) return;
          try {
            await window.PSTit.eliminar(b.dataset.eliminar);
            toast('Eliminado');
            renderFichaBody();
          } catch (err) { toast('Error: ' + err.message); }
        }));
      })();
    }
    else if (fichaTabActual === 'tareas') {
      body.innerHTML = `
        <div class="ficha-body-title">Enviar tarea o nota a ${e.nombre.split(' ')[0]}</div>
        <div class="field">
          <label>Tipo</label>
          <select id="ft-tipo">
            <option value="tarea">Tarea con checkbox</option>
            <option value="nota">Nota informativa</option>
          </select>
        </div>
        <div class="field">
          <label>Título / mensaje</label>
          <input type="text" id="ft-titulo" placeholder="p.ej. Revisar cloración a las 12:00" />
        </div>
        <div class="field">
          <label>Detalles (opcional)</label>
          <textarea id="ft-desc" placeholder="Instrucciones específicas…"></textarea>
        </div>
        <div class="field">
          <label>Prioridad</label>
          <select id="ft-prior">
            <option value="baja">Baja</option>
            <option value="media" selected>Media</option>
            <option value="alta">Alta</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="enviarTareaFicha()">
          <svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg>
          Enviar
        </button>`;
    }
    else if (fichaTabActual === 'acciones') {
      body.innerHTML = `
        ${e.estado === 'activo' ? `
          <div class="ficha-action-row warn">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-alert"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Dar de baja</div>
              <div class="ficha-action-sub">El empleado verá el finiquito para firmar. No podrá seguir fichando.</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="darDeBaja()">Dar de baja</button>
          </div>` : `
          <div class="ficha-action-row ok">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-check-circle"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Reactivar empleado</div>
              <div class="ficha-action-sub">Volver a poner en activo y permitir fichaje.</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="darDeAlta()">Reactivar</button>
          </div>`}

        <div class="ficha-action-row">
          <div class="icon" style="background: var(--info-bg); color: var(--sky-700);"><svg class="ic ic-18"><use href="#ic-shield"/></svg></div>
          <div class="ficha-action-body">
            <div class="ficha-action-title">Enviar email de recuperación de contraseña</div>
            <div class="ficha-action-sub">${e.email ? 'Se enviará un enlace a <b>' + e.email + '</b> para que ponga una contraseña nueva.' : 'Este empleado no tiene email en la ficha.'}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="enviarResetPassword()" ${!e.email ? 'disabled' : ''}>Enviar</button>
        </div>

        <div class="ficha-action-row warn">
          <div class="icon"><svg class="ic ic-18"><use href="#ic-clock"/></svg></div>
          <div class="ficha-action-body">
            <div class="ficha-action-title">Cancelar el próximo turno</div>
            <div class="ficha-action-sub">Se le notifica al momento y queda registrado como cancelado por coordinador.</div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="cancelarProximoTurno()">Cancelar turno</button>
        </div>

        <div class="ficha-action-row danger">
          <div class="icon"><svg class="ic ic-18"><use href="#ic-x"/></svg></div>
          <div class="ficha-action-body">
            <div class="ficha-action-title">Eliminar ficha por completo</div>
            <div class="ficha-action-sub">Borra todos los datos del empleado del sistema. Acción irreversible.</div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="eliminarEmpleado()" style="color: var(--danger); border-color: var(--danger);">Eliminar</button>
        </div>`;
    }
  }

  window.enviarResetPassword = async function () {
    const e = empleadoData(fichaActualId);
    if (!e || !e.email) { toast('Este empleado no tiene email'); return; }
    if (!confirm(`Enviar email de recuperación de contraseña a ${e.nombre} (${e.email})?`)) return;
    try {
      const { error } = await window.sb.auth.resetPasswordForEmail(e.email, {
        redirectTo: window.location.origin + '/reset.html'
      });
      if (error) throw error;
      toast(`✓ Enlace enviado a ${e.email}. El empleado tiene 1 hora para usarlo.`);
    } catch (err) {
      toast('Error: ' + err.message);
    }
  };

  window.guardarFichaDatos = async function () {
    const patch = {
      nombre: document.getElementById('ed-nombre').value.trim(),
      dni: document.getElementById('ed-dni').value.trim(),
      email: document.getElementById('ed-email').value.trim(),
      telefono: document.getElementById('ed-tel').value.trim(),
      direccion: document.getElementById('ed-dir').value.trim(),
      ss: document.getElementById('ed-ss').value.trim(),
      fechaAlta: document.getElementById('ed-fecha').value,
      contrato: document.getElementById('ed-contrato').value
    };
    try {
      await actualizarEmpleado(fichaActualId, patch);
      renderFicha();
      renderEmpleadosGrid();
      toast('Ficha actualizada en la BD');
    } catch (err) { /* toast ya mostrado */ }
  };

  window.enviarTareaFicha = function () {
    const titulo = document.getElementById('ft-titulo').value.trim();
    if (!titulo) { toast('Escribe un título'); return; }
    const e = empleadoData(fichaActualId);
    toast(`Enviado a ${e.nombre}`);
    document.getElementById('ft-titulo').value = '';
    document.getElementById('ft-desc').value = '';
  };

  window.darDeBaja = async function () {
    const e = empleadoData(fichaActualId);
    if (!confirm(`¿Dar de baja a ${e.nombre}?\n\nLe aparecerá el finiquito para firmar.`)) return;
    try {
      await actualizarEmpleado(fichaActualId, { estado: 'baja' });
      // También seteamos la fecha de baja
      await window.sb.from('empleados').update({ fecha_baja: new Date().toISOString().slice(0,10) }).eq('id', fichaActualId);
      await cargarEmpleadosDB();
      renderFicha();
      toast(`${e.nombre} dado de baja`);
    } catch (err) { /* toast ya mostrado */ }
  };

  window.darDeAlta = async function () {
    const e = empleadoData(fichaActualId);
    if (!confirm(`¿Reactivar a ${e.nombre}?`)) return;
    try {
      await actualizarEmpleado(fichaActualId, { estado: 'activo' });
      await window.sb.from('empleados').update({ fecha_baja: null }).eq('id', fichaActualId);
      await cargarEmpleadosDB();
      renderFicha();
      toast(`${e.nombre} reactivado`);
    } catch (err) { /* toast ya mostrado */ }
  };

  window.cancelarProximoTurno = function () {
    const e = empleadoData(fichaActualId);
    toast(`Próximo turno de ${e.nombre} cancelado. Notificado.`);
  };

  window.eliminarEmpleado = async function () {
    const e = empleadoData(fichaActualId);
    if (!confirm(`⚠️ ELIMINAR FICHA de ${e.nombre}\n\nEsto borrará su ficha del sistema (la cuenta de acceso hay que borrarla desde Supabase Auth). Acción irreversible.\n\n¿Continuar?`)) return;
    const nombre2 = prompt('Escribe el nombre completo para confirmar:');
    if (nombre2 !== e.nombre) { toast('Nombre no coincide. Cancelado.'); return; }
    try {
      // Soft delete: marca como eliminado, no borra la fila (para conservar histórico)
      await actualizarEmpleado(fichaActualId, { estado: 'eliminado' });
      closeEmpleadoModal();
      await cargarEmpleadosDB();
      toast(`Ficha de ${e.nombre} eliminada`);
    } catch (err) { /* toast ya mostrado */ }
  };

  /* ---------- Nuevo usuario (empleado / coordinador / admin) — REAL en Supabase ---------- */
  const nePuestoSel = document.getElementById('nePuesto');
  if (nePuestoSel) {
    nePuestoSel.innerHTML = '<option value="">Sin asignar de momento</option>' +
      PS.puestos.map(p => `<option value="${p.id}">${p.nombre}${p.zona ? ' — ' + p.zona : ''}</option>`).join('');
  }

  window.openNuevoEmpleadoModal = function () {
    const psSes = window.PS_SESSION || {};
    const esAdmin = psSes.rol === 'dueno';

    // Rol selector solo visible para admin
    document.getElementById('neRolWrap').style.display = esAdmin ? 'block' : 'none';
    document.getElementById('neRol').value = 'socorrista';
    document.getElementById('nuevoUsuarioTitulo').textContent = esAdmin
      ? 'Nuevo usuario'
      : 'Nuevo socorrista';

    document.getElementById('neFechaAlta').value = new Date().toISOString().slice(0,10);
    document.getElementById('neResultado').style.display = 'none';
    document.getElementById('neResultado').innerHTML = '';
    document.getElementById('neSubmitBtn').disabled = false;

    ajustarCamposSegunRol();
    document.getElementById('nuevoEmpleadoModal').classList.add('open');
  };

  document.getElementById('neRol')?.addEventListener('change', ajustarCamposSegunRol);

  function ajustarCamposSegunRol() {
    const rol = document.getElementById('neRol').value;
    const camposSoc = document.getElementById('neCamposSocorrista');
    if (camposSoc) camposSoc.style.display = rol === 'socorrista' ? 'block' : 'none';
  }

  window.closeNuevoEmpleadoModal = () => document.getElementById('nuevoEmpleadoModal').classList.remove('open');

  window.generarPasswordNueva = function () {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 12; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
    // Fuerza mayúscula, minúscula y número
    p = 'Ps' + p + '2!';
    document.getElementById('nePassword').value = p;
  };

  window.crearNuevoEmpleado = async function () {
    const psSes = window.PS_SESSION || {};
    const esAdmin = psSes.rol === 'dueno';
    const rol = esAdmin ? document.getElementById('neRol').value : 'socorrista';

    const nombre = document.getElementById('neNombre').value.trim();
    const email = document.getElementById('neEmail').value.trim().toLowerCase();
    const password = document.getElementById('nePassword').value;
    const dni = document.getElementById('neDni').value.trim();
    const telefono = document.getElementById('neTelefono').value.trim();

    if (!nombre || !email || !password) { toast('Nombre, email y contraseña son obligatorios'); return; }
    if (password.length < 8) { toast('La contraseña debe tener al menos 8 caracteres'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { toast('Email no válido'); return; }

    const btn = document.getElementById('neSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Creando cuenta…';

    // Cliente Supabase SEPARADO para no perder la sesión del admin
    const tmpClient = window.supabase.createClient(
      'https://msdjsbegqpjpshnxoilh.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZGpzYmVncXBqcHNobnhvaWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjQ5NDgsImV4cCI6MjEwMDc0MDk0OH0.Ws2Fq3chqf7jgJUFQcXlAKEr63z1HkJgs08e4GrxqdI',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );

    try {
      // 1. Crear cuenta auth
      const { data: signUpData, error: signUpErr } = await tmpClient.auth.signUp({
        email, password,
        options: { data: { rol, nombre } }
      });
      if (signUpErr) throw signUpErr;
      if (!signUpData.user) throw new Error('No se recibió el user tras signup — comprueba que la confirmación de email está desactivada en Supabase.');

      const nuevoId = signUpData.user.id;

      // 2. Insertar en usuarios con el rol correcto (usa nuestra sesión admin)
      const { error: usrErr } = await window.sb.from('usuarios').insert({
        id: nuevoId,
        empresa_id: psSes.empresa_id,
        rol,
        email,
        nombre,
        activo: true
      });
      if (usrErr) throw usrErr;

      // 3. Si es socorrista, crear también la ficha empleado
      if (rol === 'socorrista') {
        const puestoId = document.getElementById('nePuesto').value || null;
        const fechaAlta = document.getElementById('neFechaAlta').value || new Date().toISOString().slice(0,10);
        const contrato = document.getElementById('neContrato').value;
        const { error: empErr } = await window.sb.from('empleados').insert({
          usuario_id: nuevoId,
          empresa_id: psSes.empresa_id,
          nombre, dni, email, telefono,
          puesto_id: puestoId,
          fecha_alta: fechaAlta,
          tipo_contrato: contrato,
          estado: 'alta-pendiente'
        });
        if (empErr) console.warn('No se pudo crear ficha empleado:', empErr.message);
      }

      // 4. Mostrar resultado con las credenciales
      const rolLabel = rol === 'dueno' ? 'Administrador' : (rol === 'coordinador' ? 'Coordinador' : 'Socorrista');
      const resultado = document.getElementById('neResultado');
      resultado.innerHTML = `
        <div class="alert-strip ok" style="flex-direction:column; align-items:flex-start;">
          <div style="display:flex;gap:8px;align-items:center;"><svg class="ic ic-16"><use href="#ic-check-circle"/></svg><b>${nombre} creado como ${rolLabel}</b></div>
          <div class="small" style="margin-top:8px;">Dictale estas credenciales para que entre en <b>${window.location.origin}</b>:</div>
          <div style="margin-top:8px;padding:10px 12px;background:#fff;border:1px dashed var(--ink-300);border-radius:8px;font-family:monospace;font-size:13px;width:100%;box-sizing:border-box;">
            <div><b>Email:</b> ${email}</div>
            <div style="margin-top:4px;"><b>Contraseña:</b> ${password}</div>
          </div>
          <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="navigator.clipboard.writeText('Email: ${email}\\nContraseña: ${password}\\nURL: ${window.location.origin}');toast('Copiado')">
            <svg class="ic ic-14"><use href="#ic-download"/></svg> Copiar credenciales
          </button>
        </div>`;
      resultado.style.display = 'block';

      // Reset campos
      ['neNombre','neDni','neEmail','neTelefono','nePassword'].forEach(id => document.getElementById(id).value = '');

      // Refrescar la lista desde BD
      if (rol === 'socorrista') await cargarEmpleadosDB();

      toast(`✓ Cuenta creada: ${email}`);
    } catch (err) {
      let msg = err.message || 'Error desconocido';
      if (msg.includes('already registered')) msg = 'Ese email ya está registrado.';
      if (msg.includes('confirm')) msg = 'Desactiva "Confirm email" en Supabase → Auth → Providers → Email.';
      toast('Error: ' + msg);
      console.error('[crearNuevoEmpleado]', err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-plus"/></svg> Crear cuenta';
    }
  };

  /* ==========================================================================
     MÓDULO HOTELES — conectado a la BD real (Supabase)
     ========================================================================== */

  const hotelesGrid = document.getElementById('hotelesGrid');
  const hotelSearch = document.getElementById('hotelSearch');
  const hotelGrupoFilter = document.getElementById('hotelGrupoFilter');
  let hotelesCache = [];
  let hotelQuery = '';
  let hotelGrupoSel = 'todos';

  async function cargarHoteles() {
    if (!window.sb) { setTimeout(cargarHoteles, 200); return; }
    try {
      const { data, error } = await window.sb
        .from('puestos')
        .select('*')
        .order('grupo_hotel', { ascending: true })
        .order('nombre', { ascending: true });
      if (error) throw error;
      hotelesCache = data || [];

      // También actualiza PS.puestos para que otros módulos (botiquín, horarios) vean lo real
      PS.puestos.length = 0;
      hotelesCache.forEach(p => {
        const hIni = (p.hora_inicio_default || '10:00:00').slice(0,5);
        const hFin = (p.hora_fin_default || '18:00:00').slice(0,5);
        const dur = parseInt(hFin.slice(0,2)) - parseInt(hIni.slice(0,2));
        PS.puestos.push({
          id: p.id,
          nombre: p.nombre,
          zona: p.zona,
          hora: hIni,
          duracion: dur > 0 ? dur : 8,
          _raw: p
        });
      });

      renderGruposFilter();
      renderHotelesGrid();

      // Refresca botiquín admin si estaba renderizado
      if (typeof renderBotiquinAdmin === 'function') {
        try {
          if (botiquinPuestoSelect) {
            botiquinPuestoSelect.innerHTML = PS.puestos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
            currentBotPuesto = PS.puestos[0]?.id || currentBotPuesto;
            botiquinPuestoSelect.value = currentBotPuesto;
          }
          renderBotiquinAdmin();
        } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('[Hoteles]', err);
      if (hotelesGrid) hotelesGrid.innerHTML = `<div style="grid-column:1/-1; padding: 30px; text-align:center; color: var(--danger);">
        Error al cargar hoteles: ${err.message}
      </div>`;
    }
  }

  function renderGruposFilter() {
    if (!hotelGrupoFilter) return;
    const grupos = [...new Set(hotelesCache.map(h => h.grupo_hotel).filter(Boolean))].sort();
    const actual = hotelGrupoFilter.value;
    hotelGrupoFilter.innerHTML = '<option value="todos">Todos los grupos</option>' +
      grupos.map(g => `<option value="${g}">${g}</option>`).join('');
    if (grupos.includes(actual)) hotelGrupoFilter.value = actual;
  }

  function renderHotelesGrid() {
    if (!hotelesGrid) return;

    const total = hotelesCache.length;
    const serviciosTotal = hotelesCache.reduce((sum, h) => sum + (h.servicios_necesarios || 0), 0);
    const stats = document.getElementById('hotelesStats');
    if (stats) stats.textContent = `${total} hoteles · ${serviciosTotal} servicios/día`;

    let visibles = hotelesCache;
    if (hotelGrupoSel !== 'todos') visibles = visibles.filter(h => h.grupo_hotel === hotelGrupoSel);
    if (hotelQuery) {
      const q = hotelQuery.toLowerCase();
      visibles = visibles.filter(h =>
        (h.nombre || '').toLowerCase().includes(q) ||
        (h.zona || '').toLowerCase().includes(q) ||
        (h.direccion || '').toLowerCase().includes(q) ||
        (h.grupo_hotel || '').toLowerCase().includes(q)
      );
    }

    if (visibles.length === 0) {
      hotelesGrid.innerHTML = `<div style="grid-column:1/-1; padding: 40px; text-align:center; color: var(--ink-500);">Sin resultados</div>`;
      return;
    }

    hotelesGrid.innerHTML = visibles.map(h => {
      const hIni = (h.hora_inicio_default || '').slice(0,5);
      const hFin = (h.hora_fin_default || '').slice(0,5);
      const horario = hIni && hFin ? `${hIni}–${hFin}` : (hIni || '');
      const eqs = [];
      eqs.push(`<span class="hotel-eq-badge ${h.tiene_botiquin?'on bot':''}" title="Botiquín">🩹 Botiquín</span>`);
      eqs.push(`<span class="hotel-eq-badge ${h.tiene_desa?'on desa':''}" title="DESA">⚡ DESA</span>`);
      eqs.push(`<span class="hotel-eq-badge ${h.tiene_oxigeno?'on oxi':''}" title="Oxigenoterapia">💨 O₂</span>`);
      return `
        <div class="hotel-card" data-hotel="${h.id}">
          <div class="hotel-card-icon"><svg class="ic ic-22"><use href="#ic-pin"/></svg></div>
          <div class="hotel-card-body">
            <div class="hotel-card-name">${h.nombre}</div>
            <div class="hotel-card-loc">
              <svg class="ic ic-14"><use href="#ic-pin"/></svg>
              ${h.zona || 'Sin zona'}${h.grupo_hotel ? ' · ' + h.grupo_hotel : ''}
            </div>
            <div class="hotel-card-meta">
              ${horario ? `<span class="badge badge-neutral small"><svg class="ic ic-14"><use href="#ic-clock"/></svg>${horario}</span>` : ''}
              <span class="badge badge-info small"><svg class="ic ic-14"><use href="#ic-users"/></svg>${h.servicios_necesarios || 1} socorristas</span>
            </div>
            <div class="hotel-card-eq">${eqs.join('')}</div>
          </div>
        </div>`;
    }).join('');

    hotelesGrid.querySelectorAll('.hotel-card').forEach(c => {
      c.addEventListener('click', () => openHotelModal(c.dataset.hotel));
    });
  }

  if (hotelSearch) hotelSearch.addEventListener('input', e => { hotelQuery = e.target.value; renderHotelesGrid(); });
  if (hotelGrupoFilter) hotelGrupoFilter.addEventListener('change', e => { hotelGrupoSel = e.target.value; renderHotelesGrid(); });

  /* ---------- Modal ficha hotel ---------- */
  let hotelActualId = null;
  let hotelTabActual = 'datos';

  window.openHotelModal = function (hotelId) {
    hotelActualId = hotelId;
    hotelTabActual = 'datos';
    document.querySelectorAll('.ficha-tab[data-htab]').forEach(t => t.classList.toggle('active', t.dataset.htab === 'datos'));
    renderHotelFicha();
    document.getElementById('hotelModal').classList.add('open');
  };
  window.closeHotelModal = () => document.getElementById('hotelModal').classList.remove('open');

  document.querySelectorAll('.ficha-tab[data-htab]').forEach(t => {
    t.addEventListener('click', () => {
      hotelTabActual = t.dataset.htab;
      document.querySelectorAll('.ficha-tab[data-htab]').forEach(x => x.classList.toggle('active', x === t));
      renderHotelBody();
    });
  });

  function renderHotelFicha() {
    const h = hotelesCache.find(x => x.id === hotelActualId);
    if (!h) return;
    document.getElementById('hotelNombre').textContent = h.nombre;
    document.getElementById('hotelGrupoBadge').innerHTML = h.grupo_hotel ? `<span class="dot"></span>${h.grupo_hotel}` : '';
    const hIni = (h.hora_inicio_default || '').slice(0,5);
    const hFin = (h.hora_fin_default || '').slice(0,5);
    document.getElementById('hotelSubinfo').textContent = `${h.zona || ''} · ${hIni}–${hFin} · ${h.servicios_necesarios || 1} socorristas`;
    renderHotelBody();
  }

  function renderHotelBody() {
    const h = hotelesCache.find(x => x.id === hotelActualId);
    const body = document.getElementById('hotelBody');
    if (!h || !body) return;

    if (hotelTabActual === 'datos') {
      const mapsUrl = h.gps_lat && h.gps_lng
        ? `https://www.google.com/maps?q=${h.gps_lat},${h.gps_lng}`
        : null;
      body.innerHTML = `
        <div class="ficha-body-title">Identificación</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Nombre</div>
          <div class="ficha-data-value"><input type="text" id="hd-nombre" value="${h.nombre || ''}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Grupo hotelero</div>
          <div class="ficha-data-value"><input type="text" id="hd-grupo" value="${h.grupo_hotel || ''}" placeholder="INTUROTEL / GAVIMAR / ONA / ..." /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Zona</div>
          <div class="ficha-data-value"><input type="text" id="hd-zona" value="${h.zona || ''}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Dirección</div>
          <div class="ficha-data-value"><input type="text" id="hd-dir" value="${h.direccion || ''}" /></div>
        </div>

        <div class="ficha-body-title">Geolocalización</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Latitud</div>
          <div class="ficha-data-value"><input type="number" step="0.000001" id="hd-lat" value="${h.gps_lat || ''}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Longitud</div>
          <div class="ficha-data-value"><input type="number" step="0.000001" id="hd-lng" value="${h.gps_lng || ''}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Radio (m)</div>
          <div class="ficha-data-value"><input type="number" id="hd-radio" value="${h.gps_radio_m || 50}" /></div>
        </div>
        ${mapsUrl ? `<a class="btn btn-outline" href="${mapsUrl}" target="_blank" style="margin-top:10px;">
          <svg class="ic ic-16"><use href="#ic-pin"/></svg> Ver en Google Maps
        </a>` : ''}

        <div class="ficha-body-title">Contacto</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Contacto hotel</div>
          <div class="ficha-data-value"><input type="text" id="hd-contnombre" value="${h.contacto_hotel_nombre || ''}" placeholder="Nombre" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Teléfono hotel</div>
          <div class="ficha-data-value"><input type="tel" id="hd-conttel" value="${h.contacto_hotel_tel || ''}" placeholder="+34 971 000 000" /></div>
        </div>

        <div class="row gap-2 mt-3">
          <button class="btn btn-outline" onclick="closeHotelModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarHotelDatos()">
            <svg class="ic ic-16"><use href="#ic-check"/></svg>
            Guardar cambios
          </button>
        </div>`;
    }
    else if (hotelTabActual === 'horario') {
      const hIni = (h.hora_inicio_default || '10:00:00').slice(0,5);
      const hFin = (h.hora_fin_default || '18:00:00').slice(0,5);
      body.innerHTML = `
        <div class="ficha-body-title">Horario de apertura</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Hora apertura</div>
          <div class="ficha-data-value"><input type="time" id="hh-ini" value="${hIni}" /></div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Hora cierre</div>
          <div class="ficha-data-value"><input type="time" id="hh-fin" value="${hFin}" /></div>
        </div>
        <div class="row gap-2 mt-3">
          <button class="btn btn-outline" onclick="closeHotelModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarHotelHorario()">
            <svg class="ic ic-16"><use href="#ic-check"/></svg>
            Guardar horario
          </button>
        </div>`;
    }
    else if (hotelTabActual === 'servicios') {
      body.innerHTML = `
        <div class="ficha-body-title">Nº de servicios (socorristas) necesarios por día</div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Socorristas</div>
          <div class="ficha-data-value"><input type="number" id="hs-serv" min="1" value="${h.servicios_necesarios || 1}" /></div>
        </div>
        <div class="ficha-body-title">Notas para el coordinador</div>
        <div class="field">
          <textarea id="hs-notas" placeholder="Instrucciones especiales del hotel, horarios especiales, etc.">${h.notas || ''}</textarea>
        </div>
        <div class="row gap-2 mt-3">
          <button class="btn btn-outline" onclick="closeHotelModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarHotelServicios()">
            <svg class="ic ic-16"><use href="#ic-check"/></svg>
            Guardar
          </button>
        </div>
        <div id="hotelHorariosBlock"></div>`;
      if (window.PSHor) {
        window.PSHor.renderPuestoBlock(document.getElementById('hotelHorariosBlock'), hotelActualId);
      }
    }
    else if (hotelTabActual === 'equipamiento') {
      body.innerHTML = `
        <div class="eq-toggle-row ${h.tiene_botiquin ? 'on' : ''}">
          <div class="icon botiquin"><svg class="ic ic-18"><use href="#ic-medkit"/></svg></div>
          <div class="eq-toggle-body">
            <div class="eq-toggle-title">Botiquín</div>
            <div class="eq-toggle-sub">Contenido según Decreto 53/1995. 23 items en total.</div>
          </div>
          <label style="display:flex; gap:6px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="he-botiquin" ${h.tiene_botiquin ? 'checked' : ''} />
            <span>${h.tiene_botiquin ? 'Sí' : 'No'}</span>
          </label>
        </div>
        <div class="eq-toggle-row ${h.tiene_desa ? 'on' : ''}">
          <div class="icon desa"><svg class="ic ic-18"><use href="#ic-heart-pulse"/></svg></div>
          <div class="eq-toggle-body">
            <div class="eq-toggle-title">DESA (Desfibrilador)</div>
            <div class="eq-toggle-sub">Obligatorio en Baleares por Decreto 137/2008. Revisión mensual.</div>
          </div>
          <label style="display:flex; gap:6px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="he-desa" ${h.tiene_desa ? 'checked' : ''} />
            <span>${h.tiene_desa ? 'Sí' : 'No'}</span>
          </label>
        </div>
        <div class="eq-toggle-row ${h.tiene_oxigeno ? 'on' : ''}">
          <div class="icon oxi"><svg class="ic ic-18"><use href="#ic-droplet"/></svg></div>
          <div class="eq-toggle-body">
            <div class="eq-toggle-title">Oxigenoterapia</div>
            <div class="eq-toggle-sub">Bala, ambú, mascarillas. Comprobar antes del turno.</div>
          </div>
          <label style="display:flex; gap:6px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="he-oxigeno" ${h.tiene_oxigeno ? 'checked' : ''} />
            <span>${h.tiene_oxigeno ? 'Sí' : 'No'}</span>
          </label>
        </div>
        <div class="row gap-2 mt-3">
          <button class="btn btn-outline" onclick="closeHotelModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarHotelEquipamiento()">
            <svg class="ic ic-16"><use href="#ic-check"/></svg>
            Guardar equipamiento
          </button>
        </div>`;
    }
    else if (hotelTabActual === 'acciones') {
      body.innerHTML = `
        <div class="ficha-action-row ${h.activo ? 'warn' : 'ok'}">
          <div class="icon"><svg class="ic ic-18"><use href="#ic-alert"/></svg></div>
          <div class="ficha-action-body">
            <div class="ficha-action-title">${h.activo ? 'Marcar como inactivo' : 'Reactivar hotel'}</div>
            <div class="ficha-action-sub">${h.activo ? 'El hotel dejará de aparecer en el listado activo pero se conserva el histórico.' : 'Vuelve a estar disponible para asignar socorristas.'}</div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="toggleActivoHotel()">${h.activo ? 'Desactivar' : 'Reactivar'}</button>
        </div>
        <div class="ficha-action-row danger">
          <div class="icon"><svg class="ic ic-18"><use href="#ic-x"/></svg></div>
          <div class="ficha-action-body">
            <div class="ficha-action-title">Eliminar hotel permanentemente</div>
            <div class="ficha-action-sub">Borra el hotel, sus horarios asignados y su inventario. Acción irreversible.</div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="eliminarHotel()" style="color: var(--danger); border-color: var(--danger);">Eliminar</button>
        </div>`;
    }
  }

  async function actualizarHotel(patch) {
    try {
      const { error } = await window.sb.from('puestos').update(patch).eq('id', hotelActualId);
      if (error) throw error;
      await cargarHoteles();
      renderHotelFicha();
      toast('Hotel actualizado');
    } catch (err) {
      toast('Error: ' + err.message);
    }
  }

  window.guardarHotelDatos = () => actualizarHotel({
    nombre: document.getElementById('hd-nombre').value.trim(),
    grupo_hotel: document.getElementById('hd-grupo').value.trim(),
    zona: document.getElementById('hd-zona').value.trim(),
    direccion: document.getElementById('hd-dir').value.trim(),
    gps_lat: parseFloat(document.getElementById('hd-lat').value) || null,
    gps_lng: parseFloat(document.getElementById('hd-lng').value) || null,
    gps_radio_m: parseInt(document.getElementById('hd-radio').value) || 50,
    contacto_hotel_nombre: document.getElementById('hd-contnombre').value.trim(),
    contacto_hotel_tel: document.getElementById('hd-conttel').value.trim()
  });
  window.guardarHotelHorario = () => actualizarHotel({
    hora_inicio_default: document.getElementById('hh-ini').value,
    hora_fin_default: document.getElementById('hh-fin').value
  });
  window.guardarHotelServicios = () => actualizarHotel({
    servicios_necesarios: parseInt(document.getElementById('hs-serv').value) || 1,
    notas: document.getElementById('hs-notas').value.trim()
  });
  window.guardarHotelEquipamiento = () => actualizarHotel({
    tiene_botiquin: document.getElementById('he-botiquin').checked,
    tiene_desa: document.getElementById('he-desa').checked,
    tiene_oxigeno: document.getElementById('he-oxigeno').checked
  });
  window.toggleActivoHotel = async () => {
    const h = hotelesCache.find(x => x.id === hotelActualId);
    await actualizarHotel({ activo: !h.activo });
  };
  window.eliminarHotel = async () => {
    const h = hotelesCache.find(x => x.id === hotelActualId);
    if (!confirm(`⚠️ ELIMINAR el hotel "${h.nombre}" permanentemente?\n\nEsto borrará también su inventario y sus horarios. Irreversible.`)) return;
    const nombre2 = prompt('Escribe el nombre exacto del hotel para confirmar:');
    if (nombre2 !== h.nombre) { toast('Nombre no coincide. Cancelado.'); return; }
    try {
      const { error } = await window.sb.from('puestos').delete().eq('id', hotelActualId);
      if (error) throw error;
      closeHotelModal();
      await cargarHoteles();
      toast('Hotel eliminado');
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ---------- Modal nuevo hotel ---------- */
  window.openNuevoHotelModal = () => document.getElementById('nuevoHotelModal').classList.add('open');
  window.closeNuevoHotelModal = () => document.getElementById('nuevoHotelModal').classList.remove('open');
  window.usarMiUbicacion = () => {
    if (!navigator.geolocation) { toast('Tu navegador no soporta GPS'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      document.getElementById('nhLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('nhLng').value = pos.coords.longitude.toFixed(6);
      toast('Ubicación GPS obtenida');
    }, err => toast('Error GPS: ' + err.message));
  };
  window.crearNuevoHotel = async function () {
    const nombre = document.getElementById('nhNombre').value.trim();
    if (!nombre) { toast('Escribe un nombre'); return; }
    const psSes = window.PS_SESSION || {};
    try {
      const { error } = await window.sb.from('puestos').insert({
        empresa_id: psSes.empresa_id,
        nombre,
        zona: document.getElementById('nhZona').value.trim(),
        grupo_hotel: document.getElementById('nhGrupo').value.trim(),
        direccion: document.getElementById('nhDireccion').value.trim(),
        gps_lat: parseFloat(document.getElementById('nhLat').value) || null,
        gps_lng: parseFloat(document.getElementById('nhLng').value) || null,
        hora_inicio_default: document.getElementById('nhHoraIni').value,
        hora_fin_default: document.getElementById('nhHoraFin').value,
        servicios_necesarios: parseInt(document.getElementById('nhServicios').value) || 1,
        tiene_botiquin: document.getElementById('nhBotiquin').checked,
        tiene_desa: document.getElementById('nhDesa').checked,
        tiene_oxigeno: document.getElementById('nhOxigeno').checked,
        activo: true
      });
      if (error) throw error;
      ['nhNombre','nhZona','nhGrupo','nhDireccion','nhLat','nhLng'].forEach(id => document.getElementById(id).value = '');
      closeNuevoHotelModal();
      await cargarHoteles();
      toast(`Hotel "${nombre}" creado`);
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Arrancar carga de hoteles
  cargarHoteles();

  /* ==========================================================================
     MÓDULO COORDINACIÓN — actividades + visitas a hoteles (BD real)
     ========================================================================== */

  const coordAdminPanel = document.getElementById('coordAdminPanel');
  const coordSelfPanel = document.getElementById('coordSelfPanel');
  const coordTimeline = document.getElementById('coordTimeline');
  const coordSelfTimeline = document.getElementById('coordSelfTimeline');
  const coordFilterCoord = document.getElementById('coordFilterCoord');
  const coordFilterTipo = document.getElementById('coordFilterTipo');

  let coordUsuariosMap = {}; // id -> {nombre, email}
  let coordFilterCoordVal = 'todos';
  let coordFilterTipoVal = 'todos';
  let lastVisitaCapture = null; // { hora, lat, lng }

  // Muestra panel según rol
  function ajustarPanelesCoord() {
    const psSes = window.PS_SESSION || {};
    const esAdmin = psSes.rol === 'dueno';
    const esCoord = psSes.rol === 'coordinador';
    if (coordAdminPanel) coordAdminPanel.style.display = esAdmin ? 'block' : 'none';
    if (coordSelfPanel) coordSelfPanel.style.display = esCoord ? 'block' : 'none';
  }

  async function cargarUsuariosCoord() {
    try {
      const { data, error } = await window.sb.from('usuarios').select('id, nombre, email, rol').in('rol', ['coordinador','dueno']);
      if (error) throw error;
      coordUsuariosMap = {};
      (data || []).forEach(u => coordUsuariosMap[u.id] = { nombre: u.nombre || u.email.split('@')[0], email: u.email, rol: u.rol });
      if (coordFilterCoord) {
        const coords = (data || []).filter(u => u.rol === 'coordinador');
        coordFilterCoord.innerHTML = '<option value="todos">Todos los coordinadores</option>' +
          coords.map(u => `<option value="${u.id}">${u.nombre || u.email.split('@')[0]}</option>`).join('');
      }
    } catch (e) { console.warn('[Coord] usuarios:', e.message); }
  }

  window.cargarCoordinacion = async function () {
    ajustarPanelesCoord();
    const psSes = window.PS_SESSION || {};
    if (!psSes.empresa_id) { setTimeout(cargarCoordinacion, 400); return; }
    await cargarUsuariosCoord();

    // Cargar actividades y visitas de la empresa
    let acts = [], vis = [];
    try {
      const r1 = await window.sb.from('actividades_coordinador')
        .select('*')
        .eq('empresa_id', psSes.empresa_id)
        .order('fecha_hora', { ascending: false })
        .limit(200);
      if (r1.error) throw r1.error;
      acts = r1.data || [];

      const r2 = await window.sb.from('visitas_hoteles')
        .select('*')
        .eq('empresa_id', psSes.empresa_id)
        .order('fecha_hora_llegada', { ascending: false })
        .limit(200);
      if (r2.error) throw r2.error;
      vis = r2.data || [];
    } catch (e) {
      const msg = `<div class="coord-empty">Error cargando: ${e.message}</div>`;
      if (coordTimeline) coordTimeline.innerHTML = msg;
      if (coordSelfTimeline) coordSelfTimeline.innerHTML = msg;
      return;
    }

    // Unificar items para timeline
    const items = [
      ...acts.map(a => ({ tipo: 'actividad', at: a.fecha_hora, ...a })),
      ...vis.map(v => ({ tipo: 'visita', at: v.fecha_hora_llegada, ...v }))
    ].sort((a,b) => new Date(b.at) - new Date(a.at));

    // Vista admin
    if (coordAdminPanel && coordAdminPanel.style.display !== 'none') {
      renderTimeline(coordTimeline, items, { admin: true });
      const hoy = new Date().toDateString();
      const eventosHoy = items.filter(i => new Date(i.at).toDateString() === hoy).length;
      const stats = document.getElementById('coordStats');
      if (stats) stats.textContent = `${eventosHoy} eventos hoy · ${items.length} totales`;
    }

    // Vista self coordinator
    if (coordSelfPanel && coordSelfPanel.style.display !== 'none') {
      const mios = items.filter(i => i.coordinador_id === psSes.userId);
      renderTimeline(coordSelfTimeline, mios, { admin: false });
      const hoy = new Date().toDateString();
      const eventosHoy = mios.filter(i => new Date(i.at).toDateString() === hoy).length;
      const stats = document.getElementById('coordSelfStats');
      if (stats) stats.textContent = `${eventosHoy} eventos hoy · ${mios.length} totales`;
    }
  };

  function renderTimeline(container, items, opts) {
    if (!container) return;

    // Aplica filtros solo en vista admin
    let visibles = items;
    if (opts.admin) {
      if (coordFilterCoordVal !== 'todos') visibles = visibles.filter(i => i.coordinador_id === coordFilterCoordVal);
      if (coordFilterTipoVal === 'actividades') visibles = visibles.filter(i => i.tipo === 'actividad');
      else if (coordFilterTipoVal === 'visitas') visibles = visibles.filter(i => i.tipo === 'visita');
      else if (coordFilterTipoVal === 'notas') visibles = visibles.filter(i => (i.nota_para_admin || '').trim());
    }

    if (visibles.length === 0) {
      container.innerHTML = `<div class="coord-empty">
        <svg class="ic ic-24"><use href="#ic-clipboard"/></svg>
        <div>Sin eventos aún. Cuando registres actividades o visitas aparecerán aquí.</div>
      </div>`;
      return;
    }

    container.className = 'coord-timeline';
    container.innerHTML = visibles.map(i => {
      const u = coordUsuariosMap[i.coordinador_id] || { nombre: '—' };
      const dt = new Date(i.at);
      const fecha = dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      const hora = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const claseNota = (i.nota_para_admin || '').trim() ? 'nota-admin' : '';
      if (i.tipo === 'actividad') {
        return `
          <div class="coord-item actividad ${claseNota}">
            <div class="coord-item-head">
              <div class="coord-item-title">${i.titulo || 'Actividad'}</div>
              <div class="coord-item-time">${fecha} · ${hora}</div>
            </div>
            ${i.descripcion ? `<div class="coord-item-body">${escapeHtml(i.descripcion)}</div>` : ''}
            <div class="coord-item-meta">
              <span><svg class="ic ic-14"><use href="#ic-user"/></svg>${u.nombre}</span>
            </div>
            ${(i.nota_para_admin || '').trim() ? `<div class="coord-nota-box">${escapeHtml(i.nota_para_admin)}</div>` : ''}
          </div>`;
      } else {
        const hotel = (PS.puestos.find(p => p.id === i.puesto_id) || {}).nombre || '—';
        const dirBadge = i.vio_director
          ? '<span class="badge badge-ok small"><span class="dot"></span>Vio al director</span>'
          : '<span class="badge badge-neutral small"><span class="dot"></span>Sin director</span>';
        const gps = (i.gps_lat && i.gps_lng)
          ? `<a href="https://www.google.com/maps?q=${i.gps_lat},${i.gps_lng}" target="_blank" style="text-decoration:none;color:inherit;"><svg class="ic ic-14"><use href="#ic-pin"/></svg>${(+i.gps_lat).toFixed(4)}, ${(+i.gps_lng).toFixed(4)}</a>`
          : '<span><svg class="ic ic-14"><use href="#ic-pin"/></svg>sin GPS</span>';
        return `
          <div class="coord-item visita ${claseNota}">
            <div class="coord-item-head">
              <div class="coord-item-title">📍 Visita a ${escapeHtml(hotel)}</div>
              <div class="coord-item-time">${fecha} · ${hora}</div>
            </div>
            ${i.actividades_realizadas ? `<div class="coord-item-body"><b>Realizado:</b> ${escapeHtml(i.actividades_realizadas)}</div>` : ''}
            ${(i.vio_director && i.director_notas) ? `<div class="coord-item-body" style="margin-top:4px;"><b>Director:</b> ${escapeHtml(i.director_notas)}</div>` : ''}
            <div class="coord-item-meta">
              <span><svg class="ic ic-14"><use href="#ic-user"/></svg>${u.nombre}</span>
              ${gps}
              ${dirBadge}
            </div>
            ${(i.nota_para_admin || '').trim() ? `<div class="coord-nota-box">${escapeHtml(i.nota_para_admin)}</div>` : ''}
          </div>`;
      }
    }).join('');
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  if (coordFilterCoord) coordFilterCoord.addEventListener('change', e => { coordFilterCoordVal = e.target.value; cargarCoordinacion(); });
  if (coordFilterTipo) coordFilterTipo.addEventListener('change', e => { coordFilterTipoVal = e.target.value; cargarCoordinacion(); });

  // Cargar al inicio y después de que auth-guard confirme sesión
  cargarCoordinacion();
  document.addEventListener('ps-session-updated', () => cargarCoordinacion());

  /* ---------- Modal nueva actividad ---------- */
  window.openNuevaActividad = () => document.getElementById('actividadModal').classList.add('open');
  window.closeActividadModal = () => document.getElementById('actividadModal').classList.remove('open');
  window.crearActividad = async function () {
    const titulo = document.getElementById('actTitulo').value.trim();
    if (!titulo) { toast('Escribe un título'); return; }
    const psSes = window.PS_SESSION || {};
    try {
      const { error } = await window.sb.from('actividades_coordinador').insert({
        coordinador_id: psSes.userId,
        empresa_id: psSes.empresa_id,
        titulo,
        descripcion: document.getElementById('actDesc').value.trim(),
        nota_para_admin: document.getElementById('actNota').value.trim() || null
      });
      if (error) throw error;
      ['actTitulo','actDesc','actNota'].forEach(id => document.getElementById(id).value = '');
      closeActividadModal();
      toast('Actividad registrada');
      cargarCoordinacion();
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ---------- Modal nueva visita a hotel ---------- */
  window.openNuevaVisita = function () {
    const sel = document.getElementById('visHotel');
    sel.innerHTML = PS.puestos.map(p => `<option value="${p.id}">${p.nombre}${p.zona ? ' — ' + p.zona : ''}</option>`).join('');
    document.getElementById('visHora').value = '';
    document.getElementById('visGps').value = '';
    lastVisitaCapture = null;
    document.getElementById('visitaModal').classList.add('open');
  };
  window.closeVisitaModal = () => document.getElementById('visitaModal').classList.remove('open');
  window.capturarLlegada = function () {
    const btn = document.getElementById('btnCapturar');
    btn.disabled = true; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Capturando…';
    const ahora = new Date();
    if (!navigator.geolocation) {
      document.getElementById('visHora').value = ahora.toLocaleTimeString('es-ES');
      lastVisitaCapture = { hora: ahora.toISOString(), lat: null, lng: null };
      document.getElementById('visGps').value = 'no soportado';
      btn.disabled = false; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-check"/></svg> Capturado';
      return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
      document.getElementById('visHora').value = ahora.toLocaleTimeString('es-ES');
      document.getElementById('visGps').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      lastVisitaCapture = { hora: ahora.toISOString(), lat: pos.coords.latitude, lng: pos.coords.longitude };
      btn.disabled = false; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-check"/></svg> Capturado';
      toast('Hora y GPS capturados');
    }, err => {
      document.getElementById('visHora').value = ahora.toLocaleTimeString('es-ES');
      document.getElementById('visGps').value = 'error GPS';
      lastVisitaCapture = { hora: ahora.toISOString(), lat: null, lng: null };
      btn.disabled = false; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Capturar';
      toast('GPS bloqueado, se ha guardado solo la hora');
    }, { enableHighAccuracy: true, timeout: 8000 });
  };
  window.guardarVisita = async function () {
    if (!lastVisitaCapture) { toast('Pulsa Capturar primero para registrar hora y GPS'); return; }
    const hotelId = document.getElementById('visHotel').value;
    const acts = document.getElementById('visActividades').value.trim();
    if (!acts) { toast('Describe qué has realizado en el hotel'); return; }
    const psSes = window.PS_SESSION || {};
    try {
      const { error } = await window.sb.from('visitas_hoteles').insert({
        coordinador_id: psSes.userId,
        empresa_id: psSes.empresa_id,
        puesto_id: hotelId,
        fecha_hora_llegada: lastVisitaCapture.hora,
        gps_lat: lastVisitaCapture.lat,
        gps_lng: lastVisitaCapture.lng,
        vio_director: document.getElementById('visVioDirector').checked,
        director_notas: document.getElementById('visDirNotas').value.trim() || null,
        actividades_realizadas: acts,
        nota_para_admin: document.getElementById('visNotaAdmin').value.trim() || null
      });
      if (error) throw error;
      ['visActividades','visDirNotas','visNotaAdmin'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('visVioDirector').checked = false;
      closeVisitaModal();
      toast('Visita registrada');
      cargarCoordinacion();
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ==========================================================================
     DESCARGA PDF DE FIRMAS
     ========================================================================== */
  window.descargarPdfFirma = async function (firmaId, tipo) {
    try {
      toast('Generando PDF...');
      const { data: firma, error } = await window.sb
        .from('firmas_documentos').select('*').eq('id', firmaId).single();
      if (error) throw error;
      const empData = empleadoData(fichaActualId) || { nombre: '—' };
      const subdocs = (window.PS && PS.kitAltaSubdocs) || [];
      const nombreArchivo = `PoolSafety-${firma.documento_codigo}-${(empData.nombre||'empleado').replace(/\s+/g,'_')}.pdf`;
      await window.PSPdf.descargar(empData, firma, subdocs, nombreArchivo);
      toast('✓ PDF descargado');
      // Opcional: subir a Storage para tener copia permanente
      try {
        await window.PSPdf.generarYSubir(empData, firma, subdocs);
      } catch(e) { /* ignore */ }
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ==========================================================================
     TITULACIONES desde ficha coordinador (usa módulo compartido PSTit)
     ========================================================================== */
  window.openTitulacionCoord = function (t) {
    document.getElementById('titulacionModalBody').innerHTML = window.PSTit.modalHTML(t || null);
    document.getElementById('titulacionModal').classList.add('open');
    onTitTipoChange();
  };
  window.closeTitulacionModal = () => document.getElementById('titulacionModal').classList.remove('open');

  window.onTitTipoChange = function () {
    const tipo = document.getElementById('titTipo')?.value;
    if (!tipo) return;
    const info = window.PSTit.TIPOS[tipo];
    const wrapCad = document.getElementById('titCad')?.closest('.field');
    const wrapRec = document.getElementById('titRec')?.closest('.field');
    const wrapObt = document.getElementById('titObt')?.closest('.field');
    if (wrapCad) wrapCad.style.opacity = info.needCaducidad ? '1' : '.4';
    if (wrapRec) wrapRec.style.opacity = info.needReciclaje ? '1' : '.4';
    if (wrapObt) wrapObt.style.opacity = info.needObtencion ? '1' : '.4';
  };

  window.onTitFileChange = function (e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast('Archivo demasiado grande (máx 5MB)'); e.target.value = ''; return; }
    document.getElementById('titFileName').textContent = f.name;
    const reader = new FileReader();
    reader.onload = ev => { document.getElementById('titFileData').value = ev.target.result; };
    reader.readAsDataURL(f);
  };

  window.submitTitulacion = async function () {
    if (!fichaActualId) { toast('Sin empleado seleccionado'); return; }
    const tipo = document.getElementById('titTipo').value;
    const fileData = document.getElementById('titFileData').value;
    const fileName = document.getElementById('titFile').files[0]?.name || null;
    try {
      await window.PSTit.guardar(fichaActualId, {
        id: document.getElementById('titId').value || null,
        tipo,
        nombre: document.getElementById('titNombre').value.trim() || window.PSTit.TIPOS[tipo].label,
        entidad_emisora: document.getElementById('titEntidad').value.trim(),
        numero_referencia: document.getElementById('titRef').value.trim(),
        fecha_obtencion: document.getElementById('titObt').value || null,
        fecha_caducidad: document.getElementById('titCad').value || null,
        fecha_reciclaje: document.getElementById('titRec').value || null,
        documento_url: fileData || undefined,
        documento_nombre: fileName || undefined,
        notas: document.getElementById('titNotas').value.trim()
      });
      closeTitulacionModal();
      toast('✓ Documento guardado');
      renderFichaBody();
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ---------- Logout (real: cierra sesión en Supabase) ---------- */
  window.logout = function () {
    if (window.logoutReal) return window.logoutReal();
    PS.clearSession();
    window.location.href = 'index.html';
  };
})();
