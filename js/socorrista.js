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

  // Leer horario personalizado asignado por el coordinador (si existe)
  function miHorarioAsignado() {
    const raw = localStorage.getItem('poolsafety-horarios-v1');
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[me.id] || null;
  }
  const asignado = miHorarioAsignado();
  const puestoId = asignado?.puestoId || me.puestoId;
  const miPuesto = PS.puestoById(puestoId);
  const horaInicio = asignado?.hora || miPuesto.hora;
  const dur = asignado?.duracion || miPuesto.duracion;

  // Cabecera
  document.getElementById('userName').textContent = me.nombre;
  document.getElementById('userInitials').textContent = me.iniciales;
  document.getElementById('puestoName').textContent = miPuesto.nombre;
  const finTurno = `${(parseInt(horaInicio) + dur).toString().padStart(2,'0')}:00`;
  document.getElementById('turnoText').textContent = `${horaInicio} – ${finTurno}`;
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

  /* ==========================================================================
     DOCUMENTACIÓN LABORAL — Kit Alta + Jornada + Baja
     ========================================================================== */

  const docsSummary = document.getElementById('docsSummary');
  const docsAltaList = document.getElementById('docsAltaList');
  const docsJornadaList = document.getElementById('docsJornadaList');
  const docsBajaSection = document.getElementById('docsBajaSection');
  const docsBajaList = document.getElementById('docsBajaList');
  const docAltaBadge = document.getElementById('docAltaBadge');
  const docsPendingDot = document.getElementById('docsPendingDot');

  function misFirmas() { return PS.firmasDeSocorrista(me.id); }

  // Horas del mes actuales (para el registro mensual)
  // Regla del cliente: solo 40h/semana ordinarias (~160/mes).
  // Extras SOLO se muestran si el trabajador tiene menos de 40h/semana.
  function horasMesRegla() {
    const semanaObj = 40;
    const semanasMes = 4;
    const objMes = semanaObj * semanasMes; // 160h
    const totalOrdi = Math.min(me.horasNormales, objMes);
    const promedioSemana = me.horasNormales / semanasMes;
    const mostrarExtras = promedioSemana < semanaObj;
    const extras = mostrarExtras ? me.horasExtra : 0;
    return { ordinarias: totalOrdi, extras, mostrarExtras, promedioSemana, objMes };
  }

  function renderDocsHeader() {
    const kitOk = PS.haFirmadoKitAlta(me.id);
    const pend = kitOk ? 0 : 1;
    const jornadaPend = PS.documentos.filter(d => d.grupo === 'mensual' && !d.yaFirmado && !misFirmas()[d.id]).length;
    const total = pend + jornadaPend;
    if (docsSummary) {
      docsSummary.textContent = total === 0
        ? `${me.nombre} · toda la documentación al día`
        : `${me.nombre} · ${total} documento${total>1?'s':''} pendiente${total>1?'s':''} de firmar`;
    }
    if (docsPendingDot) docsPendingDot.style.display = total > 0 ? 'inline-block' : 'none';
    if (docAltaBadge) {
      docAltaBadge.textContent = kitOk ? 'Firmado' : 'Pendiente';
    }
  }

  function docCard(opts) {
    const { titulo, subtitulo, estado, badge, cta, disabled, onClick, extra } = opts;
    const el = document.createElement('div');
    el.className = 'doc-card' + (disabled ? ' disabled' : '');
    el.innerHTML = `
      <div class="doc-card-icon ${estado}">
        <svg class="ic ic-22"><use href="#${estado === 'ok' ? 'ic-check-circle' : estado === 'warn' ? 'ic-alert' : 'ic-file-text'}"/></svg>
      </div>
      <div class="doc-card-body">
        <div class="doc-card-title">${titulo}</div>
        <div class="doc-card-sub">${subtitulo}</div>
        ${extra || ''}
      </div>
      <div class="doc-card-side">
        ${badge}
        ${cta ? `<button class="btn ${disabled?'btn-outline':'btn-primary'} btn-sm" ${disabled?'disabled':''}>${cta}</button>` : ''}
      </div>
    `;
    if (onClick && !disabled) el.querySelector('button')?.addEventListener('click', onClick);
    return el;
  }

  function renderDocsLists() {
    if (!docsAltaList) return;
    docsAltaList.innerHTML = '';
    docsJornadaList.innerHTML = '';

    const firmas = misFirmas();

    // 1) Kit alta (agrupa 7 sub-docs)
    const kitOk = firmas['kit-alta']?.completado === true;
    const kitCard = docCard({
      titulo: 'Kit Alta Empresa',
      subtitulo: 'RGPD · Geolocalización · EPIs · Salud laboral · Desconexión · Imagen · Comunicación electrónica',
      estado: kitOk ? 'ok' : 'warn',
      badge: kitOk
        ? `<span class="badge badge-ok"><span class="dot"></span>Firmado</span>`
        : `<span class="badge badge-warn"><span class="dot"></span>Pendiente</span>`,
      cta: kitOk ? 'Ver' : 'Firmar ahora',
      onClick: () => kitOk ? openKitAltaView() : openKitAltaWizard(),
      extra: kitOk ? `<div class="doc-card-meta">Firmado el ${new Date(firmas['kit-alta'].fecha).toLocaleDateString('es-ES')}</div>` : ''
    });
    docsAltaList.appendChild(kitCard);

    // 2) Jornadas mensuales
    PS.documentos.filter(d => d.grupo === 'mensual').forEach(d => {
      const firmado = d.yaFirmado || firmas[d.id];
      const esActual = d.mes === 'julio'; // simplificación demo
      const puedeFirmar = esActual; // en real: solo último día trabajado del mes
      const hr = horasMesRegla();
      const hrLabel = hr.mostrarExtras
        ? `${hr.ordinarias}h ordinarias + ${hr.extras}h complementarias`
        : `${hr.ordinarias}h de ${hr.objMes}h pactadas (40h/sem)`;
      const card = docCard({
        titulo: d.titulo,
        subtitulo: firmado ? d.subtitulo : `Total del mes: ${hrLabel}`,
        estado: firmado ? 'ok' : (puedeFirmar ? 'warn' : 'neutral'),
        badge: firmado
          ? `<span class="badge badge-ok"><span class="dot"></span>Firmado</span>`
          : puedeFirmar
          ? `<span class="badge badge-warn"><span class="dot"></span>Pendiente</span>`
          : `<span class="badge badge-neutral"><span class="dot"></span>Aún no</span>`,
        cta: firmado ? 'Ver' : (puedeFirmar ? 'Firmar' : 'Bloqueado'),
        disabled: !firmado && !puedeFirmar,
        onClick: () => firmado ? openDocView('jornada-view', d) : openJornadaSign(d)
      });
      docsJornadaList.appendChild(card);
    });

    // 3) Baja / finiquito (oculto salvo estado baja)
    if (docsBajaSection) docsBajaSection.style.display = 'none';
  }

  /* ---------- Wizard Kit Alta (8 pasos con los 7 sub-docs) ---------- */
  const wizardBody = document.getElementById('wizardBody');
  const wizardProgressBar = document.getElementById('wizardProgressBar');
  const wizardStepLabel = document.getElementById('wizardStepLabel');
  const wizardBackBtn = document.getElementById('wizardBackBtn');
  const wizardNextBtn = document.getElementById('wizardNextBtn');
  let wizardStep = 0;
  let wizardData = { aceptados: {}, campos: {} };

  function wizardSteps() {
    return [
      {
        titulo: 'Bienvenido al equipo',
        subtitulo: 'Antes de empezar necesitamos que revises y firmes los documentos laborales obligatorios.',
        contenido: `
          <div class="wizard-intro">
            <div class="wizard-intro-line"><svg class="ic ic-16"><use href="#ic-shield"/></svg> Cumplimos íntegramente el RGPD y la LOPDGDD.</div>
            <div class="wizard-intro-line"><svg class="ic ic-16"><use href="#ic-signal"/></svg> Necesitamos tu consentimiento para geolocalización desde tu móvil.</div>
            <div class="wizard-intro-line"><svg class="ic ic-16"><use href="#ic-file-text"/></svg> Vas a firmar 7 documentos. Se guardará una copia visible en tu perfil.</div>
            <div class="wizard-intro-line"><svg class="ic ic-16"><use href="#ic-clock"/></svg> Tiempo estimado: 3-5 minutos.</div>
          </div>
        `,
        obligatorio: false,
        soloContinuar: true
      },
      ...PS.kitAltaSubdocs.map(sub => ({
        subdocId: sub.id,
        titulo: sub.titulo,
        subtitulo: sub.norma || '',
        contenido: `
          <div class="wizard-doc-summary">${sub.resumen}</div>
          ${sub.resaltado ? '<div class="wizard-highlight"><svg class="ic ic-14"><use href="#ic-alert"/></svg> Este documento habilita el registro digital de tu jornada con GPS. Puedes retirar el consentimiento en cualquier momento.</div>' : ''}
          ${sub.esListaEpis ? `
            <ul class="wizard-epi-list">
              <li>Sudadera roja Roly · 1 ud</li>
              <li>Camiseta blanca Roly · 3 ud</li>
              <li>Bañador rojo Roly · 2 ud</li>
              <li>Pantalón largo negro Roly · 1 ud</li>
              <li>Gafas de sol negras Roly · 1 ud</li>
              <li>Gorra roja y blanca Roly · 1 ud</li>
              <li>Crema solar · 1 ud</li>
            </ul>` : ''}
          ${sub.requiereCampos ? `
            <div class="field mt-3">
              <label>Correo electrónico personal</label>
              <input type="email" id="wiz-emailPersonal" placeholder="tu@correo.com" value="${wizardData.campos.emailPersonal || ''}" />
            </div>
            <div class="field">
              <label>Teléfono móvil personal</label>
              <input type="tel" id="wiz-telefonoPersonal" placeholder="+34 6XX XXX XXX" value="${wizardData.campos.telefonoPersonal || ''}" />
            </div>` : ''}
          <label class="wizard-accept-line">
            <input type="checkbox" id="wiz-accept" ${wizardData.aceptados[sub.id] ? 'checked' : ''} />
            <span>${sub.obligatorio
              ? 'He leído y acepto expresamente este documento.'
              : 'Doy mi consentimiento (opcional, puedo revocarlo en cualquier momento).'}</span>
          </label>
        `,
        obligatorio: sub.obligatorio,
        requiereCampos: sub.requiereCampos
      })),
      {
        titulo: 'Firma final',
        subtitulo: 'Escribe tu nombre completo tal como aparece en tu DNI para firmar todos los documentos.',
        contenido: `
          <div class="wizard-sign-box">
            <div class="wizard-sign-info">
              Firmando en: <b>${new Date().toLocaleString('es-ES')}</b><br>
              Desde: <b>Dispositivo del empleado</b> · IP registrada por el sistema
            </div>
            <div class="field mt-3">
              <label>Nombre y apellidos</label>
              <input type="text" id="wiz-firma" placeholder="${me.nombre}" />
            </div>
            <div class="field">
              <label>DNI</label>
              <input type="text" id="wiz-dni" placeholder="00000000A" />
            </div>
          </div>
        `,
        esFirma: true
      }
    ];
  }

  function wizardRender() {
    const steps = wizardSteps();
    const step = steps[wizardStep];
    if (!step) return;
    const total = steps.length;
    wizardProgressBar.style.width = `${((wizardStep+1)/total)*100}%`;
    wizardStepLabel.textContent = `Paso ${wizardStep+1} de ${total}`;
    wizardBody.innerHTML = `
      <h3 class="wizard-title">${step.titulo}</h3>
      ${step.subtitulo ? `<div class="wizard-sub">${step.subtitulo}</div>` : ''}
      ${step.contenido}
    `;
    wizardBackBtn.disabled = wizardStep === 0;
    wizardNextBtn.innerHTML = wizardStep === total - 1
      ? `<svg class="ic ic-16"><use href="#ic-pen"/></svg> Firmar todo`
      : `Siguiente <svg class="ic ic-16"><use href="#ic-chevron-right"/></svg>`;
  }

  window.wizardBack = function () {
    if (wizardStep > 0) { wizardStep--; wizardRender(); }
  };

  window.wizardNext = function () {
    const steps = wizardSteps();
    const step = steps[wizardStep];

    if (step.subdocId) {
      const accept = document.getElementById('wiz-accept')?.checked;
      if (step.obligatorio && !accept) {
        toast('Debes marcar la casilla para continuar (obligatorio)');
        return;
      }
      wizardData.aceptados[step.subdocId] = accept;
      if (step.requiereCampos) {
        const email = document.getElementById('wiz-emailPersonal')?.value.trim();
        const tel = document.getElementById('wiz-telefonoPersonal')?.value.trim();
        if (!email || !tel) { toast('Rellena email y teléfono para continuar'); return; }
        wizardData.campos.emailPersonal = email;
        wizardData.campos.telefonoPersonal = tel;
      }
    }

    if (step.esFirma) {
      const firma = document.getElementById('wiz-firma')?.value.trim();
      const dni = document.getElementById('wiz-dni')?.value.trim();
      if (!firma) { toast('Escribe tu nombre completo para firmar'); return; }
      if (!dni) { toast('Escribe tu DNI para firmar'); return; }
      // Firmar todo
      PS.firmarDocumento(me.id, 'kit-alta', {
        completado: true,
        firma, dni,
        dispositivo: 'móvil empleado',
        aceptados: wizardData.aceptados,
        campos: wizardData.campos
      });
      document.getElementById('kitAltaModal').classList.remove('open');
      toast('Kit Alta firmado correctamente ✓');
      renderDocsHeader();
      renderDocsLists();
      return;
    }

    if (wizardStep < steps.length - 1) { wizardStep++; wizardRender(); }
  };

  function openKitAltaWizard() {
    wizardStep = 0;
    wizardData = { aceptados: {}, campos: {} };
    wizardRender();
    document.getElementById('kitAltaModal').classList.add('open');
  }

  function openKitAltaView() {
    const f = misFirmas()['kit-alta'];
    if (!f) return;
    document.getElementById('docViewTitle').textContent = 'Kit Alta Empresa · firmado';
    document.getElementById('docViewSub').textContent = `Firmado por ${f.firma} · DNI ${f.dni} · ${new Date(f.fecha).toLocaleString('es-ES')} · ${f.dispositivo}`;
    document.getElementById('docViewBody').innerHTML = `
      <div class="doc-signed-list">
        ${PS.kitAltaSubdocs.map(sub => `
          <div class="doc-signed-item">
            <svg class="ic ic-16" style="color:${f.aceptados[sub.id]?'#059669':'#94A3B8'};">
              <use href="#${f.aceptados[sub.id]?'ic-check-circle':'ic-x'}"/>
            </svg>
            <div>
              <div class="doc-signed-title">${sub.titulo}</div>
              <div class="doc-signed-sub">${sub.norma || 'Consentimiento opcional'}</div>
            </div>
          </div>
        `).join('')}
      </div>
      ${f.campos?.emailPersonal ? `<div class="doc-signed-meta"><b>Email:</b> ${f.campos.emailPersonal} · <b>Tel:</b> ${f.campos.telefonoPersonal}</div>` : ''}
    `;
    document.getElementById('docViewActions').innerHTML = `<button class="btn btn-outline" onclick="closeDocView()">Cerrar</button>`;
    document.getElementById('docViewModal').classList.add('open');
  }

  function openJornadaSign(d) {
    const hr = horasMesRegla();
    document.getElementById('docViewTitle').textContent = d.titulo;
    document.getElementById('docViewSub').textContent = 'Firma obligatoria antes del cierre del mes';
    document.getElementById('docViewBody').innerHTML = `
      <div class="jornada-summary">
        <div class="jornada-row">
          <span>Horas ordinarias (40h/sem · ${hr.objMes}h/mes)</span>
          <b>${hr.ordinarias}h</b>
        </div>
        ${hr.mostrarExtras ? `
          <div class="jornada-row">
            <span>Horas complementarias voluntarias</span>
            <b>${hr.extras}h</b>
          </div>` : `
          <div class="jornada-note">No se registran horas extra porque has completado tus 40h/semana. Solo aparecerán si tu jornada semanal ha sido menor de 40 horas.</div>`}
        <div class="jornada-row total">
          <span>Total del mes</span>
          <b>${hr.ordinarias + hr.extras}h</b>
        </div>
      </div>
      <div class="field mt-3">
        <label>Firma (nombre completo)</label>
        <input type="text" id="jornada-firma" placeholder="${me.nombre}" />
      </div>
      <label class="wizard-accept-line mt-2">
        <input type="checkbox" id="jornada-accept" />
        <span>Confirmo que los datos del registro de jornada son correctos y firmo el documento mensual.</span>
      </label>
    `;
    document.getElementById('docViewActions').innerHTML = `
      <button class="btn btn-outline" onclick="closeDocView()">Cancelar</button>
      <button class="btn btn-primary" onclick="submitJornada('${d.id}')">
        <svg class="ic ic-16"><use href="#ic-pen"/></svg>
        Firmar jornada
      </button>
    `;
    document.getElementById('docViewModal').classList.add('open');
  }

  window.submitJornada = function (docId) {
    const firma = document.getElementById('jornada-firma')?.value.trim();
    const accept = document.getElementById('jornada-accept')?.checked;
    if (!firma || !accept) { toast('Firma y marca la casilla para continuar'); return; }
    PS.firmarDocumento(me.id, docId, { firma, dispositivo: 'móvil empleado' });
    closeDocView();
    toast('Jornada mensual firmada ✓');
    renderDocsHeader();
    renderDocsLists();
  };

  window.closeDocView = () => document.getElementById('docViewModal').classList.remove('open');
  window.openDocView = openJornadaSign;

  // Render inicial de docs
  renderDocsHeader();
  renderDocsLists();

  // Al primer login (o si aún no ha firmado kit-alta): mostrar wizard bloqueante
  if (!PS.haFirmadoKitAlta(me.id)) {
    setTimeout(() => openKitAltaWizard(), 700);
  }

  /* ---------- Logout ---------- */
  window.logout = function () {
    PS.clearSession();
    window.location.href = 'index.html';
  };
  document.getElementById('logoutBtn').addEventListener('click', logout);
})();
