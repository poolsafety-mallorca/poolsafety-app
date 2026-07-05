/* ==========================================================================
   PoolSafety · Dashboard coordinador / dueño v2
   ========================================================================== */

(function () {
  const session = PS.getSession() || { role: 'coordinador', nombre: 'Jaume Ferrer' };
  const nombre = session.nombre || 'Jaume Ferrer';
  const rolLabel = session.role === 'dueno' ? 'Dirección' : 'Coordinador';

  document.getElementById('userName').textContent = nombre;
  document.getElementById('userRoleLabel').textContent = rolLabel;
  document.getElementById('userAvatar').textContent = nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
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

  /* ---------- Alertas botiquín ---------- */
  const alertsList = document.getElementById('alertsList');
  document.getElementById('alertsCount').innerHTML = `<span class="dot"></span>${PS.alertas.length} abiertas`;
  alertsList.innerHTML = PS.alertas.map(a => {
    const cls = a.criticidad === 'alta' ? 'high' : a.criticidad === 'media' ? 'med' : 'low';
    const critBadge = a.criticidad === 'alta' ? 'badge-danger'
                    : a.criticidad === 'media' ? 'badge-warn' : 'badge-info';
    return `
      <div class="alert ${cls}">
        <div class="alert-icon">
          <svg class="ic ic-18"><use href="#ic-alert"/></svg>
        </div>
        <div class="alert-body">
          <div class="alert-title-row">
            <span class="alert-title">${a.item}</span>
            <span class="badge ${critBadge}"><span class="dot"></span>${a.criticidad}</span>
          </div>
          <div class="alert-sub">
            <svg class="ic ic-14"><use href="#ic-pin"/></svg>
            ${a.puestoNombre} · ${a.reportado}
          </div>
        </div>
        <button class="alert-action" onclick="resolveAlert(this)">Reponer</button>
      </div>
    `;
  }).join('');

  window.resolveAlert = function (btn) {
    btn.innerHTML = '<svg class="ic ic-14" style="vertical-align:-3px;"><use href="#ic-check"/></svg> Repuesto';
    btn.classList.add('done');
    toast('Alerta resuelta');
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

  /* ---------- Logout ---------- */
  window.logout = function () {
    PS.clearSession();
    window.location.href = 'index.html';
  };
})();
