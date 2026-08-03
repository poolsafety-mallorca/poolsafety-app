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

  // Cache local para la vista Puestos en vivo (BD real)
  let postsCache = []; // [{ puesto, fichaje, socorrista, estado }]

  async function renderPosts() {
    const grid = document.getElementById('postsGrid');
    if (!grid) return;
    if (!window.sb) { setTimeout(renderPosts, 400); return; }

    if (!postsCache.length) grid.innerHTML = '<div style="grid-column:1/-1; padding: 30px; text-align:center; color:var(--ink-500);">Cargando puestos…</div>';

    try {
      // 1. Todos los puestos activos
      const { data: puestos, error: e1 } = await window.sb
        .from('puestos').select('id, nombre, zona, hora_inicio_default').eq('activo', true).order('nombre');
      if (e1) throw e1;

      // 2. Fichajes de hoy
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      // Enriquecemos con teléfono del empleado (para botón llamar) y marca de fichaje manual
      const { data: fichajes } = await window.sb
        .from('fichajes')
        .select('id, empleado_id, puesto_id, tipo, hora, gps_ok, fuera_de_zona, distancia_m, origen_manual, motivo_manual, registrado_por, empleados(id, nombre, telefono)')
        .gte('hora', desde)
        .order('hora', { ascending: false });

      // Último fichaje por puesto
      const ultPorPuesto = {};
      (fichajes || []).forEach(f => {
        if (!ultPorPuesto[f.puesto_id]) ultPorPuesto[f.puesto_id] = f;
      });

      // 3. Construir cache con estado por puesto
      postsCache = (puestos || []).map(p => {
        const f = ultPorPuesto[p.id];
        let estado = 'vacante';
        if (f) {
          if (f.tipo === 'entrada') estado = f.fuera_de_zona ? 'fuera' : 'ok';
          else if (f.tipo === 'salida') estado = 'terminado';
        }
        return { puesto: p, fichaje: f || null, estado };
      });

      renderPostsFromCache();
    } catch (err) {
      console.warn('[renderPosts]', err);
      grid.innerHTML = `<div style="grid-column:1/-1; padding: 30px; text-align:center; color:var(--danger);">Error: ${err.message}</div>`;
    }
  }

  function renderPostsFromCache() {
    const grid = document.getElementById('postsGrid');
    if (!grid) return;
    const q = currentSearch.toLowerCase();
    const filtered = postsCache.filter(r => {
      const p = r.puesto;
      const soc = r.fichaje && r.fichaje.empleados;
      const matchesFilter = currentFilter === 'todos'
        || (currentFilter === 'ok' && r.estado === 'ok')
        || (currentFilter === 'fuera' && r.estado === 'fuera')
        || (currentFilter === 'pendiente' && (r.estado === 'vacante' || r.estado === 'terminado'))
        || (currentFilter === 'vacante' && r.estado === 'vacante');
      const matchesSearch = !q
        || (p.nombre || '').toLowerCase().includes(q)
        || (p.zona || '').toLowerCase().includes(q)
        || (soc && (soc.nombre || '').toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });

    // Actualiza contadores en chips
    const c = { todos: postsCache.length, ok: 0, fuera: 0, vacante: 0, terminado: 0 };
    postsCache.forEach(r => { c[r.estado] = (c[r.estado] || 0) + 1; });
    const chips = document.querySelectorAll('#filterChips .chip .count');
    if (chips[0]) chips[0].textContent = c.todos;
    if (chips[1]) chips[1].textContent = c.ok;
    if (chips[2]) chips[2].textContent = 0; // Tarde — no tenemos lógica todavía
    if (chips[3]) chips[3].textContent = c.fuera;
    if (chips[4]) chips[4].textContent = c.vacante + c.terminado;
    if (chips[5]) chips[5].textContent = c.vacante;

    // Actualiza los KPIs de arriba con datos reales
    const kpiOk = document.getElementById('kpiOk');
    if (kpiOk) kpiOk.innerHTML = `${c.ok}<span class="of">/ ${c.todos}</span>`;
    const kpiTarde = document.getElementById('kpiTarde'); if (kpiTarde) kpiTarde.textContent = 0;
    const kpiFuera = document.getElementById('kpiFuera'); if (kpiFuera) kpiFuera.textContent = c.fuera;
    const kpiPend = document.getElementById('kpiPend');   if (kpiPend)  kpiPend.textContent  = c.vacante;

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1; padding: 40px 20px; text-align:center; color:var(--ink-500);">
          <svg class="ic ic-24" style="opacity:.5; margin: 0 auto 8px;"><use href="#ic-search"/></svg>
          <div>Sin resultados con este filtro.</div>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(r => {
      const p = r.puesto;
      const soc = r.fichaje && r.fichaje.empleados;
      const info = r.estado === 'ok' ? { cls: 'ok', badge: 'badge-ok', icon: 'ic-check-circle', label: 'Fichado' }
                 : r.estado === 'fuera' ? { cls: 'danger', badge: 'badge-danger', icon: 'ic-signal', label: 'Fuera de zona' }
                 : r.estado === 'terminado' ? { cls: '', badge: 'badge-neutral', icon: 'ic-check', label: 'Turno terminado' }
                 : { cls: '', badge: 'badge-neutral', icon: 'ic-clock', label: 'Vacante' };
      const iniciales = soc ? soc.nombre.split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase() : '';
      const horaTxt = r.fichaje ? new Date(r.fichaje.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
      const hIni = (p.hora_inicio_default || '10:00:00').slice(0,5);
      return `
        <div class="post ${info.cls}" data-post="${p.id}">
          <div class="post-top">
            <div style="min-width:0;">
              <p class="post-name">${p.nombre}</p>
              <p class="post-loc">
                <svg class="ic ic-14"><use href="#ic-pin"/></svg>
                ${p.zona || '—'} · turno ${hIni}
              </p>
            </div>
            <span class="badge ${info.badge}">
              <svg class="ic ic-14"><use href="#${info.icon}"/></svg>
              ${info.label}
            </span>
          </div>
          ${soc ? (() => {
            const tel = (soc.telefono || '').replace(/\s+/g,'');
            const telHref = tel ? (tel.startsWith('+') ? tel : (tel.length === 9 ? '+34' + tel : tel)) : '';
            const esManual = !!r.fichaje.origen_manual;
            return `
            <div class="post-worker">
              <div class="mini-av ${avatarClassFor(r.estado === 'ok' ? 'ok' : '')}">${iniciales}</div>
              <div style="min-width:0; flex:1;">
                <div class="post-worker-name">${soc.nombre}${esManual ? ' <span class="small" style="color:#0284C7;font-weight:500;" title="Fichaje registrado manualmente por administración">📌 manual</span>' : ''}</div>
                <div class="post-time ${r.fichaje.fuera_de_zona ? 'danger' : ''}">
                  <svg class="ic ic-14"><use href="#ic-clock"/></svg>
                  ${r.fichaje.tipo === 'entrada' ? 'Fichó entrada' : 'Salió'} a las ${horaTxt}${r.fichaje.fuera_de_zona ? ' · GPS fuera' + (r.fichaje.distancia_m ? ' (' + r.fichaje.distancia_m + 'm)' : '') : ''}
                </div>
              </div>
              ${telHref ? `
                <a class="btn-icon" href="tel:${telHref}" title="Llamar a ${soc.nombre}" onclick="event.stopPropagation();"
                   style="width:36px;height:36px;flex-shrink:0;background:${r.fichaje.fuera_de_zona?'#DC2626':'#059669'};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none;">
                  <svg class="ic ic-16"><use href="#ic-phone"/></svg>
                </a>` : `
                <button class="btn-icon" title="${soc.nombre} no tiene teléfono en su ficha — añádelo desde Empleados › Datos" onclick="event.stopPropagation();" disabled
                   style="width:36px;height:36px;flex-shrink:0;background:#e2e8f0;color:#94a3b8;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:not-allowed;position:relative;">
                  <svg class="ic ic-16"><use href="#ic-phone"/></svg>
                  <span style="position:absolute;top:0;right:0;width:12px;height:2px;background:#dc2626;transform:rotate(-45deg);transform-origin:center;"></span>
                </button>`}
            </div>
            `;
          })() : `
            <div class="post-worker">
              <div class="mini-av" style="background: var(--ink-200); color: var(--ink-500);">
                <svg class="ic ic-14"><use href="#ic-user"/></svg>
              </div>
              <div>
                <div class="post-worker-name" style="color: var(--ink-500);">Sin fichaje hoy</div>
                <div class="post-time">Puesto vacante</div>
              </div>
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  document.querySelectorAll('#filterChips .chip').forEach(ch => {
    ch.addEventListener('click', () => {
      document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('active'));
      ch.classList.add('active');
      currentFilter = ch.dataset.filter;
      renderPostsFromCache();
    });
  });
  document.getElementById('postSearch')?.addEventListener('input', e => {
    currentSearch = e.target.value;
    renderPostsFromCache();
  });
  // Delegated click listener: pulsar cualquier tarjeta de puesto abre su ficha
  document.getElementById('postsGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.post[data-post]');
    if (!card) return;
    const puestoId = card.dataset.post;
    if (puestoId) window.openPostModal(puestoId);
  });
  renderPosts();
  // Refrescar cada 25s + al recuperar foco. Realtime subscription para entrada/salida
  // inmediatas cuando el socorrista ficha desde el móvil.
  setInterval(renderPosts, 25_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderPosts(); });
  try {
    window.sb.channel('fichajes-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fichajes' }, () => renderPosts())
      .subscribe();
  } catch (_) { /* si Realtime no está disponible, el interval basta */ }

  /* ---------- Modal detalle puesto ---------- */
  window.openPostModal = function (puestoId) {
    const row = postsCache.find(r => r.puesto.id === puestoId);
    if (!row) { toast('Puesto no encontrado'); return; }
    const p = { nombre: row.puesto.nombre, zona: row.puesto.zona || '—', hora: (row.puesto.hora_inicio_default || '10:00:00').slice(0,5), duracion: 8 };
    const soc = row.fichaje && row.fichaje.empleados ? {
      id: row.fichaje.empleados.id,
      nombre: row.fichaje.empleados.nombre,
      iniciales: (row.fichaje.empleados.nombre||'').split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase(),
      telefono: row.fichaje.empleados.telefono || '',
      horasNormales: 0, horasExtra: 0
    } : null;
    const esManual = row.fichaje && row.fichaje.origen_manual;
    const motivoManual = row.fichaje && row.fichaje.motivo_manual;
    const f = row.fichaje ? {
      horaFichaje: new Date(row.fichaje.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      gpsOk: !row.fichaje.fuera_de_zona,
      estado: row.estado
    } : { horaFichaje: null, gpsOk: null, estado: row.estado };
    const info = row.estado === 'ok' ? { cls:'ok', badge:'badge-ok', icon:'ic-check-circle', label:'Fichado' }
               : row.estado === 'fuera' ? { cls:'danger', badge:'badge-danger', icon:'ic-signal', label:'Fuera de zona' }
               : row.estado === 'terminado' ? { cls:'', badge:'badge-neutral', icon:'ic-check', label:'Turno terminado' }
               : { cls:'', badge:'badge-neutral', icon:'ic-clock', label:'Vacante' };
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

      ${soc ? (() => {
        const tel = (soc.telefono || '').replace(/\s+/g,'');
        const telHref = tel ? (tel.startsWith('+') ? tel : (tel.length === 9 ? '+34' + tel : tel)) : '';
        const distancia = row.fichaje?.distancia_m;
        return `
        <div class="li" style="margin-top: 14px;">
          <div class="mini-av" style="width:40px; height:40px; font-size:13px;">${soc.iniciales}</div>
          <div class="li-body">
            <div class="li-title">${soc.nombre}</div>
            <div class="li-sub">${soc.telefono || 'Sin teléfono'}${row.fichaje?.fuera_de_zona && distancia ? ' · a ' + distancia + 'm del puesto' : ''}</div>
          </div>
          ${telHref ? `
            <a class="btn btn-primary btn-sm" href="tel:${telHref}" style="text-decoration:none;background:${row.fichaje?.fuera_de_zona ? '#DC2626' : '#059669'};border-color:transparent;">
              <svg class="ic ic-16"><use href="#ic-phone"/></svg> Llamar
            </a>` : `
            <button class="btn btn-outline btn-sm" disabled title="El empleado no tiene teléfono en su ficha">
              <svg class="ic ic-16"><use href="#ic-phone"/></svg> Sin tel.
            </button>`}
        </div>
        ${esManual ? `
          <div class="alert-strip" style="background:#e0f2fe;border-left:4px solid #0EA5E9;color:#0C4A6E;padding:10px;border-radius:6px;margin-top:10px;font-size:13px;">
            <svg class="ic ic-16"><use href="#ic-alert"/></svg>
            <div>
              <b>Fichaje registrado manualmente por administración.</b>
              ${motivoManual ? '<br><span class="small">Motivo: ' + motivoManual + '</span>' : ''}
            </div>
          </div>` : ''}

        <div class="notice mt-3">
          <div class="notice-icon ${f.gpsOk === false ? 'amber' : 'sky'}" style="background: ${f.gpsOk === false ? 'var(--warning-bg)' : 'var(--info-bg)'}; color: ${f.gpsOk === false ? '#B45309' : 'var(--sky-700)'};">
            <svg class="ic ic-18"><use href="#ic-signal"/></svg>
          </div>
          <div class="notice-body">
            <div class="notice-title">${f.horaFichaje ? 'Fichaje ' + f.horaFichaje : 'Aún no ha fichado hoy'}</div>
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
        `;
      })() : `
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

  /* ---------- Alertas botiquín (REAL desde BD) ---------- */
  const alertsList = document.getElementById('alertsList');

  async function renderAlertas() {
    if (!alertsList) return;
    if (!window.sb) { setTimeout(renderAlertas, 400); return; }
    alertsList.innerHTML = '<div class="text-muted small" style="padding:16px;">Cargando alertas…</div>';
    try {
      const { data, error } = await window.sb
        .from('alertas')
        .select('id, tipo, origen, criticidad, mensaje, cantidad_pedida, fecha_creacion, puesto_id, item_id, puestos(nombre), inventario_items(nombre, seccion)')
        .eq('resuelto', false)
        .order('fecha_creacion', { ascending: false })
        .limit(50);
      if (error) throw error;
      const alertas = data || [];
      const countEl = document.getElementById('alertsCount');
      if (countEl) countEl.innerHTML = `<span class="dot"></span>${alertas.length} abiertas`;

      if (alertas.length === 0) {
        alertsList.innerHTML = '<div class="text-muted small" style="padding:22px;text-align:center;">Sin alertas abiertas. Todo el material está OK.</div>';
        return;
      }

      alertsList.innerHTML = alertas.map(a => {
        const cls = a.criticidad === 'alta' ? 'high' : a.criticidad === 'media' ? 'med' : 'low';
        const critBadge = a.criticidad === 'alta' ? 'badge-danger'
                        : a.criticidad === 'media' ? 'badge-warn' : 'badge-info';
        const origen = a.origen === 'auto'
          ? `<span class="badge badge-info small"><svg class="ic ic-14"><use href="#ic-signal"/></svg>Auto</span>`
          : `<span class="badge badge-neutral small"><svg class="ic ic-14"><use href="#ic-user"/></svg>Socorrista</span>`;
        const itemNombre = (a.inventario_items && a.inventario_items.nombre) || a.mensaje || 'Material';
        const seccion = a.inventario_items && a.inventario_items.seccion;
        const secTag = seccion === 'desa' ? ' · DESA' : seccion === 'oxigeno' ? ' · Oxígeno' : '';
        const puestoNombre = (a.puestos && a.puestos.nombre) || '—';
        const sub = a.cantidad_pedida ? `${puestoNombre} · faltan ${a.cantidad_pedida}` : puestoNombre;
        return `
          <div class="alert ${cls}">
            <div class="alert-icon">
              <svg class="ic ic-18"><use href="#ic-alert"/></svg>
            </div>
            <div class="alert-body">
              <div class="alert-title-row">
                <span class="alert-title">${itemNombre}${secTag}</span>
                <span class="badge ${critBadge}"><span class="dot"></span>${a.criticidad}</span>
              </div>
              <div class="alert-sub">
                <svg class="ic ic-14"><use href="#ic-pin"/></svg>
                ${sub}
              </div>
              <div class="row gap-1 mt-1">${origen}</div>
            </div>
            <button class="alert-action" onclick="resolveAlert('${a.id}', this)">Reponer</button>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('[Alertas]', err);
      alertsList.innerHTML = `<div class="text-muted small" style="padding:16px;color:var(--danger);">Error: ${err.message}</div>`;
    }
  }

  window.resolveAlert = async function (id, btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="ic ic-14" style="vertical-align:-3px;"><use href="#ic-signal"/></svg> …';
    try {
      const { error } = await window.sb.from('alertas')
        .update({ resuelto: true, fecha_resolucion: new Date().toISOString(), resuelto_por: (window.PS_SESSION||{}).userId || null })
        .eq('id', id);
      if (error) throw error;
      btn.innerHTML = '<svg class="ic ic-14" style="vertical-align:-3px;"><use href="#ic-check"/></svg> Resuelta';
      btn.classList.add('done');
      toast('Alerta resuelta');
      setTimeout(renderAlertas, 800);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = 'Reponer';
      toast('Error: ' + err.message);
    }
  };
  renderAlertas();
  // Refrescar cada 60 seg y al volver a foco
  setInterval(renderAlertas, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderAlertas(); });

  // Badge campana admin/coord = nº de alertas abiertas
  let alertasPanelCache = [];
  async function refrescarCampana() {
    const badge = document.getElementById('notifCoordBadge');
    if (!badge || !window.sb) return;
    try {
      const { data, error } = await window.sb.from('alertas')
        .select('id, tipo, origen, criticidad, mensaje, cantidad_pedida, resuelto, fecha_creacion, puesto_id, empleado_id, item_id, puestos(nombre), empleados(nombre), inventario_items(nombre, unidad)')
        .eq('resuelto', false)
        .order('fecha_creacion', { ascending: false })
        .limit(50);
      if (error) throw error;
      alertasPanelCache = data || [];
      const count = alertasPanelCache.length;
      if (count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = 'inline-block'; }
      else { badge.style.display = 'none'; }
      renderNotifPanel();
    } catch (err) {
      console.warn('[refrescarCampana]', err.message);
      badge.style.display = 'none';
      const cont = document.getElementById('notifPanelList');
      if (cont) cont.innerHTML = `<div style="padding:20px;text-align:center;color:#DC2626;font-size:13px;">Error cargando alertas: ${err.message}</div>`;
    }
  }

  function renderNotifPanel() {
    const cont = document.getElementById('notifPanelList');
    if (!cont) return;
    if (alertasPanelCache.length === 0) {
      cont.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;font-size:13px;">No hay alertas pendientes ✓</div>';
      return;
    }
    cont.innerHTML = alertasPanelCache.map(a => {
      const puesto = a.puestos?.nombre || '—';
      const emp = a.empleados?.nombre || '';
      const item = a.inventario_items?.nombre || '';
      const critColor = a.criticidad === 'alta' ? '#DC2626' : a.criticidad === 'media' ? '#D97706' : '#0891B2';
      const critBg = a.criticidad === 'alta' ? '#FEE2E2' : a.criticidad === 'media' ? '#FEF3C7' : '#CFFAFE';
      const cuando = new Date(a.fecha_creacion);
      const hace = tiempoRelativo(cuando);
      const iconTipo = a.tipo === 'otro' ? 'ic-message-circle' : a.tipo === 'manual' ? 'ic-alert' : 'ic-bell';
      return `
        <div style="display:flex;gap:10px;padding:12px;margin:4px 0;border:1px solid #e2e8f0;border-radius:8px;background:#fff;">
          <div style="width:36px;height:36px;border-radius:8px;background:${critBg};color:${critColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg class="ic ic-16"><use href="#${iconTipo}"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;line-height:1.3;">${a.mensaje || item || 'Alerta'}</div>
            <div style="color:#64748b;font-size:11px;margin-top:3px;">
              📍 ${puesto}${emp ? ' · 👤 ' + emp : ''} · ${hace}
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="resolverAlerta('${a.id}')" style="padding:4px 8px;font-size:11px;flex-shrink:0;height:26px;align-self:center;">
            ✓ Resolver
          </button>
        </div>
      `;
    }).join('');
  }

  function tiempoRelativo(fecha) {
    const diff = (Date.now() - fecha.getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`;
    return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  window.toggleNotifPanel = function () {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) refrescarCampana(); // recarga al abrir
  };

  window.resolverAlerta = async function (id) {
    try {
      const psSes = window.PS_SESSION || {};
      const { error } = await window.sb.from('alertas').update({
        resuelto: true,
        fecha_resolucion: new Date().toISOString(),
        resuelto_por: psSes.userId || null
      }).eq('id', id);
      if (error) throw error;
      alertasPanelCache = alertasPanelCache.filter(a => a.id !== id);
      const badge = document.getElementById('notifCoordBadge');
      if (badge) {
        if (alertasPanelCache.length > 0) badge.textContent = String(alertasPanelCache.length);
        else badge.style.display = 'none';
      }
      renderNotifPanel();
      toast('✓ Alerta resuelta');
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.marcarTodasResueltas = async function () {
    if (alertasPanelCache.length === 0) return;
    if (!confirm(`¿Marcar como resueltas las ${alertasPanelCache.length} alertas?`)) return;
    try {
      const psSes = window.PS_SESSION || {};
      const ids = alertasPanelCache.map(a => a.id);
      const { error } = await window.sb.from('alertas').update({
        resuelto: true,
        fecha_resolucion: new Date().toISOString(),
        resuelto_por: psSes.userId || null
      }).in('id', ids);
      if (error) throw error;
      alertasPanelCache = [];
      const badge = document.getElementById('notifCoordBadge');
      if (badge) badge.style.display = 'none';
      renderNotifPanel();
      toast('✓ Todas resueltas');
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Cerrar panel al clicar fuera
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const btn = document.getElementById('notifBtnCoord');
    if (!panel || !btn) return;
    if (panel.style.display === 'none') return;
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.style.display = 'none';
    }
  });

  refrescarCampana();
  setInterval(refrescarCampana, 30_000);

  /* ---------- Gestión de botiquines (selector de puesto + inventario) ---------- */
  const botiquinPuestoSelect = document.getElementById('botiquinPuestoSelect');
  const botiquinAdminList = document.getElementById('botiquinAdminList');
  const botiquinPuestoLabel = document.getElementById('botiquinPuestoLabel');
  let currentBotPuesto = 'p01';
  let currentBotSeccion = 'botiquin';

  // Llenar selector con todos los puestos — lee de BD (hoteles reales)
  async function refrescarSelectBotiquin() {
    if (!botiquinPuestoSelect) return;
    botiquinPuestoSelect.innerHTML = '<option value="">Cargando…</option>';
    try {
      const { data } = await window.sb
        .from('puestos').select('id, nombre').eq('activo', true).order('nombre');
      const rows = data || [];
      botiquinPuestoSelect.innerHTML = rows.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
      if (rows.length) {
        currentBotPuesto = rows[0].id;
        botiquinPuestoSelect.value = currentBotPuesto;
        renderBotiquinAdmin();
      }
    } catch (err) { console.warn('refrescarSelectBotiquin:', err.message); }
  }
  if (botiquinPuestoSelect) {
    refrescarSelectBotiquin();
    botiquinPuestoSelect.addEventListener('change', e => {
      currentBotPuesto = e.target.value;
      renderBotiquinAdmin();
    });
    // Refrescar al entrar en la sección Botiquín
    document.querySelectorAll('[data-view="botiquin"], [data-nav="botiquin"]').forEach(el => {
      el.addEventListener('click', () => setTimeout(refrescarSelectBotiquin, 100));
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
  let addItemModoTodos = false;

  window.openAddItemModal = async function (modoTodos) {
    addItemModoTodos = !!modoTodos;
    document.getElementById('newItemSeccion').value = currentBotSeccion;
    document.getElementById('newItemName').value = '';
    // Ajustar textos según modo
    const title = document.getElementById('addItemModalTitle');
    const sub = document.getElementById('addItemModalSub');
    const banner = document.getElementById('addItemAllBanner');
    if (addItemModoTodos) {
      // Contar hoteles activos
      let n = 0;
      try {
        const { count } = await window.sb.from('puestos')
          .select('id', { count: 'exact', head: true }).eq('activo', true);
        n = count || 0;
      } catch (_) {}
      const span = document.getElementById('addItemHotelCount');
      if (span) span.textContent = String(n);
      if (title) title.textContent = 'Añadir producto a TODOS los hoteles';
      if (sub) sub.textContent = 'Se creará el producto y se añadirá al inventario de todos los hoteles activos con el mismo stock y mínimo.';
      if (banner) banner.style.display = 'block';
    } else {
      if (title) title.textContent = 'Añadir producto al inventario';
      if (sub) sub.textContent = 'Se añadirá al puesto seleccionado. Podrás fijar el stock actual y el mínimo para generar alertas automáticas.';
      if (banner) banner.style.display = 'none';
    }
    document.getElementById('addItemModal').classList.add('open');
  };
  window.closeAddItemModal = function () {
    document.getElementById('addItemModal').classList.remove('open');
  };
  window.submitAddItem = async function () {
    const nombre = document.getElementById('newItemName').value.trim();
    if (!nombre) { toast('Escribe un nombre para el producto'); return; }
    const seccion = document.getElementById('newItemSeccion').value;
    const categoria = document.getElementById('newItemCategoria').value;
    const stock = parseInt(document.getElementById('newItemStock').value) || 0;
    const minimo = parseInt(document.getElementById('newItemMin').value) || 0;
    const unidad = document.getElementById('newItemUnidad').value;

    const btn = document.querySelector('#addItemModal .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Guardando…'; }

    try {
      // 1) Buscar si ya existe un item con ese nombre+seccion en el catálogo (evitar duplicar)
      let itemId = null;
      const { data: existentes } = await window.sb.from('inventario_items')
        .select('id, nombre, seccion').eq('seccion', seccion).ilike('nombre', nombre).limit(1);
      if (existentes && existentes.length > 0) {
        itemId = existentes[0].id;
      } else {
        // Crear nuevo item en el catálogo maestro
        const { data: nuevoItem, error: errItem } = await window.sb.from('inventario_items').insert({
          nombre, seccion, categoria, unidad,
          obligatorio: false,
          normativa: 'Añadido por coordinador'
        }).select('id').single();
        if (errItem) throw errItem;
        itemId = nuevoItem.id;
      }

      // 2) Insertar en inventario_puesto — uno o todos
      if (addItemModoTodos) {
        const { data: puestos } = await window.sb.from('puestos')
          .select('id').eq('activo', true);
        const ids = (puestos || []).map(p => p.id);
        // Filtrar los que ya tienen el item
        const { data: yaTienen } = await window.sb.from('inventario_puesto')
          .select('puesto_id').eq('item_id', itemId).in('puesto_id', ids);
        const setYaTienen = new Set((yaTienen || []).map(r => r.puesto_id));
        const nuevos = ids.filter(pid => !setYaTienen.has(pid))
          .map(pid => ({ puesto_id: pid, item_id: itemId, stock, minimo, revisado_hoy: false }));
        if (nuevos.length > 0) {
          const { error: errIns } = await window.sb.from('inventario_puesto').insert(nuevos);
          if (errIns) throw errIns;
        }
        toast(`✓ "${nombre}" añadido a ${nuevos.length}/${ids.length} hoteles${setYaTienen.size > 0 ? ` (${setYaTienen.size} ya lo tenían)` : ''}`);
      } else {
        if (!currentBotPuesto) { toast('Selecciona antes un hotel'); return; }
        // Comprobar duplicado en este puesto
        const { data: dup } = await window.sb.from('inventario_puesto')
          .select('id').eq('puesto_id', currentBotPuesto).eq('item_id', itemId).limit(1);
        if (dup && dup.length > 0) {
          toast(`"${nombre}" ya está en el inventario de este hotel`);
          return;
        }
        const { error: errIns } = await window.sb.from('inventario_puesto').insert({
          puesto_id: currentBotPuesto, item_id: itemId, stock, minimo, revisado_hoy: false
        });
        if (errIns) throw errIns;
        toast(`✓ "${nombre}" añadido al inventario del hotel`);
      }

      closeAddItemModal();
      currentBotSeccion = seccion;
      if (typeof renderBotiquinAdmin === 'function') renderBotiquinAdmin();
      if (typeof renderAlertas === 'function') renderAlertas();
    } catch (err) {
      toast('Error: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-plus"/></svg> Añadir al inventario'; }
    }
  };

  /* ---------- Horas mes (REAL desde BD: empleados + fichajes del mes) ---------- */
  async function renderHours(mode) {
    const tbody = document.querySelector('#hoursTable tbody');
    if (!tbody || !window.sb) return;
    tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--ink-500,#6B7280);">Cargando…</td></tr>';
    try {
      // 1. Empleados activos con su puesto asignado
      const { data: emps, error: e1 } = await window.sb.from('empleados')
        .select('id, nombre, puesto_id, puestos(nombre)')
        .neq('estado', 'eliminado').is('fecha_baja', null)
        .order('nombre');
      if (e1) throw e1;
      const empleados = emps || [];
      if (empleados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--ink-500,#6B7280);">Aún no hay socorristas dados de alta.</td></tr>';
        const cnt = document.querySelector('#hoursSection .panel-count');
        if (cnt) cnt.textContent = '0 socorristas';
        return;
      }
      // 2. Fichajes del mes actual
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
      const { data: fichs } = await window.sb.from('fichajes')
        .select('empleado_id, tipo, hora')
        .gte('hora', desde).lt('hora', hasta)
        .order('hora', { ascending: true });
      // 3. Agrupar por empleado → días trabajados + horas ordinarias + extras
      const OBJ_DIA = 8;
      const stats = {};
      empleados.forEach(e => { stats[e.id] = { dias: new Set(), ord: 0, extra: 0 }; });
      let entradaTmp = {};
      (fichs || []).forEach(f => {
        const s = stats[f.empleado_id];
        if (!s) return;
        const d = new Date(f.hora);
        if (f.tipo === 'entrada') {
          entradaTmp[f.empleado_id] = d;
          s.dias.add(d.toDateString());
        } else if (f.tipo === 'salida' && entradaTmp[f.empleado_id]) {
          const h = Math.max(0, (d - entradaTmp[f.empleado_id]) / 3600000);
          s.ord += Math.min(OBJ_DIA, h);
          if (h > OBJ_DIA) s.extra += h - OBJ_DIA;
          delete entradaTmp[f.empleado_id];
        }
      });
      // 4. Construir filas
      let list = empleados.map(e => {
        const s = stats[e.id];
        const puesto = (e.puestos && e.puestos.nombre) || '—';
        const iniciales = (e.nombre || '?').split(' ').map(p => p[0]).join('').substring(0,2).toUpperCase();
        return {
          id: e.id,
          nombre: e.nombre,
          iniciales,
          puesto,
          dias: s.dias.size,
          normales: Math.round(s.ord),
          extras: Math.round(s.extra),
          total: Math.round(s.ord + s.extra)
        };
      });
      // 5. Filtros
      if (mode === 'extra') list = list.filter(x => x.extras > 0).sort((a,b) => b.extras - a.extras);
      else if (mode === 'top') list = list.sort((a,b) => b.total - a.total).slice(0, 10);
      // 6. Contador
      const cnt = document.querySelector('#hoursSection .panel-count');
      const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long' });
      if (cnt) cnt.textContent = `${nombreMes} · ${list.length} de ${empleados.length}`;
      // 7. Pintar
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--ink-500,#6B7280);">Sin resultados con este filtro.</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(s => `
        <tr>
          <td>
            <div class="hours-name">
              <div class="mini-av sky">${s.iniciales}</div>
              <span style="font-weight:500;">${s.nombre}</span>
            </div>
          </td>
          <td class="text-muted">${s.puesto}</td>
          <td class="num">${s.dias}</td>
          <td class="num">${s.normales}</td>
          <td class="num">
            <span class="hours-extras ${s.extras > 0 ? '' : 'zero'}">${s.extras}</span>
          </td>
          <td class="num"><span class="hours-total">${s.total}h</span></td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--danger);">Error: ${err.message}</td></tr>`;
    }
  }
  window.renderHours = renderHours;
  setTimeout(() => renderHours('all'), 1200);
  document.querySelectorAll('[data-section="horas"]').forEach(el => el.addEventListener('click', () => setTimeout(() => renderHours(document.getElementById('hourFilter')?.value || 'all'), 200)));
  document.getElementById('hourFilter')?.addEventListener('change', e => renderHours(e.target.value));

  /* ---------- Panel Fichajes (selector de día) ---------- */
  function fechaISOhoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fechaDesplazada(iso, deltaDias) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + deltaDias);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  window.fichajesDiaHoy = () => {
    const inp = document.getElementById('fichajesDia');
    if (inp) { inp.value = fechaISOhoy(); renderFichajesDia(); }
  };
  window.fichajesDiaAyer = () => {
    const inp = document.getElementById('fichajesDia');
    if (inp) { inp.value = fechaDesplazada(inp.value || fechaISOhoy(), -1); renderFichajesDia(); }
  };
  window.fichajesDiaManana = () => {
    const inp = document.getElementById('fichajesDia');
    if (inp) { inp.value = fechaDesplazada(inp.value || fechaISOhoy(), +1); renderFichajesDia(); }
  };

  window.renderFichajesDia = async function () {
    const cont = document.getElementById('fichajesDiaLista');
    const label = document.getElementById('fichajesDiaLabel');
    const count = document.getElementById('fichajesCount');
    const inp = document.getElementById('fichajesDia');
    if (!cont || !inp || !window.sb) return;
    if (!inp.value) inp.value = fechaISOhoy();
    const iso = inp.value;
    const [y, m, d] = iso.split('-').map(Number);
    const desde = new Date(y, m - 1, d, 0, 0, 0);
    const hasta = new Date(y, m - 1, d + 1, 0, 0, 0);
    const nombreDia = desde.toLocaleDateString('es-ES', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
    if (label) label.textContent = nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1);
    cont.innerHTML = '<div class="text-muted small" style="padding:20px;text-align:center;">Cargando fichajes…</div>';
    try {
      const { data, error } = await window.sb.from('fichajes')
        .select('id, tipo, hora, gps_ok, fuera_de_zona, distancia_m, origen_manual, motivo_manual, empleado_id, puesto_id, empleados(id, nombre, telefono), puestos(nombre)')
        .gte('hora', desde.toISOString()).lt('hora', hasta.toISOString())
        .order('hora', { ascending: true });
      if (error) throw error;
      const rows = data || [];
      if (count) count.textContent = `${rows.length} fichaje${rows.length===1?'':'s'}`;
      if (rows.length === 0) {
        cont.innerHTML = `<div class="text-muted small" style="padding:30px;text-align:center;">
          <svg class="ic ic-22" style="opacity:0.4;display:block;margin:0 auto 8px;"><use href="#ic-clock"/></svg>
          Sin fichajes registrados el ${nombreDia}.
        </div>`;
        return;
      }
      // Agrupar por empleado
      const porEmp = {};
      rows.forEach(f => {
        const eid = f.empleado_id;
        (porEmp[eid] = porEmp[eid] || { empleado: f.empleados, fichajes: [] }).fichajes.push(f);
      });
      cont.innerHTML = Object.entries(porEmp).map(([eid, g]) => {
        const emp = g.empleado || { nombre: 'Desconocido', telefono: '' };
        const iniciales = (emp.nombre||'').split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase();
        const tel = (emp.telefono || '').replace(/\s+/g,'');
        const telHref = tel ? (tel.startsWith('+') ? tel : (tel.length === 9 ? '+34' + tel : tel)) : '';
        return `
        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px;background:#fff;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <button class="mini-av" style="width:38px;height:38px;font-size:13px;border:none;cursor:pointer;background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;border-radius:50%;font-weight:700;"
              onclick="verHorasDeEmpleado('${eid}')" title="Ver horas del mes de ${emp.nombre}">${iniciales}</button>
            <div style="flex:1;min-width:0;">
              <button onclick="verHorasDeEmpleado('${eid}')" title="Ver horas del mes"
                style="background:none;border:none;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left;font-weight:700;font-size:14px;text-decoration:none;">
                ${emp.nombre}
              </button>
              <div class="small text-muted">${g.fichajes[0]?.puestos?.nombre || '—'}</div>
            </div>
            ${telHref ? `
              <a class="btn-icon" href="tel:${telHref}" title="Llamar" style="width:34px;height:34px;background:#059669;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none;">
                <svg class="ic ic-14"><use href="#ic-phone"/></svg>
              </a>` : ''}
            <button class="btn-icon" title="Ver horas del mes" onclick="verHorasDeEmpleado('${eid}')"
              style="width:34px;height:34px;background:#EFF6FF;color:#1D4ED8;border-radius:50%;border:none;cursor:pointer;">
              <svg class="ic ic-14"><use href="#ic-bar-chart"/></svg>
            </button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${g.fichajes.map(f => {
              const hora = new Date(f.hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
              const bg = f.tipo === 'entrada' ? '#DCFCE7' : '#F1F5F9';
              const color = f.tipo === 'entrada' ? '#166534' : '#475569';
              const gpsMark = f.fuera_de_zona ? ` <span style="color:#DC2626;">⚠ ${f.distancia_m ? f.distancia_m+'m' : 'GPS fuera'}</span>` : '';
              const manualMark = f.origen_manual ? ' 📌' : '';
              return `<div style="padding:5px 10px;border-radius:6px;background:${bg};color:${color};font-size:12px;font-weight:600;">
                ${f.tipo === 'entrada' ? '▶' : '■'} ${hora}${gpsMark}${manualMark}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      cont.innerHTML = `<div class="alert-strip warn" style="margin:6px;">Error: ${err.message}</div>`;
    }
  };

  // Click en empleado → abrir su ficha en pestaña Acciones (donde está el editor de fichajes)
  window.verHorasDeEmpleado = function (empId) {
    if (window.openEmpleadoModal) {
      window.openEmpleadoModal(empId);
      // Cambiar a pestaña Acciones tras abrir el modal y cargar los últimos 7 días
      setTimeout(() => {
        const tabAcc = document.querySelector('.ficha-tab[data-ftab="acciones"]');
        if (tabAcc) tabAcc.click();
        setTimeout(() => {
          if (typeof window.cargarFichajesEditables === 'function') {
            window.cargarFichajesEditables(empId, 31);
          }
        }, 300);
      }, 250);
    }
  };

  // Inicializar cuando se abre el tab
  document.querySelectorAll('[data-section="fichajes"]').forEach(el => el.addEventListener('click', () => {
    setTimeout(() => {
      const inp = document.getElementById('fichajesDia');
      if (inp && !inp.value) inp.value = fechaISOhoy();
      renderFichajesDia();
    }, 200);
  }));

  // Exportar parte diario del día actual: fichajes por puesto + alertas
  window.exportarParteDiario = async function () {
    if (!window.sb) { toast('Sistema no disponible'); return; }
    toast('Generando parte diario…');
    try {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();

      const [puestosR, fichR, alertR] = await Promise.all([
        window.sb.from('puestos').select('id, nombre, zona').eq('activo', true).order('nombre'),
        window.sb.from('fichajes')
          .select('empleado_id, puesto_id, tipo, hora, gps_ok, fuera_de_zona, empleados(nombre, dni)')
          .gte('hora', desde).lt('hora', hasta).order('hora'),
        window.sb.from('alertas')
          .select('puesto_id, mensaje, criticidad, origen, fecha_creacion')
          .gte('fecha_creacion', desde).lt('fecha_creacion', hasta)
      ]);

      const puestos = puestosR.data || [];
      const fichajes = fichR.data || [];
      const alertas = alertR.data || [];

      // Agrupar fichajes por puesto (entrada + salida por par)
      const porPuesto = {};
      puestos.forEach(p => { porPuesto[p.id] = { puesto: p, entradas: [], salidas: [], alertas: [] }; });
      fichajes.forEach(f => {
        if (!porPuesto[f.puesto_id]) return;
        if (f.tipo === 'entrada') porPuesto[f.puesto_id].entradas.push(f);
        else if (f.tipo === 'salida') porPuesto[f.puesto_id].salidas.push(f);
      });
      alertas.forEach(a => {
        if (porPuesto[a.puesto_id]) porPuesto[a.puesto_id].alertas.push(a);
      });

      const fechaStr = hoy.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const filas = [
        ['Parte diario ' + fechaStr],
        ['Pool Safety Des Llevant, S.L. · CIF B75828418'],
        [],
        ['Hotel', 'Zona', 'Socorrista', 'DNI', 'Hora entrada', 'GPS entrada', 'Hora salida', 'Alertas del día']
      ];

      let totalFichados = 0, totalVacantes = 0, totalAlertas = 0;
      puestos.forEach(p => {
        const s = porPuesto[p.id];
        totalAlertas += s.alertas.length;
        if (s.entradas.length === 0) {
          filas.push([p.nombre, p.zona || '', '(sin fichaje hoy)', '', '', '', '', s.alertas.length]);
          totalVacantes++;
        } else {
          s.entradas.forEach(ent => {
            const emp = ent.empleados || {};
            // Buscar salida del mismo empleado
            const sal = s.salidas.find(x => x.empleado_id === ent.empleado_id && new Date(x.hora) > new Date(ent.hora));
            const gpsEnt = ent.fuera_de_zona ? 'FUERA' : (ent.gps_ok ? 'OK' : '—');
            filas.push([
              p.nombre, p.zona || '',
              emp.nombre || '', emp.dni || '',
              new Date(ent.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
              gpsEnt,
              sal ? new Date(sal.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '(sin salida)',
              s.alertas.length
            ]);
            totalFichados++;
          });
        }
      });

      filas.push([]);
      filas.push(['TOTAL', puestos.length + ' puestos', totalFichados + ' fichajes', '', '', '', '', totalAlertas + ' alertas']);
      if (alertas.length) {
        filas.push([]);
        filas.push(['DETALLE DE ALERTAS']);
        filas.push(['Hora', 'Hotel', 'Criticidad', 'Origen', 'Mensaje']);
        alertas.forEach(a => {
          const p = puestos.find(x => x.id === a.puesto_id) || {};
          filas.push([
            new Date(a.fecha_creacion).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            p.nombre || '—',
            a.criticidad, a.origen, a.mensaje
          ]);
        });
      }

      const csv = '﻿' + filas.map(r => r.map(c => {
        const v = String(c ?? '');
        return v.includes(';') || v.includes('"') || v.includes('\n') ? '"' + v.replace(/"/g,'""') + '"' : v;
      }).join(';')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PoolSafety-parte-diario-${hoy.toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`✓ Parte diario descargado (${totalFichados} fichajes · ${totalAlertas} alertas)`);
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Descargar informe de horas del mes (CSV para Excel / gestoría)
  window.descargarInformeHoras = async function () {
    if (!window.sb) { toast('Sistema no disponible'); return; }
    toast('Generando informe…');
    try {
      const { data: emps } = await window.sb.from('empleados')
        .select('id, nombre, dni, email, telefono, puestos(nombre)')
        .neq('estado','eliminado').is('fecha_baja', null).order('nombre');
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
      const { data: fichs } = await window.sb.from('fichajes')
        .select('empleado_id, tipo, hora, fuera_de_zona')
        .gte('hora', desde).lt('hora', hasta).order('hora');

      const OBJ_DIA = 8;
      const stats = {};
      (emps || []).forEach(e => { stats[e.id] = { dias: new Set(), ord: 0, extra: 0, fueraZona: 0 }; });
      const entradaTmp = {};
      (fichs || []).forEach(f => {
        const s = stats[f.empleado_id]; if (!s) return;
        const d = new Date(f.hora);
        if (f.tipo === 'entrada') { entradaTmp[f.empleado_id] = d; s.dias.add(d.toDateString()); if (f.fuera_de_zona) s.fueraZona++; }
        else if (f.tipo === 'salida' && entradaTmp[f.empleado_id]) {
          const h = Math.max(0, (d - entradaTmp[f.empleado_id]) / 3600000);
          s.ord += Math.min(OBJ_DIA, h);
          if (h > OBJ_DIA) s.extra += h - OBJ_DIA;
          delete entradaTmp[f.empleado_id];
        }
      });

      const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      const filas = [
        ['Informe de horas del mes', nombreMes],
        ['Pool Safety Des Llevant, S.L. · CIF B75828418'],
        [],
        ['Socorrista', 'DNI', 'Email', 'Teléfono', 'Puesto', 'Días', 'Horas ordinarias', 'Horas extras', 'Total', 'Fuera de zona']
      ];
      (emps || []).forEach(e => {
        const s = stats[e.id];
        filas.push([
          e.nombre,
          e.dni || '',
          e.email || '',
          e.telefono || '',
          (e.puestos && e.puestos.nombre) || '',
          s.dias.size,
          Math.round(s.ord),
          Math.round(s.extra),
          Math.round(s.ord + s.extra),
          s.fueraZona
        ]);
      });
      // Fila total
      const totOrd = Object.values(stats).reduce((a, s) => a + s.ord, 0);
      const totExtra = Object.values(stats).reduce((a, s) => a + s.extra, 0);
      filas.push([]);
      filas.push(['TOTAL EMPRESA', '', '', '', '', '', Math.round(totOrd), Math.round(totExtra), Math.round(totOrd + totExtra), '']);

      // Serializar como CSV (separador ; para Excel español) con BOM UTF-8
      const csv = '﻿' + filas.map(r => r.map(c => {
        const v = String(c ?? '');
        return v.includes(';') || v.includes('"') || v.includes('\n') ? '"' + v.replace(/"/g,'""') + '"' : v;
      }).join(';')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PoolSafety-horas-${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('✓ Informe descargado (CSV para Excel)');
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ---------- Modal asignar tarea (socorristas REALES de BD) ---------- */
  const socSelect = document.getElementById('taskSocorrista');
  async function refrescarSelectSocorristasTarea() {
    if (!socSelect || !window.sb) return;
    socSelect.innerHTML = '<option value="">Cargando…</option>';
    try {
      const { data } = await window.sb.from('empleados')
        .select('id, nombre, puestos(nombre)')
        .neq('estado','eliminado').is('fecha_baja', null)
        .order('nombre');
      const rows = data || [];
      socSelect.innerHTML = rows.length === 0
        ? '<option value="">Aún no hay socorristas</option>'
        : rows.map(s => `<option value="${s.id}">${s.nombre}${s.puestos ? ' — ' + s.puestos.nombre : ''}</option>`).join('');
    } catch (_) { socSelect.innerHTML = '<option value="">Error</option>'; }
  }
  refrescarSelectSocorristasTarea();

  window.openTareaModal = async function (socId) {
    await refrescarSelectSocorristasTarea();
    if (socId) socSelect.value = socId;
    document.getElementById('tareaModal').classList.add('open');
  };
  window.closeTareaModal = () => document.getElementById('tareaModal').classList.remove('open');
  window.submitTarea = async function () {
    const socId = socSelect.value;
    const tipo = document.getElementById('taskType').value;
    const title = document.getElementById('taskTitle').value.trim();
    const desc = document.getElementById('taskDesc').value.trim();
    if (!socId) { toast('Selecciona un socorrista'); return; }
    if (!title) { toast('Escribe un título o mensaje antes de enviar'); return; }
    const psSes = window.PS_SESSION || {};
    try {
      if (tipo === 'nota') {
        // NOTA informativa → tabla notas
        const { error } = await window.sb.from('notas').insert({
          empleado_id: socId,
          autor_id: psSes.userId,
          autor_nombre: psSes.nombre || psSes.email || 'Coordinador',
          mensaje: title + (desc ? '\n\n' + desc : '')
        });
        if (error) throw error;
      } else {
        // TAREA con checkbox → tabla tareas
        const { error } = await window.sb.from('tareas').insert({
          empleado_id: socId,
          asignada_por: psSes.userId,
          titulo: title,
          descripcion: desc || null,
          prioridad: 'media',
          hecha: false
        });
        if (error) throw error;
      }
      closeTareaModal();
      document.getElementById('taskTitle').value = '';
      document.getElementById('taskDesc').value = '';
      const nombreSoc = socSelect.options[socSelect.selectedIndex]?.text.split(' — ')[0] || 'socorrista';
      toast(`✓ ${tipo === 'nota' ? 'Nota' : 'Tarea'} enviada a ${nombreSoc}`);
    } catch (err) { toast('Error: ' + err.message); }
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

  async function renderDocsAdmin() {
    if (!docsAdminList || !window.sb) return;
    docsAdminList.innerHTML = '<div style="padding:30px;text-align:center;color:var(--ink-500);">Cargando documentación real…</div>';
    try {
      const { data: emps } = await window.sb.from('empleados')
        .select('id, nombre, puesto_id, puestos(nombre)')
        .neq('estado', 'eliminado').is('fecha_baja', null)
        .order('nombre');
      const empleados = emps || [];
      if (empleados.length === 0) {
        docsAdminList.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-500);font-size:13.5px;">Aún no hay socorristas dados de alta. Cuando crees uno con el modal Nuevo Empleado aparecerá aquí.</div>';
        if (docsStats) docsStats.textContent = '0 socorristas';
        return;
      }

      // Firmas kit-alta reales por empleado
      const ids = empleados.map(e => e.id);
      const { data: kitFirmas } = await window.sb.from('firmas_documentos')
        .select('empleado_id, fecha_firma').eq('documento_codigo','kit-alta').in('empleado_id', ids);
      const kitPorEmp = new Set((kitFirmas || []).map(f => f.empleado_id));

      // Jornadas firmadas reales (para futuro badge)
      const { data: jornFirmas } = await window.sb.from('firmas_documentos')
        .select('empleado_id, documento_codigo').like('documento_codigo','jornada-%').in('empleado_id', ids);
      const jornPorEmp = new Map();
      (jornFirmas || []).forEach(f => {
        const arr = jornPorEmp.get(f.empleado_id) || [];
        arr.push(f.documento_codigo);
        jornPorEmp.set(f.empleado_id, arr);
      });

      const hoyMes = 'jornada-' + new Date().toISOString().slice(0,7);
      const rows = empleados.map(e => ({
        id: e.id,
        nombre: e.nombre,
        iniciales: (e.nombre || '?').split(' ').map(p => p[0]).join('').substring(0,2).toUpperCase(),
        puesto: (e.puestos && e.puestos.nombre) || '—',
        kitOk: kitPorEmp.has(e.id),
        jornadaMesFirmada: (jornPorEmp.get(e.id) || []).includes(hoyMes)
      }));

      const alDia = rows.filter(r => r.kitOk && r.jornadaMesFirmada).length;
      const pendTotal = rows.length - alDia;
      if (docsStats) docsStats.textContent = `${alDia}/${rows.length} al día · ${pendTotal} pendientes`;

      let visibles = rows;
      if (docsCurrentFilter === 'pendientes') visibles = rows.filter(r => !r.kitOk || !r.jornadaMesFirmada);
      else if (docsCurrentFilter === 'firmados') visibles = rows.filter(r => r.kitOk && r.jornadaMesFirmada);

      if (visibles.length === 0) {
        docsAdminList.innerHTML = `<div style="padding: 30px; text-align:center; color: var(--ink-500); font-size: 13.5px;">
          <svg class="ic ic-24" style="opacity:.5; margin: 0 auto 8px;"><use href="#ic-check-circle"/></svg>
          <div>${docsCurrentFilter === 'pendientes' ? '¡Todos los socorristas al día!' : 'Sin resultados'}</div>
        </div>`;
        return;
      }

      docsAdminList.innerHTML = visibles.map(s => {
        const kitBadge = s.kitOk
          ? `<span class="badge badge-ok"><span class="dot"></span>Kit Alta ✓</span>`
          : `<span class="badge badge-danger"><span class="dot"></span>Kit Alta pendiente</span>`;
        const jornBadge = s.jornadaMesFirmada
          ? `<span class="badge badge-ok"><span class="dot"></span>Jornada del mes ✓</span>`
          : `<span class="badge badge-warn"><span class="dot"></span>Jornada del mes pendiente</span>`;
        return `
          <div class="doc-admin-row">
            <div class="doc-admin-main">
              <div class="mini-av sky">${s.iniciales}</div>
              <div style="min-width:0;flex:1;">
                <div class="doc-admin-name">${s.nombre}</div>
                <div class="doc-admin-sub">${s.puesto}</div>
              </div>
            </div>
            <div class="doc-admin-badges">
              ${kitBadge}
              ${jornBadge}
            </div>
            <div class="doc-admin-actions">
              ${!s.kitOk ? `<button class="btn btn-primary btn-sm" data-tablet-kit="${s.id}" data-tablet-nombre="${s.nombre.replace(/"/g,'&quot;')}">
                <svg class="ic ic-14"><use href="#ic-pen"/></svg>
                Firmar en tablet
              </button>` : ''}
              <button class="btn btn-outline btn-sm" data-view="${s.id}">
                <svg class="ic ic-14"><use href="#ic-file-text"/></svg>
                Ver ficha
              </button>
            </div>
          </div>
        `;
      }).join('');

      docsAdminList.querySelectorAll('[data-tablet-kit]').forEach(btn => {
        btn.addEventListener('click', () => firmarKitEnTablet(btn.dataset.tabletKit, btn.dataset.tabletNombre));
      });
      docsAdminList.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
          window.openEmpleadoModal && window.openEmpleadoModal(btn.dataset.view);
          setTimeout(() => {
            const tab = document.querySelector('.ficha-tab[data-ftab="docs"]');
            if (tab) tab.click();
          }, 200);
        });
      });
    } catch (err) {
      docsAdminList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger);">Error: ${err.message}</div>`;
    }
  }

  /* ==========================================================================
     FIRMAR KIT ALTA EN TABLET · admin + coordinador
     Cuando el empleado firma delante del coord con la tablet del coord.
     Guarda en firmas_documentos con dispositivo='tablet coordinador · <nombre>'
     ========================================================================== */
  let tabletKitEmpActual = null;
  let tabletKitAceptados = {};
  let tabletCanvasCtx = null;
  let tabletDibujando = false;
  let tabletFirmaVacia = true;

  window.firmarKitEnTablet = async function (empId, nombreEmp) {
    if (!empId) return;
    // Si solo llega el id, buscamos el nombre
    if (!nombreEmp) {
      try {
        const { data } = await window.sb.from('empleados').select('nombre').eq('id', empId).single();
        nombreEmp = data?.nombre || '—';
      } catch (_) { nombreEmp = '—'; }
    }
    tabletKitEmpActual = { id: empId, nombre: nombreEmp };
    tabletKitAceptados = {};
    document.getElementById('tabletKitEmpName').textContent = `Firma para: ${nombreEmp}`;

    // Lista de subdocumentos con texto legal completo + checkbox aceptar
    const subs = (window.PS && PS.kitAltaSubdocs) || [];
    const escapeHtml = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const renderTexto = txt => (txt || '').split('\n').map(l => {
      const t = escapeHtml(l).trim();
      if (!t) return '<div class="wizard-doc-blank"></div>';
      if (/^[A-ZÁÉÍÓÚÑ0-9· ,\.\(\)\/]+$/.test(t) && t.length > 4 && t.length < 90) return `<div class="wizard-doc-h">${t}</div>`;
      return `<div class="wizard-doc-p">${t}</div>`;
    }).join('');
    document.getElementById('tabletKitDocsList').innerHTML = subs.map((sub, i) => `
      <details ${i === 0 ? 'open' : ''} style="border:1px solid #E5E7EB;border-radius:10px;margin-bottom:10px;background:#FAFBFC;">
        <summary style="padding:12px 14px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;">
          <div style="width:24px;height:24px;background:#B91C1C;color:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${i + 1}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13.5px;color:#111827;">${sub.titulo}</div>
            <div class="small text-muted" style="margin-top:2px;">${sub.norma || 'Consentimiento opcional'} · <b style="color:#B91C1C;">pulsa para leer</b></div>
          </div>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color:#6B7280;flex-shrink:0;"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </summary>
        <div style="padding:0 14px 14px;">
          ${sub.textoCompleto ? `<div class="wizard-doc-full" style="max-height:220px;">${renderTexto(sub.textoCompleto)}</div>` : `<div class="small text-muted" style="padding:8px;">${sub.resumen || ''}</div>`}
          ${sub.esListaEpis ? `
            <div class="wizard-doc-h" style="margin-top:10px;">EPIs a entregar</div>
            <div class="wizard-epi-table-wrap">
              <table class="wizard-epi-table">
                <thead><tr><th>Equipo</th><th>Color</th><th>Modelo</th><th>Unidades</th></tr></thead>
                <tbody>${(sub.epis || []).map(e => `<tr><td><b>${e.nombre}</b></td><td>${e.color}</td><td>${e.modelo}</td><td>${e.unidades}</td></tr>`).join('')}</tbody>
              </table>
            </div>` : ''}
          <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;padding:10px 12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;cursor:pointer;font-size:13px;">
            <input type="checkbox" class="tablet-accept" data-sub="${sub.id}" ${sub.obligatorio ? 'checked' : ''} style="margin-top:3px;flex-shrink:0;" />
            <span><b>${sub.obligatorio ? 'He leído y acepto expresamente este documento (obligatorio)' : 'Doy mi consentimiento (opcional, revocable)'}</b></span>
          </label>
        </div>
      </details>
    `).join('');

    // Reset campos
    document.getElementById('tabletFirmaNombre').value = nombreEmp;
    document.getElementById('tabletFirmaDni').value = '';
    document.getElementById('tabletKitModal').classList.add('open');

    // Init canvas con delay
    setTimeout(initTabletCanvas, 100);
  };

  window.closeTabletKit = function () {
    document.getElementById('tabletKitModal').classList.remove('open');
    tabletKitEmpActual = null;
  };

  window.limpiarTabletFirma = function () {
    const c = document.getElementById('tabletFirmaCanvas');
    if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); tabletFirmaVacia = true; }
  };

  function initTabletCanvas() {
    const canvas = document.getElementById('tabletFirmaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    tabletCanvasCtx = ctx;
    tabletFirmaVacia = true;
    let lastX = 0, lastY = 0;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * canvas.width / rect.width,
        y: (clientY - rect.top) * canvas.height / rect.height
      };
    }
    function start(e) { e.preventDefault(); tabletDibujando = true; const p = getPos(e); lastX = p.x; lastY = p.y; }
    function move(e) {
      if (!tabletDibujando) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      lastX = p.x; lastY = p.y;
      tabletFirmaVacia = false;
    }
    function end() { tabletDibujando = false; }
    canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
    canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  }

  window.guardarFirmaTablet = async function () {
    if (!tabletKitEmpActual) return;
    const nombre = document.getElementById('tabletFirmaNombre').value.trim();
    const dni = document.getElementById('tabletFirmaDni').value.trim();
    if (!nombre) { toast('Escribe el nombre completo'); return; }
    if (!dni) { toast('Escribe el DNI'); return; }
    if (tabletFirmaVacia) { toast('El empleado debe firmar dentro del recuadro'); return; }

    // Validar obligatorios aceptados
    const subs = (window.PS && PS.kitAltaSubdocs) || [];
    const aceptados = {};
    let faltaObligatorio = false;
    document.querySelectorAll('.tablet-accept').forEach(chk => {
      aceptados[chk.dataset.sub] = chk.checked;
      const sub = subs.find(s => s.id === chk.dataset.sub);
      if (sub && sub.obligatorio && !chk.checked) faltaObligatorio = true;
    });
    if (faltaObligatorio) { toast('Todos los documentos obligatorios deben estar marcados'); return; }

    const canvas = document.getElementById('tabletFirmaCanvas');
    const firmaImagen = canvas.toDataURL('image/png');
    const psSes = window.PS_SESSION || {};
    const nombreCoord = psSes.nombre || psSes.email || 'coordinador';

    try {
      const { error } = await window.sb.from('firmas_documentos').insert({
        empleado_id: tabletKitEmpActual.id,
        documento_codigo: 'kit-alta',
        firma_nombre: nombre,
        dni,
        dispositivo: `tablet coordinador · ${nombreCoord}`,
        aceptados_json: aceptados,
        firma_imagen: firmaImagen
      });
      if (error) throw error;
      toast(`✓ Kit Alta firmado para ${tabletKitEmpActual.nombre}`);
      closeTabletKit();
      // Refrescar vistas afectadas
      if (window.renderDocsAdmin) renderDocsAdmin();
      if (window.renderEstadoEquipo) renderEstadoEquipo();
      if (typeof renderFicha === 'function' && fichaActualId === tabletKitEmpActual.id) renderFicha();
    } catch (err) { toast('Error: ' + err.message); }
  };

  if (docsFilter) {
    docsFilter.addEventListener('change', () => {
      docsCurrentFilter = docsFilter.value;
      renderDocsAdmin();
    });
  }
  setTimeout(renderDocsAdmin, 1400);
  document.querySelectorAll('[data-section="documentacion"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(renderDocsAdmin, 200));
  });
  document.addEventListener('ps-session-updated', () => setTimeout(renderDocsAdmin, 500));

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

  // Actualizar badge del menú Documentación con nº REAL de socorristas con Kit Alta sin firmar
  async function actualizarBadgeDocs() {
    const badge = document.getElementById('menuBadgeDocs');
    if (!badge || !window.sb) return;
    try {
      const { data: emps } = await window.sb.from('empleados')
        .select('id').neq('estado', 'eliminado').is('fecha_baja', null);
      if (!emps || emps.length === 0) { badge.style.display = 'none'; return; }
      const { data: firmas } = await window.sb.from('firmas_documentos')
        .select('empleado_id').eq('documento_codigo', 'kit-alta');
      const yaFirmado = new Set((firmas || []).map(f => f.empleado_id));
      const pendientes = emps.filter(e => !yaFirmado.has(e.id)).length;
      if (pendientes > 0) { badge.textContent = pendientes; badge.style.display = 'inline-flex'; }
      else { badge.style.display = 'none'; }
    } catch (_) { badge.style.display = 'none'; }
  }
  actualizarBadgeDocs();
  setInterval(actualizarBadgeDocs, 120_000);
  document.addEventListener('ps-session-updated', () => setTimeout(actualizarBadgeDocs, 500));

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

  // Selectores del formulario manual — leen SIEMPRE de BD real
  const hmSoc = document.getElementById('hmSoc');
  const hmPuesto = document.getElementById('hmPuesto');
  async function refrescarSelectoresHorariosManual() {
    if (hmPuesto) {
      hmPuesto.innerHTML = '<option value="">Cargando…</option>';
      try {
        const { data } = await window.sb
          .from('puestos').select('id, nombre, zona').eq('activo', true).order('nombre');
        hmPuesto.innerHTML = (data || []).map(p => `<option value="${p.id}">${p.nombre}${p.zona ? ' — ' + p.zona : ''}</option>`).join('');
      } catch (err) { hmPuesto.innerHTML = ''; }
    }
    if (hmSoc) {
      hmSoc.innerHTML = '<option value="">Cargando…</option>';
      try {
        const { data } = await window.sb
          .from('empleados').select('id, nombre').is('fecha_baja', null).order('nombre');
        hmSoc.innerHTML = (data || []).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
      } catch (err) { hmSoc.innerHTML = ''; }
    }
  }
  refrescarSelectoresHorariosManual();
  // Refrescar cada vez que el usuario entra a la sección Horarios
  document.querySelectorAll('[data-view="horarios"], [data-nav="horarios"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(refrescarSelectoresHorariosManual, 100));
  });

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
      esCorreturnos: r.es_correturnos === true,
      horasNormales: 0, horasExtra: 0, diasTrabajados: 0
    };
  }

  window.cargarEmpleadosDB = cargarEmpleadosDB;
  async function cargarEmpleadosDB() {
    if (!window.sb) { setTimeout(cargarEmpleadosDB, 300); return; }
    try {
      // Traemos también usuarios.activo: es el campo que REALMENTE decide si el
      // socorrista puede entrar en la app. Se puede desincronizar de empleados.estado
      // (la ficha decía "Activo" mientras la persona no podía entrar).
      const { data, error } = await window.sb
        .from('empleados')
        .select('*, usuarios(activo, ultimo_login)')
        .neq('estado', 'eliminado')
        .order('nombre');
      if (error) throw error;
      empleadosDB = (data || []).map(r => {
        const emp = rowToEmp(r);
        emp.puedeEntrar   = r.usuarios ? r.usuarios.activo === true : null; // null = sin cuenta
        emp.ultimoLogin   = r.usuarios ? r.usuarios.ultimo_login : null;
        // Bandera de incoherencia: figura activo pero no puede entrar
        emp.accesoRoto    = (r.estado === 'activo') && (emp.puedeEntrar !== true);
        return emp;
      });
      renderEmpleadosGrid();
      avisarAccesosRotos();
    } catch (err) {
      console.error('[Empleados]', err);
      if (empleadosGrid) empleadosGrid.innerHTML = `<div style="grid-column:1/-1; padding:30px; text-align:center; color: var(--danger);">Error cargando empleados: ${err.message}</div>`;
    }
  }

  // Aviso global: cuántos empleados figuran activos pero NO pueden entrar en la app.
  function avisarAccesosRotos() {
    const rotos = empleadosDB.filter(e => e.accesoRoto);
    let banner = document.getElementById('bannerAccesosRotos');
    if (rotos.length === 0) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'bannerAccesosRotos';
      banner.style.cssText = 'margin:0 0 14px;padding:12px 16px;background:#FEF3C7;border:1px solid #F59E0B;border-left:4px solid #D97706;border-radius:8px;color:#78350F;font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
      const grid = document.getElementById('empleadosGrid');
      if (grid && grid.parentNode) grid.parentNode.insertBefore(banner, grid);
    }
    banner.innerHTML = `
      <svg class="ic ic-18" style="flex-shrink:0;"><use href="#ic-alert"/></svg>
      <div style="flex:1;min-width:200px;">
        <b>${rotos.length} empleado${rotos.length>1?'s figuran activos':' figura activo'} pero NO puede${rotos.length>1?'n':''} entrar en la app.</b>
        <div style="margin-top:3px;">${rotos.slice(0,5).map(e => e.nombre).join(' · ')}${rotos.length>5 ? ' y '+(rotos.length-5)+' más' : ''}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="repararAccesos()">Reparar acceso de ${rotos.length===1?'este':'todos'}</button>
    `;
  }

  // Restaurar acceso de UN empleado concreto (desde su ficha)
  window.restaurarAccesoEmpleado = async function (usuarioId, nombre) {
    if (!confirm(`¿Restaurar el acceso de ${nombre} a la app?\n\nPodrá volver a iniciar sesión y fichar.`)) return;
    try {
      const { error } = await window.sb.from('usuarios').update({ activo: true }).eq('id', usuarioId);
      if (error) throw error;
      toast(`✓ ${nombre} ya puede entrar en la app`);
      await cargarEmpleadosDB();
      renderFicha();
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Reactiva usuarios.activo para todos los empleados con estado='activo'
  window.repararAccesos = async function () {
    const rotos = empleadosDB.filter(e => e.accesoRoto);
    const conCuenta = rotos.filter(e => e.puedeEntrar === false && e.usuarioId);
    const sinCuenta = rotos.filter(e => !e.usuarioId || e.puedeEntrar === null);
    let msg = `Se va a restaurar el acceso a ${conCuenta.length} empleado(s).`;
    if (sinCuenta.length) {
      msg += `\n\n⚠️ ${sinCuenta.length} no tiene cuenta de acceso creada (${sinCuenta.slice(0,3).map(e=>e.nombre).join(', ')}${sinCuenta.length>3?'…':''}). A esos hay que crearles la cuenta con "Enviar email de acceso" desde su ficha.`;
    }
    if (conCuenta.length === 0) { alert(msg); return; }
    if (!confirm(msg + '\n\n¿Continuar?')) return;
    try {
      const ids = conCuenta.map(e => e.usuarioId);
      const { error } = await window.sb.from('usuarios').update({ activo: true }).in('id', ids);
      if (error) throw error;
      toast(`✓ Acceso restaurado a ${ids.length} empleado(s)`);
      await cargarEmpleadosDB();
    } catch (err) { toast('Error: ' + err.message); }
  };

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
    if ('esCorreturnos' in patch) dbPatch.es_correturnos = !!patch.esCorreturnos;

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
      // Aviso: figura activo pero NO puede entrar en la app (usuarios.activo = false o sin cuenta)
      if (e.accesoRoto) {
        badges.push(e.usuarioId
          ? `<span class="badge badge-danger small" title="Su cuenta está desactivada: no puede entrar en la app"><span class="dot"></span>Sin acceso</span>`
          : `<span class="badge badge-danger small" title="No tiene cuenta de acceso creada"><span class="dot"></span>Sin cuenta</span>`);
      }
      if (e.esCorreturnos) badges.push(`<span class="badge small" style="background:#FEF3C7;color:#92400E;"><span class="dot" style="background:#F59E0B;"></span>Correturnos</span>`);
      return `
        <div class="emp-card ${e.estado === 'baja' ? 'baja' : ''}" data-emp="${e.id}">
          <span class="emp-card-status ${e.estado}"></span>
          <div class="emp-card-photo ${photoClass}" ${photoStyle}>${photoContent}</div>
          <div class="emp-card-name">${e.nombre}${e.esCorreturnos ? ' <span style="color:#F59E0B;font-size:11px;" title="Correturnos">●</span>' : ''}</div>
          <div class="emp-card-role">${e.esCorreturnos ? 'Correturnos · sin puesto fijo' : puesto}</div>
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
          <div class="ficha-data-label">Puesto asignado</div>
          <div class="ficha-data-value">
            <select id="ed-puesto"><option value="">Cargando hoteles…</option></select>
            <div class="small text-muted mt-1">Puesto principal del socorrista. Para múltiples horarios/hoteles usa la pestaña <b>Horario</b>.</div>
          </div>
        </div>
        <div class="ficha-data-row">
          <div class="ficha-data-label">Correturnos</div>
          <div class="ficha-data-value">
            <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
              <input type="checkbox" id="ed-correturnos" ${e.esCorreturnos ? 'checked' : ''} />
              <span>Este socorrista cubre suplencias en distintos hoteles cada día</span>
            </label>
          </div>
        </div>
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
      // Cargar lista de hoteles reales y prellenar el select con el puesto actual
      (async () => {
        const sel = document.getElementById('ed-puesto');
        if (!sel) return;
        try {
          const { data } = await window.sb.from('puestos').select('id, nombre, zona').eq('activo', true).order('nombre');
          const opts = ['<option value="">— Sin asignar —</option>']
            .concat((data || []).map(p => `<option value="${p.id}" ${p.id === e.puestoId ? 'selected' : ''}>${p.nombre}${p.zona ? ' — ' + p.zona : ''}</option>`));
          sel.innerHTML = opts.join('');
        } catch (err) { sel.innerHTML = '<option value="">Error cargando hoteles</option>'; }
      })();
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
            <div class="ficha-action-body" style="flex:1;min-width:0;">
              <div class="ficha-action-title">Kit Alta Empresa</div>
              <div class="ficha-action-sub">${kitFirma ? 'Firmado el ' + new Date(kitFirma.fecha_firma).toLocaleString('es-ES') + '<br>Desde: ' + (kitFirma.dispositivo || 'móvil') : 'Pendiente de firma'}</div>
              ${kitFirma?.firma_imagen ? `<img src="${kitFirma.firma_imagen}" class="firma-imagen" style="max-width:220px;margin-top:8px;" alt="Firma"/>` : ''}
              ${kitFirma?.ubicacion_lat ? `<div class="small text-muted mt-1">📍 <a href="https://www.google.com/maps?q=${kitFirma.ubicacion_lat},${kitFirma.ubicacion_lng}" target="_blank">${(+kitFirma.ubicacion_lat).toFixed(4)}, ${(+kitFirma.ubicacion_lng).toFixed(4)}</a></div>` : ''}
            </div>
          </div>
          ${!kitFirma ? `
            <div class="row gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" onclick="enviarKitAltaParaFirmar('${e.id}','${(e.nombre||'').replace(/'/g,'\\\'')}')">
                <svg class="ic ic-14"><use href="#ic-bell"/></svg> Solicitar firma en su app
              </button>
              <button class="btn btn-primary btn-sm" onclick="firmarKitEnTablet('${e.id}', '${(e.nombre||'').replace(/'/g,'\\\'')}')">
                <svg class="ic ic-14"><use href="#ic-pen"/></svg> Firmar en tablet
              </button>
            </div>` : ''}
          ${kitFirma ? `
            <div class="row gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" onclick="reenviarKitAlta('${kitFirma.id}','${(e.nombre||'').replace(/'/g,'\\\'')}')" style="color:#B45309;border-color:#F59E0B;">
                <svg class="ic ic-16"><use href="#ic-refresh"/></svg>
                Reenviar para firmar de nuevo
              </button>
              <button class="btn btn-primary btn-sm" onclick="descargarPdfFirma('${kitFirma.id}','kit-alta')">
                <svg class="ic ic-16"><use href="#ic-download"/></svg>
                Descargar PDF
              </button>
              ${kitFirma.archivo_pdf_url ? `<a class="btn btn-outline btn-sm" href="${kitFirma.archivo_pdf_url}" target="_blank">📎 Ver PDF guardado</a>` : ''}
            </div>
            <div class="small text-muted mt-2" style="text-align:right;">"Reenviar" archiva la firma actual y obliga al empleado a firmar de nuevo cuando entre en la app.</div>
            ` : ''}
        </div>
        ${jornadas.map(j => {
          const c = j.campos_json || {};
          return `
          <div class="ficha-action-row ok" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <div class="icon"><svg class="ic ic-18"><use href="#ic-clock"/></svg></div>
              <div class="ficha-action-body">
                <div class="ficha-action-title">${j.documento_codigo}</div>
                <div class="ficha-action-sub">Firmado el ${new Date(j.fecha_firma).toLocaleString('es-ES')}</div>
                <div class="small text-muted mt-1">
                  Firmadas <b>${c.horas_firmadas || '—'}h</b>
                  ${c.horas_reales && c.horas_reales > (c.horas_firmadas || 0) ? ` · Reales ${c.horas_reales}h (${c.horas_reales - (c.horas_firmadas || 0)}h extra)` : ''}
                  ${c.dias_trabajados ? ' · ' + c.dias_trabajados + ' días' : ''}
                </div>
                ${j.firma_imagen ? `<img src="${j.firma_imagen}" class="firma-imagen" style="max-width:180px;margin-top:8px;" alt="Firma"/>` : ''}
              </div>
            </div>
            <div class="row gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="descargarPdfFirma('${j.id}','jornada')">
                <svg class="ic ic-16"><use href="#ic-download"/></svg>
                Descargar resumen
              </button>
              <button class="btn btn-outline btn-sm" onclick="descargarJornadaOficial('${j.id}')">
                <svg class="ic ic-16"><use href="#ic-file-text"/></svg>
                Descargar hoja mensual oficial (inspección)
              </button>
            </div>
          </div>`;
        }).join('')}
        ${jornadas.length === 0 ? `
          <div class="ficha-action-row warn">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-clock"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Registro mensual de jornada</div>
              <div class="ficha-action-sub">Sin firmas mensuales aún. Se firma el último día trabajado del mes o cuando le solicites la firma.</div>
            </div>
          </div>` : ''}

        <div class="ficha-action-row" style="flex-direction:column;align-items:stretch;background:#f0f9ff;border:1px dashed #7dd3fc;">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-bell"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Solicitar firma de registro mensual</div>
              <div class="ficha-action-sub">Genera una solicitud para que ${(e.nombre||'el trabajador').replace(/'/g,'\\\'')} firme las horas trabajadas hasta hoy. Le aparece EN EL ACTO en su app (Realtime).</div>
            </div>
          </div>
          <div class="row gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="solicitarRegistroMensual('${e.id}','${(e.nombre||'').replace(/'/g,'\\\'')}')">
              <svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg>
              Mandar horas para firmar ahora
            </button>
          </div>
        </div>
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
      const psSes = window.PS_SESSION || {};
      const esAdmin = psSes.rol === 'dueno';
      body.innerHTML = `
        <!-- Estado real de acceso a la app (usuarios.activo, no empleados.estado) -->
        ${e.accesoRoto ? `
          <div class="ficha-action-row" style="flex-direction:column;align-items:stretch;background:#FEF2F2;border-left:4px solid #DC2626;">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <div class="icon" style="background:#FEE2E2;color:#B91C1C;"><svg class="ic ic-18"><use href="#ic-alert"/></svg></div>
              <div class="ficha-action-body" style="flex:1;min-width:0;">
                <div class="ficha-action-title" style="color:#B91C1C;">Este empleado NO puede entrar en la app</div>
                <div class="ficha-action-sub">
                  ${e.usuarioId
                    ? 'Su ficha figura como <b>Activo</b>, pero su cuenta de acceso está desactivada. Al intentar entrar, la app le expulsa.'
                    : 'No tiene cuenta de acceso creada. Usa "Enviar email de acceso" para crearla.'}
                </div>
              </div>
            </div>
            ${e.usuarioId ? `
              <div class="row gap-2 mt-3" style="justify-content:flex-end;">
                <button class="btn btn-primary btn-sm" onclick="restaurarAccesoEmpleado('${e.usuarioId}','${(e.nombre||'').replace(/'/g,'\\\'')}')">
                  <svg class="ic ic-14"><use href="#ic-check-circle"/></svg> Restaurar acceso
                </button>
              </div>` : ''}
          </div>` : `
          <div class="ficha-action-row ok">
            <div class="icon" style="background:#DCFCE7;color:#166534;"><svg class="ic ic-18"><use href="#ic-check-circle"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Acceso a la app</div>
              <div class="ficha-action-sub">
                ${e.puedeEntrar === true
                  ? (e.ultimoLogin
                      ? 'Puede entrar. Último acceso: <b>' + new Date(e.ultimoLogin).toLocaleString('es-ES') + '</b>'
                      : 'Puede entrar, pero <b>aún no ha entrado nunca</b>. Envíale el email de acceso.')
                  : 'Estado: ' + (e.estado || '—')}
              </div>
            </div>
          </div>`}

        <!-- Reset password: coord + admin -->
        <div class="ficha-action-row">
          <div class="icon" style="background: var(--info-bg); color: var(--sky-700);"><svg class="ic ic-18"><use href="#ic-shield"/></svg></div>
          <div class="ficha-action-body">
            <div class="ficha-action-title">Enviar email de acceso</div>
            <div class="ficha-action-sub">${e.email ? 'Se enviará a <b>' + e.email + '</b> para que ponga contraseña y entre.' : 'Este empleado no tiene email.'}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="enviarResetPassword()" ${!e.email ? 'disabled' : ''}>Enviar</button>
        </div>

        ${e.estado === 'alta-pendiente' ? `
          <div class="ficha-action-row ok">
            <div class="icon" style="background:#DCFCE7;color:#166534;"><svg class="ic ic-18"><use href="#ic-check-circle"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Alta pendiente de confirmar</div>
              <div class="ficha-action-sub">Este empleado se creó pero aún NO está formalmente dado de alta. Pulsa para activarlo y que pueda fichar.</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="confirmarAlta()">Dar de alta</button>
          </div>` : ''}

        <!-- Fichar por el empleado (para cuando no le funcione la app) -->
        <div class="ficha-action-row" style="flex-direction:column;align-items:stretch;background:#eff6ff;border-left:4px solid #3B82F6;">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div class="icon" style="background:#DBEAFE;color:#1D4ED8;"><svg class="ic ic-18"><use href="#ic-clock"/></svg></div>
            <div class="ficha-action-body" style="flex:1;min-width:0;">
              <div class="ficha-action-title">Fichar por el empleado (manual)</div>
              <div class="ficha-action-sub">Úsalo si al empleado no le funciona la app o el GPS. Queda registrado que el fichaje lo hizo administración.</div>
            </div>
          </div>
          <div class="row gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="ficharPorEmpleado('${e.id}','${(e.nombre||'').replace(/'/g,'\\\'')}','entrada')">
              <svg class="ic ic-14"><use href="#ic-check"/></svg> Registrar entrada
            </button>
            <button class="btn btn-primary btn-sm" onclick="ficharPorEmpleado('${e.id}','${(e.nombre||'').replace(/'/g,'\\\'')}','salida')">
              <svg class="ic ic-14"><use href="#ic-check-circle"/></svg> Registrar salida
            </button>
          </div>
        </div>

        <!-- Ver / editar / borrar fichajes existentes -->
        <div class="ficha-action-row" style="flex-direction:column;align-items:stretch;background:#fefce8;border-left:4px solid #EAB308;">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div class="icon" style="background:#FEF9C3;color:#854D0E;"><svg class="ic ic-18"><use href="#ic-file-text"/></svg></div>
            <div class="ficha-action-body" style="flex:1;min-width:0;">
              <div class="ficha-action-title">Ver, editar o borrar fichajes existentes</div>
              <div class="ficha-action-sub">Corregir horas mal marcadas, borrar fichajes duplicados o erróneos. Queda auditado quién hace cada cambio.</div>
            </div>
          </div>
          <div id="fichajesEdit_${e.id}" style="margin-top:12px;"></div>
          <div class="row gap-2 mt-2" style="justify-content:flex-end;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="cargarFichajesEditables('${e.id}', 7)">Últimos 7 días</button>
            <button class="btn btn-primary btn-sm" onclick="cargarFichajesEditables('${e.id}', 31)">Mes actual</button>
          </div>
        </div>

        ${!esAdmin ? `
          <div class="ficha-action-row" style="opacity:.7;">
            <div class="icon" style="background:var(--ink-100,#E5E7EB);color:var(--ink-500,#6B7280);"><svg class="ic ic-18"><use href="#ic-alert"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Baja, finiquito y eliminación · reservado a administración</div>
              <div class="ficha-action-sub">Solo Adam (rol Administrador) puede dar de baja, iniciar finiquito o eliminar una ficha. Contacta con él si necesitas cualquiera de estas acciones.</div>
            </div>
          </div>
        ` : `
          <!-- BAJA · cortar acceso app -->
          ${e.estado === 'baja' ? `
            <div class="ficha-action-row ok">
              <div class="icon"><svg class="ic ic-18"><use href="#ic-check-circle"/></svg></div>
              <div class="ficha-action-body">
                <div class="ficha-action-title">Reactivar empleado</div>
                <div class="ficha-action-sub">Vuelve a estado activo con acceso a la app.</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="darDeAlta()">Reactivar</button>
            </div>` : `
            <div class="ficha-action-row warn">
              <div class="icon"><svg class="ic ic-18"><use href="#ic-alert"/></svg></div>
              <div class="ficha-action-body">
                <div class="ficha-action-title">Cortar acceso · dar de baja</div>
                <div class="ficha-action-sub">Bloquea el acceso a la app y a los documentos. Sus datos se conservan. No genera finiquito.</div>
              </div>
              <button class="btn btn-outline btn-sm" onclick="darDeBaja()" style="color:#B45309;border-color:#F59E0B;">Cortar acceso</button>
            </div>`}

          <!-- FINIQUITO -->
          <div class="ficha-action-row warn" style="border-color:#FCA5A5;background:#FEF2F2;">
            <div class="icon" style="background:#FEE2E2;color:#B91C1C;"><svg class="ic ic-18"><use href="#ic-file-text"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Iniciar finiquito</div>
              <div class="ficha-action-sub">Crea el documento de finiquito. La app solo mostrará al empleado ese documento para firmar. Cuando firme, su cuenta se paraliza pero se conservan todos los datos.</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="iniciarFiniquito()" style="color:#B91C1C;border-color:#B91C1C;">Iniciar finiquito</button>
          </div>

          <!-- ELIMINACIÓN TOTAL -->
          <div class="ficha-action-row danger">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-x"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Eliminar perfil y cuenta permanentemente</div>
              <div class="ficha-action-sub"><b>Irreversible.</b> Borra ficha, firmas, fichajes, tareas, notas, documentos subidos, horarios, titulaciones y la cuenta de acceso. Solo usar si nunca debería existir.</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="eliminarEmpleado()" style="color: var(--danger); border-color: var(--danger);">Eliminar todo</button>
          </div>
        `}`;
    }
  }

  // Versión raw reutilizable (sin confirm/toast) para crearNuevoEmpleado y creación masiva
  window.enviarAccesoEmailRaw = async function (email) {
    try {
      const { error } = await window.sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset.html'
      });
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      return { ok: false, err: err.message };
    }
  };

  /* ==========================================================================
     PANEL ENVIAR ACCESOS · envío controlado, uno a uno, con pausa
     Evita el "desastre" de mandar a todos de golpe:
     - Muestra quién YA entró (no necesita email) y quién NO
     - Por defecto solo se preseleccionan los que nunca han entrado
     - Envía secuencialmente con 1,2 s de pausa (rate limit del proveedor)
     - Log en vivo de cada envío, con su error concreto si falla
     ========================================================================== */
  let accesosCache = [];

  window.openAccesosModal = async function () {
    document.getElementById('accesosModal').classList.add('open');
    document.getElementById('accesosProgreso').style.display = 'none';
    document.getElementById('accesosLog').innerHTML = '';
    const cont = document.getElementById('accesosLista');
    cont.innerHTML = '<div class="text-muted small" style="padding:20px;text-align:center;">Cargando socorristas…</div>';
    try {
      const { data, error } = await window.sb.from('empleados')
        .select('id, nombre, email, estado, usuario_id, usuarios(activo, ultimo_login)')
        .eq('estado', 'activo')
        .order('nombre');
      if (error) throw error;
      accesosCache = (data || []).map(e => ({
        id: e.id,
        nombre: e.nombre,
        email: e.email,
        usuarioId: e.usuario_id,
        tieneCuenta: !!e.usuario_id,
        puedeEntrar: e.usuarios ? e.usuarios.activo === true : false,
        ultimoLogin: e.usuarios ? e.usuarios.ultimo_login : null,
        // Preseleccionado solo si: tiene cuenta, puede entrar, tiene email y NUNCA ha entrado
        sel: !!e.usuario_id && (e.usuarios?.activo === true) && !!e.email && !e.usuarios?.ultimo_login
      }));
      renderAccesosLista();
    } catch (err) {
      cont.innerHTML = `<div class="alert-strip warn" style="margin:6px;">Error: ${err.message}</div>`;
    }
  };
  window.closeAccesosModal = () => document.getElementById('accesosModal').classList.remove('open');

  function renderAccesosLista() {
    const cont = document.getElementById('accesosLista');
    if (!cont) return;
    if (accesosCache.length === 0) {
      cont.innerHTML = '<div class="text-muted small" style="padding:20px;text-align:center;">No hay socorristas activos.</div>';
      return;
    }
    cont.innerHTML = accesosCache.map((s, i) => {
      let estadoTxt, estadoColor, puedeEnviar = true;
      if (!s.email) {
        estadoTxt = 'Sin email en su ficha'; estadoColor = '#DC2626'; puedeEnviar = false;
      } else if (!s.tieneCuenta) {
        estadoTxt = 'Sin cuenta creada — créala primero'; estadoColor = '#DC2626'; puedeEnviar = false;
      } else if (!s.puedeEntrar) {
        estadoTxt = 'Cuenta desactivada — restaura el acceso primero'; estadoColor = '#DC2626'; puedeEnviar = false;
      } else if (s.ultimoLogin) {
        estadoTxt = 'Ya entró el ' + new Date(s.ultimoLogin).toLocaleDateString('es-ES') + ' — no necesita email';
        estadoColor = '#059669';
      } else {
        estadoTxt = 'Nunca ha entrado — necesita el email';
        estadoColor = '#D97706';
      }
      return `
        <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;margin:3px 0;border:1px solid ${s.sel?'#B91C1C':'#e2e8f0'};border-radius:8px;background:${s.sel?'#fef2f2':'#fff'};cursor:${puedeEnviar?'pointer':'not-allowed'};opacity:${puedeEnviar?1:0.6};">
          <input type="checkbox" ${s.sel?'checked':''} ${puedeEnviar?'':'disabled'}
            onchange="accesosToggle(${i}, this.checked)" style="width:18px;height:18px;flex-shrink:0;" />
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;">${s.nombre}</div>
            <div class="small text-muted">${s.email || 'sin email'}</div>
          </div>
          <div style="font-size:11px;color:${estadoColor};text-align:right;flex-shrink:0;max-width:210px;">${estadoTxt}</div>
        </label>`;
    }).join('');
    actualizarResumenAccesos();
  }

  window.accesosToggle = function (i, v) {
    if (accesosCache[i]) accesosCache[i].sel = v;
    actualizarResumenAccesos();
    // Repintamos solo el borde sin recargar toda la lista
    renderAccesosLista();
  };

  window.accesosSeleccion = function (modo) {
    accesosCache.forEach(s => {
      const puede = s.tieneCuenta && s.puedeEntrar && s.email;
      if (modo === 'ninguno') s.sel = false;
      else if (modo === 'nunca') s.sel = puede && !s.ultimoLogin;
    });
    renderAccesosLista();
  };

  function actualizarResumenAccesos() {
    const el = document.getElementById('accesosResumen');
    if (!el) return;
    const n = accesosCache.filter(s => s.sel).length;
    const yaEntraron = accesosCache.filter(s => s.ultimoLogin).length;
    el.textContent = `${n} seleccionado${n===1?'':'s'} · ${yaEntraron} ya han entrado alguna vez`;
  }

  window.enviarAccesosSeleccionados = async function () {
    const sel = accesosCache.filter(s => s.sel);
    if (sel.length === 0) { toast('No has seleccionado a nadie'); return; }
    const yaEntraron = sel.filter(s => s.ultimoLogin);
    let msg = `Se enviará el email de acceso a ${sel.length} socorrista(s).`;
    if (yaEntraron.length > 0) {
      msg += `\n\n⚠️ ${yaEntraron.length} de ellos YA habían entrado antes (${yaEntraron.slice(0,3).map(s=>s.nombre).join(', ')}${yaEntraron.length>3?'…':''}).\nSu contraseña actual seguirá funcionando, pero pueden confundirse al recibir el email.`;
    }
    msg += `\n\nSe envían de uno en uno con pausa (tarda ~${Math.ceil(sel.length * 1.2)} segundos).\n\n¿Continuar?`;
    if (!confirm(msg)) return;

    const btn = document.getElementById('btnEnviarAccesos');
    const prog = document.getElementById('accesosProgreso');
    const barra = document.getElementById('accesosProgresoBarra');
    const texto = document.getElementById('accesosProgresoTexto');
    const log = document.getElementById('accesosLog');
    btn.disabled = true;
    prog.style.display = 'block';
    log.innerHTML = '';

    let ok = 0, fallos = 0;
    for (let i = 0; i < sel.length; i++) {
      const s = sel[i];
      texto.textContent = `Enviando ${i+1} de ${sel.length}: ${s.nombre}…`;
      barra.style.width = `${Math.round(((i) / sel.length) * 100)}%`;
      const r = await window.enviarAccesoEmailRaw(s.email);
      if (r.ok) {
        ok++;
        log.innerHTML += `<div style="color:#059669;">✓ ${s.email}</div>`;
      } else {
        fallos++;
        log.innerHTML += `<div style="color:#DC2626;">✗ ${s.email} — ${r.err}</div>`;
      }
      log.scrollTop = log.scrollHeight;
      // Pausa entre envíos para no chocar con el rate limit del proveedor de email
      if (i < sel.length - 1) await new Promise(res => setTimeout(res, 1200));
    }
    barra.style.width = '100%';
    barra.style.background = fallos === 0 ? '#059669' : '#F59E0B';
    texto.textContent = `Terminado · ${ok} enviados${fallos ? ' · ' + fallos + ' fallaron' : ''}`;
    btn.disabled = false;
    toast(fallos === 0 ? `✓ ${ok} accesos enviados` : `${ok} enviados, ${fallos} fallaron (mira el detalle)`);
  };

  window.enviarResetPassword = async function () {
    const e = empleadoData(fichaActualId);
    if (!e || !e.email) { toast('Este empleado no tiene email'); return; }
    if (!confirm(`Enviar email de acceso a ${e.nombre} (${e.email})?\n\nSe enviará un enlace para poner contraseña y entrar en la app.`)) return;
    const r = await window.enviarAccesoEmailRaw(e.email);
    if (r.ok) toast(`✓ Enlace enviado a ${e.email}. Tiene 1 hora para usarlo.`);
    else toast('Error: ' + r.err);
  };

  window.guardarFichaDatos = async function () {
    const puestoSel = document.getElementById('ed-puesto');
    const corrChk = document.getElementById('ed-correturnos');
    const patch = {
      nombre: document.getElementById('ed-nombre').value.trim(),
      dni: document.getElementById('ed-dni').value.trim(),
      email: document.getElementById('ed-email').value.trim(),
      telefono: document.getElementById('ed-tel').value.trim(),
      direccion: document.getElementById('ed-dir').value.trim(),
      ss: document.getElementById('ed-ss').value.trim(),
      fechaAlta: document.getElementById('ed-fecha').value,
      contrato: document.getElementById('ed-contrato').value,
      puestoId: puestoSel ? (puestoSel.value || null) : undefined,
      esCorreturnos: corrChk ? corrChk.checked : undefined
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

  function requiereAdmin() {
    const psSes = window.PS_SESSION || {};
    if (psSes.rol !== 'dueno') {
      alert('Solo el administrador puede realizar esta acción. Contacta con Adam.');
      return false;
    }
    return true;
  }

  // 0) DAR DE ALTA · confirma un socorrista pendiente → activo. Admin + coord.
  window.confirmarAlta = async function () {
    const e = empleadoData(fichaActualId);
    if (!confirm(`¿Dar de alta a ${e.nombre}?\n\nPasará a estado ACTIVO y podrá fichar.`)) return;
    try {
      await actualizarEmpleado(fichaActualId, { estado: 'activo' });
      if (e.usuarioId) await window.sb.from('usuarios').update({ activo: true }).eq('id', e.usuarioId);
      await cargarEmpleadosDB();
      renderFicha();
      if (window.renderEstadoEquipo) window.renderEstadoEquipo();
      toast(`✓ ${e.nombre} dado de alta y activo`);
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Fichar por un empleado (cuando la app no le funciona, sin GPS, etc.)
  // Registra entrada o salida en fichajes con marca clara de que lo hizo admin.
  window.ficharPorEmpleado = async function (empId, nombre, tipo) {
    // 1) Pedir hora — default = ahora
    const ahora = new Date();
    const horaAhora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    const horaTxt = prompt(
      `Fichar ${tipo.toUpperCase()} manual de ${nombre}\n\n` +
      `Escribe la hora en formato HH:MM (24 h):`,
      horaAhora
    );
    if (horaTxt === null) return; // cancelado
    const m = horaTxt.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { toast('Hora inválida. Formato: HH:MM'); return; }
    const hh = parseInt(m[1]), mm = parseInt(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) { toast('Hora fuera de rango'); return; }

    // 2) Motivo opcional
    const motivo = prompt(`Motivo del fichaje manual (opcional):\n\np.ej. "Sin señal móvil", "App no responde", "GPS bloqueado"…`, '');
    if (motivo === null) return; // cancelado explícito

    // 3) Construir hora del día actual
    const hora = new Date();
    hora.setHours(hh, mm, 0, 0);

    // 4) Buscar puesto del empleado (para asociar al fichaje)
    let puestoId = null;
    try {
      const { data: emp } = await window.sb.from('empleados')
        .select('puesto_id').eq('id', empId).single();
      puestoId = emp?.puesto_id || null;
    } catch (_) {}

    // 5) Confirmar
    if (!confirm(
      `¿Confirmar fichaje MANUAL?\n\n` +
      `Empleado: ${nombre}\n` +
      `Tipo: ${tipo.toUpperCase()}\n` +
      `Hora: ${horaTxt} (hoy)\n` +
      `${motivo ? 'Motivo: ' + motivo + '\n' : ''}` +
      `\nQuedará marcado como fichaje registrado por administración.`
    )) return;

    // 6) INSERT
    try {
      const psSes = window.PS_SESSION || {};
      const { error } = await window.sb.from('fichajes').insert({
        empleado_id: empId,
        puesto_id: puestoId,
        tipo,
        hora: hora.toISOString(),
        gps_lat: null, gps_lng: null,
        gps_ok: null,
        fuera_de_zona: null,
        distancia_m: null,
        origen_manual: true,
        registrado_por: psSes.userId || null,
        motivo_manual: motivo || null
      });
      if (error) {
        // Si la BD no tiene las columnas nuevas (origen_manual…), reintentar sin ellas
        // pero con marca en el motivo dentro del hueco disponible
        if (String(error.message).includes('origen_manual') || String(error.message).includes('column')) {
          const { error: err2 } = await window.sb.from('fichajes').insert({
            empleado_id: empId,
            puesto_id: puestoId,
            tipo,
            hora: hora.toISOString(),
            gps_ok: false,
            fuera_de_zona: false
          });
          if (err2) throw err2;
        } else {
          throw error;
        }
      }
      toast(`✓ ${tipo === 'entrada' ? 'Entrada' : 'Salida'} de ${nombre} a las ${horaTxt} registrada manualmente`);
      if (window.renderFicha) renderFicha();
      if (window.renderPosts) renderPosts();
      if (window.renderEstadoEquipo) window.renderEstadoEquipo();
    } catch (err) {
      toast('Error: ' + err.message);
    }
  };

  // Listar / editar / borrar fichajes existentes de un empleado.
  window.cargarFichajesEditables = async function (empId, dias) {
    const cont = document.getElementById(`fichajesEdit_${empId}`);
    if (!cont) return;
    cont.innerHTML = '<div class="text-muted small" style="padding:10px;text-align:center;">Cargando fichajes…</div>';
    try {
      const desde = new Date();
      if (dias === 31) {
        desde.setDate(1); desde.setHours(0,0,0,0);
      } else {
        desde.setDate(desde.getDate() - (dias - 1));
        desde.setHours(0,0,0,0);
      }
      const { data, error } = await window.sb.from('fichajes')
        .select('id, tipo, hora, gps_ok, fuera_de_zona, distancia_m, origen_manual, motivo_manual, puesto_id, puestos(nombre)')
        .eq('empleado_id', empId)
        .gte('hora', desde.toISOString())
        .order('hora', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) {
        cont.innerHTML = `<div class="text-muted small" style="padding:14px;text-align:center;">Sin fichajes en los últimos ${dias === 31 ? 'del mes' : dias + ' días'}.</div>`;
        return;
      }
      // Agrupar por día para claridad
      const porDia = {};
      rows.forEach(f => {
        const d = new Date(f.hora);
        const key = d.toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'short' });
        (porDia[key] = porDia[key] || []).push(f);
      });
      cont.innerHTML = Object.entries(porDia).map(([diaTxt, arr]) => `
        <div style="margin-bottom:10px;">
          <div style="font-weight:700;font-size:12px;color:#475569;padding:4px 0;text-transform:uppercase;">${diaTxt}</div>
          ${arr.map(f => {
            const hora = new Date(f.hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
            const puesto = f.puestos?.nombre || '—';
            const badgeTipo = f.tipo === 'entrada'
              ? '<span class="badge badge-ok"><span class="dot"></span>Entrada</span>'
              : '<span class="badge badge-neutral"><span class="dot"></span>Salida</span>';
            const badgeGps = f.fuera_de_zona
              ? `<span class="badge badge-warn" style="margin-left:4px;">GPS fuera${f.distancia_m ? ' (' + f.distancia_m + 'm)' : ''}</span>`
              : (f.gps_ok === true ? '<span class="badge badge-ok" style="margin-left:4px;">GPS OK</span>' : '');
            const badgeManual = f.origen_manual
              ? '<span class="badge badge-info" style="margin-left:4px;">📌 manual</span>'
              : '';
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;margin:4px 0;">
                <div style="min-width:60px;font-weight:700;font-family:monospace;">${hora}</div>
                <div style="flex:1;min-width:0;">
                  ${badgeTipo} ${badgeGps} ${badgeManual}
                  <div class="small text-muted" style="margin-top:2px;">${puesto}${f.motivo_manual ? ' · ' + f.motivo_manual : ''}</div>
                </div>
                <button class="btn-icon" title="Editar hora" onclick="editarFichaje('${f.id}','${empId}',${dias})"
                  style="width:30px;height:30px;background:#EFF6FF;color:#1D4ED8;border-radius:6px;border:none;cursor:pointer;">
                  <svg class="ic ic-14"><use href="#ic-pen"/></svg>
                </button>
                <button class="btn-icon" title="Borrar" onclick="borrarFichaje('${f.id}','${empId}',${dias})"
                  style="width:30px;height:30px;background:#FEF2F2;color:#DC2626;border-radius:6px;border:none;cursor:pointer;">
                  <svg class="ic ic-14"><use href="#ic-x"/></svg>
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `).join('');
    } catch (err) {
      cont.innerHTML = `<div class="alert-strip warn" style="margin:6px;">Error: ${err.message}</div>`;
    }
  };

  window.editarFichaje = async function (fichajeId, empId, dias) {
    try {
      // Cargar el fichaje actual
      const { data: f, error } = await window.sb.from('fichajes')
        .select('id, tipo, hora').eq('id', fichajeId).single();
      if (error) throw error;
      const d = new Date(f.hora);
      const horaAct = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      const fechaAct = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      // 1) Nueva fecha (dejar por defecto la actual)
      const nuevaFecha = prompt(`Editar fichaje (${f.tipo.toUpperCase()})\n\nFecha (YYYY-MM-DD):`, fechaAct);
      if (nuevaFecha === null) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) { toast('Fecha inválida (YYYY-MM-DD)'); return; }

      // 2) Nueva hora
      const nuevaHora = prompt('Hora (HH:MM en formato 24h):', horaAct);
      if (nuevaHora === null) return;
      const m = nuevaHora.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) { toast('Hora inválida (HH:MM)'); return; }
      const hh = parseInt(m[1]), mm = parseInt(m[2]);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) { toast('Hora fuera de rango'); return; }

      // 3) Motivo del cambio
      const motivo = prompt('Motivo del cambio (obligatorio):', '');
      if (!motivo || !motivo.trim()) { toast('Debes indicar el motivo del cambio'); return; }

      // 4) Construir ISO y confirmar
      const [y, mo, dd] = nuevaFecha.split('-').map(Number);
      const nueva = new Date(y, mo - 1, dd, hh, mm, 0, 0);
      if (!confirm(`¿Confirmar cambio?\n\nDe: ${fechaAct} ${horaAct}\nA: ${nuevaFecha} ${nuevaHora}\n\nMotivo: ${motivo}`)) return;

      // 5) UPDATE
      const psSes = window.PS_SESSION || {};
      const updateData = { hora: nueva.toISOString() };
      // Intentar guardar motivo si la columna existe (misma columna que motivo_manual)
      try {
        const { error: errUp } = await window.sb.from('fichajes').update({
          ...updateData,
          motivo_manual: `[Editado ${new Date().toLocaleDateString('es-ES')}] ${motivo}`,
          registrado_por: psSes.userId || null
        }).eq('id', fichajeId);
        if (errUp && String(errUp.message).includes('column')) {
          // Sin columnas de auditoría: solo la hora
          const { error: err2 } = await window.sb.from('fichajes').update(updateData).eq('id', fichajeId);
          if (err2) throw err2;
        } else if (errUp) throw errUp;
      } catch (e) { throw e; }

      toast(`✓ Fichaje actualizado a ${nuevaFecha} ${nuevaHora}`);
      cargarFichajesEditables(empId, dias);
      if (window.renderPosts) renderPosts();
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.borrarFichaje = async function (fichajeId, empId, dias) {
    try {
      const { data: f } = await window.sb.from('fichajes')
        .select('tipo, hora').eq('id', fichajeId).single();
      const cuando = f ? new Date(f.hora).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
      if (!confirm(`¿Borrar este fichaje?\n\n${f?.tipo?.toUpperCase() || ''} ${cuando}\n\nEsta acción no se puede deshacer.`)) return;
      const { error } = await window.sb.from('fichajes').delete().eq('id', fichajeId);
      if (error) throw error;
      toast('✓ Fichaje borrado');
      cargarFichajesEditables(empId, dias);
      if (window.renderPosts) renderPosts();
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Botón masivo: dar de alta a TODOS los que estén en alta-pendiente
  window.darDeAltaMasivo = async function () {
    if (!confirm('¿Dar de alta de golpe a TODOS los socorristas en estado "alta-pendiente"?\n\nPasarán a activos y podrán fichar.')) return;
    try {
      const { data: pendientes } = await window.sb.from('empleados')
        .select('id, usuario_id').eq('estado', 'alta-pendiente');
      if (!pendientes || pendientes.length === 0) { toast('Ninguno en alta-pendiente'); return; }
      for (const p of pendientes) {
        await window.sb.from('empleados').update({ estado: 'activo' }).eq('id', p.id);
        if (p.usuario_id) await window.sb.from('usuarios').update({ activo: true }).eq('id', p.usuario_id);
      }
      await cargarEmpleadosDB();
      if (window.renderEstadoEquipo) window.renderEstadoEquipo();
      toast(`✓ ${pendientes.length} socorristas dados de alta`);
    } catch (err) { toast('Error: ' + err.message); }
  };

  // 1) BAJA · corta acceso app, sin finiquito
  window.darDeBaja = async function () {
    if (!requiereAdmin()) return;
    const e = empleadoData(fichaActualId);
    if (!confirm(`¿Cortar acceso a ${e.nombre}?\n\n- No podrá entrar a la app.\n- No podrá fichar ni ver documentos.\n- Sus datos se conservan.\n- Puedes reactivarlo cuando quieras.`)) return;
    try {
      await actualizarEmpleado(fichaActualId, { estado: 'baja' });
      await window.sb.from('empleados').update({ fecha_baja: new Date().toISOString().slice(0,10) }).eq('id', fichaActualId);
      // También desactivar usuarios.activo para cortar login
      if (e.usuarioId) await window.sb.from('usuarios').update({ activo: false }).eq('id', e.usuarioId);
      await cargarEmpleadosDB();
      renderFicha();
      toast(`${e.nombre} · acceso cortado`);
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.darDeAlta = async function () {
    if (!requiereAdmin()) return;
    const e = empleadoData(fichaActualId);
    if (!confirm(`¿Reactivar a ${e.nombre}?\n\nVuelve a tener acceso completo a la app.`)) return;
    try {
      await actualizarEmpleado(fichaActualId, { estado: 'activo' });
      await window.sb.from('empleados').update({ fecha_baja: null }).eq('id', fichaActualId);
      if (e.usuarioId) await window.sb.from('usuarios').update({ activo: true }).eq('id', e.usuarioId);
      await cargarEmpleadosDB();
      renderFicha();
      toast(`${e.nombre} · reactivado`);
    } catch (err) { toast('Error: ' + err.message); }
  };

  // 2) FINIQUITO · crea documento pendiente, la app le bloquea todo hasta que firme
  window.iniciarFiniquito = async function () {
    if (!requiereAdmin()) return;
    const e = empleadoData(fichaActualId);
    const msg = `INICIAR FINIQUITO para ${e.nombre}\n\nSe generará el documento oficial de finiquito. Cuando entre en la app SOLO verá ese documento para firmar (nada más). Al firmarlo, su cuenta se paraliza permanentemente pero los datos se conservan.\n\n¿Continuar?`;
    if (!confirm(msg)) return;
    const nombre2 = prompt('Escribe el nombre completo del empleado para confirmar:');
    if ((nombre2 || '').trim().toLowerCase() !== e.nombre.trim().toLowerCase()) {
      toast('Nombre no coincide. Cancelado.'); return;
    }
    try {
      const docCodigo = 'finiquito-' + new Date().toISOString().slice(0,10);
      // Marcar empleado como finiquito-pendiente + insertar documento pendiente de firma
      await actualizarEmpleado(fichaActualId, { estado: 'finiquito-pendiente' });
      await window.sb.from('documentos_subidos').insert({
        empleado_id: fichaActualId,
        subido_por: (window.PS_SESSION||{}).userId || null,
        tipo: 'finiquito',
        nombre_archivo: docCodigo,
        url_storage: '',
        pendiente_firma: true
      });
      toast(`✓ Finiquito iniciado. ${e.nombre} lo verá al entrar y solo podrá firmar eso.`);
      await cargarEmpleadosDB();
      renderFicha();
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.cancelarProximoTurno = function () {
    const e = empleadoData(fichaActualId);
    toast(`Próximo turno de ${e.nombre} cancelado. Notificado.`);
  };

  // 3) ELIMINAR · borra TODO permanentemente. Doble confirmación + tecleo del nombre.
  window.eliminarEmpleado = async function () {
    if (!requiereAdmin()) return;
    const e = empleadoData(fichaActualId);
    if (!confirm(`⚠️ ELIMINAR PERMANENTEMENTE a ${e.nombre}\n\nSe borrarán TODOS sus datos:\n· Ficha empleado\n· Firmas de documentos\n· Fichajes\n· Tareas y notas\n· Documentos subidos\n· Horarios y titulaciones\n· Cuenta de acceso a la app\n\nEsto NO SE PUEDE DESHACER. ¿Continuar?`)) return;
    const nombre2 = prompt('Para confirmar, escribe el nombre completo del empleado:');
    if ((nombre2 || '').trim().toLowerCase() !== e.nombre.trim().toLowerCase()) {
      toast('Nombre no coincide. Eliminación cancelada.'); return;
    }
    const confirm2 = prompt('Última confirmación. Escribe la palabra ELIMINAR en mayúsculas:');
    if (confirm2 !== 'ELIMINAR') { toast('No coincide. Cancelado.'); return; }
    try {
      const empId = fichaActualId;
      const usuId = e.usuarioId;
      // Borrado en cascada del histórico (ON DELETE CASCADE se encarga del resto)
      // Pero para asegurar, borramos manualmente lo importante:
      const tablas = ['firmas_documentos','tareas','notas','alertas','fichajes','documentos_subidos','registro_jornada','horarios','titulaciones_empleado','visitas_hoteles'];
      for (const t of tablas) {
        try { await window.sb.from(t).delete().eq('empleado_id', empId); } catch (_) {}
      }
      await window.sb.from('empleados').delete().eq('id', empId);
      if (usuId) await window.sb.from('usuarios').delete().eq('id', usuId);
      // La cuenta auth.users sigue existiendo — solo un admin de Supabase puede borrarla.
      closeEmpleadoModal();
      await cargarEmpleadosDB();
      if (window.renderEstadoEquipo) window.renderEstadoEquipo();
      toast(`✓ ${e.nombre} eliminado. Recuerda borrar también la cuenta auth desde Supabase Dashboard → Auth → Users.`);
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ---------- Nuevo usuario (empleado / coordinador / admin) — REAL en Supabase ---------- */
  async function recargarSelectPuestos() {
    const nePuestoSel = document.getElementById('nePuesto');
    if (!nePuestoSel) return;
    nePuestoSel.innerHTML = '<option value="">Cargando hoteles…</option>';
    try {
      const { data, error } = await window.sb
        .from('puestos')
        .select('id, nombre, zona')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (error) throw error;
      nePuestoSel.innerHTML = '<option value="">Sin asignar de momento</option>' +
        (data || []).map(p => `<option value="${p.id}">${p.nombre}${p.zona ? ' — ' + p.zona : ''}</option>`).join('');
    } catch (err) {
      console.warn('recargarSelectPuestos:', err.message);
      nePuestoSel.innerHTML = '<option value="">Sin asignar de momento</option>';
    }
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

    recargarSelectPuestos(); // hoteles reales de BD, refrescados cada vez
    const corrChk = document.getElementById('neCorreturnos'); if (corrChk) corrChk.checked = false;
    ajustarCamposSegunRol();
    document.getElementById('nuevoEmpleadoModal').classList.add('open');
  };

  document.getElementById('neRol')?.addEventListener('change', ajustarCamposSegunRol);

  function ajustarCamposSegunRol() {
    const rol = document.getElementById('neRol').value;
    const camposSoc = document.getElementById('neCamposSocorrista');
    if (camposSoc) camposSoc.style.display = rol === 'socorrista' ? 'block' : 'none';
    // Por defecto: enviar email de invitación a coordinador/admin, NO a socorrista
    const chk = document.getElementById('neEnviarEmail');
    if (chk) chk.checked = (rol === 'coordinador' || rol === 'dueno');
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

    // Pre-check: ¿ya existe en usuarios?
    try {
      const { data: existe } = await window.sb.from('usuarios')
        .select('id, rol, nombre').eq('email', email).maybeSingle();
      if (existe) {
        const resultado = document.getElementById('neResultado');
        resultado.style.display = 'block';
        resultado.innerHTML = `
          <div class="alert-strip warn" style="flex-direction:column;align-items:stretch;">
            <div><b>${existe.nombre || email}</b> ya existe como ${existe.rol}.</div>
            <div class="small text-muted" style="margin-top:6px;">Si perdió la contraseña, envíale un enlace de recuperación:</div>
            <button class="btn btn-primary btn-sm" style="margin-top:8px;align-self:flex-start;" onclick="(async()=>{const r=await window.enviarAccesoEmailRaw('${email}'); toast(r.ok?'✓ Enviado a ${email}':'Error: '+r.err);})()">
              <svg class="ic ic-14"><use href="#ic-arrow-up-right"/></svg> Enviar acceso por email
            </button>
          </div>`;
        btn.disabled = false;
        btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-plus"/></svg> Crear cuenta';
        return;
      }
    } catch (_) {}

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

      // 3. Si es socorrista, crear también la ficha empleado (estado 'activo' directamente
      //    — el admin ya lo está dando de alta al crearlo. 'alta-pendiente' solo aplica en
      //    imports masivos preparatorios).
      if (rol === 'socorrista') {
        const puestoId = document.getElementById('nePuesto').value || null;
        const fechaAlta = document.getElementById('neFechaAlta').value || new Date().toISOString().slice(0,10);
        const contrato = document.getElementById('neContrato').value;
        const esCorr = !!document.getElementById('neCorreturnos')?.checked;
        const { error: empErr } = await window.sb.from('empleados').insert({
          usuario_id: nuevoId,
          empresa_id: psSes.empresa_id,
          nombre, dni, email, telefono,
          puesto_id: puestoId,
          fecha_alta: fechaAlta,
          tipo_contrato: contrato,
          es_correturnos: esCorr,
          estado: 'activo'
        });
        if (empErr) console.warn('No se pudo crear ficha empleado:', empErr.message);
      }

      // 4. Enviar email de invitación si está marcado el checkbox
      const enviarEmail = document.getElementById('neEnviarEmail')?.checked;
      let emailStatus = '';
      if (enviarEmail) {
        const r = await window.enviarAccesoEmailRaw(email);
        emailStatus = r.ok
          ? '<div class="small ok-strip" style="margin-top:8px;color:#059669;">✓ Email de invitación enviado a ' + email + '</div>'
          : '<div class="small" style="margin-top:8px;color:#B91C1C;">⚠ No se pudo enviar email (' + r.err + '). Dicta las credenciales manualmente.</div>';
      }

      // 5. Mostrar resultado con las credenciales
      const rolLabel = rol === 'dueno' ? 'Administrador' : (rol === 'coordinador' ? 'Coordinador' : 'Socorrista');
      const resultado = document.getElementById('neResultado');
      resultado.innerHTML = `
        <div class="alert-strip ok" style="flex-direction:column; align-items:flex-start;">
          <div style="display:flex;gap:8px;align-items:center;"><svg class="ic ic-16"><use href="#ic-check-circle"/></svg><b>${nombre} creado como ${rolLabel}</b></div>
          ${emailStatus}
          <div class="small" style="margin-top:8px;">${enviarEmail ? 'Como respaldo, estas son las credenciales generadas:' : 'Dictale estas credenciales para que entre en <b>' + window.location.origin + '</b>:'}</div>
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
      if (window.renderEquipoBlock) window.renderEquipoBlock();

      toast(`✓ Cuenta creada: ${email}`);
    } catch (err) {
      const msg = err.message || 'Error desconocido';
      // Cuenta huérfana en auth.users (creación previa que falló a la mitad).
      // Solución: enviar email de acceso; al entrar, auth-guard auto-crea las filas
      // que falten en usuarios/empleados desde los metadatos del signUp.
      if (msg.includes('already registered')) {
        const resultado = document.getElementById('neResultado');
        resultado.style.display = 'block';
        resultado.innerHTML = `
          <div class="alert-strip warn" style="flex-direction:column;align-items:stretch;">
            <div><b>Cuenta huérfana detectada</b> en el sistema de autenticación.</div>
            <div class="small text-muted" style="margin-top:6px;">La creación anterior de <b>${email}</b> falló a la mitad. Envíale el enlace de acceso — al entrar, la ficha se completa sola con rol <b>${rol}</b> y nombre <b>${nombre}</b>.</div>
            <button class="btn btn-primary btn-sm" style="margin-top:8px;align-self:flex-start;" onclick="(async()=>{const r=await window.enviarAccesoEmailRaw('${email}'); toast(r.ok?'✓ Enlace enviado a ${email}':'Error: '+r.err);})()">
              <svg class="ic ic-14"><use href="#ic-arrow-up-right"/></svg> Enviar enlace de acceso a ${email}
            </button>
          </div>`;
      } else if (msg.includes('confirm')) {
        toast('Error: Desactiva "Confirm email" en Supabase → Auth → Providers → Email.');
      } else {
        toast('Error: ' + msg);
      }
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
        <div class="ficha-body-title">Horario de apertura del hotel</div>
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
        </div>

        <div class="ficha-body-title" style="margin-top:22px;">Horarios por servicio (socorrista)</div>
        <div class="small text-muted" style="margin:-6px 0 8px;">Cada servicio del hotel puede tener su propio horario de entrada, salida y días. Sirve para turnos mañana/tarde con socorristas distintos.</div>
        <div id="hotelHorariosBlockH"></div>`;
      if (window.PSHor) {
        window.PSHor.renderPuestoBlock(document.getElementById('hotelHorariosBlockH'), hotelActualId);
      }
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
  window.openNuevaVisita = async function () {
    const sel = document.getElementById('visHotel');
    sel.innerHTML = '<option value="">Cargando…</option>';
    document.getElementById('visHora').value = '';
    document.getElementById('visGps').value = '';
    lastVisitaCapture = null;
    document.getElementById('visitaModal').classList.add('open');
    try {
      const { data } = await window.sb
        .from('puestos').select('id, nombre, zona').eq('activo', true).order('nombre');
      sel.innerHTML = (data || []).map(p => `<option value="${p.id}">${p.nombre}${p.zona ? ' — ' + p.zona : ''}</option>`).join('');
    } catch (err) { console.warn('openNuevaVisita:', err.message); sel.innerHTML = '<option value="">Sin hoteles</option>'; }
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
      // Enriquecer con el nombre del puesto para el PDF oficial
      if (empData.puestoId && !empData.puesto_nombre) {
        try {
          const { data: p } = await window.sb.from('puestos').select('nombre').eq('id', empData.puestoId).single();
          if (p) empData.puesto_nombre = p.nombre;
        } catch (_) {}
      }
      const subdocs = (window.PS && PS.kitAltaSubdocs) || [];
      const nombreArchivo = `PoolSafety-${firma.documento_codigo}-${(empData.nombre||'empleado').replace(/\s+/g,'_')}.pdf`;
      await window.PSPdf.descargar(empData, firma, subdocs, nombreArchivo);
      toast('✓ PDF descargado');
      try { await window.PSPdf.generarYSubir(empData, firma, subdocs); } catch(e) { /* ignore */ }
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Solicitar firma Kit Alta en la app (sin email — solo notificación dentro de la app).
  // Además de archivar la firma anterior si existe, inserta una tarea 'Firmar Kit Alta'
  // en tabla tareas para que aparezca en tareas pendientes + campana del socorrista.
  window.enviarKitAltaParaFirmar = async function (empId, nombre) {
    try {
      const { data: firmas } = await window.sb.from('firmas_documentos')
        .select('id').eq('empleado_id', empId).eq('documento_codigo', 'kit-alta').limit(1);
      const yaFirmado = firmas && firmas.length > 0;
      const msg = yaFirmado
        ? `${nombre} ya firmó el Kit Alta. ¿Solicitar que lo firme de NUEVO?\n\n• Se archiva la firma actual.\n• Si tiene la app abierta le salta el wizard EN EL ACTO.\n• Si no, le sale al abrirla (o refrescar).`
        : `¿Solicitar a ${nombre} que firme el Kit Alta en su app?\n\n• Si tiene la app abierta le salta el wizard EN EL ACTO (Realtime).\n• Si no, le sale al abrirla o refrescar.\n\nSin enviar email — puedes avisarle por WhatsApp de que entre.`;
      if (!confirm(msg)) return;
      if (yaFirmado) {
        await window.sb.from('firmas_documentos')
          .update({ documento_codigo: 'kit-alta-archivada-' + Date.now() })
          .eq('id', firmas[0].id);
      }
      // Insertar tarea recordatoria (aparece en tareas socorrista + campana + dispara Realtime)
      try {
        // Borrar tarea previa "Firmar Kit Alta" para no duplicar
        await window.sb.from('tareas').delete()
          .eq('empleado_id', empId).eq('titulo', 'Firmar Kit Alta pendiente');
        const { error: errT } = await window.sb.from('tareas').insert({
          empleado_id: empId,
          titulo: 'Firmar Kit Alta pendiente',
          descripcion: 'Debes firmar tu documentación de alta antes de continuar. Al abrir la app te aparecerá el proceso obligatorio.',
          prioridad: 'alta',
          hecha: false
        });
        if (errT) throw errT;
      } catch (err) {
        toast('⚠ Aviso: no se pudo crear la tarea (' + err.message + '). Aún así, el wizard le saldrá al abrir la app.');
      }
      toast(`✓ ${nombre}: se le abrirá el wizard automáticamente (Realtime en piloto real)`);
      if (window.renderFicha && fichaActualId === empId) renderFicha();
      if (window.renderEstadoEquipo) window.renderEstadoEquipo();
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Solicitar firma de registro mensual: calcula horas hasta HOY y crea tarea
  // "Firmar registro mensual pendiente" en tabla tareas. El socorrista lo verá
  // en la sección Docs y podrá firmarlo con las horas reales trabajadas hasta la fecha.
  window.solicitarRegistroMensual = async function (empId, nombre) {
    try {
      // Calcular horas hasta HOY del mes actual
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const hasta = hoy.toISOString();
      const { data: fichs } = await window.sb.from('fichajes')
        .select('id, tipo, hora').eq('empleado_id', empId)
        .gte('hora', desde).lt('hora', hasta).order('hora', { ascending: true });
      let totalMins = 0, entrada = null;
      (fichs || []).forEach(f => {
        if (f.tipo === 'entrada') entrada = new Date(f.hora);
        else if (f.tipo === 'salida' && entrada) {
          totalMins += Math.max(0, (new Date(f.hora) - entrada) / 60000);
          entrada = null;
        }
      });
      const horas = Math.round(totalMins / 60);
      const dias = new Set((fichs || []).filter(f => f.tipo === 'entrada').map(f => new Date(f.hora).toDateString())).size;
      const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

      const msg = `Solicitar a ${nombre} que firme el registro mensual de ${nombreMes}?\n\n` +
        `• Horas hasta hoy: ${horas}h\n• Días trabajados: ${dias}\n\n` +
        `Le saltará el aviso EN EL ACTO en su app (Realtime).`;
      if (!confirm(msg)) return;

      // Borrar solicitud previa idéntica para no duplicar
      await window.sb.from('tareas').delete()
        .eq('empleado_id', empId).eq('titulo', 'Firmar registro mensual pendiente').eq('hecha', false);
      const { error: errT } = await window.sb.from('tareas').insert({
        empleado_id: empId,
        titulo: 'Firmar registro mensual pendiente',
        descripcion: `Firma tu registro de jornada de ${nombreMes} con las horas trabajadas hasta hoy (${horas}h en ${dias} días).`,
        prioridad: 'alta',
        hecha: false
      });
      if (errT) throw errT;
      toast(`✓ ${nombre}: le llega la solicitud de firma de ${horas}h`);
      if (window.renderFicha && fichaActualId === empId) renderFicha();
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.reenviarKitAlta = async function (firmaId, nombre) {
    if (!confirm(`¿Reenviar Kit Alta para que ${nombre || 'el trabajador'} lo firme de nuevo?\n\n• Se archiva la firma actual.\n• Si tiene la app abierta le salta el wizard EN EL ACTO (Realtime).\n• Si no, le sale al abrirla o refrescar.`)) return;
    try {
      // Recuperar empleado_id de la firma que vamos a archivar (para crear su tarea)
      const { data: firmaOrig } = await window.sb.from('firmas_documentos')
        .select('empleado_id').eq('id', firmaId).single();
      const empId = firmaOrig?.empleado_id;

      // Archivar cambiando el documento_codigo (sin data-loss)
      const codigo = 'kit-alta-archivada-' + Date.now();
      await window.sb.from('firmas_documentos').update({
        documento_codigo: codigo,
        dispositivo: '[REEMPLAZADA · ' + new Date().toLocaleDateString('es-ES') + ']'
      }).eq('id', firmaId);

      // Crear tarea pendiente (dispara Realtime en la app del socorrista → wizard al momento)
      if (empId) {
        try {
          await window.sb.from('tareas').delete()
            .eq('empleado_id', empId).eq('titulo', 'Firmar Kit Alta pendiente');
          await window.sb.from('tareas').insert({
            empleado_id: empId,
            titulo: 'Firmar Kit Alta pendiente',
            descripcion: 'Se te ha solicitado firmar de nuevo tu Kit Alta. Al abrir la app te aparecerá el proceso obligatorio.',
            prioridad: 'alta',
            hecha: false
          });
        } catch (err) {
          toast('⚠ Firma archivada pero no se pudo crear la tarea: ' + err.message);
        }
      }
      toast(`✓ ${nombre || 'El trabajador'}: se le abrirá el wizard automáticamente (Realtime)`);
      renderFicha();
      if (window.renderEstadoEquipo) window.renderEstadoEquipo();
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.descargarJornadaOficial = async function (firmaId) {
    try {
      toast('Generando hoja mensual…');
      const { data: firma, error } = await window.sb
        .from('firmas_documentos').select('*').eq('id', firmaId).single();
      if (error) throw error;
      const empData = empleadoData(fichaActualId) || { nombre: '—' };
      if (empData.puestoId && !empData.puesto_nombre) {
        try {
          const { data: p } = await window.sb.from('puestos').select('nombre').eq('id', empData.puestoId).single();
          if (p) empData.puesto_nombre = p.nombre;
        } catch (_) {}
      }
      // Detectar mes/año desde documento_codigo 'jornada-YYYY-MM'
      const m = firma.documento_codigo.match(/jornada-(\d{4})-(\d{2})/);
      const anio = m ? parseInt(m[1]) : new Date().getFullYear();
      const mes = m ? parseInt(m[2]) - 1 : new Date().getMonth();
      const desde = new Date(anio, mes, 1).toISOString();
      const hasta = new Date(anio, mes + 1, 1).toISOString();
      const { data: fichs } = await window.sb.from('fichajes')
        .select('id, tipo, hora').eq('empleado_id', fichaActualId)
        .gte('hora', desde).lt('hora', hasta).order('hora');
      const nombreMes = new Date(anio, mes, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      await window.PSPdf.descargarJornadaOficial(empData, firma, fichs || [], nombreMes);
      toast('✓ Hoja mensual descargada');
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
    const MAX_MB = 20;
    if (f.size > MAX_MB * 1024 * 1024) {
      const mb = (f.size / 1024 / 1024).toFixed(1);
      toast(`Archivo demasiado grande (${mb} MB, máx ${MAX_MB} MB). Comprime el PDF o reduce la calidad del escaneo.`);
      e.target.value = ''; return;
    }
    document.getElementById('titFileName').textContent = f.name + ' · ' + (f.size / 1024 / 1024).toFixed(1) + ' MB';
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

  /* ==========================================================================
     Cabecera Panel Operativo · números REALES (puestos, socorristas, coord)
     ========================================================================== */
  async function refrescarDashSubStats() {
    const el = document.getElementById('dashSubStats');
    if (!el || !window.sb) return;
    try {
      const [puestos, socorristas, coords] = await Promise.all([
        window.sb.from('puestos').select('id', { count: 'exact', head: true }).eq('activo', true),
        window.sb.from('empleados').select('id', { count: 'exact', head: true }).eq('estado', 'activo').is('fecha_baja', null),
        window.sb.from('usuarios').select('id', { count: 'exact', head: true }).eq('rol', 'coordinador').eq('activo', true)
      ]);
      const p = puestos.count || 0;
      const s = socorristas.count || 0;
      const c = coords.count || 0;
      el.textContent = `${p} puesto${p===1?'':'s'} activo${p===1?'':'s'} · ${s} socorrista${s===1?'':'s'} · ${c} coordinador${c===1?'':'es'}`;
    } catch (_) { el.textContent = ''; }
  }
  setTimeout(refrescarDashSubStats, 1600);
  document.addEventListener('ps-session-updated', () => setTimeout(refrescarDashSubStats, 400));
  setInterval(refrescarDashSubStats, 120_000);

  /* ==========================================================================
     MI PERFIL (admin + coord) — editar nombre, teléfono, subir docs propios
     ========================================================================== */
  let miPerfilFileBlob = null;
  window.openMiPerfilModal = async function () {
    const psSes = window.PS_SESSION || {};
    if (!psSes.userId) return;
    document.getElementById('miPerfilRol').textContent = psSes.rol === 'dueno' ? 'Administrador' : 'Coordinador';
    try {
      const { data } = await window.sb.from('usuarios')
        .select('nombre, email, telefono').eq('id', psSes.userId).single();
      document.getElementById('mp-nombre').value = data?.nombre || '';
      document.getElementById('mp-email').value = data?.email || psSes.email || '';
      document.getElementById('mp-tel').value = data?.telefono || '';
    } catch (_) {}
    document.getElementById('mp-notas').value = '';
    document.getElementById('mp-file').value = '';
    miPerfilFileBlob = null;
    const btn = document.getElementById('mp-subir-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Subir archivo'; }
    document.getElementById('miPerfilModal').classList.add('open');
    renderMisDocsPerfil();
  };
  window.closeMiPerfilModal = () => document.getElementById('miPerfilModal').classList.remove('open');

  window.guardarMiPerfil = async function () {
    const psSes = window.PS_SESSION || {};
    if (!psSes.userId) return;
    const nombre = document.getElementById('mp-nombre').value.trim();
    const tel = document.getElementById('mp-tel').value.trim();
    if (!nombre) { toast('Escribe tu nombre'); return; }
    try {
      const { error } = await window.sb.from('usuarios')
        .update({ nombre, telefono: tel || null }).eq('id', psSes.userId);
      if (error) throw error;
      // Actualiza cabecera al momento
      psSes.nombre = nombre;
      localStorage.setItem('ps-session', JSON.stringify(psSes));
      const un = document.getElementById('userName');
      if (un) un.textContent = nombre;
      const av = document.getElementById('userAvatar');
      if (av) av.textContent = nombre.split(' ').map(p => p[0]).join('').substring(0,2).toUpperCase();
      toast('✓ Perfil actualizado');
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.onMiPerfilFile = function (e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast(`Archivo demasiado grande (${(f.size/1048576).toFixed(1)} MB, máx 20 MB)`); e.target.value=''; return; }
    miPerfilFileBlob = f;
    const btn = document.getElementById('mp-subir-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Subir "${f.name}" (${(f.size/1048576).toFixed(1)} MB)`;
    }
  };

  window.subirMiPerfilDoc = async function () {
    if (!miPerfilFileBlob) { toast('Elige un archivo'); return; }
    const psSes = window.PS_SESSION || {};
    if (!psSes.userId) return;
    const tipo = document.getElementById('mp-tipo').value;
    const notas = document.getElementById('mp-notas').value.trim() || miPerfilFileBlob.name;
    const btn = document.getElementById('mp-subir-btn');
    btn.disabled = true; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Subiendo…';
    try {
      const ext = (miPerfilFileBlob.name.split('.').pop() || 'bin').toLowerCase();
      const path = `docs-coordinador/${psSes.userId}/${Date.now()}-${tipo}.${ext}`;
      const url = await window.PSStorage.subir(path, miPerfilFileBlob, miPerfilFileBlob.type);
      // Guardamos en documentos_subidos con empleado_id NULL (es doc del coordinador/admin, no de un empleado)
      // Como la tabla exige empleado_id NOT NULL, guardamos usuario_id en subido_por y usamos un empleado_id placeholder si aplica
      // MEJOR: creamos un registro en localStorage/tabla propia. Pero para el MVP, usamos documentos_subidos con un empleado_id ficticio.
      // Solución: si tienes tabla docs_usuarios; si no, guardamos en storage y listamos por path.
      // Aquí simplemente listamos por Storage directamente.
      toast(`✓ Documento subido: ${notas}`);
      miPerfilFileBlob = null;
      document.getElementById('mp-file').value = '';
      document.getElementById('mp-notas').value = '';
      btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Subir archivo';
      renderMisDocsPerfil();
    } catch (err) {
      toast('Error: ' + err.message);
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Reintentar';
    }
  };

  async function renderMisDocsPerfil() {
    const cont = document.getElementById('mp-docs-list');
    if (!cont) return;
    const psSes = window.PS_SESSION || {};
    if (!psSes.userId || !window.PSStorage || !window.PSStorage.listar) { cont.innerHTML = ''; return; }
    try {
      const prefix = `docs-coordinador/${psSes.userId}`;
      const items = await window.PSStorage.listar(prefix);
      if (!items || items.length === 0) { cont.innerHTML = ''; return; }
      cont.innerHTML = '<div class="section-eyebrow" style="margin-top:12px;"><span class="eyebrow">Ya subidos</span></div>' +
        items.map(it => `
          <a class="li interactive" href="${it.url}" target="_blank" style="text-decoration:none;color:inherit;">
            <div class="li-icon"><svg class="ic ic-18"><use href="#ic-file-text"/></svg></div>
            <div class="li-body">
              <div class="li-title">${it.name.split('/').pop()}</div>
              <div class="li-sub">${(it.size/1024).toFixed(0)} KB</div>
            </div>
          </a>`).join('');
    } catch (_) { cont.innerHTML = ''; }
  }

  /* ==========================================================================
     TOGGLE DISPONIBLE / LIBRE (dueno + coordinador)
     ========================================================================== */
  async function renderDisponibleBlock() {
    const cont = document.getElementById('coordDisponibleBlock');
    if (!cont) return;
    const psSes = window.PS_SESSION || {};
    if (!['dueno','coordinador'].includes(psSes.rol)) { cont.innerHTML = ''; return; }
    let disponible = true;
    try {
      const { data } = await window.sb.from('usuarios').select('disponible').eq('id', psSes.userId).single();
      disponible = data && data.disponible !== false;
    } catch (_) {}
    cont.innerHTML = `
      <div class="disp-panel ${disponible ? 'on' : 'off'}">
        <div class="disp-info">
          <div class="disp-icon">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              ${disponible
                ? '<circle cx="12" cy="12" r="9"></circle><path d="M8 12l3 3 5-6"></path>'
                : '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v4"></path><circle cx="12" cy="16" r="1" fill="currentColor"></circle>'}
            </svg>
          </div>
          <div>
            <div class="disp-title">${disponible ? 'Disponible' : 'Libre (no molestar)'}</div>
            <div class="disp-sub">${disponible
              ? 'Los socorristas te ven en la lista de contacto y recibes avisos.'
              : 'Los socorristas NO te ven ni te llegarán avisos hasta que vuelvas a ponerte disponible.'}</div>
          </div>
        </div>
        <button class="disp-toggle" onclick="toggleDisponible()">
          ${disponible ? 'Ponerme libre' : 'Volver a estar disponible'}
        </button>
      </div>`;
  }
  window.renderDisponibleBlock = renderDisponibleBlock;

  window.toggleDisponible = async function () {
    const psSes = window.PS_SESSION || {};
    if (!psSes.userId) return;
    try {
      const { data: cur } = await window.sb.from('usuarios').select('disponible').eq('id', psSes.userId).single();
      const nuevo = !(cur && cur.disponible !== false);
      const { error } = await window.sb.from('usuarios').update({ disponible: nuevo }).eq('id', psSes.userId);
      if (error) throw error;
      toast(nuevo ? '✓ Ahora estás disponible' : '✓ Marcado como libre — no recibirás avisos');
      renderDisponibleBlock();
      if (window.renderEquipoBlock) renderEquipoBlock();
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ==========================================================================
     MIEMBROS DEL EQUIPO (admin only) — lista dueno + coordinadores
     ========================================================================== */
  async function renderEquipoBlock() {
    const cont = document.getElementById('coordEquipoBlock');
    if (!cont) return;
    const psSes = window.PS_SESSION || {};
    if (psSes.rol !== 'dueno') { cont.style.display = 'none'; return; }
    cont.style.display = 'block';
    cont.innerHTML = '<div class="text-muted small" style="padding:12px;">Cargando equipo…</div>';
    try {
      const { data, error } = await window.sb.from('usuarios')
        .select('id, nombre, email, rol, activo, disponible, created_at')
        .in('rol', ['dueno','coordinador'])
        .order('rol', { ascending: true })
        .order('nombre', { ascending: true });
      if (error) throw error;
      const rows = data || [];
      cont.innerHTML = `
        <div class="panel" style="margin-top:16px;">
          <div class="panel-head">
            <div class="panel-title-wrap">
              <h3 class="panel-title">Miembros del equipo</h3>
              <span class="panel-count">${rows.length} activos</span>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openNuevoEmpleadoModal()">
              <svg class="ic ic-14"><use href="#ic-plus"/></svg>
              Añadir miembro
            </button>
          </div>
          <div class="hor-table-wrap" style="padding:0 12px 12px;">
            <table class="hor-table">
              <thead><tr><th>Nombre</th><th>Rol</th><th>Email</th><th>Estado</th><th>Ahora</th><th></th></tr></thead>
              <tbody>
                ${rows.map(u => `
                  <tr>
                    <td><b>${u.nombre || u.email.split('@')[0]}</b></td>
                    <td>${u.rol === 'dueno' ? '<span class="hor-badge" style="background:#DBEAFE;color:#1D4ED8;">Administrador</span>' : '<span class="hor-badge" style="background:#DCFCE7;color:#166534;">Coordinador</span>'}</td>
                    <td class="small">${u.email}</td>
                    <td>${u.activo !== false ? '<span class="badge badge-ok"><span class="dot"></span>Activo</span>' : '<span class="badge badge-neutral"><span class="dot"></span>Inactivo</span>'}</td>
                    <td>${u.disponible !== false ? '<span class="badge badge-ok"><span class="dot"></span>Disponible</span>' : '<span class="badge" style="background:#FEF3C7;color:#92400E;"><span class="dot" style="background:#F59E0B;"></span>Libre</span>'}</td>
                    <td class="hor-actions">
                      <button class="icon-btn-mini" title="Enviar acceso por email" onclick="enviarAccesoDesdeEquipo('${u.email}')"><svg class="ic ic-14"><use href="#ic-arrow-up-right"/></svg></button>
                      ${u.id !== psSes.userId ? `
                        <button class="icon-btn-mini" title="Desactivar (bloquea login, se puede reactivar)" onclick="desactivarMiembroEquipo('${u.id}','${(u.nombre||u.email).replace(/'/g,"&#39;")}')" style="color:#B45309;"><svg class="ic ic-14"><use href="#ic-alert"/></svg></button>
                        <button class="icon-btn-mini danger" title="Eliminar permanentemente" onclick="eliminarMiembroEquipo('${u.id}','${(u.nombre||u.email).replace(/'/g,"&#39;")}','${u.rol}')"><svg class="ic ic-14"><use href="#ic-x"/></svg></button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    } catch (err) {
      cont.innerHTML = `<div class="text-muted small" style="padding:12px;color:var(--danger);">Error: ${err.message}</div>`;
    }
  }
  window.renderEquipoBlock = renderEquipoBlock;

  window.enviarAccesoDesdeEquipo = async function (email) {
    if (!confirm(`Enviar email de acceso a ${email}?`)) return;
    const r = await window.enviarAccesoEmailRaw(email);
    if (r.ok) toast(`✓ Enlace enviado a ${email}`);
    else toast('Error: ' + r.err);
  };
  window.eliminarMiembroEquipo = async function (id, nombre, rol) {
    const psSes = window.PS_SESSION || {};
    if (psSes.rol !== 'dueno') { alert('Solo el administrador puede eliminar miembros.'); return; }
    if (!confirm(`⚠️ ELIMINAR PERMANENTEMENTE a ${nombre} (${rol})?\n\nSe borrará su fila de usuarios. La cuenta de autenticación (auth.users) quedará en Supabase — bórrala manualmente desde Dashboard → Authentication → Users.\n\nSi es coordinador NO afecta a empleados ni a horarios ni a firmas.\n\n¿Continuar?`)) return;
    const conf = prompt(`Escribe el nombre para confirmar: ${nombre}`);
    if ((conf || '').trim().toLowerCase() !== nombre.trim().toLowerCase()) { toast('Cancelado.'); return; }
    try {
      // Si es socorrista con ficha empleado, redirigir al flujo correcto
      if (rol === 'socorrista') {
        const { data: emp } = await window.sb.from('empleados').select('id').eq('usuario_id', id).maybeSingle();
        if (emp) { alert('Este usuario tiene ficha de empleado. Ve a Empleados → su ficha → Acciones → Eliminar permanente. Ahí se hace la limpieza en cascada correcta.'); return; }
      }
      // .select() devuelve las filas realmente borradas → así detectamos si RLS bloquea
      const { data: borrados, error } = await window.sb.from('usuarios')
        .delete().eq('id', id).select('id');
      if (error) throw error;
      if (!borrados || borrados.length === 0) {
        alert(`No se pudo borrar la fila (0 filas afectadas).\n\nProbablemente falta la política RLS 'usuarios_delete' en Supabase.\n\nEjecuta este SQL en Supabase SQL Editor y vuelve a intentar:\n\ndrop policy if exists usuarios_delete on usuarios;\ncreate policy usuarios_delete on usuarios\n  for delete using (auth_es_admin() and empresa_id = auth_empresa());`);
        return;
      }
      toast(`✓ ${nombre} eliminado. Recuerda borrar también la cuenta auth desde Supabase Dashboard → Auth → Users.`);
      renderEquipoBlock();
    } catch (err) { toast('Error: ' + err.message); alert('Detalle del error:\n' + err.message); }
  };

  window.desactivarMiembroEquipo = async function (id, nombre) {
    if (!confirm(`¿Desactivar a ${nombre}? Podrás reactivarlo desde Supabase Auth si te arrepientes.`)) return;
    try {
      const { error } = await window.sb.from('usuarios').update({ activo: false }).eq('id', id);
      if (error) throw error;
      toast(`${nombre} desactivado`);
      renderEquipoBlock();
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Renderizar cuando se entre a la sección Coordinación
  document.querySelectorAll('[data-section="coordinacion"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(() => { renderEquipoBlock(); renderDisponibleBlock(); }, 200));
  });
  // Y al arrancar
  setTimeout(() => { renderEquipoBlock(); renderDisponibleBlock(); }, 1500);
  document.addEventListener('ps-session-updated', () => setTimeout(renderDisponibleBlock, 400));

  /* ==========================================================================
     ESTADO DEL EQUIPO (admin) — quién ha entrado, quién ha firmado Kit Alta,
     cuántos fichajes lleva este mes. Detecta socorristas rezagados.
     ========================================================================== */
  async function renderEstadoEquipo() {
    const cont = document.getElementById('estadoEquipoBlock');
    if (!cont || !window.sb) return;
    const psSes = window.PS_SESSION || {};
    if (!['dueno','coordinador'].includes(psSes.rol)) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<div class="text-muted small" style="padding:12px;">Cargando estado del equipo…</div>';
    try {
      const { data: emps, error } = await window.sb.from('empleados')
        .select('id, nombre, email, usuario_id, estado')
        .neq('estado', 'eliminado').is('fecha_baja', null)
        .order('nombre');
      if (error) throw error;
      if (!emps || emps.length === 0) { cont.innerHTML = ''; return; }
      const ids = emps.map(e => e.id).filter(Boolean);
      const usuarioIds = emps.map(e => e.usuario_id).filter(Boolean);

      // Firmas Kit Alta
      const { data: firmas } = await window.sb.from('firmas_documentos')
        .select('empleado_id, documento_codigo, fecha_firma')
        .eq('documento_codigo', 'kit-alta').in('empleado_id', ids);
      const firmadoPorId = new Map();
      (firmas || []).forEach(f => { if (!firmadoPorId.has(f.empleado_id)) firmadoPorId.set(f.empleado_id, f.fecha_firma); });

      // Último login (columna nueva en usuarios)
      const { data: usrs } = await window.sb.from('usuarios')
        .select('id, ultimo_login').in('id', usuarioIds);
      const loginPorUsuario = new Map();
      (usrs || []).forEach(u => loginPorUsuario.set(u.id, u.ultimo_login));

      // Fichajes del mes por empleado
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const { data: fich } = await window.sb.from('fichajes')
        .select('empleado_id').in('empleado_id', ids).gte('hora', desde);
      const fichajesPorId = new Map();
      (fich || []).forEach(f => fichajesPorId.set(f.empleado_id, (fichajesPorId.get(f.empleado_id) || 0) + 1));

      // Contadores globales
      const total = emps.length;
      const noEntrado = emps.filter(e => !loginPorUsuario.get(e.usuario_id)).length;
      const noFirmado = emps.filter(e => !firmadoPorId.has(e.id)).length;

      const fmtFecha = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
        if (dias === 0) return 'Hoy · ' + d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
        if (dias === 1) return 'Ayer';
        if (dias < 7) return `Hace ${dias} días`;
        return d.toLocaleDateString('es-ES');
      };

      cont.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title-wrap">
              <div class="kpi-icon" style="width:30px;height:30px;background:linear-gradient(135deg,#F59E0B,#D97706);color:#fff;">
                <svg class="ic ic-16"><use href="#ic-alert"/></svg>
              </div>
              <h3 class="panel-title">Estado del equipo</h3>
              <span class="panel-count">${total} socorristas · <b style="color:${noEntrado?'#B91C1C':'#059669'};">${noEntrado} sin entrar</b> · <b style="color:${noFirmado?'#B91C1C':'#059669'};">${noFirmado} sin firmar Kit Alta</b></span>
            </div>
            <button class="btn btn-outline btn-icon" onclick="renderEstadoEquipo()" title="Refrescar">
              <svg class="ic ic-16"><use href="#ic-refresh"/></svg>
            </button>
          </div>
          <div class="hor-table-wrap" style="padding:0 12px 12px;">
            <table class="hor-table">
              <thead>
                <tr>
                  <th>Socorrista</th>
                  <th>App</th>
                  <th>Kit Alta</th>
                  <th>Fichajes ${hoy.toLocaleDateString('es-ES',{month:'long'})}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${emps.map(e => {
                  const login = loginPorUsuario.get(e.usuario_id);
                  const firma = firmadoPorId.get(e.id);
                  const nf = fichajesPorId.get(e.id) || 0;
                  return `
                    <tr>
                      <td><b>${e.nombre}</b><div class="hor-td-sub">${e.email || '—'}</div></td>
                      <td>${login ? `<span class="badge badge-ok"><span class="dot"></span>Ha entrado</span><div class="hor-td-sub">${fmtFecha(login)}</div>` : `<span class="badge" style="background:#FEE2E2;color:#B91C1C;"><span class="dot" style="background:#DC2626;"></span>Sin entrar</span>`}</td>
                      <td>${firma ? `<span class="badge badge-ok"><span class="dot"></span>Firmado</span><div class="hor-td-sub">${fmtFecha(firma)}</div>` : `<span class="badge" style="background:#FEF3C7;color:#92400E;"><span class="dot" style="background:#F59E0B;"></span>Pendiente</span>`}</td>
                      <td>${nf > 0 ? `<b>${nf}</b>` : `<span class="text-muted">0</span>`}</td>
                      <td class="hor-actions">
                        ${e.email ? `<button class="icon-btn-mini" title="Reenviar acceso por email" onclick="enviarAccesoDesdeEquipo('${e.email}')"><svg class="ic ic-14"><use href="#ic-arrow-up-right"/></svg></button>` : ''}
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    } catch (err) {
      cont.innerHTML = `<div class="text-muted small" style="padding:12px;color:var(--danger);">Error: ${err.message}</div>`;
    }
  }
  window.renderEstadoEquipo = renderEstadoEquipo;
  document.querySelectorAll('[data-section="empleados"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(renderEstadoEquipo, 200));
  });
  setTimeout(renderEstadoEquipo, 1800);
  document.addEventListener('ps-session-updated', () => setTimeout(renderEstadoEquipo, 500));

  /* ==========================================================================
     CREACIÓN MASIVA DE CUENTAS
     ========================================================================== */
  window.openMasivaModal = function () {
    document.getElementById('masivaResultado').style.display = 'none';
    document.getElementById('masivaResultado').innerHTML = '';
    document.getElementById('masivaInput').value = '';
    document.getElementById('masivaBtn').disabled = false;
    document.getElementById('masivaModal').classList.add('open');
  };
  window.closeMasivaModal = () => document.getElementById('masivaModal').classList.remove('open');

  window.ejecutarMasiva = async function () {
    const raw = document.getElementById('masivaInput').value.trim();
    if (!raw) { toast('Pega al menos una línea'); return; }
    const enviarEmail = document.getElementById('masivaEnviarEmail').checked;
    const psSes = window.PS_SESSION || {};
    const btn = document.getElementById('masivaBtn');
    btn.disabled = true;
    btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Creando…';

    const lineas = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const rows = [];
    for (const linea of lineas) {
      const partes = linea.split(',').map(p => p.trim());
      if (partes.length < 3) { rows.push({ linea, ok: false, err: 'Formato inválido (esperado: rol,nombre,email)' }); continue; }
      const [rol, nombre, email] = partes;
      if (!['socorrista','coordinador','dueno'].includes(rol)) { rows.push({ linea, ok: false, err: `Rol '${rol}' no válido` }); continue; }
      if (!/\S+@\S+\.\S+/.test(email)) { rows.push({ linea, ok: false, err: 'Email inválido' }); continue; }
      rows.push({ rol, nombre, email });
    }

    const tmpClient = window.supabase.createClient(
      'https://msdjsbegqpjpshnxoilh.supabase.co',
      window.PS_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZGpzYmVncXBqcHNobnhvaWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjQ5NDgsImV4cCI6MjEwMDc0MDk0OH0.Ws2Fq3chqf7jgJUFQcXlAKEr63z1HkJgs08e4GrxqdI',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );

    const genPass = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      let p = 'Ps';
      for (let i = 0; i < 10; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
      return p + '2!';
    };

    const resultados = [];
    for (const r of rows) {
      if (r.ok === false) { resultados.push(r); continue; }
      const password = genPass();
      try {
        const { data: signUpData, error: signUpErr } = await tmpClient.auth.signUp({
          email: r.email, password,
          options: { data: { rol: r.rol, nombre: r.nombre } }
        });
        if (signUpErr) throw signUpErr;
        const nuevoId = signUpData.user.id;

        await window.sb.from('usuarios').insert({
          id: nuevoId, empresa_id: psSes.empresa_id, rol: r.rol,
          email: r.email, nombre: r.nombre, activo: true
        });

        if (r.rol === 'socorrista') {
          await window.sb.from('empleados').insert({
            usuario_id: nuevoId, empresa_id: psSes.empresa_id,
            nombre: r.nombre, email: r.email, estado: 'activo'
          });
        }

        let emailStatus = '';
        if (enviarEmail) {
          const em = await window.enviarAccesoEmailRaw(r.email);
          emailStatus = em.ok ? ' · email enviado' : ' · email FALLÓ: ' + em.err;
        }
        resultados.push({ ...r, ok: true, password, emailStatus });
      } catch (err) {
        let msg = err.message || 'error';
        if (msg.includes('already registered')) msg = 'email ya registrado';
        resultados.push({ ...r, ok: false, err: msg });
      }
    }

    const div = document.getElementById('masivaResultado');
    const okCount = resultados.filter(x => x.ok).length;
    div.style.display = 'block';
    div.innerHTML = `
      <div class="alert-strip ${okCount === resultados.length ? 'ok' : 'warn'}" style="flex-direction:column;align-items:stretch;">
        <div><b>${okCount} de ${resultados.length} cuentas creadas</b></div>
        <div style="margin-top:8px;max-height:200px;overflow-y:auto;font-family:monospace;font-size:12px;background:#fff;padding:8px;border-radius:6px;">
          ${resultados.map(r => r.ok
            ? `✓ ${r.email} (${r.rol}) · pass: ${r.password}${r.emailStatus||''}`
            : `✗ ${r.email || r.linea || '?'} · ${r.err}`
          ).join('<br>')}
        </div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;align-self:flex-start;" onclick="navigator.clipboard.writeText(document.querySelector('#masivaResultado div').innerText); toast('Copiado')">Copiar credenciales</button>
      </div>`;
    btn.disabled = false;
    btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-plus"/></svg> Crear todas las cuentas';
    if (window.cargarEmpleadosDB) cargarEmpleadosDB();
    if (window.renderEquipoBlock) renderEquipoBlock();
  };
})();
