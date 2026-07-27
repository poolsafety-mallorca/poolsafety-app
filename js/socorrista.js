/* ==========================================================================
   PoolSafety · App socorrista v2
   ========================================================================== */

(function () {
  // Sesión (aseguramos que hay usuario aunque venga directo)
  const session = PS.getSession();
  if (!session || session.role !== 'socorrista') {
    PS.setSession({ role: 'socorrista', id: 's01', nombre: 'María Fernández' });
  }
  const me = PS.socorristas.find(s => s.id === 's01');
  const miPuesto = PS.puestoById(me.puestoId);

  // Cabecera
  document.getElementById('userName').textContent = me.nombre;
  document.getElementById('userInitials').textContent = me.iniciales;
  document.getElementById('puestoName').textContent = miPuesto.nombre;
  const finTurno = `${(parseInt(miPuesto.hora) + miPuesto.duracion).toString().padStart(2,'0')}:00`;
  document.getElementById('turnoText').textContent = `${miPuesto.hora} – ${finTurno}`;
  const h = new Date().getHours();
  document.getElementById('greetingText').textContent =
    h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';

  // Reloj vivo
  function tickClock() {
    const d = new Date();
    document.getElementById('punchClock').textContent =
      `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  tickClock();
  setInterval(tickClock, 30 * 1000);

  /* ---------- Navegación ---------- */
  window.showView = function (name) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.dataset.view !== name));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  document.querySelectorAll('.tabbar button').forEach(b => {
    b.addEventListener('click', () => showView(b.dataset.tab));
  });

  /* ---------- Fichaje ---------- */
  const state = PS.getSocorristaState();
  const punchActions = document.getElementById('punchActions');
  const punchBadge = document.getElementById('punchBadge');
  const punchWhen = document.getElementById('punchWhen');

  function renderPunch() {
    if (!state.fichado && !state.horaSalida) {
      punchBadge.innerHTML = `<span class="dot" style="background:#FCA5A5;"></span> No iniciado`;
      punchWhen.textContent = 'Pulsa para fichar tu entrada al turno';
      punchActions.innerHTML = `
        <button class="punch-cta" id="punchInBtn">
          <svg class="ic ic-18"><use href="#ic-play"/></svg>
          Fichar entrada
        </button>`;
      document.getElementById('punchInBtn').addEventListener('click', doPunchIn);
    } else if (state.fichado) {
      punchBadge.innerHTML = `<span class="dot" style="background:#34D399;"></span> Trabajando`;
      punchWhen.textContent = `Fichaste entrada a las ${state.horaEntrada}`;
      punchActions.innerHTML = `
        <button class="punch-cta out" id="punchOutBtn">
          <svg class="ic ic-18"><use href="#ic-stop"/></svg>
          Fichar salida
        </button>`;
      document.getElementById('punchOutBtn').addEventListener('click', doPunchOut);
    } else {
      punchBadge.innerHTML = `<span class="dot" style="background:#94A3B8;"></span> Turno finalizado`;
      punchWhen.textContent = `${state.horaEntrada} – ${state.horaSalida} · registrado correctamente`;
      punchActions.innerHTML = `
        <div style="text-align:center; padding:14px; color:#fff; opacity:.9; font-size:14px; display:inline-flex; gap:6px; align-items:center; justify-content:center; width:100%;">
          <svg class="ic ic-16"><use href="#ic-check-circle"/></svg>
          Fichaje registrado
        </div>`;
    }
  }

  function doPunchIn() {
    const btn = document.getElementById('punchInBtn');
    btn.innerHTML = `<svg class="ic ic-18"><use href="#ic-signal"/></svg> Comprobando ubicación…`;
    btn.disabled = true;
    setTimeout(() => {
      state.fichado = true;
      state.horaEntrada = PS.ahora();
      PS.setSocorristaState(state);
      renderPunch();
      toast(`Entrada registrada a las ${state.horaEntrada} · dentro del puesto`);
    }, 1300);
  }
  function doPunchOut() {
    if (!confirm('¿Fichar salida ahora?')) return;
    state.horaSalida = PS.ahora();
    state.fichado = false;
    PS.setSocorristaState(state);
    renderPunch();
    toast(`Turno finalizado. ¡Buen trabajo!`);
  }
  renderPunch();

  /* ---------- Notas ---------- */
  const notasList = document.getElementById('notasList');
  if (notasList) {
    notasList.innerHTML = PS.notas.map(n => `
      <div class="note">
        <div class="note-head">
          <div class="note-avatar">${n.autor.split(' ').slice(-1)[0][0]}</div>
          <div class="note-author">${n.autor}</div>
          <div class="note-time">${n.fecha}</div>
        </div>
        <div class="note-body">${n.mensaje}</div>
      </div>
    `).join('');
  }

  /* ---------- Tareas ---------- */
  const tareasList = document.getElementById('tareasList');
  const tareasProgress = document.getElementById('tareasProgress');
  function renderTareas() {
    if (!tareasList) return;
    tareasList.innerHTML = PS.tareas.map(t => {
      const done = state.tareasHechas.includes(t.id);
      const prBadge = t.prioridad === 'alta' ? 'badge-danger'
                    : t.prioridad === 'media' ? 'badge-warn' : 'badge-info';
      return `
        <div class="li ${done ? 'done' : ''}" data-task="${t.id}">
          <div class="check ${done ? 'done' : ''}">
            ${done ? `<svg class="ic ic-14"><use href="#ic-check"/></svg>` : ''}
          </div>
          <div class="li-body">
            <div class="li-title">${t.titulo}</div>
            <div class="li-sub">${t.descripcion}</div>
            <div class="row gap-1 mt-2">
              <span class="badge ${prBadge}"><span class="dot"></span>${t.prioridad}</span>
              <span class="badge badge-neutral">
                <svg class="ic ic-14"><use href="#ic-calendar"/></svg>
                ${t.fecha}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    tareasList.querySelectorAll('.li').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.task;
        if (state.tareasHechas.includes(id)) {
          state.tareasHechas = state.tareasHechas.filter(x => x !== id);
        } else {
          state.tareasHechas.push(id);
          toast('Tarea marcada como hecha');
        }
        PS.setSocorristaState(state);
        renderTareas();
      });
    });
    const done = PS.tareas.filter(t => state.tareasHechas.includes(t.id)).length;
    if (tareasProgress) tareasProgress.textContent = `${done} de ${PS.tareas.length} completadas`;
  }
  renderTareas();

  /* ---------- Botiquín / DESA / Oxigenoterapia ---------- */
  const inventarioList = document.getElementById('inventarioList');
  const alertasStockPanel = document.getElementById('alertasStockPanel');
  const revisionSummary = document.getElementById('revisionSummary');
  const invSectionTitle = document.getElementById('invSectionTitle');
  const invSectionMeta = document.getElementById('invSectionMeta');
  const normaBanner = document.getElementById('normaBanner');
  let seccionActual = 'botiquin';

  const SECCION_INFO = {
    botiquin: { titulo: 'Inventario del botiquín', norma: 'Contenido según Decreto 53/1995 de Baleares · piscinas de establecimientos turísticos.' },
    desa:     { titulo: 'Desfibrilador (DESA)', norma: 'Obligatorio según Decreto 137/2008 de Baleares. Revisión mensual del equipo, batería y parches.' },
    oxigeno:  { titulo: 'Oxigenoterapia', norma: 'Obligatoria según Decreto 53/1995. Comprobar carga de bala, ambú y mascarillas antes del turno.' }
  };

  function iconForCat(cat) {
    switch (cat) {
      case 'Curas': return 'ic-package';
      case 'Antiséptico': return 'ic-droplet';
      case 'Lavado': return 'ic-droplet';
      case 'Protección': return 'ic-shield';
      case 'Instrumental': return 'ic-package';
      case 'Emergencia': return 'ic-alert';
      case 'Medicación': return 'ic-medkit';
      case 'DESA': return 'ic-heart-pulse';
      case 'Oxígeno': return 'ic-droplet';
      default: return 'ic-package';
    }
  }

  function itemsPorSeccion(sec) {
    return PS.inventario.filter(it => it.seccion === sec && it.puestoId === me.puestoId);
  }

  function alertasAutomaticas() {
    return PS.inventario.filter(it => it.puestoId === me.puestoId && it.stock < it.minimo);
  }

  function renderTabs() {
    ['botiquin','desa','oxigeno'].forEach(sec => {
      const el = document.getElementById(`cnt-${sec}`);
      if (el) el.textContent = itemsPorSeccion(sec).length;
    });
    document.querySelectorAll('.chip-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.sec === seccionActual);
    });
  }

  function renderRevisionSummary() {
    const items = PS.inventario.filter(it => it.puestoId === me.puestoId);
    const total = items.length;
    const revisados = items.filter(it => it.revisadoHoy).length;
    if (revisionSummary) {
      revisionSummary.textContent = `${miPuesto.nombre} · revisión diaria ${revisados}/${total} comprobados`;
    }
  }

  function renderAlertasStock() {
    if (!alertasStockPanel) return;
    const alertas = alertasAutomaticas();
    if (alertas.length === 0) {
      alertasStockPanel.innerHTML = `
        <div class="alert-strip ok">
          <svg class="ic ic-16"><use href="#ic-check-circle"/></svg>
          Todo el material está por encima del mínimo.
        </div>`;
      return;
    }
    alertasStockPanel.innerHTML = `
      <div class="alert-strip warn">
        <svg class="ic ic-16"><use href="#ic-alert"/></svg>
        <div style="flex:1">
          <div><b>${alertas.length} artículo${alertas.length>1?'s':''} bajo mínimo</b> · alerta enviada al coordinador</div>
          <div class="small mt-1">${alertas.map(a => a.nombre).slice(0,3).join(' · ')}${alertas.length>3?' …':''}</div>
        </div>
      </div>`;
  }

  function renderInventario() {
    if (!inventarioList) return;
    const info = SECCION_INFO[seccionActual];
    if (invSectionTitle) invSectionTitle.textContent = info.titulo;
    if (normaBanner) {
      normaBanner.innerHTML = `<svg class="ic ic-14"><use href="#ic-shield"/></svg><span>${info.norma}</span>`;
    }
    const items = itemsPorSeccion(seccionActual);
    if (invSectionMeta) {
      const rev = items.filter(it => it.revisadoHoy).length;
      invSectionMeta.textContent = `${rev}/${items.length} revisados hoy`;
    }

    inventarioList.innerHTML = items.map(it => {
      const pct = Math.min(100, Math.round((it.stock / (it.minimo * 2)) * 100));
      const level = it.stock === 0 ? 'low' : it.stock < it.minimo ? 'warn' : 'ok';
      const badge = it.stock === 0
        ? '<span class="badge badge-danger"><span class="dot"></span>Sin stock</span>'
        : it.stock < it.minimo
        ? '<span class="badge badge-warn"><span class="dot"></span>Bajo mínimo</span>'
        : '<span class="badge badge-ok"><span class="dot"></span>OK</span>';
      const obligBadge = it.obligatorio
        ? `<span class="badge badge-info small" title="${it.normativa}"><svg class="ic ic-14"><use href="#ic-shield"/></svg>Obligatorio</span>`
        : '';
      const extraInfo = [];
      if (it.caducidad) extraInfo.push(`Caduca ${it.caducidad}`);
      if (it.cargaBala) extraInfo.push(`Carga ${it.cargaBala}`);
      if (it.revisionMensual) extraInfo.push(`Revisión mensual · próx. ${it.proximaRevision || 'este mes'}`);
      const extra = extraInfo.length ? `<div class="inv-extra">${extraInfo.join(' · ')}</div>` : '';

      return `
        <div class="inv">
          <button class="inv-check ${it.revisadoHoy ? 'done' : ''}" data-id="${it.id}" title="Marcar revisado hoy">
            ${it.revisadoHoy ? `<svg class="ic ic-14"><use href="#ic-check"/></svg>` : ''}
          </button>
          <div class="inv-icon ${level}">
            <svg class="ic ic-22"><use href="#${iconForCat(it.categoria)}"/></svg>
          </div>
          <div class="inv-body">
            <div class="row between">
              <div class="inv-name">${it.nombre}</div>
              ${badge}
            </div>
            <div class="row gap-1 mt-1">${obligBadge}</div>
            <div class="inv-meta">
              <div class="inv-stock">${it.stock} ${it.unidad} · mínimo ${it.minimo}</div>
              <div class="inv-bar"><span class="${level}" style="width:${pct}%"></span></div>
            </div>
            ${extra}
          </div>
        </div>
      `;
    }).join('');

    // Checkbox revisión diaria
    inventarioList.querySelectorAll('.inv-check').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const it = PS.inventario.find(x => x.id === id);
        if (!it) return;
        it.revisadoHoy = !it.revisadoHoy;
        renderInventario();
        renderRevisionSummary();
        if (it.revisadoHoy) toast(`Revisado ✓ ${it.nombre}`);
      });
    });
  }

  document.querySelectorAll('#botiquinTabs .chip-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      seccionActual = btn.dataset.sec;
      renderTabs();
      renderInventario();
    });
  });

  renderTabs();
  renderRevisionSummary();
  renderAlertasStock();
  renderInventario();

  // Recalcular reporte modal según sección actual
  window.updateReportOptions = function () {
    const sel = document.getElementById('reportItem');
    if (!sel) return;
    sel.innerHTML = PS.inventario
      .filter(it => it.puestoId === me.puestoId)
      .sort((a,b) => a.stock/a.minimo - b.stock/b.minimo)
      .map(it => `<option value="${it.id}">${it.nombre}${it.stock<it.minimo?' · '+it.stock+' '+it.unidad:''}</option>`)
      .join('');
  };
  updateReportOptions();

  /* ---------- Modal reportar ---------- */
  window.openReportModal = () => {
    updateReportOptions();
    document.getElementById('reportModal').classList.add('open');
  };
  window.closeReportModal = () => document.getElementById('reportModal').classList.remove('open');
  window.submitReport = function () {
    const itemId = document.getElementById('reportItem').value;
    const qty = document.getElementById('reportQty').value;
    const it = PS.inventario.find(x => x.id === itemId);
    const nombre = it ? it.nombre : 'material';
    closeReportModal();
    toast(`Alerta enviada al coordinador: falta ${qty}× ${nombre}`);
    document.getElementById('reportNotes').value = '';
  };

  /* ---------- Toast ---------- */
  const toastEl = document.getElementById('toast');
  const toastTx = document.getElementById('toastText');
  let toastT = null;
  function toast(msg) {
    toastTx.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  /* ---------- Logout ---------- */
  window.logout = function () {
    PS.clearSession();
    window.location.href = 'index.html';
  };
  document.getElementById('logoutBtn').addEventListener('click', logout);
})();
