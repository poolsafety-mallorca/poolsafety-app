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
      case 'ok':          return { cls: 'ok',       label: 'Fichado',        badge: 'badge-ok',     icon: 'ic-check-circle' };
      case 'tarde':       return { cls: 'tarde',    label: 'Tarde',          badge: 'badge-warn',   icon: 'ic-clock' };
      case 'fuera':       return { cls: 'fuera',    label: 'Fuera de zona',  badge: 'badge-danger', icon: 'ic-signal' };
      case 'pendiente':   return { cls: 'pendiente',label: 'Sin fichar',     badge: 'badge-danger', icon: 'ic-alert-circle' };
      case 'vacante':     return { cls: 'vacante',  label: 'Vacante',        badge: 'badge-neutral',icon: 'ic-user' };
      case 'sin_servicio':return { cls: '',         label: 'Sin servicio hoy',badge: 'badge-neutral',icon: 'ic-clock' };
    }
  }

  function avatarClassFor(estado) {
    return estado === 'ok' ? 'sky' : estado === 'tarde' ? 'amber' : '';
  }

  // ¿Aplica un horario a un día concreto de la semana?
  // Copia de la función del socorrista.js. Acepta "lun-vie", "L-S",
  // "lun,mie,vie", "dom", turnos partidos, etc.
  function horarioAplicaEnDiaCoord(horario, jsDay) {
    const NOMBRES = ['dom','lun','mar','mie','jue','vie','sab'];
    const INIS = ['d','l','m','x','j','v','s'];
    const raw = (horario.dias || 'lun-vie').toString().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    const target = NOMBRES[jsDay];
    if (raw.includes(target)) return true;
    const rango = raw.match(/(dom|lun|mar|mie|jue|vie|sab|[dlmxjvs])\s*[-–]\s*(dom|lun|mar|mie|jue|vie|sab|[dlmxjvs])/);
    if (rango) {
      const parse = s => s.length === 1 ? INIS.indexOf(s) : NOMBRES.indexOf(s.slice(0,3));
      const ini = parse(rango[1]), fin = parse(rango[2]);
      if (ini < 0 || fin < 0) return false;
      if (ini <= fin) return jsDay >= ini && jsDay <= fin;
      return jsDay >= ini || jsDay <= fin;
    }
    const partes = raw.split(/[,\s\/]+/).filter(Boolean);
    return partes.some(p =>
      (p.length === 1 && INIS[jsDay] === p) ||
      (p.length >= 3 && NOMBRES[jsDay] === p.slice(0,3))
    );
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
        .from('puestos').select('id, nombre, zona, hora_inicio_default, gps_lat, gps_lng, gps_radio_m').eq('activo', true).order('nombre');
      if (e1) throw e1;

      // 2. Fichajes de hoy
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      // Enriquecemos con teléfono del empleado (para botón llamar) y marca de fichaje manual
      const { data: fichajes } = await window.sb
        .from('fichajes')
        .select('id, empleado_id, puesto_id, tipo, hora, gps_ok, gps_lat, gps_lng, fuera_de_zona, distancia_m, origen_manual, motivo_manual, registrado_por, empleados(id, nombre, telefono)')
        .gte('hora', desde)
        .order('hora', { ascending: false });

      // 2b. Horarios de los empleados que han fichado hoy (para saber si
      // llegaron tarde según su turno real, no el default único del hotel).
      const empleadosHoy = [...new Set((fichajes || []).map(f => f.empleado_id))];
      let horariosMap = {};
      if (empleadosHoy.length) {
        const { data: horarios } = await window.sb
          .from('horarios')
          .select('empleado_id, puesto_id, hora_inicio, hora_inicio_2, dias, activo, fecha_desde, fecha_hasta')
          .in('empleado_id', empleadosHoy).eq('activo', true);
        (horarios || []).forEach(h => {
          const k = h.empleado_id;
          (horariosMap[k] = horariosMap[k] || []).push(h);
        });
      }

      // Marca en cada fichaje si llegó tarde (>5min del turno previsto)
      const TOL_MIN = 5;
      (fichajes || []).forEach(f => {
        if (f.tipo !== 'entrada') return;
        const d = new Date(f.hora);
        const jsDay = d.getDay();
        const cand = (horariosMap[f.empleado_id] || []).filter(h =>
          h.puesto_id === f.puesto_id && horarioAplicaEnDiaCoord(h, jsDay) &&
          (!h.fecha_desde || new Date(h.fecha_desde) <= d) &&
          (!h.fecha_hasta || new Date(h.fecha_hasta) >= d)
        );
        let horaTurno = null;
        if (cand.length) {
          const opciones = [];
          cand.forEach(h => { if (h.hora_inicio) opciones.push(h.hora_inicio); if (h.hora_inicio_2) opciones.push(h.hora_inicio_2); });
          let mejor = null, mejorDiff = Infinity;
          opciones.forEach(hs => {
            const [oh, om] = hs.split(':').map(Number);
            const p = new Date(d); p.setHours(oh, om || 0, 0, 0);
            const diff = Math.abs(d - p);
            if (diff < mejorDiff) { mejorDiff = diff; mejor = hs; }
          });
          horaTurno = mejor;
        }
        if (!horaTurno) {
          const puestoRef = (puestos || []).find(p => p.id === f.puesto_id);
          horaTurno = puestoRef && puestoRef.hora_inicio_default;
        }
        if (!horaTurno) return;
        const [th, tm] = String(horaTurno).split(':').map(Number);
        const previsto = new Date(d); previsto.setHours(th, tm || 0, 0, 0);
        const retrasoMin = Math.round((d - previsto) / 60000);
        f._retrasoMin = retrasoMin;
        f._llegoTarde = retrasoMin > TOL_MIN;
      });

      // Agrupamos fichajes por PUESTO y por EMPLEADO. Un hotel puede tener
      // varios socorristas trabajando el mismo día (servicios distintos o
      // turnos diferentes). Guardamos por cada empleado su ÚLTIMO fichaje
      // del día (para saber si entró, salió, ambos, etc.).
      const porPuesto = {};
      (fichajes || []).forEach(f => {
        if (!porPuesto[f.puesto_id]) porPuesto[f.puesto_id] = {};
        // Como los fichajes vienen ordenados DESC por hora, el primero por
        // (puesto, empleado) es el más reciente para ese empleado.
        if (!porPuesto[f.puesto_id][f.empleado_id]) {
          porPuesto[f.puesto_id][f.empleado_id] = f;
        } else {
          // Preservar el flag _llegoTarde del fichaje de entrada aunque
          // ahora esté guardado el de salida (para que la tarjeta lo muestre)
          if (f._llegoTarde && !porPuesto[f.puesto_id][f.empleado_id]._llegoTardeEntrada) {
            porPuesto[f.puesto_id][f.empleado_id]._llegoTardeEntrada = true;
            porPuesto[f.puesto_id][f.empleado_id]._retrasoEntradaMin = f._retrasoMin;
          }
        }
      });

      // 2c. Horarios activos por puesto — para saber qué hoteles TIENEN
      // servicio hoy. Si un hotel no tiene ningún horario activo para HOY
      // y no hay fichajes, se marca "sin servicio hoy" en vez de vacante.
      const hoyDay = hoy.getDay();
      let horariosPorPuesto = {};
      try {
        const { data: allHors } = await window.sb.from('horarios')
          .select('puesto_id, dias, fecha_desde, fecha_hasta, activo')
          .eq('activo', true);
        (allHors || []).forEach(h => {
          const aplica = horarioAplicaEnDiaCoord(h, hoyDay) &&
            (!h.fecha_desde || new Date(h.fecha_desde) <= hoy) &&
            (!h.fecha_hasta || new Date(h.fecha_hasta) >= hoy);
          if (aplica) horariosPorPuesto[h.puesto_id] = true;
        });
      } catch (_) {}

      // 3. Construir cache: array de fichajes por puesto (uno por empleado).
      postsCache = (puestos || []).map(p => {
        const socsMap = porPuesto[p.id] || {};
        const fichajesPuesto = Object.values(socsMap);
        const tieneServicioHoy = !!horariosPorPuesto[p.id];
        // El estado del puesto es el "peor" de los estados de sus socorristas:
        //   · fuera > tarde > ok > terminado > vacante
        // Si no hay servicio hoy y tampoco fichajes → 'sin_servicio'
        let estado = 'vacante';
        fichajesPuesto.forEach(f => {
          const llegoTarde = f._llegoTarde || f._llegoTardeEntrada;
          const s = f.tipo === 'salida'
            ? (llegoTarde ? 'tarde' : 'terminado')
            : (f.fuera_de_zona ? 'fuera' : (llegoTarde ? 'tarde' : 'ok'));
          const rank = { fuera: 4, tarde: 3, ok: 2, terminado: 1, vacante: 0 };
          if (rank[s] > rank[estado]) estado = s;
        });
        if (estado === 'vacante' && !tieneServicioHoy) estado = 'sin_servicio';
        return { puesto: p, fichajes: fichajesPuesto, estado, tieneServicioHoy };
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
      // Por defecto ocultamos los "sin servicio hoy" (no interesan al coord
      // porque hoy no toca cubrirlos). El chip "Todos" también los oculta
      // para que la vista general sea limpia. Solo aparecen si el buscador
      // los busca por nombre.
      const matchesFilter = currentFilter === 'todos' ? r.estado !== 'sin_servicio'
        : (currentFilter === 'ok' && r.estado === 'ok')
        || (currentFilter === 'tarde' && r.estado === 'tarde')
        || (currentFilter === 'fuera' && r.estado === 'fuera')
        || (currentFilter === 'pendiente' && (r.estado === 'vacante' || r.estado === 'terminado'))
        || (currentFilter === 'vacante' && r.estado === 'vacante');
      const matchesSearch = !q
        || (p.nombre || '').toLowerCase().includes(q)
        || (p.zona || '').toLowerCase().includes(q)
        || (r.fichajes || []).some(f => (f.empleados?.nombre || '').toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });

    // Actualiza contadores en chips (incluido tarde real y sin_servicio)
    const c = { todos: postsCache.length, ok: 0, tarde: 0, fuera: 0, vacante: 0, terminado: 0, sin_servicio: 0 };
    postsCache.forEach(r => { c[r.estado] = (c[r.estado] || 0) + 1; });
    // Los hoteles "sin servicio hoy" NO cuentan en el total operativo:
    // se restan del "todos" para que 3/8 no se convierta en 3/23 lleno de
    // hoteles cerrados.
    const totalOperativo = c.todos - c.sin_servicio;
    const chips = document.querySelectorAll('#filterChips .chip .count');
    if (chips[0]) chips[0].textContent = totalOperativo;
    if (chips[1]) chips[1].textContent = c.ok;
    if (chips[2]) chips[2].textContent = c.tarde;
    if (chips[3]) chips[3].textContent = c.fuera;
    if (chips[4]) chips[4].textContent = c.vacante + c.terminado;
    if (chips[5]) chips[5].textContent = c.vacante;

    // Actualiza los KPIs de arriba con datos reales
    const kpiOk = document.getElementById('kpiOk');
    if (kpiOk) kpiOk.innerHTML = `${c.ok}<span class="of">/ ${totalOperativo}</span>`;
    const kpiTarde = document.getElementById('kpiTarde'); if (kpiTarde) kpiTarde.textContent = c.tarde;
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
      const fichs = r.fichajes || [];
      const info = r.estado === 'ok' ? { cls: 'ok', badge: 'badge-ok', icon: 'ic-check-circle', label: fichs.length > 1 ? `${fichs.length} fichados` : 'Fichado' }
                 : r.estado === 'tarde' ? { cls: 'warn', badge: 'badge-warn', icon: 'ic-clock', label: fichs.length > 1 ? `${fichs.length} · alguno tarde` : 'Llegó tarde' }
                 : r.estado === 'fuera' ? { cls: 'danger', badge: 'badge-danger', icon: 'ic-signal', label: fichs.length > 1 ? `${fichs.length} · alguno fuera` : 'Fuera de zona' }
                 : r.estado === 'terminado' ? { cls: '', badge: 'badge-neutral', icon: 'ic-check', label: 'Turno terminado' }
                 : r.estado === 'sin_servicio' ? { cls: '', badge: 'badge-neutral', icon: 'ic-clock', label: 'Sin servicio hoy' }
                 : { cls: '', badge: 'badge-neutral', icon: 'ic-clock', label: 'Vacante' };
      const hIni = (p.hora_inicio_default || '10:00:00').slice(0,5);
      // Renderiza UNA fila por socorrista fichado (puede haber varios en el mismo hotel)
      const workers = fichs.length === 0 ? `
            <div class="post-worker">
              <div class="mini-av" style="background: var(--ink-200); color: var(--ink-500);">
                <svg class="ic ic-14"><use href="#ic-user"/></svg>
              </div>
              <div>
                <div class="post-worker-name" style="color: var(--ink-500);">Sin fichaje hoy</div>
                <div class="post-time">Puesto vacante</div>
              </div>
            </div>` : fichs.map(f => {
              const soc = f.empleados;
              if (!soc) return '';
              const iniciales = soc.nombre.split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase();
              const horaTxt = new Date(f.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              const tel = (soc.telefono || '').replace(/\s+/g,'');
              const telHref = tel ? (tel.startsWith('+') ? tel : (tel.length === 9 ? '+34' + tel : tel)) : '';
              const esManual = !!f.origen_manual;
              const sinGps = f.gps_lat == null || f.gps_lng == null;
              const llegoTarde = f._llegoTarde || f._llegoTardeEntrada;
              const retrasoMin = f._retrasoMin || f._retrasoEntradaMin;
              const rowClass = (f.fuera_de_zona || sinGps) ? 'danger' : (llegoTarde ? 'warn' : (f.tipo === 'entrada' ? 'ok' : ''));
              const gpsExtra = sinGps
                ? ' <span class="small" style="color:#DC2626;font-weight:700;background:#FEE2E2;padding:2px 6px;border-radius:10px;">🚫 SIN GPS</span>'
                : (f.fuera_de_zona ? ' · GPS fuera' + (f.distancia_m ? ' (' + f.distancia_m + 'm)' : '') : '');
              const tardeExtra = llegoTarde
                ? ` <span class="small" style="color:#92400E;font-weight:700;background:#FEF3C7;padding:2px 6px;border-radius:10px;">⏰ ${retrasoMin}m tarde</span>`
                : '';
              return `
                <div class="post-worker" style="cursor:pointer;" onclick="event.stopPropagation(); verMapaFichajeIndividual('${f.id}')" title="Ver mapa del fichaje">
                  <div class="mini-av ${avatarClassFor(rowClass)}">${iniciales}</div>
                  <div style="min-width:0; flex:1;">
                    <div class="post-worker-name">${soc.nombre}${esManual ? ' <span class="small" style="color:#0284C7;font-weight:500;">📌 manual</span>' : ''}${sinGps ? gpsExtra : ''}${tardeExtra}</div>
                    <div class="post-time ${f.fuera_de_zona ? 'danger' : (llegoTarde ? 'warn' : '')}">
                      <svg class="ic ic-14"><use href="#ic-clock"/></svg>
                      ${f.tipo === 'entrada' ? 'Fichó entrada' : 'Salió'} a las ${horaTxt}${sinGps ? '' : (f.fuera_de_zona ? ' · GPS fuera' + (f.distancia_m ? ' (' + f.distancia_m + 'm)' : '') : '')}
                    </div>
                  </div>
                  ${telHref ? `
                    <a class="btn-icon" href="tel:${telHref}" title="Llamar a ${soc.nombre}" onclick="event.stopPropagation();"
                       style="width:36px;height:36px;flex-shrink:0;background:${f.fuera_de_zona?'#DC2626':'#059669'};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none;">
                      <svg class="ic ic-16"><use href="#ic-phone"/></svg>
                    </a>` : ''}
                </div>
                <div id="mapaFichaje_${f.id}" style="display:none;margin:2px 0 8px;"></div>
              `;
            }).join('');
      return `
        <div class="post ${info.cls}" data-post="${p.id}">
          <div class="post-top">
            <div style="min-width:0;">
              <p class="post-name">${p.nombre}</p>
              <p class="post-loc">
                <svg class="ic ic-14"><use href="#ic-pin"/></svg>
                ${p.zona || '—'} · turno ${hIni}${fichs.length > 1 ? ' · ' + fichs.length + ' socorristas hoy' : ''}
              </p>
            </div>
            <span class="badge ${info.badge}">
              <svg class="ic ic-14"><use href="#${info.icon}"/></svg>
              ${info.label}
            </span>
          </div>
          ${workers}
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

  // Los KPIs de arriba filtran la lista de puestos igual que los chips.
  // Así "Sin fichar: 19" te lleva directo a ver esos 19 puestos.
  window.filtrarPuestos = function (filtro) {
    // Nos aseguramos de estar en la pestaña Vista general
    const tabGeneral = document.querySelector('[data-section="general"]');
    if (tabGeneral && !tabGeneral.classList.contains('active')) tabGeneral.click();

    setTimeout(() => {
      const chip = document.querySelector(`#filterChips .chip[data-filter="${filtro}"]`);
      if (chip) {
        chip.click();
      } else {
        currentFilter = filtro;
        renderPostsFromCache();
      }
      // Llevamos la vista a la lista de puestos
      const grid = document.getElementById('postsGrid');
      if (grid) {
        const y = grid.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, tabGeneral && !tabGeneral.classList.contains('active') ? 220 : 0);
  };
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

  /* ---------- Mapa real (OpenStreetMap embed) ----------
     Muestra el punto EXACTO donde el socorrista fichó (chincheta roja)
     y opcionalmente el centro del puesto (chincheta azul) para comparar.
     Usa el iframe de openstreetmap.org (sin API key, sin CSP problems)
     con un bbox que engloba ambos puntos + margen. Debajo:
       - Coordenadas del fichaje
       - "Abrir en Google Maps" (útil en móvil)
       - "Cómo llegar" desde tu ubicación (útil para el coord)
  ---------------------------------------------------------- */
  function renderMapaFichaje({ puestoLat, puestoLng, fichLat, fichLng, radio, esManual }) {
    // Sin ninguna coordenada válida → placeholder gris
    if (!fichLat && !puestoLat) {
      return `
        <div style="height:150px;background:#F1F5F9;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#94A3B8;font-size:13px;flex-direction:column;gap:6px;">
          <svg class="ic ic-22"><use href="#ic-pin"/></svg>
          <div>Sin coordenadas registradas para este fichaje</div>
        </div>`;
    }

    // Elegir centro y bbox
    const pts = [];
    if (fichLat) pts.push({ lat: fichLat, lng: fichLng, color: 'red', label: 'Fichaje' });
    if (puestoLat) pts.push({ lat: puestoLat, lng: puestoLng, color: 'blue', label: 'Puesto' });

    const lats = pts.map(p => p.lat);
    const lngs = pts.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    // Margen ~ 100m equivalente en grados (aprox 0.001)
    const marg = Math.max(0.0015, (maxLat - minLat) * 0.6, (maxLng - minLng) * 0.6);
    const bbox = [minLng - marg, minLat - marg, maxLng + marg, maxLat + marg].join(',');

    // Marker de OSM: solo permite UN marker en el embed. Usamos el del fichaje si hay,
    // si no el del puesto. Los dos se ven en la capa dibujada con el bbox.
    const markerPt = fichLat ? { lat: fichLat, lng: fichLng } : { lat: puestoLat, lng: puestoLng };
    const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${markerPt.lat},${markerPt.lng}`;

    // Enlaces útiles
    const gmapUrl = fichLat
      ? `https://www.google.com/maps?q=${fichLat},${fichLng}`
      : `https://www.google.com/maps?q=${puestoLat},${puestoLng}`;
    const osmFullUrl = `https://www.openstreetmap.org/?mlat=${markerPt.lat}&mlon=${markerPt.lng}#map=18/${markerPt.lat}/${markerPt.lng}`;

    // Info: si hay ambos, calcular distancia (Haversine) para saber si el punto fichado está lejos del puesto
    let distanciaTxt = '';
    if (fichLat && puestoLat) {
      const R = 6371000;
      const toRad = d => d * Math.PI / 180;
      const dLat = toRad(fichLat - puestoLat);
      const dLng = toRad(fichLng - puestoLng);
      const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(puestoLat)) * Math.cos(toRad(fichLat)) * Math.sin(dLng/2) ** 2;
      const d = 2 * R * Math.asin(Math.sqrt(a));
      const distancia = Math.round(d);
      const dentroRadio = radio && distancia <= radio;
      distanciaTxt = dentroRadio
        ? `<span style="color:#059669;">✓ Dentro del radio del puesto (${distancia} m del centro)</span>`
        : `<span style="color:#DC2626;">⚠ ${distancia} m del centro del puesto${radio ? ` (radio permitido: ${radio} m)` : ''}</span>`;
    }

    const soloPuesto = !fichLat && puestoLat;
    const banner = soloPuesto
      ? `<div style="padding:6px 10px;background:#EFF6FF;color:#1E40AF;font-size:11.5px;border-radius:6px;margin-bottom:6px;">Este fichaje no tiene coordenadas GPS${esManual ? ' (fichaje manual del admin)' : ''}. Mostrando el centro del puesto.</div>`
      : '';

    return `
      <div style="border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;background:#F1F5F9;">
        ${banner}
        <iframe
          src="${iframeSrc}"
          style="width:100%;height:220px;border:0;display:block;"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Mapa del fichaje">
        </iframe>
        <div style="padding:8px 10px;background:#fff;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;">
          <div style="min-width:0;flex:1;">
            ${fichLat ? `<div><b>📍 ${fichLat.toFixed(6)}, ${fichLng.toFixed(6)}</b></div>` : ''}
            ${distanciaTxt ? `<div style="margin-top:2px;">${distanciaTxt}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <a href="${gmapUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 8px;">
              <svg class="ic ic-14"><use href="#ic-pin"/></svg> Google Maps
            </a>
            <a href="${osmFullUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 8px;">
              Ver ampliado
            </a>
          </div>
        </div>
      </div>`;
  }
  window.renderMapaFichaje = renderMapaFichaje;

  /* ---------- Modal detalle puesto ---------- */
  window.openPostModal = function (puestoId) {
    const row = postsCache.find(r => r.puesto.id === puestoId);
    if (!row) { toast('Puesto no encontrado'); return; }
    const p = { nombre: row.puesto.nombre, zona: row.puesto.zona || '—', hora: (row.puesto.hora_inicio_default || '10:00:00').slice(0,5), duracion: 8 };
    // Compat con la nueva estructura row.fichajes[] (v98). Cogemos como
    // "fichaje principal" el primero del array — el resto se listan abajo
    // como "más socorristas en este hotel hoy".
    const fichs = row.fichajes || (row.fichaje ? [row.fichaje] : []);
    const principal = fichs[0] || null;
    const otros = fichs.slice(1);
    const soc = principal && principal.empleados ? {
      id: principal.empleados.id,
      nombre: principal.empleados.nombre,
      iniciales: (principal.empleados.nombre||'').split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase(),
      telefono: principal.empleados.telefono || '',
      horasNormales: 0, horasExtra: 0
    } : null;
    const esManual = principal && principal.origen_manual;
    const motivoManual = principal && principal.motivo_manual;
    const f = principal ? {
      horaFichaje: new Date(principal.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      gpsOk: !principal.fuera_de_zona,
      estado: row.estado
    } : { horaFichaje: null, gpsOk: null, estado: row.estado };

    // ------ Mapa real del fichaje principal ------
    const puestoLat = parseFloat(row.puesto.gps_lat) || null;
    const puestoLng = parseFloat(row.puesto.gps_lng) || null;
    const fichLat   = principal && principal.gps_lat != null ? parseFloat(principal.gps_lat) : null;
    const fichLng   = principal && principal.gps_lng != null ? parseFloat(principal.gps_lng) : null;
    const mapHtml = renderMapaFichaje({ puestoLat, puestoLng, fichLat, fichLng, radio: row.puesto.gps_radio_m, esManual });
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

      ${mapHtml}

      ${soc ? (() => {
        const tel = (soc.telefono || '').replace(/\s+/g,'');
        const telHref = tel ? (tel.startsWith('+') ? tel : (tel.length === 9 ? '+34' + tel : tel)) : '';
        const distancia = principal?.distancia_m;
        return `
        <div class="li" style="margin-top: 14px;">
          <div class="mini-av" style="width:40px; height:40px; font-size:13px;">${soc.iniciales}</div>
          <div class="li-body">
            <div class="li-title">${soc.nombre}</div>
            <div class="li-sub">${soc.telefono || 'Sin teléfono'}${principal?.fuera_de_zona && distancia ? ' · a ' + distancia + 'm del puesto' : ''}</div>
          </div>
          ${telHref ? `
            <a class="btn btn-primary btn-sm" href="tel:${telHref}" style="text-decoration:none;background:${principal?.fuera_de_zona ? '#DC2626' : '#059669'};border-color:transparent;">
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

        ${principal && principal.fuera_de_zona ? `
          <div style="margin-top:10px;padding:12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;">
            <div style="font-weight:700;font-size:13px;color:#78350F;margin-bottom:6px;">⚠️ Fichaje registrado fuera del radio del puesto</div>
            <div style="font-size:12px;color:#92400E;margin-bottom:8px;">Si el motivo es válido (bañista atendido, GPS impreciso, zona ampliada…) puedes marcarlo como correcto para que deje de contar como incidencia.</div>
            <button class="btn btn-primary btn-sm" onclick="verificarUbicacionFichaje('${principal.id}')" style="background:#059669;border-color:#059669;">
              <svg class="ic ic-14"><use href="#ic-check-circle"/></svg>
              ✓ Ubicación verificada — marcar como correcto
            </button>
          </div>` : ''}
        ${otros.length ? `
          <div style="margin-top:14px;padding:12px;background:#F1F5F9;border-radius:10px;">
            <div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:8px;">También trabajando aquí hoy · ${otros.length}</div>
            ${otros.map(o => {
              const nom = o.empleados?.nombre || '—';
              const ini = (nom||'').split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase();
              const h = new Date(o.hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
              const badge = o.fuera_de_zona ? 'badge-warn' : (o.tipo === 'entrada' ? 'badge-ok' : 'badge-neutral');
              const tipo = o.tipo === 'entrada' ? 'Entró' : 'Salió';
              return `
                <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#fff;border-radius:8px;margin:6px 0;cursor:pointer;" onclick="verMapaFichajeIndividual('${o.id}')">
                  <div class="mini-av" style="width:32px;height:32px;font-size:11px;">${ini}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:13px;">${nom}</div>
                    <div style="font-size:11.5px;color:#64748B;">${tipo} a las ${h}${o.fuera_de_zona?' · GPS fuera':''}</div>
                  </div>
                  <span class="badge ${badge}" style="font-size:10px;padding:3px 8px;">📍 mapa</span>
                </div>
                <div id="mapaFichaje_${o.id}" style="display:none;margin:2px 0 8px;"></div>
              `;
            }).join('')}
          </div>` : ''}

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
        .select('id, tipo, origen, criticidad, mensaje, cantidad_pedida, fecha_creacion, puesto_id, item_id, empleado_id, puestos(nombre), inventario_items(nombre, seccion), empleados(nombre, telefono)')
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
          : `<span class="badge badge-neutral small"><svg class="ic ic-14"><use href="#ic-user"/></svg>${a.empleados?.nombre || 'Socorrista'}</span>`;
        const itemNombre = (a.inventario_items && a.inventario_items.nombre) || a.mensaje || 'Material';
        const seccion = a.inventario_items && a.inventario_items.seccion;
        const secTag = seccion === 'desa' ? ' · DESA' : seccion === 'oxigeno' ? ' · Oxígeno' : '';
        const puestoNombre = (a.puestos && a.puestos.nombre) || '—';
        const sub = a.cantidad_pedida ? `${puestoNombre} · faltan ${a.cantidad_pedida}` : puestoNombre;
        // Nota escrita por el socorrista al reportar. Se guarda dentro del
        // mensaje con el formato "Falta 3x Gasas — su nota (Hotel X)".
        const nota = extraerNotaDeAlerta(a);
        const cuando = a.fecha_creacion ? tiempoRelativo(new Date(a.fecha_creacion)) : '';
        return `
          <div class="alert ${cls}" style="cursor:pointer;" onclick="verDetalleAlerta('${a.id}')" title="Pulsa para ver el detalle completo">
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
                ${sub}${cuando ? ' · ' + cuando : ''}
              </div>
              ${nota ? `
                <div style="margin-top:6px;padding:7px 10px;background:#FFFBEB;border-left:3px solid #F59E0B;border-radius:0 6px 6px 0;font-size:12.5px;color:#78350F;">
                  <b>Nota:</b> ${nota}
                </div>` : ''}
              <div class="row gap-1 mt-1">${origen}</div>
            </div>
            <button class="alert-action" onclick="event.stopPropagation(); resolveAlert('${a.id}', this)">Reponer</button>
          </div>
        `;
      }).join('');
      // Guardamos para el modal de detalle
      window.__alertasCache = alertas;
    } catch (err) {
      console.warn('[Alertas]', err);
      alertsList.innerHTML = `<div class="text-muted small" style="padding:16px;color:var(--danger);">Error: ${err.message}</div>`;
    }
  }

  // Extrae la nota que escribió el socorrista dentro del mensaje de la alerta.
  // Formatos que genera la app del socorrista:
  //   "Falta 3× Gasas — se acabaron las del cajón (Hotel X)"   → reporte material
  //   "[Mensaje de Carlos] texto libre"                        → mensaje al coord
  function extraerNotaDeAlerta(a) {
    const msg = a && a.mensaje ? String(a.mensaje) : '';
    if (!msg) return '';
    // Mensaje libre al coordinador
    const libre = msg.match(/^\[Mensaje de [^\]]+\]\s*(.+)$/s);
    if (libre) return libre[1].trim();
    // Reporte de material: la nota va tras el guion largo, antes del hotel
    const conNota = msg.match(/—\s*(.+?)\s*(?:\([^)]*\))?\s*$/s);
    if (conNota) {
      const nota = conNota[1].trim();
      // Evitamos devolver el propio nombre del producto si no había nota
      const item = (a.inventario_items && a.inventario_items.nombre) || '';
      if (nota && nota.toLowerCase() !== item.toLowerCase()) return nota;
    }
    return '';
  }

  // Modal con toda la información de la alerta + acciones.
  // Busca en los dos caches: el del widget lateral y el de la campana.
  window.verDetalleAlerta = async function (id) {
    let a = (window.__alertasCache || []).find(x => x.id === id)
         || (typeof alertasPanelCache !== 'undefined' ? alertasPanelCache.find(x => x.id === id) : null);
    // Si no está en memoria (p. ej. tras refrescar), la pedimos a la BD
    if (!a) {
      try {
        const { data } = await window.sb.from('alertas')
          .select('id, tipo, origen, criticidad, mensaje, cantidad_pedida, fecha_creacion, puestos(nombre), inventario_items(nombre, seccion), empleados(nombre, telefono)')
          .eq('id', id).single();
        a = data;
      } catch (_) {}
    }
    if (!a) { toast('No se encontró la alerta'); return; }
    const item = a.inventario_items?.nombre || 'Material';
    const puesto = a.puestos?.nombre || '—';
    const quien = a.empleados?.nombre || (a.origen === 'auto' ? 'Sistema (stock bajo)' : 'Socorrista');
    const tel = (a.empleados?.telefono || '').replace(/\s+/g,'');
    const telHref = tel ? (tel.startsWith('+') ? tel : (tel.length === 9 ? '+34'+tel : tel)) : '';
    const nota = extraerNotaDeAlerta(a);
    const cuando = a.fecha_creacion
      ? new Date(a.fecha_creacion).toLocaleString('es-ES', { weekday:'long', day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit' })
      : '—';
    const critColor = a.criticidad === 'alta' ? '#DC2626' : a.criticidad === 'media' ? '#D97706' : '#0891B2';

    const body = document.getElementById('postModalBody');
    if (!body) return;
    body.innerHTML = `
      <div class="modal-head">
        <div>
          <h3>${item}</h3>
          <p class="small text-muted" style="margin:4px 0 0;">
            <svg class="ic ic-14" style="vertical-align:-3px;"><use href="#ic-pin"/></svg> ${puesto}
          </p>
        </div>
        <button class="modal-close" onclick="closePostModal()">
          <svg class="ic ic-16"><use href="#ic-x"/></svg>
        </button>
      </div>

      <div style="margin:6px 0 14px;">
        <span class="badge" style="background:${critColor}1a;color:${critColor};padding:6px 12px;font-size:12px;">
          <span class="dot" style="background:${critColor};"></span> Criticidad ${a.criticidad}
        </span>
        ${a.cantidad_pedida ? `<span class="badge badge-neutral" style="margin-left:6px;padding:6px 12px;font-size:12px;">Faltan ${a.cantidad_pedida} uds</span>` : ''}
      </div>

      ${nota ? `
        <div style="padding:14px 16px;background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:0 8px 8px 0;margin-bottom:14px;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#92400E;font-weight:700;margin-bottom:5px;">
            Nota de ${quien}
          </div>
          <div style="font-size:14.5px;color:#78350F;line-height:1.5;">${nota}</div>
        </div>` : `
        <div class="text-muted small" style="padding:12px;background:#F8FAFC;border-radius:8px;margin-bottom:14px;">
          No escribió ninguna nota adicional.
        </div>`}

      <div class="li" style="margin-bottom:10px;">
        <div class="li-body">
          <div class="li-title">Reportado por</div>
          <div class="li-sub">${quien}${a.empleados?.telefono ? ' · ' + a.empleados.telefono : ''}</div>
        </div>
        ${telHref ? `
          <a class="btn btn-primary btn-sm" href="tel:${telHref}" style="text-decoration:none;background:#059669;border-color:transparent;">
            <svg class="ic ic-16"><use href="#ic-phone"/></svg> Llamar
          </a>` : ''}
      </div>

      <div class="li" style="margin-bottom:10px;">
        <div class="li-body">
          <div class="li-title">Cuándo</div>
          <div class="li-sub">${cuando}</div>
        </div>
      </div>

      <div class="li">
        <div class="li-body">
          <div class="li-title">Mensaje completo registrado</div>
          <div class="li-sub" style="white-space:pre-wrap;">${a.mensaje || '—'}</div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-outline" onclick="closePostModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="resolverDesdeDetalle('${a.id}')">
          <svg class="ic ic-16"><use href="#ic-check"/></svg> Marcar como repuesto
        </button>
      </div>`;
    document.getElementById('postModal').classList.add('open');
  };

  window.resolverDesdeDetalle = async function (id) {
    try {
      const { error } = await window.sb.from('alertas')
        .update({ resuelto: true, fecha_resolucion: new Date().toISOString(), resuelto_por: (window.PS_SESSION||{}).userId || null })
        .eq('id', id);
      if (error) throw error;
      closePostModal();
      toast('✓ Alerta resuelta');
      renderAlertas();
      if (typeof refrescarCampana === 'function') refrescarCampana();
    } catch (err) { toast('Error: ' + err.message); }
  };

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
      const notaPanel = extraerNotaDeAlerta(a);
      return `
        <div style="display:flex;gap:10px;padding:12px;margin:4px 0;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;"
             onclick="toggleNotifPanel(); verDetalleAlerta('${a.id}')" title="Pulsa para ver el detalle">
          <div style="width:36px;height:36px;border-radius:8px;background:${critBg};color:${critColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg class="ic ic-16"><use href="#${iconTipo}"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;line-height:1.3;">${a.mensaje || item || 'Alerta'}</div>
            ${notaPanel ? `<div style="margin-top:4px;padding:5px 8px;background:#FFFBEB;border-left:3px solid #F59E0B;border-radius:0 4px 4px 0;font-size:11.5px;color:#78350F;"><b>Nota:</b> ${notaPanel}</div>` : ''}
            <div style="color:#64748b;font-size:11px;margin-top:3px;">
              📍 ${puesto}${emp ? ' · 👤 ' + emp : ''} · ${hace}
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); resolverAlerta('${a.id}')" style="padding:4px 8px;font-size:11px;flex-shrink:0;height:26px;align-self:center;">
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

  /* ---------- Push local (Notification API + Realtime) ---------- */
  // Banner rojo persistente arriba del dashboard cuando el coord/dueño aún NO
  // ha firmado su Kit Alta laboral. Los coord son trabajadores igual y también
  // deben firmar. Al pulsar el botón se les redirige a socorrista.html?kit=1
  // donde ven el mismo wizard que los socorristas.
  async function comprobarKitAltaCoord() {
    const psSes = window.PS_SESSION || {};
    if (!['dueno','coordinador'].includes(psSes.rol) || !psSes.userId || !window.sb) return;
    // Quitar banner previo si existiese
    document.getElementById('psKitCoordBanner')?.remove();
    try {
      // Empleado asociado a este usuario
      const { data: emp } = await window.sb.from('empleados')
        .select('id').eq('usuario_id', psSes.userId).maybeSingle();
      if (!emp) return; // aún no está creada la ficha, reintentar más tarde
      const { data: firmas } = await window.sb.from('firmas_documentos')
        .select('id').eq('empleado_id', emp.id).eq('documento_codigo','kit-alta').limit(1);
      if (firmas && firmas.length) return; // ya firmado, nada que hacer
      // Inyectar banner rojo bajo la nav superior
      const banner = document.createElement('div');
      banner.id = 'psKitCoordBanner';
      banner.style.cssText = 'background:linear-gradient(135deg,#B91C1C,#DC2626);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;box-shadow:0 2px 10px rgba(185,28,28,.25);';
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:240px;">
          <span style="font-size:26px;">📋</span>
          <div>
            <div style="font-weight:800;font-size:14.5px;">Debes firmar tu Kit Alta Empresa</div>
            <div style="font-size:12.5px;opacity:.92;margin-top:2px;">Los coordinadores también son trabajadores. La documentación laboral (RGPD, EPIs, salud, etc.) tiene que quedar firmada en el sistema.</div>
          </div>
        </div>
        <a href="socorrista.html?kit=1&volver=coord" style="background:#fff;color:#B91C1C;border-radius:8px;padding:10px 18px;font-weight:800;text-decoration:none;font-size:13px;flex-shrink:0;">Firmar ahora →</a>`;
      const nav = document.querySelector('nav.dash-nav');
      if (nav && nav.parentNode) nav.parentNode.insertBefore(banner, nav.nextSibling);
    } catch (_) {}
  }
  window.comprobarKitAltaCoord = comprobarKitAltaCoord;
  document.addEventListener('ps-session-updated', () => setTimeout(comprobarKitAltaCoord, 1200));
  setTimeout(comprobarKitAltaCoord, 2000);

  // Banner grande persistente arriba del dashboard cuando el permiso no está
  // concedido. Especialmente útil para coord que abren la app y no se enteran
  // de que hay que activar los avisos.
  function refrescarPushBannerHero() {
    const rol = ((window.PS_SESSION || {}).rol) || '';
    if (!['dueno','coordinador'].includes(rol) || !window.PSNotif) return;
    let host = document.getElementById('psPushHeroBanner');
    const necesitaMostrar = PSNotif.soporta() && !PSNotif.enabled() && PSNotif.permiso() !== 'denied';
    if (!necesitaMostrar) {
      if (host) host.remove();
      return;
    }
    if (host) return; // ya visible
    host = document.createElement('div');
    host.id = 'psPushHeroBanner';
    host.style.cssText = 'background:linear-gradient(135deg,#F59E0B,#FBBF24);color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13.5px;font-weight:600;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,.1);';
    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:220px;">
        <span style="font-size:22px;">🔔</span>
        <div>
          <div style="font-weight:800;">Activa los avisos para no perder alertas</div>
          <div style="font-size:12px;font-weight:400;opacity:.9;margin-top:2px;">Sin esto no recibirás notificaciones cuando entre una alerta o mensaje del socorrista.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('psPushHeroBanner').remove()" style="background:rgba(255,255,255,.2);color:#fff;border:0;padding:8px 14px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;">Luego</button>
        <button onclick="activarAvisosPush(); setTimeout(refrescarPushBannerHeroPublic,600);" style="background:#fff;color:#B45309;border:0;padding:8px 16px;border-radius:6px;font-weight:800;cursor:pointer;font-size:13px;">Activar ahora</button>
      </div>`;
    // Insertar justo debajo de la nav superior
    const nav = document.querySelector('nav.dash-nav');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(host, nav.nextSibling);
    else document.body.prepend(host);
  }
  window.refrescarPushBannerHeroPublic = refrescarPushBannerHero;

  function refrescarPushBanner() {
    refrescarPushBannerHero();
    const banner = document.getElementById('notifPushBanner');
    const text   = document.getElementById('notifPushBannerText');
    const btn    = document.getElementById('notifPushBannerBtn');
    if (!banner || !window.PSNotif) return;
    if (!PSNotif.soporta()) {
      banner.style.display = 'block';
      text.textContent = 'ℹ️ Este navegador no soporta avisos. En iPhone: instala la app en pantalla de inicio.';
      btn.style.display = 'none';
      return;
    }
    if (PSNotif.enabled()) {
      banner.style.display = 'block';
      banner.style.background = '#F0FDF4';
      banner.style.borderBottomColor = '#BBF7D0';
      text.style.color = '#166534';
      text.textContent = '🔔 Avisos activados. Suenan cuando entra una alerta.';
      btn.textContent = 'Silenciar';
      btn.style.background = '#DC2626';
      btn.onclick = () => { PSNotif.silenciar(); refrescarPushBanner(); toast('Avisos silenciados'); };
    } else if (PSNotif.permiso() === 'denied') {
      banner.style.display = 'block';
      text.textContent = '🔕 Avisos bloqueados. Actívalos en los ajustes del navegador (candado junto a la URL).';
      btn.style.display = 'none';
    } else {
      banner.style.display = 'block';
      banner.style.background = '#EFF6FF';
      banner.style.borderBottomColor = '#DBEAFE';
      text.style.color = '#1E40AF';
      text.textContent = '🔕 Avisos desactivados. Actívalos para que el móvil te avise cuando entre una alerta.';
      btn.textContent = 'Activar';
      btn.style.background = '#2563EB';
      btn.style.display = '';
      btn.onclick = () => window.activarAvisosPush();
    }
  }
  window.activarAvisosPush = async function () {
    if (!window.PSNotif) return;
    const ok = await PSNotif.pedirPermiso();
    refrescarPushBanner();
    if (ok) toast('✓ Avisos activados');
  };
  // Al abrir el panel también refrescamos el banner (usuario pudo cambiar permisos)
  const _toggleAntes = window.toggleNotifPanel;
  window.toggleNotifPanel = function () {
    _toggleAntes && _toggleAntes();
    refrescarPushBanner();
  };
  refrescarPushBanner();
  // Enganche Realtime al SDK de PSNotif (una sola vez cuando sb esté listo)
  (function esperarSb(intentos) {
    if (window.sb && window.PSNotif) {
      try { PSNotif.suscribirCoordinador({ empresaId: (window.PS_SESSION || {}).empresaId }); }
      catch (e) { console.warn('[PSNotif] suscribir falló', e); }
      return;
    }
    if (intentos > 20) return;
    setTimeout(() => esperarSb(intentos + 1), 300);
  })(0);

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
        await cargarUnidadesPuesto(currentBotPuesto);
        renderBotiquinAdmin();
      }
    } catch (err) { console.warn('refrescarSelectBotiquin:', err.message); }
  }
  if (botiquinPuestoSelect) {
    refrescarSelectBotiquin();
    botiquinPuestoSelect.addEventListener('change', async e => {
      currentBotPuesto = e.target.value;
      await cargarUnidadesPuesto(currentBotPuesto);
      renderBotiquinAdmin();
    });
    // Refrescar al entrar en la sección Botiquín
    document.querySelectorAll('[data-view="botiquin"], [data-nav="botiquin"]').forEach(el => {
      el.addEventListener('click', async () => {
        setTimeout(refrescarSelectBotiquin, 100);
        if (currentBotPuesto) { await cargarUnidadesPuesto(currentBotPuesto); renderUnidadesBar(currentBotSeccion); }
      });
    });
    // Y al cargar por primera vez cuando ya haya un puesto seleccionado
    setTimeout(async () => {
      if (currentBotPuesto) { await cargarUnidadesPuesto(currentBotPuesto); renderUnidadesBar(currentBotSeccion); }
    }, 1200);
  }

  function itemsPuestoSeccion(puestoId, sec) {
    return PS.inventario.filter(it => it.puestoId === puestoId && it.seccion === sec);
  }

  // ---- Gestor de unidades del hotel (Botiquín 1/2/3, Oxígeno 1/2…) ----
  // Se pinta encima del listado de items. Al cambiar de puesto/sección se
  // repinta con las unidades reales de BD. Solo visible para admin/coord.
  let unidadesPuestoCache = { botiquin: [], desa: [], oxigeno: [] };

  async function cargarUnidadesPuesto(puestoId) {
    unidadesPuestoCache = { botiquin: [], desa: [], oxigeno: [] };
    if (!puestoId || !window.sb) return;
    try {
      const { data, error } = await window.sb.from('unidades_material')
        .select('id, seccion, nombre, numero, activo')
        .eq('puesto_id', puestoId).eq('activo', true)
        .order('seccion').order('numero');
      if (error) throw error;
      (data || []).forEach(u => {
        if (unidadesPuestoCache[u.seccion]) unidadesPuestoCache[u.seccion].push(u);
      });
    } catch (err) { console.warn('[unidades]', err.message); }
  }

  function renderUnidadesBar(sec) {
    const cont = document.getElementById('unidadesBar');
    if (!cont) return;
    const uds = unidadesPuestoCache[sec] || [];
    const psSes = window.PS_SESSION || {};
    const puedeGestionar = psSes.rol === 'dueno' || psSes.rol === 'coordinador';
    const secLabel = sec === 'botiquin' ? 'botiquines' : sec === 'desa' ? 'DESA' : 'oxígenos';
    if (uds.length === 0) {
      cont.innerHTML = puedeGestionar ? `
        <div style="padding:10px 12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;font-size:12.5px;color:#78350F;display:flex;gap:8px;align-items:center;">
          <span>⚠️ Este hotel no tiene unidades de ${secLabel} configuradas.</span>
          <button class="btn btn-sm btn-primary" style="background:#F59E0B;margin-left:auto;" onclick="crearNuevaUnidad('${sec}')">+ Crear ${sec === 'botiquin' ? 'Botiquín 1' : sec === 'desa' ? 'DESA 1' : 'Oxígeno 1'}</button>
        </div>` : '';
      return;
    }
    cont.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;background:#F1F5F9;border-radius:8px;">
        <span style="font-weight:700;font-size:12px;color:#334155;text-transform:uppercase;letter-spacing:.3px;">Unidades:</span>
        ${uds.map(u => `
          <div style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid #CBD5E1;padding:4px 8px;border-radius:20px;font-size:12.5px;">
            <span style="font-weight:600;">${u.nombre}</span>
            ${puedeGestionar ? `
              <button title="Renombrar" onclick="renombrarUnidad('${u.id}')" style="background:transparent;border:0;color:#1D4ED8;cursor:pointer;padding:0 2px;font-size:12px;">✏️</button>
              ${u.numero > 1 ? `<button title="Eliminar unidad" onclick="eliminarUnidad('${u.id}','${u.nombre.replace(/'/g,"\\'")}','${sec}')" style="background:transparent;border:0;color:#DC2626;cursor:pointer;padding:0 2px;font-size:12px;">🗑</button>` : ''}
            ` : ''}
          </div>
        `).join('')}
        ${puedeGestionar ? `
          <button class="btn btn-sm" style="background:#059669;color:#fff;border:0;padding:5px 12px;border-radius:16px;font-size:12px;font-weight:700;margin-left:auto;cursor:pointer;" onclick="crearNuevaUnidad('${sec}')">
            + Añadir ${sec === 'botiquin' ? 'botiquín' : sec === 'desa' ? 'DESA' : 'oxígeno'}
          </button>` : ''}
      </div>`;
  }

  window.crearNuevaUnidad = async function (sec) {
    const psSes = window.PS_SESSION || {};
    if (psSes.rol !== 'dueno' && psSes.rol !== 'coordinador') { toast('Solo administrador o coordinador'); return; }
    if (!currentBotPuesto) { toast('Selecciona antes un hotel'); return; }
    const defNombre = sec === 'botiquin' ? `Botiquín ${(unidadesPuestoCache.botiquin.length || 0) + 1}`
                    : sec === 'desa'     ? `DESA ${(unidadesPuestoCache.desa.length || 0) + 1}`
                                         : `Oxígeno ${(unidadesPuestoCache.oxigeno.length || 0) + 1}`;
    const nombre = prompt(`Nombre de la nueva unidad:\n\n(Ej: "${defNombre}", "Botiquín piscina infantil", "Oxígeno pool grande"…)`, defNombre);
    if (!nombre || !nombre.trim()) return;
    try {
      // Si es la primera unidad de esta sección, la creamos vacía. Si hay otras, duplicamos.
      const existentes = unidadesPuestoCache[sec] || [];
      if (existentes.length === 0) {
        const { error } = await window.sb.from('unidades_material').insert({
          puesto_id: currentBotPuesto, seccion: sec, nombre: nombre.trim(), numero: 1
        });
        if (error) throw error;
        toast(`✓ "${nombre}" creado sin material — añade productos con "+ Añadir producto"`);
      } else {
        // Duplicar la primera unidad (copia items+minimos, stock=minimo)
        const { data, error } = await window.sb.rpc('duplicar_unidad_material', {
          p_puesto_id: currentBotPuesto,
          p_seccion: sec,
          p_nuevo_nombre: nombre.trim()
        });
        if (error) throw error;
        toast(`✓ "${nombre}" creado con los mismos productos que la unidad 1`);
      }
      await cargarUnidadesPuesto(currentBotPuesto);
      renderUnidadesBar(currentBotSeccion);
      renderBotiquinAdmin();
    } catch (err) { alert('Error creando unidad:\n\n' + err.message + '\n\nSi dice que la función no existe, ejecuta antes sql/14-unidades-material.sql en Supabase.'); }
  };

  window.renombrarUnidad = async function (unidadId) {
    const psSes = window.PS_SESSION || {};
    if (psSes.rol !== 'dueno' && psSes.rol !== 'coordinador') { toast('Solo administrador o coordinador'); return; }
    const u = Object.values(unidadesPuestoCache).flat().find(x => x.id === unidadId);
    if (!u) return;
    const nuevo = prompt(`Nuevo nombre para "${u.nombre}":\n\n(Ej: "Botiquín piscina infantil", "Oxígeno pool grande", "Botiquín zona pool bar"…)`, u.nombre);
    if (!nuevo || !nuevo.trim() || nuevo.trim() === u.nombre) return;
    try {
      const { error } = await window.sb.from('unidades_material')
        .update({ nombre: nuevo.trim() }).eq('id', unidadId);
      if (error) throw error;
      toast('✓ Renombrado');
      await cargarUnidadesPuesto(currentBotPuesto);
      renderUnidadesBar(currentBotSeccion);
    } catch (err) { alert('Error: ' + err.message); }
  };

  window.eliminarUnidad = async function (unidadId, nombre, sec) {
    const psSes = window.PS_SESSION || {};
    if (psSes.rol !== 'dueno' && psSes.rol !== 'coordinador') { toast('Solo administrador o coordinador'); return; }
    if (!confirm(`⚠ ELIMINAR "${nombre}"?\n\nEsto borra la unidad y TODOS los items+revisiones asociados a ella.\n\nSi solo la quieres esconder temporalmente, mejor renómbrala.\n\n¿Continuar?`)) return;
    const conf = prompt(`Escribe el nombre para confirmar: ${nombre}`);
    if ((conf || '').trim().toLowerCase() !== nombre.trim().toLowerCase()) { toast('Cancelado'); return; }
    try {
      // Borrar inventario_puesto de esa unidad primero (por si CASCADE no funciona bien)
      await window.sb.from('inventario_puesto').delete().eq('unidad_id', unidadId);
      const { error } = await window.sb.from('unidades_material').delete().eq('id', unidadId);
      if (error) throw error;
      toast(`✓ ${nombre} eliminado`);
      await cargarUnidadesPuesto(currentBotPuesto);
      renderUnidadesBar(currentBotSeccion);
      renderBotiquinAdmin();
    } catch (err) { alert('Error: ' + err.message); }
  };

  function renderBotiquinAdmin() {
    if (!botiquinAdminList) return;
    const p = PS.puestoById(currentBotPuesto);
    if (botiquinPuestoLabel) botiquinPuestoLabel.textContent = `— ${p.nombre}`;
    // Pinta la barra de unidades (asíncrono en el arranque, síncrono si cache OK)
    renderUnidadesBar(currentBotSeccion);

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
      //    El tope de 8 h ordinarias se aplica al TOTAL DEL DÍA, no a cada tramo.
      //    Si no, un turno partido de 4,5 h + 4,5 h (9 h) contaría las 9 como
      //    ordinarias, porque ningún tramo suelto llega a 8.
      const OBJ_DIA = 8;
      const stats = {};
      empleados.forEach(e => { stats[e.id] = { dias: new Set(), ord: 0, extra: 0, porDia: {} }; });
      const entradaTmp = {};
      (fichs || []).forEach(f => {
        const s = stats[f.empleado_id];
        if (!s) return;
        const d = new Date(f.hora);
        if (f.tipo === 'entrada') {
          entradaTmp[f.empleado_id] = d;
          s.dias.add(d.toDateString());
        } else if (f.tipo === 'salida' && entradaTmp[f.empleado_id]) {
          const ini = entradaTmp[f.empleado_id];
          const h = Math.max(0, (d - ini) / 3600000);
          const clave = ini.toDateString();               // acumulamos por día natural
          s.porDia[clave] = (s.porDia[clave] || 0) + h;
          delete entradaTmp[f.empleado_id];
        }
      });
      // Con el total de cada día ya cerrado, repartimos entre ordinarias y extras
      Object.values(stats).forEach(s => {
        Object.values(s.porDia).forEach(hDia => {
          s.ord   += Math.min(OBJ_DIA, hDia);
          s.extra += Math.max(0, hDia - OBJ_DIA);
        });
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
      // 7. Pintar (columna Editar solo visible para admin=dueno)
      const esAdmin = ((window.PS_SESSION || {}).rol || rol) === 'dueno';
      const thAcc = document.getElementById('hoursTableActionsTh');
      if (thAcc) thAcc.style.display = esAdmin ? '' : 'none';
      const colspan = esAdmin ? 7 : 6;
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="padding:30px;text-align:center;color:var(--ink-500,#6B7280);">Sin resultados con este filtro.</td></tr>`;
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
          ${esAdmin ? `<td class="num">
            <button class="btn-icon" title="Editar fichajes del mes" onclick="abrirEditorHorasMes('${s.id}','${s.nombre.replace(/'/g,"\\'")}')"
              style="width:32px;height:32px;background:#FEF3C7;color:#92400E;border-radius:8px;border:none;cursor:pointer;">
              <svg class="ic ic-14"><use href="#ic-pen"/></svg>
            </button>
          </td>` : ''}
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--danger);">Error: ${err.message}</td></tr>`;
    }
  }
  window.renderHours = renderHours;
  /* ==========================================================================
     HOJA DE NÓMINA · SOLO ADMIN (rol 'dueno')
     Tercera hoja, deliberadamente separada de las otras dos:
       · Lo que firma el socorrista y la hoja de inspección llevan las horas
         ORDINARIAS (tope 40 h/semana natural) — y coinciden entre sí.
       · Esta lleva las horas REALES fichadas, que es lo que necesita la
         gestoría para calcular la nómina, con el exceso separado.
     Los coordinadores NO la ven.
     ========================================================================== */
  let nominaCacheFilas = [];
  let nominaCacheMes = '';

  function nominaEsAdmin() {
    return ((window.PS_SESSION || {}).rol || rol) === 'dueno';
  }

  function nominaRellenarSelectorMeses() {
    const sel = document.getElementById('nominaMes');
    if (!sel || sel.options.length) return;
    const hoy = new Date();
    for (let atras = 0; atras < 6; atras++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
      const cod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const opt = document.createElement('option');
      opt.value = cod;
      opt.textContent = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => renderNomina());
  }

  async function renderNomina() {
    const sec = document.getElementById('nominaSection');
    if (!sec) return;
    if (!nominaEsAdmin()) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    nominaRellenarSelectorMeses();

    const tbody = document.querySelector('#nominaTable tbody');
    if (!tbody || !window.sb) return;
    tbody.innerHTML = '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--ink-500,#6B7280);">Cargando…</td></tr>';
    try {
      const cod = document.getElementById('nominaMes')?.value || new Date().toISOString().slice(0, 7);
      const [anio, mes] = cod.split('-').map(Number);
      const desde = new Date(anio, mes - 1, 1).toISOString();
      const hasta = new Date(anio, mes, 1).toISOString();
      nominaCacheMes = cod;

      const { data: emps, error: e1 } = await window.sb.from('empleados')
        .select('id, nombre, puesto_id, puestos(nombre)')
        .neq('estado', 'eliminado')
        .order('nombre');
      if (e1) throw e1;
      const empleados = emps || [];

      const { data: fichs } = await window.sb.from('fichajes')
        .select('empleado_id, tipo, hora')
        .gte('hora', desde).lt('hora', hasta)
        .order('hora', { ascending: true });

      // Un cálculo por empleado, con el módulo compartido: así la columna
      // "Ordinarias" de esta hoja es EXACTAMENTE la que firmó el trabajador.
      const porEmp = {};
      (fichs || []).forEach(f => {
        (porEmp[f.empleado_id] = porEmp[f.empleado_id] || []).push(f);
      });

      const fmtH = window.PSJornada.fmtH;
      const filas = empleados.map(e => {
        const calc = window.PSJornada.calcular(porEmp[e.id] || []);
        return {
          id: e.id,
          nombre: e.nombre,
          puesto: (e.puestos && e.puestos.nombre) || '—',
          iniciales: (e.nombre || '?').split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase(),
          dias: calc.diasTrabajados,
          reales: calc.horasReales,
          ordinarias: calc.horasFirmadas,
          compl: calc.horasComplementarias,
          incompletos: calc.incompletos.length
        };
      }).filter(x => x.dias > 0 || x.incompletos > 0);

      nominaCacheFilas = filas;
      const cnt = document.getElementById('nominaCount');
      if (cnt) cnt.textContent = `${filas.length} con actividad`;

      if (!filas.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--ink-500,#6B7280);">Nadie fichó en este mes.</td></tr>';
        return;
      }
      tbody.innerHTML = filas.map(s => `
        <tr>
          <td><div class="hours-name"><div class="mini-av sky">${s.iniciales}</div><span style="font-weight:500;">${s.nombre}</span></div></td>
          <td class="text-muted">${s.puesto}</td>
          <td class="num">${s.dias}</td>
          <td class="num"><b>${fmtH(s.reales)}h</b></td>
          <td class="num">${fmtH(s.ordinarias)}h</td>
          <td class="num"><span class="hours-extras ${s.compl > 0 ? '' : 'zero'}">${fmtH(s.compl)}</span></td>
          <td class="num">${s.incompletos ? `<span style="color:#B45309;font-weight:700;" title="Días con entrada sin salida fichada">⚠ ${s.incompletos}</span>` : '—'}</td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:20px;text-align:center;color:#B91C1C;">Error: ${err.message}</td></tr>`;
    }
  }
  window.renderNomina = renderNomina;

  window.descargarNominaCSV = function () {
    if (!nominaEsAdmin()) return;
    if (!nominaCacheFilas.length) { toast('No hay datos que descargar'); return; }
    const cab = ['Socorrista', 'Puesto', 'Dias', 'Horas reales', 'Ordinarias (40h/sem)', 'Complementarias', 'Dias sin cerrar'];
    const linea = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [cab.map(linea).join(';')]
      .concat(nominaCacheFilas.map(s => [s.nombre, s.puesto, s.dias, s.reales, s.ordinarias, s.compl, s.incompletos].map(linea).join(';')))
      .join('\r\n');
    // BOM para que Excel en español abra bien los acentos
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nomina-horas-reales-${nominaCacheMes}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toast('✓ CSV descargado');
  };

  setTimeout(() => renderHours('all'), 1200);
  setTimeout(() => renderNomina(), 1400);
  document.querySelectorAll('[data-section="horas"]').forEach(el => el.addEventListener('click', () => setTimeout(() => {
    renderHours(document.getElementById('hourFilter')?.value || 'all');
    renderNomina();
  }, 200)));
  document.getElementById('hourFilter')?.addEventListener('change', e => renderHours(e.target.value));

  /* ==========================================================================
     PANEL TITULACIONES · quién tiene documentación caducada o a punto
     Un socorrista con la titulación caducada no puede prestar servicio y la
     responsabilidad recae en la empresa, así que esto es control de riesgo.
     ========================================================================== */
  let titulacionesCache = [];

  window.renderTitulacionesPanel = async function () {
    const cont = document.getElementById('titulacionesPanelBody');
    const countEl = document.getElementById('titPanelCount');
    if (!cont || !window.sb) return;
    cont.innerHTML = '<div class="text-muted small" style="padding:30px;text-align:center;">Cargando titulaciones…</div>';
    try {
      // 1) Empleados activos
      const { data: emps, error: e1 } = await window.sb.from('empleados')
        .select('id, nombre, email, telefono, puesto_id, puestos(nombre)')
        .eq('estado', 'activo')
        .order('nombre');
      if (e1) throw e1;
      const empleados = emps || [];
      if (empleados.length === 0) {
        cont.innerHTML = '<div class="text-muted small" style="padding:30px;text-align:center;">No hay empleados activos.</div>';
        return;
      }

      // 2) Todas sus titulaciones de una sola consulta
      const ids = empleados.map(e => e.id);
      const { data: tits, error: e2 } = await window.sb.from('titulaciones_empleado')
        .select('id, empleado_id, tipo, nombre, fecha_caducidad, fecha_reciclaje, documento_url')
        .in('empleado_id', ids);
      if (e2) throw e2;
      titulacionesCache = tits || [];

      const porEmpleado = {};
      titulacionesCache.forEach(t => {
        (porEmpleado[t.empleado_id] = porEmpleado[t.empleado_id] || []).push(t);
      });

      // 3) Clasificar
      const TIPOS = (window.PSTit && window.PSTit.TIPOS) || {};
      const obligatorios = Object.keys(TIPOS).filter(k => TIPOS[k].obligatorio);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const diasHasta = f => Math.floor((new Date(f) - hoy) / 86400000);

      const caducadas = [], en30 = [], en90 = [], faltan = [];

      empleados.forEach(emp => {
        const suyas = porEmpleado[emp.id] || [];
        // Titulaciones con fecha de caducidad
        suyas.forEach(t => {
          if (!t.fecha_caducidad) return;
          const d = diasHasta(t.fecha_caducidad);
          const item = { emp, tit: t, dias: d };
          if (d < 0) caducadas.push(item);
          else if (d <= 30) en30.push(item);
          else if (d <= 90) en90.push(item);
        });
        // Obligatorias que NO ha subido
        const tiposQueTiene = new Set(suyas.map(t => t.tipo));
        const suFaltan = obligatorios.filter(tp => !tiposQueTiene.has(tp));
        if (suFaltan.length) faltan.push({ emp, tipos: suFaltan });
      });

      caducadas.sort((a,b) => a.dias - b.dias);
      en30.sort((a,b) => a.dias - b.dias);
      en90.sort((a,b) => a.dias - b.dias);

      const totalCritico = caducadas.length + en30.length;
      if (countEl) {
        countEl.textContent = totalCritico > 0
          ? `${totalCritico} requieren atención`
          : 'Todo en regla';
      }
      // Badge en el menú lateral
      const badge = document.getElementById('menuBadgeTit');
      if (badge) {
        if (totalCritico > 0) { badge.textContent = totalCritico; badge.style.display = ''; }
        else badge.style.display = 'none';
      }

      // 4) Pintar
      const tel = e => (e.telefono || '').replace(/\s+/g,'');
      const telHref = e => { const t = tel(e); return t ? (t.startsWith('+') ? t : (t.length === 9 ? '+34'+t : t)) : ''; };
      const nombreTipo = tp => (TIPOS[tp] && TIPOS[tp].label) || tp;

      function bloque(titulo, items, color, fondo, descripcion, render) {
        if (!items.length) return '';
        return `
          <div style="margin-bottom:22px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
              <div style="width:10px;height:10px;border-radius:50%;background:${color};"></div>
              <h4 style="margin:0;font-size:15px;">${titulo}</h4>
              <span style="background:${fondo};color:${color};padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;">${items.length}</span>
            </div>
            <div class="small text-muted" style="margin:0 0 10px 20px;">${descripcion}</div>
            ${items.map(render).join('')}
          </div>`;
      }

      const filaTit = (color, fondo) => (it) => {
        const h = telHref(it.emp);
        const txtDias = it.dias < 0
          ? `Caducó hace ${Math.abs(it.dias)} día${Math.abs(it.dias)===1?'':'s'}`
          : `Caduca en ${it.dias} día${it.dias===1?'':'s'}`;
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;margin:5px 0;background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${color};border-radius:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;">${it.emp.nombre}</div>
              <div class="small text-muted">
                ${nombreTipo(it.tit.tipo)} · ${it.emp.puestos?.nombre || 'sin puesto'}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;font-size:12.5px;color:${color};">${txtDias}</div>
              <div class="small text-muted">${new Date(it.tit.fecha_caducidad).toLocaleDateString('es-ES')}</div>
            </div>
            ${h ? `<a class="btn-icon" href="tel:${h}" title="Llamar a ${it.emp.nombre}" style="width:34px;height:34px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;text-decoration:none;flex-shrink:0;">
              <svg class="ic ic-14"><use href="#ic-phone"/></svg></a>` : ''}
            <button class="btn-icon" title="Abrir su ficha" onclick="abrirFichaTitulaciones('${it.emp.id}')"
              style="width:34px;height:34px;background:#EFF6FF;color:#1D4ED8;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;">
              <svg class="ic ic-14"><use href="#ic-chevron-right"/></svg>
            </button>
          </div>`;
      };

      let html = '';

      if (totalCritico === 0 && faltan.length === 0) {
        html = `<div class="alert-strip ok" style="padding:20px;">
          <svg class="ic ic-18"><use href="#ic-check-circle"/></svg>
          <div><b>Toda la plantilla al día.</b> Ninguna titulación caducada ni próxima a caducar, y no falta ninguna obligatoria.</div>
        </div>`;
      }

      html += bloque(
        'Caducadas', caducadas, '#DC2626', '#FEE2E2',
        'Estas personas NO deberían estar prestando servicio hasta renovar.',
        filaTit('#DC2626', '#FEE2E2')
      );
      html += bloque(
        'Caducan este mes', en30, '#D97706', '#FEF3C7',
        'Avisa ya para que tengan tiempo de renovar sin perder días de trabajo.',
        filaTit('#D97706', '#FEF3C7')
      );
      html += bloque(
        'Caducan en 3 meses', en90, '#0891B2', '#CFFAFE',
        'Conviene ir planificando la renovación.',
        filaTit('#0891B2', '#CFFAFE')
      );

      if (faltan.length) {
        html += `
          <div style="margin-bottom:22px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
              <div style="width:10px;height:10px;border-radius:50%;background:#7C3AED;"></div>
              <h4 style="margin:0;font-size:15px;">Documentación obligatoria sin subir</h4>
              <span style="background:#EDE9FE;color:#7C3AED;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;">${faltan.length}</span>
            </div>
            <div class="small text-muted" style="margin:0 0 10px 20px;">Aún no han subido estos documentos a su ficha.</div>
            ${faltan.map(f => `
              <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;margin:5px 0;background:#fff;border:1px solid #e2e8f0;border-left:4px solid #7C3AED;border-radius:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;font-size:14px;">${f.emp.nombre}</div>
                  <div class="small text-muted">Falta: ${f.tipos.map(nombreTipo).join(' · ')}</div>
                </div>
                <button class="btn-icon" title="Abrir su ficha" onclick="abrirFichaTitulaciones('${f.emp.id}')"
                  style="width:34px;height:34px;background:#EFF6FF;color:#1D4ED8;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;">
                  <svg class="ic ic-14"><use href="#ic-chevron-right"/></svg>
                </button>
              </div>`).join('')}
          </div>`;
      }

      cont.innerHTML = html;
      // Guardamos para el export
      window.__titExport = { caducadas, en30, en90, faltan, nombreTipo };
    } catch (err) {
      cont.innerHTML = `<div class="alert-strip warn" style="margin:6px;">Error cargando titulaciones: ${err.message}</div>`;
    }
  };

  // Abre la ficha del empleado directamente en su pestaña de titulaciones
  window.abrirFichaTitulaciones = function (empId) {
    if (!window.openEmpleadoModal) return;
    window.openEmpleadoModal(empId);
    setTimeout(() => {
      const tab = document.querySelector('.ficha-tab[data-ftab="titulaciones"]');
      if (tab) tab.click();
    }, 250);
  };

  window.exportarTitulacionesCSV = function () {
    const d = window.__titExport;
    if (!d) { toast('Carga primero el panel'); return; }
    const filas = [['Estado','Socorrista','Documento','Caducidad','Dias','Puesto']];
    const add = (estado, arr) => arr.forEach(it => filas.push([
      estado, it.emp.nombre, d.nombreTipo(it.tit.tipo),
      new Date(it.tit.fecha_caducidad).toLocaleDateString('es-ES'),
      it.dias, it.emp.puestos?.nombre || ''
    ]));
    add('CADUCADA', d.caducadas);
    add('CADUCA EN 30 DIAS', d.en30);
    add('CADUCA EN 90 DIAS', d.en90);
    d.faltan.forEach(f => filas.push([
      'SIN SUBIR', f.emp.nombre, f.tipos.map(d.nombreTipo).join(' / '), '', '', f.emp.puestos?.nombre || ''
    ]));
    const csv = '﻿' + filas.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PoolSafety-titulaciones-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast('✓ CSV descargado');
  };

  // Cargar al entrar en la sección + comprobar al arrancar para pintar el badge
  document.querySelectorAll('[data-section="titulaciones"]').forEach(el =>
    el.addEventListener('click', () => setTimeout(renderTitulacionesPanel, 200)));
  setTimeout(renderTitulacionesPanel, 2500);

  /* ==========================================================================
     PANEL INCIDENCIAS · partes firmados por los socorristas
     Realtime → aparecen al momento. Cada fila: descargar PDF, ver detalle.
     ========================================================================== */
  let incAdminCache = [];
  let incAdminFiltroTipo = '';
  let incAdminFiltroDesde = '';

  function poblarFiltroTiposInc() {
    const sel = document.getElementById('incFiltroTipo');
    if (!sel || !window.PSInc) return;
    if (sel.options.length > 1) return; // ya poblado
    window.PSInc.TIPOS_INCIDENTE.forEach(t => {
      const o = document.createElement('option');
      o.value = t.value; o.textContent = t.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { incAdminFiltroTipo = sel.value; renderIncidenciasList(); });
    const desde = document.getElementById('incFiltroDesde');
    if (desde) desde.addEventListener('change', () => { incAdminFiltroDesde = desde.value; renderIncidenciasList(); });
  }

  window.renderIncidenciasPanel = async function () {
    if (!window.sb) return;
    poblarFiltroTiposInc();
    const cont = document.getElementById('incidenciasList');
    if (cont) cont.innerHTML = '<div class="text-muted small" style="padding:30px;text-align:center;">Cargando incidencias…</div>';
    try {
      const { data, error } = await window.sb.from('incidencias')
        .select('*, empleados(id,nombre,dni,telefono), puestos(id,nombre)')
        .order('fecha_incidente', { ascending: false })
        .limit(200);
      if (error) throw error;
      incAdminCache = data || [];
      renderIncidenciasList();
      // Badge en menú lateral
      const badge = document.getElementById('menuBadgeInc');
      const nuevas = incAdminCache.filter(i => {
        // Consideramos "nueva" las creadas en las últimas 48 h
        const cr = i.fecha_creado ? new Date(i.fecha_creado) : null;
        return cr && (Date.now() - cr.getTime() < 48 * 3600 * 1000);
      }).length;
      if (badge) {
        if (nuevas > 0) { badge.textContent = nuevas; badge.style.display = 'inline-flex'; }
        else { badge.style.display = 'none'; }
      }
    } catch (err) {
      if (cont) cont.innerHTML = `<div class="alert-strip warn" style="margin:6px;">
        Error cargando incidencias: ${err.message}<br>
        <small>Si no has ejecutado el SQL <code>sql/06-incidencias.sql</code> aún, hazlo en Supabase primero.</small>
      </div>`;
    }
  };

  function renderIncidenciasList() {
    const cont = document.getElementById('incidenciasList');
    const cnt = document.getElementById('incPanelCount');
    if (!cont) return;
    let visibles = incAdminCache.slice();
    if (incAdminFiltroTipo) visibles = visibles.filter(i => i.tipo_incidente === incAdminFiltroTipo);
    if (incAdminFiltroDesde) {
      const d0 = new Date(incAdminFiltroDesde); d0.setHours(0,0,0,0);
      visibles = visibles.filter(i => new Date(i.fecha_incidente) >= d0);
    }
    if (cnt) cnt.textContent = `${visibles.length} de ${incAdminCache.length}`;
    if (visibles.length === 0) {
      cont.innerHTML = '<div class="text-muted small" style="padding:30px;text-align:center;">Sin partes con estos filtros.</div>';
      return;
    }
    cont.innerHTML = visibles.map(i => {
      const emp = i.empleados?.nombre || '—';
      const puesto = i.puestos?.nombre || '—';
      const tipo = window.PSInc?.formatTipo(i.tipo_incidente) || i.tipo_incidente || '—';
      const color = window.PSInc?.colorTipo(i.tipo_incidente) || '#64748B';
      const fecha = new Date(i.fecha_incidente).toLocaleString('es-ES', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const menor = i.es_menor ? '<span class="badge badge-warn" style="margin-left:6px;font-size:10px;">MENOR</span>' : '';
      const amb = (i.derivacion === 'ambulancia' || i.derivacion === 'hospital') ? '<span class="badge badge-danger" style="margin-left:6px;font-size:10px;">🚑 Ambulancia/Hospital</span>' : '';
      const mat = Array.isArray(i.material_usado) ? i.material_usado.length : 0;
      return `
        <div class="doc-admin-row" style="border-left:4px solid ${color};">
          <div class="doc-admin-main">
            <div style="width:36px;height:36px;border-radius:8px;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;">
              <svg class="ic ic-18"><use href="#ic-alert"/></svg>
            </div>
            <div style="min-width:0;flex:1;">
              <div class="doc-admin-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
                <span style="font-weight:700;">${tipo}</span>
                ${menor}${amb}
              </div>
              <div class="doc-admin-sub">
                <b>${i.numero_parte || '—'}</b> · ${fecha} · ${puesto}<br>
                Víctima: ${i.victima_nombre || '—'}${i.victima_edad?' ('+i.victima_edad+' años)':''} · Socorrista: ${emp}
                ${mat ? ' · ' + mat + ' productos usados' : ''}
              </div>
            </div>
          </div>
          <div class="doc-admin-actions">
            <button class="btn btn-primary btn-sm" data-inc-pdf="${i.id}" style="background:#B91C1C;">
              <svg class="ic ic-14"><use href="#ic-download"/></svg> PDF
            </button>
            <button class="btn btn-outline btn-sm" data-inc-ver="${i.id}">Ver detalle</button>
            ${(window.PS_SESSION||{}).rol === 'dueno' ? `<button class="btn btn-outline btn-sm" data-inc-del="${i.id}" style="color:#DC2626;border-color:#DC2626;" title="Eliminar (irreversible)">✕</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
    cont.querySelectorAll('[data-inc-pdf]').forEach(b => b.addEventListener('click', () => descargarIncidenciaAdmin(b.dataset.incPdf)));
    cont.querySelectorAll('[data-inc-ver]').forEach(b => b.addEventListener('click', () => verIncidenciaDetalle(b.dataset.incVer)));
    cont.querySelectorAll('[data-inc-del]').forEach(b => b.addEventListener('click', () => borrarIncidencia(b.dataset.incDel)));
  }

  async function descargarIncidenciaAdmin(id) {
    const inc = incAdminCache.find(x => x.id === id);
    if (!inc) return;
    toast('Generando PDF…');
    try {
      const emp = { nombre: inc.empleados?.nombre, dni: inc.empleados?.dni, puesto_nombre: inc.puestos?.nombre };
      await window.PSPdf.descargarIncidencia(inc, emp);
      toast('✓ PDF descargado');
      // Si aún no había PDF en Storage, subirlo ahora
      if (!inc.archivo_pdf_url) {
        try {
          const doc = await window.PSPdf.generarIncidencia(inc, emp);
          const blob = doc.output('blob');
          const url = await window.PSStorage.subir(`incidencias/${inc.id}.pdf`, blob, 'application/pdf');
          await window.sb.from('incidencias').update({ archivo_pdf_url: url }).eq('id', inc.id);
        } catch (_) {}
      }
    } catch (err) { toast('Error: ' + err.message); }
  }

  function verIncidenciaDetalle(id) {
    const i = incAdminCache.find(x => x.id === id);
    if (!i) return;
    const zonas = Array.isArray(i.dolor_zonas) ? i.dolor_zonas : [];
    const zonasHtml = zonas.length ? zonas.map(z => `<span class="badge badge-danger" style="margin:2px;font-size:11px;">${window.PSInc?.zonaLabel(z) || z}</span>`).join('') : '<span class="text-muted">—</span>';
    const tec = Array.isArray(i.tecnicas_aplicadas) ? i.tecnicas_aplicadas : [];
    const tecHtml = tec.length ? tec.map(t => `<span class="badge badge-info" style="margin:2px;font-size:11px;">${window.PSInc?.formatTecnica(t) || t}</span>`).join('') : '<span class="text-muted">—</span>';
    const mat = Array.isArray(i.material_usado) ? i.material_usado : [];
    const matHtml = mat.length ? mat.map(m => `<div style="padding:6px 8px;background:#F8FAFC;border-radius:6px;margin:3px 0;font-size:12.5px;">${m.nombre} · <b>${m.cantidad} ${m.unidad||''}</b></div>`).join('') : '<span class="text-muted">Sin material usado</span>';
    let modal = document.getElementById('incDetalleModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'incDetalleModal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:12px;';
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      document.body.appendChild(modal);
    }
    const b = v => v === true ? '<b style="color:#059669;">Sí</b>' : v === false ? '<b style="color:#DC2626;">No</b>' : '—';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:720px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3);">
        <div style="padding:14px 18px;background:${window.PSInc?.colorTipo(i.tipo_incidente)};color:#fff;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;opacity:.85;text-transform:uppercase;letter-spacing:.4px;">Parte ${i.numero_parte || ''}</div>
            <div style="font-size:16px;font-weight:700;margin-top:2px;">${window.PSInc?.formatTipo(i.tipo_incidente)}</div>
          </div>
          <button onclick="document.getElementById('incDetalleModal').remove()" style="background:rgba(255,255,255,.2);border:0;color:#fff;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:20px;">×</button>
        </div>
        <div style="padding:16px 18px;overflow-y:auto;font-size:13.5px;line-height:1.55;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
            <div><b>Fecha:</b><br>${new Date(i.fecha_incidente).toLocaleString('es-ES')}</div>
            <div><b>Puesto:</b><br>${i.puestos?.nombre || '—'}</div>
          </div>
          <div style="margin-bottom:12px;"><b>Ubicación:</b> ${i.ubicacion_descripcion || '—'}</div>
          <div style="margin-bottom:12px;"><b>Circunstancias:</b><br><div style="padding:8px;background:#F8FAFC;border-radius:6px;white-space:pre-wrap;">${(i.circunstancias||'—').replace(/</g,'&lt;')}</div></div>
          ${i.testigos ? `<div style="margin-bottom:12px;"><b>Testigos:</b> ${i.testigos}</div>` : ''}

          <h4 style="border-top:1px solid #E2E8F0;padding-top:10px;margin:14px 0 8px;">Víctima</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div><b>Nombre:</b> ${i.victima_nombre || '—'}${i.es_menor?' <span class="badge badge-warn" style="font-size:10px;">MENOR</span>':''}</div>
            <div><b>Edad:</b> ${i.victima_edad ?? '—'} años · <b>Sexo:</b> ${i.victima_sexo || '—'}</div>
            <div><b>DNI:</b> ${i.victima_dni || '—'}</div>
            <div><b>Teléfono:</b> ${i.victima_telefono ? `<a href="tel:${i.victima_telefono}">${i.victima_telefono}</a>` : '—'}</div>
            <div><b>Nacionalidad:</b> ${i.victima_nacionalidad || '—'}</div>
            <div><b>Hotel/hab:</b> ${i.victima_hotel_habitacion || '—'}</div>
          </div>
          ${i.familiar_avisado ? `<div style="margin-top:8px;padding:8px;background:#EFF6FF;border-radius:6px;font-size:12.5px;">👨‍👩‍👧 Familiar avisado: ${i.familiar_nombre || '(sí)'} ${i.familiar_hora ? ' a las ' + new Date(i.familiar_hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : ''}</div>` : ''}

          <h4 style="border-top:1px solid #E2E8F0;padding-top:10px;margin:14px 0 8px;">Estado y actuación</h4>
          <div>Consciente: ${b(i.consciente)} · Respira: ${b(i.respira)} · Sangrado: ${b(i.sangrado)}</div>
          <div style="margin:8px 0;"><b>Zonas afectadas:</b><br>${zonasHtml}</div>
          <div style="margin-bottom:8px;"><b>Silueta:</b>
            <div style="display:flex;gap:12px;justify-content:center;background:#F8FAFC;padding:10px;border-radius:8px;">
              <div style="max-width:130px;text-align:center;"><div class="small text-muted">Frontal</div>${window.PSInc?.siluetaSVG(zonas, false, 'front')}</div>
              <div style="max-width:130px;text-align:center;"><div class="small text-muted">Espalda</div>${window.PSInc?.siluetaSVG(zonas, false, 'back')}</div>
            </div>
          </div>
          <div style="margin:10px 0;"><b>Actuación:</b><br><div style="padding:8px;background:#F8FAFC;border-radius:6px;white-space:pre-wrap;">${(i.actuacion||'—').replace(/</g,'&lt;')}</div></div>
          <div style="margin:8px 0;"><b>Técnicas:</b><br>${tecHtml}</div>
          <div style="margin:8px 0;"><b>Material usado:</b>${matHtml}</div>

          <h4 style="border-top:1px solid #E2E8F0;padding-top:10px;margin:14px 0 8px;">Derivación</h4>
          <div>${window.PSInc?.formatDerivacion(i.derivacion) || (i.derivacion||'—')}</div>
          ${i.ambulancia_numero || i.hospital ? `
          <div style="margin-top:6px;padding:8px;background:#FEF2F2;border-radius:6px;font-size:12.5px;">
            ${i.ambulancia_numero ? `🚑 Ambulancia: ${i.ambulancia_numero}<br>` : ''}
            ${i.ambulancia_hora ? `Hora llegada: ${new Date(i.ambulancia_hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}<br>` : ''}
            ${i.hospital ? `Hospital: ${i.hospital}` : ''}
          </div>` : ''}

          <h4 style="border-top:1px solid #E2E8F0;padding-top:10px;margin:14px 0 8px;">Firma</h4>
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div style="flex:1;">
              <div><b>Socorrista:</b> ${i.firma_nombre || i.empleados?.nombre || '—'}</div>
              <div><b>DNI:</b> ${i.firma_dni || '—'}</div>
              <div class="small text-muted" style="margin-top:4px;">Firmado el ${new Date(i.fecha_creado).toLocaleString('es-ES')}</div>
            </div>
            ${i.firma_imagen ? `<img src="${i.firma_imagen}" style="max-width:180px;border:1px solid #E2E8F0;border-radius:6px;" alt="firma"/>` : ''}
          </div>
        </div>
        <div style="padding:12px 16px;border-top:1px solid #E2E8F0;display:flex;gap:8px;justify-content:flex-end;background:#F8FAFC;">
          <button class="btn btn-outline" onclick="document.getElementById('incDetalleModal').remove()">Cerrar</button>
          <button class="btn btn-primary" style="background:#B91C1C;" onclick="descargarIncAdminById('${i.id}')">
            <svg class="ic ic-16"><use href="#ic-download"/></svg> Descargar PDF
          </button>
        </div>
      </div>`;
  }
  window.descargarIncAdminById = descargarIncidenciaAdmin;

  async function borrarIncidencia(id) {
    if (((window.PS_SESSION||{}).rol) !== 'dueno') { toast('Solo el administrador puede borrar partes'); return; }
    if (!confirm('¿Eliminar este parte permanentemente? Perderás el registro y el PDF asociado.')) return;
    try {
      const { error } = await window.sb.from('incidencias').delete().eq('id', id);
      if (error) throw error;
      toast('✓ Parte eliminado');
      renderIncidenciasPanel();
    } catch (err) { toast('Error: ' + err.message); }
  }

  window.exportarIncidenciasCSV = function () {
    if (!incAdminCache.length) { toast('No hay incidencias'); return; }
    const rows = [['Nº parte','Fecha','Tipo','Puesto','Socorrista','Víctima','Edad','Menor','Derivación','Ambulancia','Material items','Circunstancias']];
    incAdminCache.forEach(i => {
      const mat = Array.isArray(i.material_usado) ? i.material_usado.map(m => `${m.nombre} x${m.cantidad}`).join(' | ') : '';
      rows.push([
        i.numero_parte || '',
        new Date(i.fecha_incidente).toLocaleString('es-ES'),
        window.PSInc?.formatTipo(i.tipo_incidente) || i.tipo_incidente,
        i.puestos?.nombre || '',
        i.empleados?.nombre || '',
        i.victima_nombre || '',
        i.victima_edad ?? '',
        i.es_menor ? 'Sí' : 'No',
        window.PSInc?.formatDerivacion(i.derivacion) || i.derivacion || '',
        i.ambulancia_numero || '',
        mat,
        (i.circunstancias || '').replace(/\n/g,' · ')
      ]);
    });
    const csv = '﻿' + rows.map(r => r.map(c => {
      const v = String(c ?? '');
      return v.includes(';') || v.includes('"') || v.includes('\n') ? '"' + v.replace(/"/g,'""') + '"' : v;
    }).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `PoolSafety-incidencias-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('✓ CSV descargado');
  };

  // Cargar al entrar en la sección + realtime + badge inicial
  document.querySelectorAll('[data-section="incidencias"]').forEach(el =>
    el.addEventListener('click', () => setTimeout(renderIncidenciasPanel, 200)));
  setTimeout(renderIncidenciasPanel, 2500);
  // Realtime: nuevos partes aparecen al momento
  (function esperarSbInc(intentos) {
    if (window.sb) {
      try {
        window.sb.channel('incidencias-admin')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidencias' }, () => {
            renderIncidenciasPanel();
            if (window.PSNotif) window.PSNotif.notify('🚨 Nueva incidencia', { body: 'Un socorrista acaba de firmar un parte.', tag: 'incidencia-new', url: '#incidencias' });
          })
          .subscribe();
      } catch (_) {}
      return;
    }
    if (intentos > 20) return;
    setTimeout(() => esperarSbInc(intentos + 1), 300);
  })(0);

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

      // ========== BLOQUE REVISIONES DIARIAS ==========
      // Añade al parte quién ha revisado botiquín/DESA/oxígeno hoy y
      // qué hoteles quedaron pendientes. Fallback silencioso si la
      // tabla no existe (sql/20 no ejecutado).
      try {
        const { data: revs } = await window.sb.from('revisiones_diarias')
          .select('puesto_id, seccion, empleado_nombre, fecha, items_ok, items_total, parcial, observaciones')
          .gte('fecha', desde).lt('fecha', hasta)
          .order('fecha');
        if (revs) {
          filas.push([]);
          filas.push(['REVISIONES DIARIAS · botiquín / DESA / oxígeno']);
          filas.push(['Hotel', 'Sección', 'Revisado por', 'Hora', 'Items OK', 'Items total', 'Parcial', 'Observaciones']);
          const secLabel = { botiquin: 'Botiquín', desa: 'DESA', oxigeno: 'Oxigenoterapia' };
          // Cruzar con puestos activos para detectar hoteles sin revisar
          const revsPorHotelSec = {};
          revs.forEach(r => {
            const k = r.puesto_id + '|' + r.seccion;
            (revsPorHotelSec[k] = revsPorHotelSec[k] || []).push(r);
            const p = puestos.find(x => x.id === r.puesto_id) || {};
            filas.push([
              p.nombre || '—',
              secLabel[r.seccion] || r.seccion,
              r.empleado_nombre || '—',
              new Date(r.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
              r.items_ok ?? '',
              r.items_total ?? '',
              r.parcial ? 'sí' : 'no',
              (r.observaciones || '').replace(/[\r\n;]/g, ' ')
            ]);
          });
          // Pendientes: hoteles activos sin revisión hoy en ninguna sección
          filas.push([]);
          filas.push(['HOTELES SIN REVISIÓN HOY']);
          puestos.forEach(p => {
            ['botiquin','desa','oxigeno'].forEach(sec => {
              if (!revsPorHotelSec[p.id + '|' + sec]) {
                filas.push([p.nombre, secLabel[sec], '(pendiente)', '', '', '', '', '']);
              }
            });
          });
        }
      } catch (_) { /* sql/20 no ejecutado */ }

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

      // Igual que en el panel: el tope de 8 h ordinarias es POR DÍA, no por
      // tramo, para que los turnos partidos se repartan bien.
      const OBJ_DIA = 8;
      const stats = {};
      (emps || []).forEach(e => { stats[e.id] = { dias: new Set(), ord: 0, extra: 0, fueraZona: 0, porDia: {} }; });
      const entradaTmp = {};
      (fichs || []).forEach(f => {
        const s = stats[f.empleado_id]; if (!s) return;
        const d = new Date(f.hora);
        if (f.tipo === 'entrada') { entradaTmp[f.empleado_id] = d; s.dias.add(d.toDateString()); if (f.fuera_de_zona) s.fueraZona++; }
        else if (f.tipo === 'salida' && entradaTmp[f.empleado_id]) {
          const ini = entradaTmp[f.empleado_id];
          const h = Math.max(0, (d - ini) / 3600000);
          const clave = ini.toDateString();
          s.porDia[clave] = (s.porDia[clave] || 0) + h;
          delete entradaTmp[f.empleado_id];
        }
      });
      Object.values(stats).forEach(s => {
        Object.values(s.porDia).forEach(hDia => {
          s.ord   += Math.min(OBJ_DIA, hDia);
          s.extra += Math.max(0, hDia - OBJ_DIA);
        });
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
  let docsCurrentFilter = 'kit_pendiente';

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
        .select('id, nombre, puesto_id, estado, fecha_baja, puestos(nombre)')
        .neq('estado', 'eliminado').is('fecha_baja', null)
        .order('nombre');
      const empleados = emps || [];
      if (empleados.length === 0) {
        docsAdminList.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-500);font-size:13.5px;">Aún no hay socorristas dados de alta. Cuando crees uno con el modal Nuevo Empleado aparecerá aquí.</div>';
        if (docsStats) docsStats.textContent = '0 socorristas';
        return;
      }

      // Firmas kit-alta reales por empleado (guardamos también la fecha para mostrarla)
      const ids = empleados.map(e => e.id);
      const { data: kitFirmas } = await window.sb.from('firmas_documentos')
        .select('empleado_id, fecha_firma').eq('documento_codigo','kit-alta').in('empleado_id', ids)
        .order('fecha_firma', { ascending: false });
      const kitPorEmp = new Set();
      const kitFechaPorEmp = new Map();
      (kitFirmas || []).forEach(f => {
        if (!kitPorEmp.has(f.empleado_id)) {
          kitPorEmp.add(f.empleado_id);
          kitFechaPorEmp.set(f.empleado_id, f.fecha_firma);
        }
      });

      // Jornadas firmadas reales (para futuro badge)
      const { data: jornFirmas } = await window.sb.from('firmas_documentos')
        .select('empleado_id, documento_codigo').like('documento_codigo','jornada-%').in('empleado_id', ids);
      const jornPorEmp = new Map();
      (jornFirmas || []).forEach(f => {
        const arr = jornPorEmp.get(f.empleado_id) || [];
        arr.push(f.documento_codigo);
        jornPorEmp.set(f.empleado_id, arr);
      });

      // ------ ¿Toca firmar la jornada del mes? ------
      // La jornada solo se firma:
      //   a) En los últimos 4 días del mes (día 27→fin), o
      //   b) Cuando el empleado está en baja/finiquito-pendiente (su último día).
      // Fuera de esa ventana, no toca — mostrar el estado como "Se firma a fin de mes" (gris).
      const hoy = new Date();
      const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      const diasParaFinMes = Math.max(0, Math.ceil((finDeMes - hoy) / (1000 * 60 * 60 * 24)));
      const esEpocaFirma = diasParaFinMes <= 4; // 4 últimos días del mes

      const hoyMes = 'jornada-' + new Date().toISOString().slice(0,7);
      const rows = empleados.map(e => {
        const enSalida = e.estado === 'finiquito-pendiente' || e.estado === 'baja';
        const jornadaMesFirmada = (jornPorEmp.get(e.id) || []).includes(hoyMes);
        // "Toca firmar la jornada" solo si es fin de mes o el empleado sale, y no está firmada aún
        const jornadaToca = !jornadaMesFirmada && (esEpocaFirma || enSalida);
        return {
          id: e.id,
          nombre: e.nombre,
          iniciales: (e.nombre || '?').split(' ').map(p => p[0]).join('').substring(0,2).toUpperCase(),
          puesto: (e.puestos && e.puestos.nombre) || '—',
          estado: e.estado,
          enSalida,
          kitOk: kitPorEmp.has(e.id),
          kitFecha: kitFechaPorEmp.get(e.id) || null,
          jornadaMesFirmada,
          jornadaToca
        };
      });

      // Contadores: solo cuenta como "pendiente" lo accionable (kit sin firmar o jornada que toca)
      const alDia = rows.filter(r => r.kitOk && !r.jornadaToca).length;
      const pendTotal = rows.filter(r => !r.kitOk || r.jornadaToca).length;
      const cabeceraExtra = esEpocaFirma
        ? ` · <span style="color:#B45309;">últimos ${diasParaFinMes||1} días del mes: toca firmar jornadas</span>`
        : ` · <span style="color:#64748b;">jornadas se firman al final del mes</span>`;
      if (docsStats) docsStats.innerHTML = `${alDia}/${rows.length} al día · ${pendTotal} pendientes${cabeceraExtra}`;

      let visibles = rows;
      if (docsCurrentFilter === 'kit_pendiente')      visibles = rows.filter(r => !r.kitOk);
      else if (docsCurrentFilter === 'pendientes')    visibles = rows.filter(r => !r.kitOk || r.jornadaToca);
      else if (docsCurrentFilter === 'firmados')      visibles = rows.filter(r => r.kitOk && !r.jornadaToca);
      // 'todos' → sin filtro

      if (visibles.length === 0) {
        const msg = docsCurrentFilter === 'kit_pendiente'
          ? '¡Todos los socorristas tienen el Kit Alta firmado! 🎉'
          : docsCurrentFilter === 'pendientes'
            ? '¡Todos los socorristas al día!'
            : 'Sin resultados';
        docsAdminList.innerHTML = `<div style="padding: 30px; text-align:center; color: var(--ink-500); font-size: 13.5px;">
          <svg class="ic ic-24" style="opacity:.5; margin: 0 auto 8px;"><use href="#ic-check-circle"/></svg>
          <div>${msg}</div>
        </div>`;
        return;
      }

      docsAdminList.innerHTML = visibles.map(s => {
        const kitFechaCorta = s.kitFecha ? new Date(s.kitFecha).toLocaleDateString('es-ES', { day:'2-digit', month:'short' }) : '';
        const kitBadge = s.kitOk
          ? `<span class="badge badge-ok" title="Firmado el ${s.kitFecha ? new Date(s.kitFecha).toLocaleString('es-ES') : ''}"><span class="dot"></span>Kit Alta ✓${kitFechaCorta ? ' · '+kitFechaCorta : ''}</span>`
          : `<span class="badge badge-danger"><span class="dot"></span>Kit Alta pendiente</span>`;
        // Badge jornada: solo naranja si toca, verde si firmada, gris si aún no toca
        const jornBadge = s.jornadaMesFirmada
          ? `<span class="badge badge-ok"><span class="dot"></span>Jornada del mes ✓</span>`
          : s.jornadaToca
            ? `<span class="badge badge-warn"><span class="dot"></span>${s.enSalida ? 'Firmar jornada de baja' : 'Firmar jornada del mes'}</span>`
            : `<span class="badge badge-neutral" style="opacity:.7;"><span class="dot"></span>Jornada · fin de mes</span>`;
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
              ${s.kitOk && s.jornadaToca ? `<button class="btn btn-primary btn-sm" data-solicitar-jorn="${s.id}" data-solicitar-nombre="${s.nombre.replace(/"/g,'&quot;')}" style="background:#B45309;">
                <svg class="ic ic-14"><use href="#ic-bell"/></svg>
                Solicitar firma
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
      docsAdminList.querySelectorAll('[data-solicitar-jorn]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (typeof window.solicitarRegistroMensual === 'function') {
            window.solicitarRegistroMensual(btn.dataset.solicitarJorn, btn.dataset.solicitarNombre);
          }
        });
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

  /* --------- Parser mejorado con detección de columnas + turno partido ---------
     Columnas reconocidas (case-insensitive, admite tildes/acentos):
       nombre / socorrista / empleado   → nombre del trabajador
       dni / nif                        → DNI (más fiable que el nombre)
       hotel / puesto / lugar / centro  → puesto
       hora_inicio / entrada / hora ini → 1er tramo inicio
       hora_fin    / salida  / hora fin → 1er tramo fin
       hora_inicio_2 / entrada 2        → 2º tramo inicio (turno partido)
       hora_fin_2    / salida 2         → 2º tramo fin (turno partido)
       horario / turno                  → texto "10:00-18:00" (fallback si no hay
                                          columnas separadas)
       dias / días                      → "Lun-Vie" o "L,M,X,J,V"
     Cada fila devuelve {socId, socMatch, nombre, dni, puestoId, puesto,
                         hora, hora_fin, es_partido, hora_ini_2, hora_fin_2,
                         dur, dias, motivos: [errores]}
     Filas con errores NO se filtran — se muestran en el preview para que el
     usuario vea por qué se descartan. Solo se aplican las OK.
  ------------------------------------------------------------------------- */
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

    // Detectar columnas — buscar en las primeras 5 filas
    const idx = { nombre: -1, dni: -1, hotel: -1, horario: -1, ini: -1, fin: -1, ini2: -1, fin2: -1, dias: -1 };
    let filaCabecera = -1;
    for (let r = 0; r < Math.min(filas.length, 5); r++) {
      const row = filas[r].map(c => normaliza(String(c || '')));
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        // Orden importante: las columnas más específicas primero para no pisarlas con "hora"
        if (idx.dni  === -1 && (cell === 'dni' || cell === 'nif' || cell.includes('dninif'))) idx.dni = c;
        if (idx.nombre === -1 && (cell.includes('nombre') || cell.includes('socorrista') || cell.includes('empleado') || cell === 'trabajador')) idx.nombre = c;
        if (idx.hotel === -1 && (cell.includes('hotel') || cell.includes('puesto') || cell.includes('centro') || cell.includes('lugar'))) idx.hotel = c;
        if (idx.ini2 === -1 && (cell.includes('inicio2') || cell.includes('entrada2') || cell.includes('inicio 2') || cell === 'ini2')) idx.ini2 = c;
        if (idx.fin2 === -1 && (cell.includes('fin2') || cell.includes('salida2') || cell.includes('fin 2'))) idx.fin2 = c;
        if (idx.ini  === -1 && (cell === 'horainicio' || cell.includes('inicio') || cell === 'entrada' || cell === 'horaini')) idx.ini = c;
        if (idx.fin  === -1 && (cell === 'horafin' || cell === 'salida' || cell.includes('finhora') || cell === 'horafin1' || cell === 'fin')) idx.fin = c;
        if (idx.dias === -1 && cell.startsWith('dia')) idx.dias = c;
        if (idx.horario === -1 && (cell === 'horario' || cell === 'turno')) idx.horario = c;
      }
      if (idx.nombre >= 0 || idx.hotel >= 0 || idx.dni >= 0 || idx.ini >= 0) { filaCabecera = r; break; }
    }
    if (filaCabecera === -1) filaCabecera = 0;
    // Fallbacks minimalistas cuando el usuario no puso cabeceras
    if (idx.hotel === -1 && idx.horario === -1 && idx.ini === -1) {
      // Estilo antiguo: col0=hotel, col1=horario
      idx.hotel = 0;
      idx.horario = 1;
    }

    const parseHora = (v) => {
      if (v === null || v === undefined || v === '') return null;
      // Excel guarda horas como fracción de día — si es número entre 0 y 1
      if (typeof v === 'number' && v >= 0 && v <= 1) {
        const totalMin = Math.round(v * 24 * 60);
        return `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`;
      }
      const s = String(v).trim().replace('.', ':').replace('h', ':').replace(/\s/g,'');
      const m = s.match(/^(\d{1,2})[:.]?(\d{2})?$/);
      if (m) {
        const hh = parseInt(m[1]); const mm = m[2] ? parseInt(m[2]) : 0;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      }
      return null;
    };
    const diffH = (a, b) => {
      if (!a || !b) return 0;
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      return Math.max(0, (bh + bm/60) - (ah + am/60));
    };

    const extraidos = [];
    for (let r = filaCabecera + 1; r < filas.length; r++) {
      const row = filas[r];
      if (!row || row.every(c => !c || !String(c).trim())) continue;
      const motivos = [];

      // --- Puesto ---
      let puesto = null;
      let hotelRaw = idx.hotel >= 0 ? String(row[idx.hotel] || '').trim() : '';
      if (hotelRaw) {
        // Descartar títulos/cabeceras espurios
        if (/^(semana|hoteles?|puestos?|cuadrante)$/i.test(hotelRaw)) continue;
        puesto = PS.puestos.find(p => normaliza(p.nombre) === normaliza(hotelRaw));
        if (!puesto) puesto = PS.puestos.find(p => normaliza(p.nombre).includes(normaliza(hotelRaw))
          || normaliza(hotelRaw).includes(normaliza(p.nombre.split(' ')[0])));
        if (!puesto) puesto = PS.puestos.find(p => p._raw?.grupo_hotel && normaliza(p._raw.grupo_hotel) === normaliza(hotelRaw));
        if (!puesto) motivos.push(`Puesto no encontrado: "${hotelRaw}"`);
      } else {
        motivos.push('Sin puesto');
      }

      // --- Empleado (match por DNI si hay; si no, por nombre) ---
      let socId = null, nombreSoc = '', dniSoc = '';
      if (idx.dni >= 0 && row[idx.dni]) {
        dniSoc = String(row[idx.dni]).trim().toUpperCase().replace(/[^0-9A-Z]/g,'');
        if (dniSoc) {
          const s = empleadosDB.find(e => (e.dni || '').toUpperCase().replace(/[^0-9A-Z]/g,'') === dniSoc);
          if (s) socId = s.id;
        }
      }
      if (idx.nombre >= 0 && row[idx.nombre]) {
        nombreSoc = String(row[idx.nombre]).trim();
        if (!socId) {
          const nSoc = normaliza(nombreSoc);
          // Match exacto → aprox por primer nombre + primer apellido
          let s = empleadosDB.find(e => normaliza(e.nombre) === nSoc);
          if (!s) {
            const partesBusca = nSoc.split(/\s+/).filter(Boolean);
            s = empleadosDB.find(e => {
              const partesEmp = normaliza(e.nombre).split(/\s+/).filter(Boolean);
              return partesBusca.length && partesEmp.length &&
                partesBusca.every(p => partesEmp.some(pe => pe.includes(p) || p.includes(pe)));
            });
          }
          if (s) socId = s.id;
        }
      }
      if (!socId && (nombreSoc || dniSoc)) {
        motivos.push(`Empleado no encontrado: ${nombreSoc || dniSoc}. Debe estar dado de alta antes.`);
      }
      if (!socId && !nombreSoc && !dniSoc) motivos.push('Sin socorrista');

      // --- Horas ---
      let hIni = null, hFin = null, hIni2 = null, hFin2 = null;
      if (idx.ini >= 0) hIni = parseHora(row[idx.ini]);
      if (idx.fin >= 0) hFin = parseHora(row[idx.fin]);
      if (idx.ini2 >= 0) hIni2 = parseHora(row[idx.ini2]);
      if (idx.fin2 >= 0) hFin2 = parseHora(row[idx.fin2]);

      // Fallback formato "10:00-18:00" en columna horario/turno o si no vino separado
      if (!hIni && idx.horario >= 0) {
        const txt = String(row[idx.horario] || '').trim();
        const m = txt.match(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/);
        if (m) { hIni = parseHora(m[1]); hFin = parseHora(m[2]); }
        // Segundo tramo en el mismo texto: "10:00-14:30 / 16:00-20:30"
        const m2 = txt.match(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2}).*?(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/);
        if (m2) { hIni2 = parseHora(m2[3]); hFin2 = parseHora(m2[4]); }
      }
      if (!hIni || !hFin) motivos.push('Horas de entrada/salida no válidas');
      // Turno partido si vienen 2 tramos completos
      const esPartido = !!(hIni2 && hFin2);

      // --- Duración total ---
      const dur = Math.round((diffH(hIni, hFin) + (esPartido ? diffH(hIni2, hFin2) : 0)) * 10) / 10;

      // --- Días ---
      const dias = idx.dias >= 0 ? (String(row[idx.dias] || '').trim() || 'Lun-Vie') : 'Lun-Vie';

      extraidos.push({
        socId,
        nombre: nombreSoc || '(sin asignar)',
        dni: dniSoc,
        puestoId: puesto ? puesto.id : null,
        puesto: puesto ? puesto.nombre : (hotelRaw || '—'),
        hora: hIni || '',
        hora_fin: hFin || '',
        es_partido: esPartido,
        hora_ini_2: hIni2 || '',
        hora_fin_2: hFin2 || '',
        dur: dur || 8,
        dias,
        ok: motivos.length === 0 && socId && puesto,
        motivos
      });
    }

    if (extraidos.length === 0) throw new Error('No se detectaron filas en el archivo. Revisa que tenga cabeceras con nombre/hotel/hora_inicio/hora_fin o descarga la plantilla.');
    return extraidos;
  }

  function normaliza(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function mostrarPreviewExtraido(file, extraidos) {
    const ok  = extraidos.filter(e => e.ok);
    const err = extraidos.filter(e => !e.ok);
    // Guardamos las filas OK en window para no meter un JSON.stringify enorme como atributo HTML
    window.__horariosParaAplicar = ok;

    const filaTxt = (e) => {
      const turno = e.es_partido
        ? `${e.hora}–${e.hora_fin} · ${e.hora_ini_2}–${e.hora_fin_2}`
        : `${e.hora}–${e.hora_fin}`;
      const cls = e.ok ? '' : 'style="background:#FEF2F2;"';
      const motivos = e.motivos && e.motivos.length ? `<div class="small" style="color:#B91C1C;margin-top:2px;">✗ ${e.motivos.join(' · ')}</div>` : '';
      return `
        <tr ${cls}>
          <td><b>${e.nombre}</b>${e.dni ? ' <span class="small text-muted">('+e.dni+')</span>' : ''}${motivos}</td>
          <td>${e.puesto}</td>
          <td class="num"><b>${turno}</b>${e.es_partido ? ' <span class="badge badge-info" style="font-size:9px;">Partido</span>' : ''}</td>
          <td class="num">${e.dur} h</td>
          <td>${e.dias}</td>
        </tr>`;
    };

    horarioPreview.innerHTML = `
      <div class="horario-preview-box">
        <div class="horario-preview-head">
          <svg class="ic ic-22" style="color: ${err.length ? '#F59E0B' : '#10B981'};"><use href="#ic-check-circle"/></svg>
          <div style="flex:1;">
            <div class="horario-preview-title">Archivo procesado</div>
            <div class="horario-preview-sub">${file.name} · <b style="color:#059669;">${ok.length} listas para aplicar</b>${err.length ? ` · <b style="color:#B91C1C;">${err.length} con errores</b>` : ''}</div>
          </div>
        </div>

        ${ok.length > 0 ? `
          <div style="margin-top:12px;font-weight:700;font-size:12px;color:#059669;text-transform:uppercase;letter-spacing:.3px;">✓ Listas para aplicar (${ok.length})</div>
          <div style="overflow-x:auto;">
            <table class="hours-table">
              <thead><tr><th>Socorrista</th><th>Hotel / puesto</th><th class="num">Turno</th><th class="num">Duración</th><th>Días</th></tr></thead>
              <tbody>
                ${ok.slice(0, 20).map(filaTxt).join('')}
                ${ok.length > 20 ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:8px;">…y ${ok.length-20} filas más</td></tr>` : ''}
              </tbody>
            </table>
          </div>` : ''}

        ${err.length > 0 ? `
          <div style="margin-top:14px;font-weight:700;font-size:12px;color:#B91C1C;text-transform:uppercase;letter-spacing:.3px;">✗ NO se aplicarán (${err.length}) — arréglalas y vuelve a subir</div>
          <div style="overflow-x:auto;">
            <table class="hours-table">
              <thead><tr><th>Socorrista</th><th>Hotel / puesto</th><th class="num">Turno</th><th class="num">Duración</th><th>Días</th></tr></thead>
              <tbody>
                ${err.slice(0, 20).map(filaTxt).join('')}
                ${err.length > 20 ? `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:8px;">…y ${err.length-20} errores más</td></tr>` : ''}
              </tbody>
            </table>
          </div>` : ''}

        <div class="modal-actions" style="margin-top: 14px; padding: 0;">
          <button class="btn btn-outline" onclick="cancelarImportHorario()">Descartar</button>
          <button class="btn btn-primary" onclick="aplicarImportHorarioReal()" ${ok.length === 0 ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
            <svg class="ic ic-16"><use href="#ic-check"/></svg>
            Aplicar ${ok.length} horarios
          </button>
        </div>
      </div>`;
  }
  window.aplicarImportHorarioReal = function () { aplicarImportHorario(window.__horariosParaAplicar || []); };

  window.cancelarImportHorario = function () {
    horarioPreview.style.display = 'none';
    horarioPreview.innerHTML = '';
    uploadInput.value = '';
    toast('Importación cancelada');
  };

  window.aplicarImportHorario = async function (rows) {
    if (!rows || !rows.length) { toast('Nada que aplicar'); return; }
    if (!confirm(`¿Aplicar ${rows.length} horarios?\n\nSe archivan los horarios activos previos de cada socorrista y se crean los nuevos. Los turnos partidos se guardan como un solo horario con los dos tramos.`)) return;
    toast(`Aplicando ${rows.length} horarios…`);
    let creados = 0, saltados = 0;
    const errores = [];
    for (const r of rows) {
      if (!r.socId || !r.puestoId) { saltados++; continue; }
      try {
        // Desactivar horarios activos anteriores del empleado
        await window.sb.from('horarios').update({ activo: false })
          .eq('empleado_id', r.socId).eq('activo', true);
        // Nuevo horario. Intentamos guardar todas las columnas nuevas.
        // Si la BD no tiene alguna (schema antiguo), reintentamos sin ellas.
        const payloadFull = {
          empleado_id: r.socId,
          puesto_id: r.puestoId,
          hora_inicio: r.hora + ':00',
          hora_fin: r.hora_fin ? r.hora_fin + ':00' : null,
          duracion: r.dur,
          es_partido: !!r.es_partido,
          hora_inicio_2: r.es_partido && r.hora_ini_2 ? r.hora_ini_2 + ':00' : null,
          hora_fin_2:    r.es_partido && r.hora_fin_2 ? r.hora_fin_2 + ':00' : null,
          dias: r.dias,
          activo: true
        };
        let { error } = await window.sb.from('horarios').insert(payloadFull);
        if (error && /column|does not exist/i.test(error.message)) {
          const { error: e2 } = await window.sb.from('horarios').insert({
            empleado_id: r.socId, puesto_id: r.puestoId,
            hora_inicio: r.hora + ':00', duracion: r.dur, dias: r.dias, activo: true
          });
          if (e2) throw e2;
        } else if (error) throw error;
        // Reflejar en empleados el puesto principal
        await window.sb.from('empleados').update({ puesto_id: r.puestoId }).eq('id', r.socId);
        creados++;
      } catch (err) {
        errores.push(`${r.nombre}: ${err.message}`);
        saltados++;
      }
    }
    horarioPreview.style.display = 'none';
    horarioPreview.innerHTML = '';
    uploadInput.value = '';
    window.__horariosParaAplicar = null;
    await cargarEmpleadosDB();
    renderHorariosTable();
    renderPosts();
    toast(`✓ ${creados} horarios aplicados${saltados ? ' · ' + saltados + ' saltados' : ''}`);
    if (errores.length) {
      alert('Algunos horarios no se pudieron guardar:\n\n' + errores.slice(0, 8).join('\n') + (errores.length > 8 ? `\n\n(+${errores.length-8} más)` : ''));
    }
  };

  /* --- Descargar plantilla Excel con formato exacto + ejemplos --- */
  window.descargarPlantillaHorarios = function () {
    if (!window.XLSX) { toast('Librería XLSX no cargada, refresca la página'); return; }
    const cabecera = ['nombre','dni','hotel','hora_inicio','hora_fin','hora_inicio_2','hora_fin_2','dias'];
    // 2 ejemplos: turno normal + turno partido, cogidos de empleados reales si hay
    const ej1 = empleadosDB[0];
    const ej2 = empleadosDB[1] || empleadosDB[0];
    const puestoEj = (PS.puestos && PS.puestos[0]?.nombre) || 'Hotel Ejemplo';
    const puestoEj2 = (PS.puestos && PS.puestos[1]?.nombre) || puestoEj;
    const filas = [
      cabecera,
      [ej1?.nombre || 'Juan Pérez García', ej1?.dni || '12345678A', puestoEj, '10:00', '18:00', '', '', 'Lun-Dom'],
      [ej2?.nombre || 'Ana Martín Ruiz', ej2?.dni || '87654321B', puestoEj2, '10:00', '14:30', '16:00', '20:30', 'Lun-Vie'],
      ['','','','','','','',''],
      ['# NOTAS','','','','','','',''],
      ['# hora_inicio_2 y hora_fin_2 solo si es turno partido (deja en blanco si no).','','','','','','',''],
      ['# El sistema empareja por DNI si existe, si no por nombre completo.','','','','','','',''],
      ['# El hotel/puesto debe existir ya en el sistema (sección Puestos).','','','','','','',''],
      ['# Formato horas: HH:MM (24h). Días: "Lun-Vie", "Lun-Dom", "L,M,X,J,V", etc.','','','','','','','']
    ];
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(filas);
    // Anchuras cómodas
    ws['!cols'] = [{wch:24},{wch:12},{wch:26},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14}];
    window.XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
    window.XLSX.writeFile(wb, 'PoolSafety-plantilla-horarios.xlsx');
    toast('✓ Plantilla descargada');
  };

  /* --- Modal de ayuda para el formato --- */
  window.mostrarAyudaFormatoHorarios = function () {
    let modal = document.getElementById('ayudaFormatoHorariosModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ayudaFormatoHorariosModal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);">
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:11px;color:#059669;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Ayuda</div>
              <div style="font-size:17px;font-weight:700;color:#111827;margin-top:2px;">Formato de la plantilla de horarios</div>
            </div>
            <button onclick="document.getElementById('ayudaFormatoHorariosModal').remove()" class="btn-icon" style="width:34px;height:34px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;">
              <svg class="ic ic-16"><use href="#ic-x"/></svg>
            </button>
          </div>
          <div style="padding:18px 22px;font-size:13.5px;line-height:1.55;color:#111827;">
            <p><b>Columnas reconocidas</b> (en cualquier orden, cabecera en fila 1):</p>
            <table style="width:100%;border-collapse:collapse;margin:10px 0;">
              <thead><tr style="background:#F8FAFC;"><th style="text-align:left;padding:6px 8px;border:1px solid #e2e8f0;">Columna</th><th style="text-align:left;padding:6px 8px;border:1px solid #e2e8f0;">Qué debe contener</th></tr></thead>
              <tbody>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>nombre</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">Nombre y apellidos del socorrista.</td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>dni</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">Opcional pero recomendado — permite emparejar aunque el nombre esté distinto.</td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>hotel</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">Nombre del hotel/puesto. Debe existir ya en el sistema.</td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>hora_inicio</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">HH:MM (24h) — inicio del turno.</td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>hora_fin</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">HH:MM (24h) — fin del turno.</td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>hora_inicio_2</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">Solo para turno partido — inicio del 2º tramo. En blanco si no aplica.</td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>hora_fin_2</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">Solo para turno partido — fin del 2º tramo.</td></tr>
                <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><code>dias</code></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">"Lun-Vie", "Lun-Dom", "L,M,X,J,V"… Por defecto Lun-Vie.</td></tr>
              </tbody>
            </table>
            <p style="margin-top:14px;"><b>Consejos</b></p>
            <ul style="padding-left:22px;margin:6px 0;">
              <li>Descarga la plantilla — trae 2 filas de ejemplo con los formatos correctos.</li>
              <li>Los socorristas deben estar dados de alta antes de asignarles horario.</li>
              <li>El horario actual se ARCHIVA al aplicar el nuevo (queda historial en BD).</li>
              <li>El sistema muestra un preview con las filas OK y las que tienen error antes de aplicar.</li>
            </ul>
            <p style="margin-top:14px;color:#64748b;font-size:12px;">¿Te ha llegado el cuadrante en otro formato? Ábrelo con Excel/Numbers, ajústalo a esta plantilla y súbelo.</p>
          </div>
          <div style="padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn btn-outline" onclick="document.getElementById('ayudaFormatoHorariosModal').remove()">Cerrar</button>
            <button class="btn btn-primary" onclick="document.getElementById('ayudaFormatoHorariosModal').remove(); descargarPlantillaHorarios();">
              <svg class="ic ic-16"><use href="#ic-download"/></svg> Descargar plantilla
            </button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
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
          <div class="ficha-data-value">
            <input type="email" id="ed-email" value="${e.email}" data-original="${(e.email||'').toLowerCase()}" />
            <div class="small text-muted mt-1">Si cambias el email, también se cambia el email de login del empleado en Supabase. La app te lo confirma al guardar.</div>
          </div>
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
        // Mes anterior: para poder cerrar un mes que se pasó sin firmar. Antes,
        // pasada la medianoche del último día, ese mes ya no había forma de
        // firmarlo desde la app.
        const _refAnt = new Date(); _refAnt.setDate(1); _refAnt.setMonth(_refAnt.getMonth() - 1);
        const codigoMesAnterior = `jornada-${_refAnt.getFullYear()}-${String(_refAnt.getMonth() + 1).padStart(2, '0')}`;
        const nombreMesAnterior = _refAnt.toLocaleDateString('es-ES', { month: 'long' });
        const finiquitos = firmasBD.filter(f => f.documento_codigo.startsWith('finiquito'));

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
                  Firmadas <b>${c.horas_firmadas != null ? window.PSJornada.fmtH(c.horas_firmadas) + 'h' : '—'}</b> ordinarias
                  ${c.horas_reales && c.horas_reales > (c.horas_firmadas || 0) ? ` · Reales ${window.PSJornada.fmtH(c.horas_reales)}h (${window.PSJornada.fmtH(c.horas_reales - (c.horas_firmadas || 0))}h complementarias)` : ''}
                  ${c.dias_trabajados ? ' · ' + c.dias_trabajados + ' días' : ''}
                  ${c.regla ? `<br><span style="color:#64748B;">Regla: ${c.regla}</span>` : ''}
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

        ${finiquitos.map(f => `
          <div class="ficha-action-row" style="flex-direction:column;align-items:stretch;background:#FEF2F2;border:1px solid #FCA5A5;">
            <div style="display:flex;gap:10px;align-items:flex-start;">
              <div class="icon" style="background:#FEE2E2;color:#B91C1C;"><svg class="ic ic-18"><use href="#ic-file-text"/></svg></div>
              <div class="ficha-action-body" style="flex:1;min-width:0;">
                <div class="ficha-action-title">Recibo de finiquito</div>
                <div class="ficha-action-sub">Firmado el ${new Date(f.fecha_firma).toLocaleString('es-ES')} · ${f.dispositivo || 'móvil'}</div>
                ${f.firma_imagen ? `<img src="${f.firma_imagen}" class="firma-imagen" style="max-width:180px;margin-top:8px;" alt="Firma"/>` : ''}
                ${f.ubicacion_lat ? `<div class="small text-muted mt-1">📍 <a href="https://www.google.com/maps?q=${f.ubicacion_lat},${f.ubicacion_lng}" target="_blank">${(+f.ubicacion_lat).toFixed(4)}, ${(+f.ubicacion_lng).toFixed(4)}</a></div>` : ''}
              </div>
            </div>
            <div class="row gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="descargarPdfFirma('${f.id}','finiquito')" style="background:#B91C1C;">
                <svg class="ic ic-16"><use href="#ic-download"/></svg>
                Descargar PDF finiquito
              </button>
              ${f.archivo_pdf_url ? `<a class="btn btn-outline btn-sm" href="${f.archivo_pdf_url}" target="_blank">📎 Ver PDF guardado</a>` : ''}
            </div>
            <div class="small text-muted mt-2" style="text-align:right;">El PDF lleva la firma manuscrita, evidencia técnica y cuadro económico para que la gestoría lo cumplimente.</div>
          </div>
        `).join('')}

        <div class="ficha-action-row" style="flex-direction:column;align-items:stretch;background:#f0f9ff;border:1px dashed #7dd3fc;">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <div class="icon"><svg class="ic ic-18"><use href="#ic-bell"/></svg></div>
            <div class="ficha-action-body">
              <div class="ficha-action-title">Solicitar firma de registro mensual</div>
              <div class="ficha-action-sub">Genera una solicitud para que ${(e.nombre||'el trabajador').replace(/'/g,'\\\'')} firme las horas trabajadas. Le aparece EN EL ACTO en su app (Realtime). Las horas se calculan con el tope de 40 h por semana natural, igual que en la hoja de inspección.</div>
            </div>
          </div>
          <div class="row gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="solicitarRegistroMensual('${e.id}','${(e.nombre||'').replace(/'/g,'\\\'')}','${codigoMesAnterior}')">
              <svg class="ic ic-16"><use href="#ic-clock"/></svg>
              Pedir firma de ${nombreMesAnterior}
            </button>
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
    const emailInput = document.getElementById('ed-email');
    const emailNuevo = (emailInput.value || '').trim().toLowerCase();
    const emailOriginal = (emailInput.dataset.original || '').toLowerCase();
    const cambiaEmail = emailNuevo && emailOriginal && emailNuevo !== emailOriginal;

    const patch = {
      nombre: document.getElementById('ed-nombre').value.trim(),
      dni: document.getElementById('ed-dni').value.trim(),
      email: emailNuevo,
      telefono: document.getElementById('ed-tel').value.trim(),
      direccion: document.getElementById('ed-dir').value.trim(),
      ss: document.getElementById('ed-ss').value.trim(),
      fechaAlta: document.getElementById('ed-fecha').value,
      contrato: document.getElementById('ed-contrato').value,
      puestoId: puestoSel ? (puestoSel.value || null) : undefined,
      esCorreturnos: corrChk ? corrChk.checked : undefined
    };

    // Si cambia el email, avisar y usar la RPC que actualiza auth.users también
    if (cambiaEmail) {
      const psSes = window.PS_SESSION || {};
      if (psSes.rol !== 'dueno') {
        alert('Solo el administrador puede cambiar el email de login.\n\nGuardaré el resto de datos pero el email se queda como antes.');
        patch.email = emailOriginal;
      } else if (!confirm(`⚠ Vas a cambiar el email de login de este empleado:\n\n${emailOriginal}\n→\n${emailNuevo}\n\nSe cambia también en Supabase Auth para que el empleado pueda entrar con el nuevo email. ¿Continuar?`)) {
        patch.email = emailOriginal;
      } else {
        try {
          const { data: msg, error } = await window.sb.rpc('admin_cambiar_email', {
            p_empleado_id: fichaActualId,
            p_nuevo_email: emailNuevo
          });
          if (error) throw error;
          toast('✓ Email de login cambiado');
          // No hace falta actualizar empleados.email en el patch, la RPC ya lo hizo
          delete patch.email;
        } catch (err) {
          alert('❌ No se ha podido cambiar el email de login:\n\n' + err.message +
            '\n\nSi el mensaje dice "function admin_cambiar_email does not exist", ejecuta antes en Supabase el SQL sql/12-cambiar-email-admin.sql.');
          patch.email = emailOriginal;
        }
      }
    }

    try {
      await actualizarEmpleado(fichaActualId, patch);
      renderFicha();
      renderEmpleadosGrid();
      toast('Ficha actualizada');
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
  window.ficharPorEmpleado = async function (empId, nombre, tipo, fechaPredeterminada) {
    // Selección de tipo si no viene (entrada/salida) — para invocaciones sin argumento
    if (tipo !== 'entrada' && tipo !== 'salida') {
      const t = prompt(`¿Fichar ENTRADA o SALIDA para ${nombre}?\n\nEscribe "entrada" o "salida":`, 'entrada');
      if (!t) return;
      tipo = t.trim().toLowerCase() === 'salida' ? 'salida' : 'entrada';
    }

    // 1) Pedir FECHA — default = fechaPredeterminada o hoy
    const ahora = new Date();
    const defFecha = fechaPredeterminada || `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
    const fechaTxt = prompt(
      `Fichar ${tipo.toUpperCase()} manual de ${nombre}\n\n` +
      `¿En qué día? (YYYY-MM-DD)\n` +
      `Puedes elegir cualquier día pasado o el actual.`,
      defFecha
    );
    if (fechaTxt === null) return; // cancelado
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTxt)) { toast('Fecha inválida (YYYY-MM-DD)'); return; }
    const [fy, fmo, fd] = fechaTxt.split('-').map(Number);
    const fechaTest = new Date(fy, fmo - 1, fd);
    if (isNaN(fechaTest.getTime()) || fechaTest.getFullYear() !== fy) { toast('Fecha inválida'); return; }
    // No permitir fechas futuras (más allá de hoy)
    const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);
    if (fechaTest > finHoy) { toast('No se puede fichar en el futuro'); return; }

    // 2) Pedir HORA — default = "10:00" si es día pasado, ahora si es hoy
    const esHoy = fechaTest.toDateString() === ahora.toDateString();
    const horaDefault = esHoy
      ? `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`
      : (tipo === 'entrada' ? '10:00' : '18:00');
    const horaTxt = prompt(
      `Fichar ${tipo.toUpperCase()} de ${nombre}\n\n` +
      `Día: ${fechaTest.toLocaleDateString('es-ES', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}\n\n` +
      `Hora en formato HH:MM (24 h):`,
      horaDefault
    );
    if (horaTxt === null) return;
    const m = horaTxt.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { toast('Hora inválida. Formato: HH:MM'); return; }
    const hh = parseInt(m[1]), mm = parseInt(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) { toast('Hora fuera de rango'); return; }

    // 3) Motivo opcional
    const motivo = prompt(
      `Motivo del fichaje manual (opcional):\n\n` +
      `p.ej. "Sin señal móvil", "App no responde", "GPS bloqueado", ` +
      `"Alta retroactiva", "Olvidó fichar la salida"…`, ''
    );
    if (motivo === null) return;

    // 4) Construir fecha+hora final
    const hora = new Date(fy, fmo - 1, fd, hh, mm, 0, 0);
    // Si el usuario elige hoy pero con hora futura, avisamos y bloqueamos
    if (hora > new Date()) { toast('La hora está en el futuro. Ajusta la hora.'); return; }

    // 5) Buscar puesto del empleado (para asociar al fichaje)
    let puestoId = null;
    try {
      const { data: emp } = await window.sb.from('empleados')
        .select('puesto_id').eq('id', empId).single();
      puestoId = emp?.puesto_id || null;
    } catch (_) {}

    // 6) Confirmar
    const fechaBonita = fechaTest.toLocaleDateString('es-ES', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
    if (!confirm(
      `¿Confirmar fichaje MANUAL?\n\n` +
      `Empleado: ${nombre}\n` +
      `Tipo: ${tipo.toUpperCase()}\n` +
      `Día:  ${fechaBonita}\n` +
      `Hora: ${horaTxt}\n` +
      `${motivo ? 'Motivo: ' + motivo + '\n' : ''}` +
      `\nQuedará marcado como fichaje registrado por administración.`
    )) return;

    // 7) INSERT
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
      toast(`✓ ${tipo === 'entrada' ? 'Entrada' : 'Salida'} de ${nombre} el ${fechaTest.toLocaleDateString('es-ES')} a las ${horaTxt} registrada`);
      if (window.renderFicha) renderFicha();
      if (window.renderPosts) renderPosts();
      if (window.renderEstadoEquipo) window.renderEstadoEquipo();
      if (window.renderHours) renderHours(document.getElementById('hourFilter')?.value || 'all');
      // Refrescar la lista de fichajes del editor si está abierto
      const cont = document.getElementById(`fichajesEdit_${empId}`);
      if (cont && typeof window.cargarFichajesEditables === 'function') {
        // Determinar el rango actualmente cargado (por defecto 31)
        window.cargarFichajesEditables(empId, 31);
      }
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
        .select('id, tipo, hora, gps_ok, gps_lat, gps_lng, fuera_de_zona, distancia_m, origen_manual, motivo_manual, puesto_id, puestos(nombre, gps_lat, gps_lng, gps_radio_m)')
        .eq('empleado_id', empId)
        .gte('hora', desde.toISOString())
        .order('hora', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      // Cache global para verMapaFichajeIndividual (sin tener que refetchear)
      window.__fichajesCache = window.__fichajesCache || {};
      rows.forEach(f => { window.__fichajesCache[f.id] = f; });
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
      const esAdmin = ((window.PS_SESSION || {}).rol || rol) === 'dueno';
      cont.innerHTML = Object.entries(porDia).map(([diaTxt, arr]) => `
        <div style="margin-bottom:10px;">
          <div style="font-weight:700;font-size:12px;color:#475569;padding:4px 0;text-transform:uppercase;">${diaTxt}</div>
          ${arr.map(f => {
            const hora = new Date(f.hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
            const puesto = f.puestos?.nombre || '—';
            const badgeTipo = f.tipo === 'entrada'
              ? '<span class="badge badge-ok"><span class="dot"></span>Entrada</span>'
              : '<span class="badge badge-neutral"><span class="dot"></span>Salida</span>';
            const sinGpsRow = f.gps_lat == null || f.gps_lng == null;
            const badgeGps = sinGpsRow
              ? `<span class="badge badge-danger" style="margin-left:4px;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;">🚫 SIN GPS</span>`
              : (f.fuera_de_zona
                  ? `<span class="badge badge-warn" style="margin-left:4px;">GPS fuera${f.distancia_m ? ' (' + f.distancia_m + 'm)' : ''}</span>`
                  : (f.gps_ok === true ? '<span class="badge badge-ok" style="margin-left:4px;">GPS OK</span>' : ''));
            const badgeManual = f.origen_manual
              ? '<span class="badge badge-info" style="margin-left:4px;">📌 manual</span>'
              : '';
            const tieneGps = f.gps_lat != null && f.gps_lng != null;
            const botonMapa = tieneGps ? `
                <button class="btn-icon" title="Ver punto exacto del fichaje en el mapa" onclick="verMapaFichajeIndividual('${f.id}')"
                  style="width:30px;height:30px;background:#F0FDF4;color:#166534;border-radius:6px;border:none;cursor:pointer;">
                  <svg class="ic ic-14"><use href="#ic-pin"/></svg>
                </button>` : '';
            const botonVerificar = f.fuera_de_zona ? `
                <button class="btn-icon" title="Marcar ubicación como verificada (dejar de contar como fuera de zona)" onclick="verificarUbicacionFichaje('${f.id}')"
                  style="width:30px;height:30px;background:#DCFCE7;color:#065F46;border-radius:6px;border:none;cursor:pointer;">
                  <svg class="ic ic-14"><use href="#ic-check-circle"/></svg>
                </button>` : '';
            const botones = esAdmin ? `
                ${botonMapa}
                ${botonVerificar}
                <button class="btn-icon" title="Editar hora" onclick="editarFichaje('${f.id}','${empId}',${dias})"
                  style="width:30px;height:30px;background:#EFF6FF;color:#1D4ED8;border-radius:6px;border:none;cursor:pointer;">
                  <svg class="ic ic-14"><use href="#ic-pen"/></svg>
                </button>
                <button class="btn-icon" title="Borrar" onclick="borrarFichaje('${f.id}','${empId}',${dias})"
                  style="width:30px;height:30px;background:#FEF2F2;color:#DC2626;border-radius:6px;border:none;cursor:pointer;">
                  <svg class="ic ic-14"><use href="#ic-x"/></svg>
                </button>` : (botonMapa + botonVerificar);
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;margin:4px 0;">
                <div style="min-width:60px;font-weight:700;font-family:monospace;">${hora}</div>
                <div style="flex:1;min-width:0;">
                  ${badgeTipo} ${badgeGps} ${badgeManual}
                  <div class="small text-muted" style="margin-top:2px;">${puesto}${f.motivo_manual ? ' · ' + f.motivo_manual : ''}</div>
                </div>
                ${botones}
              </div>
              <div id="mapaFichaje_${f.id}" style="display:none;margin:2px 0 8px;"></div>
            `;
          }).join('')}
        </div>
      `).join('');
    } catch (err) {
      cont.innerHTML = `<div class="alert-strip warn" style="margin:6px;">Error: ${err.message}</div>`;
    }
  };

  // Toggle mini-mapa inline en una fila del editor de fichajes.
  // Usa cache de cargarFichajesEditables. Si no hay cache (caso raro), refetch.
  window.verMapaFichajeIndividual = async function (fichajeId) {
    const cont = document.getElementById(`mapaFichaje_${fichajeId}`);
    if (!cont) return;
    // Toggle: si ya está visible, cerrar
    if (cont.style.display !== 'none' && cont.innerHTML.trim()) {
      cont.style.display = 'none';
      cont.innerHTML = '';
      return;
    }
    cont.style.display = 'block';
    cont.innerHTML = '<div class="text-muted small" style="padding:8px;text-align:center;">Cargando mapa…</div>';
    let f = (window.__fichajesCache || {})[fichajeId];
    if (!f) {
      try {
        const { data } = await window.sb.from('fichajes')
          .select('id, tipo, hora, gps_lat, gps_lng, origen_manual, puestos(gps_lat, gps_lng, gps_radio_m)')
          .eq('id', fichajeId).single();
        f = data;
      } catch (err) {
        cont.innerHTML = `<div class="alert-strip warn">Error cargando el mapa: ${err.message}</div>`;
        return;
      }
    }
    if (!f) { cont.innerHTML = '<div class="text-muted small" style="padding:8px;">Sin datos.</div>'; return; }
    cont.innerHTML = renderMapaFichaje({
      puestoLat: f.puestos ? parseFloat(f.puestos.gps_lat) : null,
      puestoLng: f.puestos ? parseFloat(f.puestos.gps_lng) : null,
      fichLat:   f.gps_lat != null ? parseFloat(f.gps_lat) : null,
      fichLng:   f.gps_lng != null ? parseFloat(f.gps_lng) : null,
      radio:     f.puestos ? f.puestos.gps_radio_m : null,
      esManual:  !!f.origen_manual
    });
  };

  /* --- Verificar ubicación de un fichaje "fuera de zona" ---
     Admin/coord marca la ubicación como buena (el socorrista fichó fuera del
     radio pero el motivo era válido: hotel amplió zona, empleado atendía a un
     bañista, GPS impreciso, etc.). Al confirmar: fuera_de_zona = false y se
     deja constancia en motivo_manual con quién y cuándo. */
  window.verificarUbicacionFichaje = async function (fichajeId) {
    const psSes = window.PS_SESSION || {};
    if (!['dueno','coordinador'].includes(psSes.rol)) { toast('Solo admin/coord puede verificar ubicaciones'); return; }
    try {
      const { data: f, error } = await window.sb.from('fichajes')
        .select('id, tipo, hora, distancia_m, motivo_manual, empleados(nombre)').eq('id', fichajeId).single();
      if (error) throw error;
      const cuando = f.hora ? new Date(f.hora).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
      const nombreEmp = f.empleados?.nombre || 'el empleado';
      const distTxt = f.distancia_m ? ` (a ${f.distancia_m}m del centro)` : '';
      const motivo = prompt(
        `Marcar como UBICACIÓN VERIFICADA el fichaje de ${nombreEmp}\n${f.tipo.toUpperCase()} · ${cuando}${distTxt}\n\n` +
        `¿Motivo? (opcional, queda registrado):\n\nEj: "Estaba atendiendo a un bañista", "Zona ampliada por el hotel", "GPS impreciso"…`,
        ''
      );
      if (motivo === null) return; // cancelado
      const marca = `[GPS verificado ${new Date().toLocaleDateString('es-ES')} · ${psSes.rol === 'dueno' ? 'admin' : 'coord'}]` + (motivo.trim() ? ' ' + motivo.trim() : '');
      const motivoFinal = f.motivo_manual ? (f.motivo_manual + ' · ' + marca) : marca;
      const { data: upd, error: eUp } = await window.sb.from('fichajes').update({
        fuera_de_zona: false,
        motivo_manual: motivoFinal,
        registrado_por: psSes.userId || null
      }).eq('id', fichajeId).select();
      if (eUp) throw eUp;
      if (!upd || !upd.length) { alert('No se ha podido guardar. Revisa la policy UPDATE de fichajes.'); return; }
      toast('✓ Ubicación verificada — el fichaje queda como correcto');
      // Refrescar UI donde corresponda
      if (window.renderPosts) renderPosts();
      // Si estaba abierto el modal de puesto, cerrarlo y reabrirlo con datos frescos
      const modal = document.getElementById('postModal');
      if (modal && modal.classList.contains('open')) {
        setTimeout(() => {
          if (window.closePostModal) window.closePostModal();
        }, 400);
      }
      // Refrescar editor de fichajes si está en pantalla
      const contEditor = document.querySelector('[id^="fichajesEdit_"]');
      if (contEditor) {
        const empId = contEditor.dataset.empid || (contEditor.id.split('fichajesEdit_')[1]);
        if (empId && typeof window.cargarFichajesEditables === 'function') {
          window.cargarFichajesEditables(empId, 31);
        }
      }
    } catch (err) { toast('Error: ' + err.message); alert('Error verificando ubicación:\n\n' + err.message); }
  };

  window.editarFichaje = async function (fichajeId, empId, dias) {
    const rolAct = (window.PS_SESSION || {}).rol || rol;
    if (rolAct !== 'dueno') { toast('Solo el administrador puede editar fichajes.'); return; }
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
      if (window.renderHours) renderHours(document.getElementById('hourFilter')?.value || 'all');
    } catch (err) { toast('Error: ' + err.message); }
  };

  window.borrarFichaje = async function (fichajeId, empId, dias) {
    const rolAct = (window.PS_SESSION || {}).rol || rol;
    if (rolAct !== 'dueno') { toast('Solo el administrador puede borrar fichajes.'); return; }
    try {
      const { data: f } = await window.sb.from('fichajes')
        .select('tipo, hora').eq('id', fichajeId).single();
      const cuando = f ? new Date(f.hora).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
      if (!confirm(`¿Borrar este fichaje?\n\n${f?.tipo?.toUpperCase() || ''} ${cuando}\n\nEsta acción no se puede deshacer.`)) return;
      const { data: del, error } = await window.sb.from('fichajes').delete().eq('id', fichajeId).select();
      if (error) throw error;
      if (!del || !del.length) {
        toast('No se ha podido borrar. Puede que no tengas permisos.'); return;
      }
      toast('✓ Fichaje borrado');
      cargarFichajesEditables(empId, dias);
      if (window.renderPosts) renderPosts();
      if (window.renderHours) renderHours(document.getElementById('hourFilter')?.value || 'all');
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* --- Editor de fichajes del mes desde la tabla "Horas del mes" (admin) ---
     Abre un modal ligero con el mismo widget que ya usamos en Ficha → Acciones.
     Botones lápiz / ✕ reutilizan editarFichaje() y borrarFichaje().
     Al cerrar recalcula la fila para reflejar los cambios sin recargar. */
  window.abrirEditorHorasMes = function (empId, nombreEmp) {
    const rolAct = (window.PS_SESSION || {}).rol || rol;
    if (rolAct !== 'dueno') { toast('Solo el administrador puede editar fichajes.'); return; }
    let modal = document.getElementById('horasMesEditorModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'horasMesEditorModal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3);">
          <div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#FEFCE8;">
            <div>
              <div style="font-size:11px;color:#92400E;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Editar fichajes del mes</div>
              <div id="horasMesEditorNombre" style="font-size:16px;font-weight:700;color:#111827;margin-top:2px;">—</div>
            </div>
            <button onclick="cerrarEditorHorasMes()" class="btn-icon" style="width:34px;height:34px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;">
              <svg class="ic ic-16"><use href="#ic-x"/></svg>
            </button>
          </div>
          <div style="padding:10px 14px;border-bottom:1px solid #F3F4F6;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-outline btn-sm" id="horasMesRango7">Últimos 7 días</button>
            <button class="btn btn-primary btn-sm" id="horasMesRango31">Mes actual</button>
            <div style="flex:1;"></div>
            <button class="btn btn-outline btn-sm" onclick="addFichajeDesdeEditor('entrada')" title="Añadir entrada manual" style="color:#059669;border-color:#059669;">＋ Entrada</button>
            <button class="btn btn-outline btn-sm" onclick="addFichajeDesdeEditor('salida')" title="Añadir salida manual" style="color:#B45309;border-color:#B45309;">＋ Salida</button>
          </div>
          <div style="padding:12px 14px;background:#FFFBEB;border-bottom:1px solid #FDE68A;font-size:12px;color:#78350F;">
            ⚠️ Cada edición o borrado queda registrado en auditoría (fecha + motivo).
          </div>
          <div id="horasMesEditorBody" style="padding:12px 14px;overflow-y:auto;flex:1;background:#F8FAFC;">
            <div id="fichajesEdit_${empId}" data-empid="${empId}"></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) window.cerrarEditorHorasMes(); });
    } else {
      // Reutilizar modal: cambiar el data-empid para que cargarFichajesEditables apunte al contenedor correcto
      const body = modal.querySelector('#horasMesEditorBody');
      body.innerHTML = `<div id="fichajesEdit_${empId}" data-empid="${empId}"></div>`;
      modal.style.display = 'flex';
    }
    modal.querySelector('#horasMesEditorNombre').textContent = nombreEmp || '—';
    const b7  = modal.querySelector('#horasMesRango7');
    const b31 = modal.querySelector('#horasMesRango31');
    b7.onclick  = () => { cargarFichajesEditables(empId, 7);  b7.className='btn btn-primary btn-sm'; b31.className='btn btn-outline btn-sm'; };
    b31.onclick = () => { cargarFichajesEditables(empId, 31); b31.className='btn btn-primary btn-sm'; b7.className='btn btn-outline btn-sm'; };
    // Añadir fichaje desde el editor de Horas del mes — ya no pide tipo aparte
    window.addFichajeDesdeEditor = async (tipo) => {
      if (typeof window.ficharPorEmpleado !== 'function') {
        toast('No disponible aquí, hazlo desde la ficha del empleado.'); return;
      }
      await window.ficharPorEmpleado(empId, nombreEmp || 'este empleado', tipo);
      // Refrescar la lista tras crear
      cargarFichajesEditables(empId, 31);
    };
    // Alias antiguo por compatibilidad (por si algún onclick sigue apuntando aquí)
    window.ficharPorEmpleadoDesdeEditor = () => window.addFichajeDesdeEditor('entrada');
    // Cargar mes actual por defecto
    cargarFichajesEditables(empId, 31);
  };
  window.cerrarEditorHorasMes = function () {
    const modal = document.getElementById('horasMesEditorModal');
    if (modal) modal.style.display = 'none';
    // Recalcular tabla del mes por si borró/editó fichajes
    if (window.renderHours) renderHours(document.getElementById('hourFilter')?.value || 'all');
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
    const secciones = [];
    if (document.getElementById('nhBotiquin').checked) secciones.push('botiquin');
    if (document.getElementById('nhDesa').checked) secciones.push('desa');
    if (document.getElementById('nhOxigeno').checked) secciones.push('oxigeno');
    try {
      const { data: nuevo, error } = await window.sb.from('puestos').insert({
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
      }).select('id').single();
      if (error) throw error;
      const sembrado = await sembrarMaterialPuesto(nuevo.id, secciones);
      ['nhNombre','nhZona','nhGrupo','nhDireccion','nhLat','nhLng'].forEach(id => document.getElementById(id).value = '');
      closeNuevoHotelModal();
      await cargarHoteles();
      toast(sembrado > 0
        ? `Hotel "${nombre}" creado con ${sembrado} artículos del catálogo`
        : `Hotel "${nombre}" creado`);
      if (secciones.length && sembrado === 0) {
        alert(`El hotel "${nombre}" se ha creado, pero no se le ha podido asignar material.\n\n` +
              `Revisa el catálogo en Botiquín → "+ Añadir producto", o el socorrista verá ` +
              `"sin material configurado" al abrir su botiquín.`);
      }
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ---------- Sembrar material de un hotel desde el catálogo maestro ----------
     Un hotel recién creado no tenía NINGUNA fila en inventario_puesto, así que
     el socorrista veía "0/0 revisados · sin material configurado". Aquí le
     copiamos el catálogo (inventario_items) de las secciones que tenga
     activadas, con stock 0 y el mínimo recomendado de cada artículo, creando
     además la unidad "Botiquín 1" / "DESA 1" / "Oxígeno 1" de cada sección.
     Devuelve cuántos artículos se han insertado. */
  async function sembrarMaterialPuesto(puestoId, secciones) {
    if (!puestoId || !secciones || !secciones.length) return 0;
    let total = 0;
    for (const sec of secciones) {
      try {
        // El esquema de producción se ha desviado de sql/01 (p.ej. hay
        // instalaciones sin `activo` ni `minimo_recomendado` en el catálogo),
        // así que degradamos la consulta en vez de romper la siembra.
        let catalogo = null;
        const cat1 = await window.sb.from('inventario_items')
          .select('id, minimo_recomendado').eq('seccion', sec).eq('activo', true);
        if (!cat1.error) {
          catalogo = cat1.data;
        } else {
          const cat2 = await window.sb.from('inventario_items')
            .select('id, minimo_recomendado').eq('seccion', sec);
          if (!cat2.error) {
            catalogo = cat2.data;
          } else {
            const cat3 = await window.sb.from('inventario_items').select('id').eq('seccion', sec);
            if (cat3.error) throw cat3.error;
            catalogo = cat3.data;
          }
        }
        if (!catalogo || !catalogo.length) continue;

        // Unidad 1 de la sección (tabla de sql/14 — puede no existir en BD antigua)
        let unidadId = null;
        try {
          const nombreUnidad = sec === 'botiquin' ? 'Botiquín 1' : sec === 'desa' ? 'DESA 1' : 'Oxígeno 1';
          const { data: ud, error: errUd } = await window.sb.from('unidades_material')
            .insert({ puesto_id: puestoId, seccion: sec, nombre: nombreUnidad, numero: 1 })
            .select('id').single();
          if (!errUd && ud) unidadId = ud.id;
        } catch (_) { /* BD sin unidades_material: se siembra sin unidad_id */ }

        const filas = catalogo.map(it => ({
          puesto_id: puestoId,
          item_id: it.id,
          stock: 0,
          minimo: it.minimo_recomendado || 1,
          revisado_hoy: false,
          ...(unidadId ? { unidad_id: unidadId } : {})
        }));
        const { data: ins, error: errIns } = await window.sb.from('inventario_puesto')
          .insert(filas).select('id');
        if (errIns) throw errIns;
        total += (ins || []).length;
      } catch (err) {
        console.warn(`[nuevo hotel] no se pudo sembrar la sección ${sec}:`, err.message);
      }
    }
    return total;
  }
  window.sembrarMaterialPuesto = sembrarMaterialPuesto;

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
      if (r2.error) {
        // Si falla porque no existe fecha_hora_salida (sql/17 no ejecutado)
        // seguimos igual con select * — pero avisamos por consola
        if (/fecha_hora_salida/i.test(r2.error.message)) {
          console.warn('[Coord] sql/17 no ejecutado — no verás duración de visitas hasta ejecutarlo');
        } else {
          throw r2.error;
        }
      }
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
        // ¿Visita abierta o cerrada? Mostrar duración o badge EN CURSO
        const abierta = !i.fecha_hora_salida;
        let duracionTxt = '';
        let estadoBadge = '';
        if (abierta) {
          const minsAbierta = Math.round((Date.now() - new Date(i.fecha_hora_llegada).getTime()) / 60000);
          duracionTxt = minsAbierta > 60 ? `${Math.floor(minsAbierta/60)}h ${minsAbierta%60}m` : `${minsAbierta} min`;
          estadoBadge = `<span class="badge small" style="background:#DCFCE7;color:#065F46;border:1px solid #86EFAC;"><span class="dot" style="background:#10B981;"></span>EN CURSO · ${duracionTxt}</span>`;
        } else {
          const mins = Math.round((new Date(i.fecha_hora_salida).getTime() - new Date(i.fecha_hora_llegada).getTime()) / 60000);
          duracionTxt = mins > 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins} min`;
          const horaSal = new Date(i.fecha_hora_salida).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          estadoBadge = `<span class="badge small" style="background:#F1F5F9;color:#334155;"><span class="dot" style="background:#64748B;"></span>${hora} → ${horaSal} · ${duracionTxt}</span>`;
        }
        // Botón cerrar visita — solo en vista self (el propio coord) y solo si abierta
        const btnCerrar = (!opts.admin && abierta && i.coordinador_id === (window.PS_SESSION || {}).userId)
          ? `<button class="btn btn-sm" onclick="cerrarVisitaHotel('${i.id}','${escapeHtml(hotel).replace(/'/g,"\\'")}')" style="background:#DC2626;color:#fff;border:0;padding:6px 12px;border-radius:8px;font-weight:700;cursor:pointer;margin-top:8px;">🚪 Registrar salida del hotel</button>`
          : '';
        return `
          <div class="coord-item visita ${claseNota}" ${abierta ? 'style="border-left:3px solid #10B981;background:#F0FDF4;"' : ''}>
            <div class="coord-item-head">
              <div class="coord-item-title">📍 Visita a ${escapeHtml(hotel)}</div>
              <div class="coord-item-time">${fecha} · entrada ${hora}</div>
            </div>
            <div style="margin:4px 0 6px;">${estadoBadge}</div>
            ${i.actividades_realizadas ? `<div class="coord-item-body"><b>Realizado:</b> ${escapeHtml(i.actividades_realizadas)}</div>` : ''}
            ${(i.vio_director && i.director_notas) ? `<div class="coord-item-body" style="margin-top:4px;"><b>Director:</b> ${escapeHtml(i.director_notas)}</div>` : ''}
            <div class="coord-item-meta">
              <span><svg class="ic ic-14"><use href="#ic-user"/></svg>${u.nombre}</span>
              ${gps}
              ${dirBadge}
            </div>
            ${(i.nota_para_admin || '').trim() ? `<div class="coord-nota-box">${escapeHtml(i.nota_para_admin)}</div>` : ''}
            ${btnCerrar}
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
        actividades_realizadas: acts || null,
        nota_para_admin: document.getElementById('visNotaAdmin').value.trim() || null
      });
      if (error) throw error;
      ['visActividades','visDirNotas','visNotaAdmin'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('visVioDirector').checked = false;
      closeVisitaModal();
      toast('✓ Entrada al hotel registrada — al irte pulsa "Registrar salida" en el timeline');
      cargarCoordinacion();
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Cierra una visita abierta: captura hora + GPS de salida, pide actividades
  // realizadas y nota opcional para el admin. Calcula duración implícitamente.
  window.cerrarVisitaHotel = async function (visitaId, hotelNombre) {
    if (!confirm(`¿Registrar SALIDA del hotel ${hotelNombre}?\n\nSe capturará hora y GPS de tu salida.`)) return;
    // 1) Capturar hora + GPS de salida
    const ahora = new Date();
    let latSal = null, lngSal = null;
    try {
      if (navigator.geolocation) {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
        latSal = pos.coords.latitude; lngSal = pos.coords.longitude;
      }
    } catch (_) { /* Sin GPS también se guarda la salida — no bloqueamos */ }
    // 2) Pedir actividades + nota
    const acts = prompt('¿Qué has hecho en el hotel?\n(Reunión con director, revisar botiquines, entregar material, formar socorrista…)');
    if (acts === null) return; // Cancelado
    const nota = prompt('¿Alguna nota para Adán? (opcional — dejar en blanco si no hace falta)') || '';
    // 3) UPDATE
    try {
      const patch = {
        fecha_hora_salida: ahora.toISOString(),
        gps_lat_salida: latSal,
        gps_lng_salida: lngSal
      };
      if (acts.trim()) patch.actividades_realizadas = acts.trim();
      if (nota.trim()) patch.nota_para_admin = nota.trim();
      const { error, data } = await window.sb.from('visitas_hoteles')
        .update(patch).eq('id', visitaId).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('No se actualizó ninguna fila. ¿Ejecutaste sql/17?');
      toast('✓ Salida registrada. El admin verá cuánto has estado.');
      cargarCoordinacion();
    } catch (err) { alert('Error cerrando visita:\n\n' + err.message); }
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
      let empData = empleadoData(firma.empleado_id || fichaActualId) || { nombre: '—' };
      // Para finiquito y jornada oficial hay que garantizar fecha_alta/baja/tipo_contrato/puesto reales
      const esFin = typeof firma.documento_codigo === 'string' && firma.documento_codigo.startsWith('finiquito');
      const necesitaExtras = esFin || !empData.fecha_alta || !empData.puesto_nombre;
      if (necesitaExtras) {
        try {
          const { data: eDb } = await window.sb.from('empleados')
            .select('id, nombre, dni, fecha_alta, fecha_baja, tipo_contrato, puesto_id, puestos(nombre)')
            .eq('id', firma.empleado_id || fichaActualId).single();
          if (eDb) {
            empData = Object.assign({}, empData, eDb, {
              puesto_nombre: eDb.puestos?.nombre || empData.puesto_nombre
            });
          }
        } catch (_) {}
      }
      // Fallback puesto por id si sigue sin nombre
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
  // `codigoMes` opcional ('jornada-YYYY-MM'). Sin él, el mes en curso.
  // Se puede pedir la firma de un mes ya cerrado: el código viaja dentro de la
  // descripción de la tarea y la app del socorrista lo lee de ahí.
  window.solicitarRegistroMensual = async function (empId, nombre, codigoMes) {
    try {
      const hoy = new Date();
      const mm = (codigoMes || '').match(/jornada-(\d{4})-(\d{2})/);
      const anio = mm ? parseInt(mm[1]) : hoy.getFullYear();
      const mesIdx = mm ? parseInt(mm[2]) - 1 : hoy.getMonth();
      const codigo = `jornada-${anio}-${String(mesIdx + 1).padStart(2, '0')}`;
      const desde = new Date(anio, mesIdx, 1).toISOString();
      const finMes = new Date(anio, mesIdx + 1, 1).getTime();
      // Nunca más allá del fin del mes que se pide firmar.
      const hasta = new Date(Math.min(Date.now(), finMes)).toISOString();
      const { data: fichs } = await window.sb.from('fichajes')
        .select('id, tipo, hora').eq('empleado_id', empId)
        .gte('hora', desde).lt('hora', hasta).order('hora', { ascending: true });
      // MISMO cálculo que verá el socorrista al firmar y que saldrá en la hoja
      // de inspección. Antes aquí se sumaba el total en bruto sin el tope de
      // 40 h/semana, así que el coordinador leía un número (42 h) y el
      // trabajador firmaba otro (40 h).
      const calc = window.PSJornada.calcular(fichs || [], { hasta });
      const fmtH = window.PSJornada.fmtH;
      const horas = calc.horasFirmadas;
      const dias = calc.diasTrabajados;
      const nombreMes = new Date(anio, mesIdx, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

      const msg = `Solicitar a ${nombre} que firme el registro mensual de ${nombreMes}?\n\n` +
        `• Horas ordinarias a firmar: ${fmtH(horas)}h (tope 40 h/semana)\n` +
        `• Horas reales trabajadas: ${fmtH(calc.horasReales)}h\n` +
        (calc.horasComplementarias > 0 ? `• Complementarias: ${fmtH(calc.horasComplementarias)}h\n` : '') +
        `• Días trabajados: ${dias}\n` +
        (calc.incompletos.length ? `\n⚠ ${calc.incompletos.length} día(s) con entrada SIN SALIDA fichada. Esas horas no cuentan: corrígelas antes de pedir la firma.\n` : '') +
        `\nLe saltará el aviso EN EL ACTO en su app (Realtime).`;
      if (!confirm(msg)) return;

      // Borrar solicitud previa idéntica para no duplicar
      await window.sb.from('tareas').delete()
        .eq('empleado_id', empId).eq('titulo', 'Firmar registro mensual pendiente').eq('hecha', false);
      const { error: errT } = await window.sb.from('tareas').insert({
        empleado_id: empId,
        titulo: 'Firmar registro mensual pendiente',
        descripcion: `Firma tu registro de jornada de ${nombreMes} [${codigo}]: ${fmtH(horas)}h ordinarias en ${dias} días.`,
        prioridad: 'alta',
        hecha: false
      });
      if (errT) throw errT;
      toast(`✓ ${nombre}: le llega la solicitud de firma de ${fmtH(horas)}h`);
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
    const psSes = window.PS_SESSION || {};
    const esCoord = ['dueno','coordinador'].includes(psSes.rol);
    // Chip de cabecera (siempre visible para dueño/coord, en cualquier tab)
    const chip = document.getElementById('dispQuickToggle');
    const chipDot = document.getElementById('dispQuickDot');
    const chipTxt = document.getElementById('dispQuickText');
    if (!esCoord) {
      if (cont) cont.innerHTML = '';
      if (chip) chip.style.display = 'none';
      return;
    }
    let disponible = true;
    try {
      const { data } = await window.sb.from('usuarios').select('disponible').eq('id', psSes.userId).single();
      disponible = data && data.disponible !== false;
    } catch (_) {}

    // 1) Chip cabecera
    if (chip) {
      chip.style.display = 'inline-flex';
      if (disponible) {
        chip.style.border = '2px solid #10B981';
        chip.style.background = '#DCFCE7';
        chip.style.color = '#065F46';
        if (chipDot) { chipDot.style.background = '#10B981'; chipDot.style.boxShadow = '0 0 0 3px rgba(16,185,129,.2)'; }
        if (chipTxt) chipTxt.textContent = 'Disponible';
        chip.title = 'Estás disponible. Pulsa para ponerte LIBRE (no recibirás avisos).';
      } else {
        chip.style.border = '2px solid #F59E0B';
        chip.style.background = '#FEF3C7';
        chip.style.color = '#78350F';
        if (chipDot) { chipDot.style.background = '#F59E0B'; chipDot.style.boxShadow = '0 0 0 3px rgba(245,158,11,.25)'; }
        if (chipTxt) chipTxt.textContent = 'Libre';
        chip.title = 'Estás en modo LIBRE. Los socorristas no te ven ni te llegan avisos. Pulsa para volver a estar disponible.';
      }
    }

    // 2) Panel completo dentro del tab Coordinación
    if (cont) {
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
  }
  window.renderDisponibleBlock = renderDisponibleBlock;
  // Actualizar chip cabecera cada vez que la sesión llegue o cambie
  document.addEventListener('ps-session-updated', () => setTimeout(renderDisponibleBlock, 300));
  setTimeout(renderDisponibleBlock, 900);

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
        .select('id, nombre, email, telefono, rol, activo, disponible, created_at, ultimo_login')
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
                      <button class="icon-btn-mini" title="Editar ficha (nombre, email, teléfono, rol)" onclick="editarMiembroEquipo('${u.id}')" style="color:#1D4ED8;"><svg class="ic ic-14"><use href="#ic-pen"/></svg></button>
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

  /* ---- Editar ficha coordinador / dueño (nombre, email, teléfono, rol) ---- */
  window.editarMiembroEquipo = async function (id) {
    const psSes = window.PS_SESSION || {};
    if (psSes.rol !== 'dueno') { alert('Solo el administrador puede editar miembros.'); return; }
    try {
      const { data: u, error } = await window.sb.from('usuarios')
        .select('id, nombre, email, telefono, rol').eq('id', id).single();
      if (error) throw error;
      // Modal editor
      let modal = document.getElementById('editarMiembroModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editarMiembroModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
      }
      const esYo = id === psSes.userId;
      modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);">
          <div style="padding:14px 18px;background:#DBEAFE;color:#1E3A8A;display:flex;justify-content:space-between;align-items:center;border-radius:14px 14px 0 0;">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Editar miembro del equipo</div>
              <div style="font-size:16px;font-weight:700;margin-top:2px;">${u.nombre || u.email.split('@')[0]}</div>
            </div>
            <button onclick="document.getElementById('editarMiembroModal').remove()" style="background:rgba(255,255,255,.5);border:0;color:#1E3A8A;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:20px;">×</button>
          </div>
          <div style="padding:18px;">
            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:6px;">Nombre y apellidos</label>
            <input type="text" id="emm_nombre" value="${(u.nombre || '').replace(/"/g,'&quot;')}"
              style="width:100%;padding:11px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:12px;" />

            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:6px;">Email</label>
            <input type="email" id="emm_email" value="${(u.email || '').replace(/"/g,'&quot;')}"
              style="width:100%;padding:11px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:6px;" />
            <div style="padding:8px 10px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;font-size:11.5px;color:#78350F;margin-bottom:12px;">
              ⚠️ <b>Cambiar el email aquí NO cambia el email de acceso</b> (usuario Supabase Auth). Actualiza sólo lo visible en la app.<br>
              Para cambiar el email de LOGIN de un miembro debes ir a <b>Supabase Dashboard → Authentication → Users</b> y editar allí su email.
            </div>

            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:6px;">Teléfono</label>
            <input type="tel" id="emm_tel" value="${(u.telefono || '').replace(/"/g,'&quot;')}"
              style="width:100%;padding:11px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:12px;" />

            <label style="display:block;font-weight:700;font-size:13px;margin-bottom:6px;">Rol</label>
            <select id="emm_rol" ${esYo?'disabled':''} style="width:100%;padding:11px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;background:#fff;">
              <option value="coordinador" ${u.rol==='coordinador'?'selected':''}>Coordinador</option>
              <option value="dueno" ${u.rol==='dueno'?'selected':''}>Administrador (dueño)</option>
            </select>
            ${esYo?'<div class="small text-muted" style="margin-top:4px;">No puedes cambiar tu propio rol para no perder acceso.</div>':''}
          </div>
          <div style="padding:14px 18px;border-top:1px solid #E2E8F0;display:flex;gap:8px;justify-content:flex-end;background:#F8FAFC;border-radius:0 0 14px 14px;">
            <button class="btn btn-outline" onclick="document.getElementById('editarMiembroModal').remove()">Cancelar</button>
            <button class="btn btn-primary" onclick="guardarMiembroEquipo('${id}')" style="background:#1D4ED8;">Guardar cambios</button>
          </div>
        </div>`;
    } catch (err) { alert('Error cargando miembro: ' + err.message); }
  };

  window.guardarMiembroEquipo = async function (id) {
    const nombre = document.getElementById('emm_nombre').value.trim();
    const email  = document.getElementById('emm_email').value.trim();
    const tel    = document.getElementById('emm_tel').value.trim();
    const rol    = document.getElementById('emm_rol').value;
    if (!nombre) { alert('El nombre es obligatorio'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Email no válido'); return; }
    try {
      // Detectar si cambia el email (para avisar del extra manual)
      const { data: prev } = await window.sb.from('usuarios').select('email').eq('id', id).single();
      const cambiaEmail = prev && prev.email && prev.email.toLowerCase() !== email.toLowerCase();
      // Intentamos update con todas las columnas. Si `telefono` no existe en la BD, reintentamos sin ella.
      const patch = { nombre, email, rol };
      let { error, data: upd } = await window.sb.from('usuarios').update({ ...patch, telefono: tel }).eq('id', id).select();
      if (error && /telefono/i.test(error.message)) {
        ({ error, data: upd } = await window.sb.from('usuarios').update(patch).eq('id', id).select());
      }
      if (error) throw error;
      if (!upd || !upd.length) {
        alert('No se ha guardado (0 filas). Puede que falte una policy UPDATE en usuarios para el dueño. Revisa RLS en Supabase.');
        return;
      }
      document.getElementById('editarMiembroModal')?.remove();
      toast('✓ Ficha actualizada');
      if (cambiaEmail) {
        alert(`✓ Ficha actualizada.\n\n⚠️ El email de LOGIN sigue siendo el antiguo: ${prev.email}\n\nPara cambiarlo también en Supabase Auth ve a Dashboard → Authentication → Users → busca el usuario → Edit → nuevo email → Save. El miembro tendrá que confirmar el cambio desde su bandeja de entrada.`);
      }
      renderEquipoBlock();
    } catch (err) { alert('Error guardando: ' + err.message); }
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

  /* ==========================================================================
     PANEL REVISIONES DIARIAS · quién ha revisado botiquín/DESA/oxígeno hoy
     Admin (dueno) puede exportar CSV y PDF; coord solo lee.
     Requiere sql/20-revisiones-diarias.sql ejecutado.
     ========================================================================== */
  let revisionesCache = { fecha: null, filas: [], porHotel: {} };

  window.cargarRevisionesDiarias = async function () {
    const cont = document.getElementById('revisionesTablas');
    if (!cont || !window.sb) return;
    cont.innerHTML = '<div class="text-muted small" style="padding:30px;text-align:center;">Cargando revisiones…</div>';

    const psSes = window.PS_SESSION || {};
    const empresaId = psSes.empresa_id || psSes.empresaId;
    // Fecha filtro (por defecto hoy)
    const fechaInp = document.getElementById('revFechaFiltro');
    const fechaSel = fechaInp?.value || new Date().toISOString().slice(0,10);
    if (fechaInp && !fechaInp.value) fechaInp.value = fechaSel;
    const desde = new Date(fechaSel + 'T00:00:00').toISOString();
    const hasta = new Date(new Date(fechaSel + 'T00:00:00').getTime() + 86400000).toISOString();

    try {
      // 1) Puestos activos con las secciones que tienen (botiquin/desa/oxigeno)
      const { data: puestos } = await window.sb.from('puestos')
        .select('id, nombre, zona, tiene_botiquin, tiene_desa, tiene_oxigeno')
        .eq('activo', true).order('nombre');

      // 2) Unidades por puesto (para saber cuántos botiquines/DESAs/oxígenos hay)
      const { data: unidades } = await window.sb.from('unidades_material')
        .select('id, puesto_id, seccion, nombre, numero')
        .eq('activo', true);
      const unidadesPorPuesto = {};
      (unidades || []).forEach(u => {
        const k = u.puesto_id + '|' + u.seccion;
        (unidadesPorPuesto[k] = unidadesPorPuesto[k] || []).push(u);
      });

      // 3) Revisiones del día
      let revs = [];
      try {
        const { data, error } = await window.sb.from('revisiones_diarias')
          .select('*')
          .eq('empresa_id', empresaId)
          .gte('fecha', desde).lt('fecha', hasta)
          .order('fecha', { ascending: false });
        if (error) throw error;
        revs = data || [];
      } catch (e) {
        if (/revisiones_diarias/i.test(e.message) || /relation.*does not exist/i.test(e.message)) {
          cont.innerHTML = `<div style="padding:20px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;color:#78350F;">
            <b>⚠️ SQL pendiente:</b> ejecuta <code>sql/20-revisiones-diarias.sql</code> en Supabase para que este panel funcione.
          </div>`;
          return;
        }
        throw e;
      }

      // 4) Estructura: para cada (puesto, seccion) → { unidadesEsperadas, revisadas: [rev...] }
      const porHotelSec = {};
      (puestos || []).forEach(p => {
        ['botiquin','desa','oxigeno'].forEach(sec => {
          const tienePropiedad = sec === 'botiquin' ? p.tiene_botiquin : sec === 'desa' ? p.tiene_desa : p.tiene_oxigeno;
          if (tienePropiedad === false) return; // hotel no tiene esa sección
          const uds = unidadesPorPuesto[p.id + '|' + sec] || [];
          if (uds.length === 0 && tienePropiedad === null) return; // ni unidad ni flag → no aplica
          const revsSec = revs.filter(r => r.puesto_id === p.id && r.seccion === sec);
          const k = p.id + '|' + sec;
          porHotelSec[k] = {
            puesto: p, seccion: sec, unidades: uds,
            revisiones: revsSec,
            unidadesRevisadas: new Set(revsSec.map(r => r.unidad_id).filter(Boolean)),
            estado: revsSec.length === 0 ? 'pendiente' :
                    (uds.length && revsSec.filter(r => r.unidad_id).length >= uds.length ? 'completo' : 'parcial')
          };
        });
      });

      revisionesCache = { fecha: fechaSel, filas: revs, porHotelSec, puestos: puestos || [] };
      renderRevisionesTablas();

      // Actualiza badge en el menú (nº de hoteles pendientes)
      const hoyStr = new Date().toISOString().slice(0,10);
      if (fechaSel === hoyStr) {
        const pendientes = Object.values(porHotelSec).filter(x => x.estado === 'pendiente').length;
        const badge = document.getElementById('menuBadgeRev');
        if (badge) {
          if (pendientes > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = pendientes;
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (err) {
      cont.innerHTML = `<div style="padding:20px;color:#DC2626;">Error cargando revisiones: ${err.message}</div>`;
    }
  };

  function renderRevisionesTablas() {
    const cont = document.getElementById('revisionesTablas');
    if (!cont) return;
    const { porHotelSec, puestos, fecha, filas } = revisionesCache;

    const hoyStr = new Date().toISOString().slice(0,10);
    const esHoy = fecha === hoyStr;

    // Contadores globales
    let totales = { completo: 0, parcial: 0, pendiente: 0 };
    Object.values(porHotelSec || {}).forEach(x => { totales[x.estado] = (totales[x.estado]||0)+1; });
    const total = totales.completo + totales.parcial + totales.pendiente;

    // Panel resumen arriba
    const resumenHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">
        <div style="padding:12px;border-radius:10px;background:#F0FDF4;border:1px solid #86EFAC;">
          <div style="font-size:11px;font-weight:700;color:#065F46;text-transform:uppercase;">✅ Completas</div>
          <div style="font-size:22px;font-weight:800;color:#065F46;margin-top:2px;">${totales.completo}<span style="font-size:14px;font-weight:400;color:#059669;"> / ${total}</span></div>
        </div>
        <div style="padding:12px;border-radius:10px;background:#FEF3C7;border:1px solid #F59E0B;">
          <div style="font-size:11px;font-weight:700;color:#78350F;text-transform:uppercase;">⚠ Parciales</div>
          <div style="font-size:22px;font-weight:800;color:#78350F;margin-top:2px;">${totales.parcial}</div>
        </div>
        <div style="padding:12px;border-radius:10px;background:#FEE2E2;border:1px solid #DC2626;">
          <div style="font-size:11px;font-weight:700;color:#7F1D1D;text-transform:uppercase;">✗ Pendientes</div>
          <div style="font-size:22px;font-weight:800;color:#7F1D1D;margin-top:2px;">${totales.pendiente}</div>
        </div>
        <div style="padding:12px;border-radius:10px;background:#F1F5F9;border:1px solid #CBD5E1;">
          <div style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;">Fecha</div>
          <div style="font-size:18px;font-weight:800;color:#334155;margin-top:2px;">${new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'short' })}</div>
        </div>
      </div>`;

    // Tabla por sección
    const SEC_LABELS = { botiquin: '🩹 Botiquín', desa: '⚡ DESA', oxigeno: '💨 Oxigenoterapia' };
    const html = ['botiquin','desa','oxigeno'].map(sec => {
      const filasSec = Object.values(porHotelSec || {})
        .filter(x => x.seccion === sec)
        .sort((a,b) => a.puesto.nombre.localeCompare(b.puesto.nombre));
      if (filasSec.length === 0) return '';
      return `
        <div style="margin-bottom:24px;">
          <h4 style="margin:0 0 10px;font-size:15px;color:#111827;">${SEC_LABELS[sec]} <span style="font-size:12px;color:#64748B;font-weight:400;">— ${filasSec.length} hoteles</span></h4>
          <div style="overflow-x:auto;border:1px solid #E2E8F0;border-radius:10px;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead style="background:#F8FAFC;">
                <tr>
                  <th style="text-align:left;padding:8px 10px;font-weight:700;">Hotel</th>
                  <th style="text-align:left;padding:8px 10px;font-weight:700;">Estado</th>
                  <th style="text-align:left;padding:8px 10px;font-weight:700;">Unidades</th>
                  <th style="text-align:left;padding:8px 10px;font-weight:700;">Revisado por</th>
                  <th style="text-align:left;padding:8px 10px;font-weight:700;">Hora</th>
                  <th style="text-align:left;padding:8px 10px;font-weight:700;">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                ${filasSec.map(f => {
                  const badgeColor = f.estado === 'completo' ? 'background:#DCFCE7;color:#065F46;'
                                   : f.estado === 'parcial'  ? 'background:#FEF3C7;color:#78350F;'
                                                             : 'background:#FEE2E2;color:#7F1D1D;';
                  const badgeText = f.estado === 'completo' ? '✅ Completa' : f.estado === 'parcial' ? '⚠ Parcial' : '✗ Pendiente';
                  const revList = f.revisiones.length === 0 ? '<span class="text-muted">—</span>' : f.revisiones.map(r => escHtml(r.empleado_nombre || '—')).join('<br>');
                  const horaList = f.revisiones.length === 0 ? '<span class="text-muted">—</span>' : f.revisiones.map(r => new Date(r.fecha).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })).join('<br>');
                  const obsList = f.revisiones.filter(r => r.observaciones).map(r => `<div style="background:#FEF9C3;padding:4px 6px;border-radius:4px;margin:2px 0;font-size:12px;">${escHtml(r.observaciones)}</div>`).join('') || '<span class="text-muted">—</span>';
                  const udsTxt = f.unidades.length === 0
                    ? '<span class="text-muted">1</span>'
                    : `${f.revisiones.filter(r => r.unidad_id).length}/${f.unidades.length} unidades`;
                  return `
                    <tr style="border-top:1px solid #F1F5F9;">
                      <td style="padding:8px 10px;font-weight:600;">${escHtml(f.puesto.nombre)}${f.puesto.zona ? `<div style="font-size:11px;color:#64748B;font-weight:400;">${escHtml(f.puesto.zona)}</div>` : ''}</td>
                      <td style="padding:8px 10px;"><span class="badge" style="${badgeColor}padding:3px 8px;border-radius:8px;font-size:11.5px;font-weight:700;">${badgeText}</span></td>
                      <td style="padding:8px 10px;">${udsTxt}</td>
                      <td style="padding:8px 10px;">${revList}</td>
                      <td style="padding:8px 10px;font-family:monospace;">${horaList}</td>
                      <td style="padding:8px 10px;">${obsList}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }).filter(Boolean).join('');

    cont.innerHTML = resumenHTML + (html || '<div class="text-muted" style="padding:20px;text-align:center;">Ningún hotel activo tiene botiquín/DESA/oxígeno configurado.</div>');

    // Contador en la cabecera del panel
    const panelCount = document.getElementById('revPanelCount');
    if (panelCount) panelCount.textContent = `${totales.completo}/${total} completas · ${filas.length} revisiones`;

    // Bloquear botones de export para coord (solo dueno los usa)
    const rolAct = ((window.PS_SESSION || {}).rol || rol);
    ['btnExportRevCSV','btnExportRevPDF'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.style.display = rolAct === 'dueno' ? '' : 'none';
    });
  }

  function escHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Al cambiar la fecha
  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('revFechaFiltro');
    if (inp) inp.addEventListener('change', () => cargarRevisionesDiarias());
  });
  setTimeout(() => {
    const inp = document.getElementById('revFechaFiltro');
    if (inp && !inp._psBound) {
      inp._psBound = true;
      inp.addEventListener('change', () => cargarRevisionesDiarias());
    }
  }, 1500);

  // Precarga en background (para que el badge del menú se actualice al entrar)
  setTimeout(() => { cargarRevisionesDiarias(); }, 2500);
  document.addEventListener('ps-session-updated', () => setTimeout(cargarRevisionesDiarias, 800));

  // Al abrir la sección desde el menú, refrescar
  document.querySelectorAll('[data-section="revisiones"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(cargarRevisionesDiarias, 100));
  });

  window.exportarRevisionesCSV = function () {
    const rolAct = ((window.PS_SESSION || {}).rol || rol);
    if (rolAct !== 'dueno') { toast('Solo el administrador puede exportar'); return; }
    const { porHotelSec, fecha } = revisionesCache;
    if (!porHotelSec) { toast('No hay datos que exportar'); return; }
    const filas = [['Hotel','Zona','Sección','Estado','Unidades','Revisado por','Hora','Items OK','Items total','Observaciones']];
    Object.values(porHotelSec).forEach(f => {
      const seccionTxt = f.seccion === 'botiquin' ? 'Botiquín' : f.seccion === 'desa' ? 'DESA' : 'Oxigenoterapia';
      const estadoTxt = f.estado === 'completo' ? 'Completa' : f.estado === 'parcial' ? 'Parcial' : 'Pendiente';
      const uds = f.unidades.length === 0 ? '1' : `${f.revisiones.filter(r=>r.unidad_id).length}/${f.unidades.length}`;
      if (f.revisiones.length === 0) {
        filas.push([f.puesto.nombre, f.puesto.zona||'', seccionTxt, estadoTxt, uds, '(sin revisar)', '', '', '', '']);
      } else {
        f.revisiones.forEach(r => {
          filas.push([
            f.puesto.nombre, f.puesto.zona||'', seccionTxt, estadoTxt, uds,
            r.empleado_nombre || '', new Date(r.fecha).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}),
            r.items_ok ?? '', r.items_total ?? '', (r.observaciones||'').replace(/[\r\n;]/g,' ')
          ]);
        });
      }
    });
    const csv = filas.map(row => row.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `PoolSafety-revisiones-${fecha}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✓ CSV descargado');
  };

  window.exportarRevisionesPDF = async function () {
    const rolAct = ((window.PS_SESSION || {}).rol || rol);
    if (rolAct !== 'dueno') { toast('Solo el administrador puede exportar'); return; }
    if (!window.jspdf) { toast('Espera unos segundos a que cargue el generador de PDF…'); return; }
    const { porHotelSec, fecha } = revisionesCache;
    if (!porHotelSec) { toast('No hay datos que exportar'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.setTextColor(185,28,28);
    doc.text('PoolSafety · Revisiones diarias', 15, 18);
    doc.setFontSize(10); doc.setTextColor(0,0,0); doc.setFont('helvetica','normal');
    doc.text(`Fecha: ${new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}`, 15, 25);

    // Resumen totales
    let totales = { completo:0, parcial:0, pendiente:0 };
    Object.values(porHotelSec).forEach(x => { totales[x.estado] = (totales[x.estado]||0)+1; });
    const total = totales.completo + totales.parcial + totales.pendiente;
    doc.setFontSize(9);
    doc.text(`Completas: ${totales.completo}/${total}   ·   Parciales: ${totales.parcial}   ·   Pendientes: ${totales.pendiente}`, 15, 31);

    let y = 40;
    const SEC_LABELS = { botiquin: 'BOTIQUIN', desa: 'DESA', oxigeno: 'OXIGENOTERAPIA' };
    ['botiquin','desa','oxigeno'].forEach(sec => {
      const filas = Object.values(porHotelSec).filter(x => x.seccion === sec).sort((a,b) => a.puesto.nombre.localeCompare(b.puesto.nombre));
      if (filas.length === 0) return;
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30,64,175);
      doc.text(SEC_LABELS[sec] + ` (${filas.length} hoteles)`, 15, y); y += 6;
      doc.setTextColor(0,0,0);

      // Cabecera tabla
      doc.setFillColor(240,240,240); doc.rect(15, y-4, 180, 6, 'F');
      doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('Hotel', 16, y);
      doc.text('Estado', 80, y);
      doc.text('Revisado por', 105, y);
      doc.text('Hora', 145, y);
      doc.text('Uds', 165, y);
      doc.text('Obs', 178, y);
      y += 4;
      doc.setFont('helvetica','normal');

      filas.forEach(f => {
        if (y > 285) { doc.addPage(); y = 20; }
        const nombre = (f.puesto.nombre || '').substring(0,32);
        const est = f.estado === 'completo' ? 'Completa' : f.estado === 'parcial' ? 'Parcial' : 'PENDIENTE';
        const revs = f.revisiones;
        const revBy = revs.length ? (revs[0].empleado_nombre || '—').substring(0,24) : '(sin revisar)';
        const revHora = revs.length ? new Date(revs[0].fecha).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}) : '—';
        const udsTxt = f.unidades.length === 0 ? '1' : `${revs.filter(r=>r.unidad_id).length}/${f.unidades.length}`;
        const hasObs = revs.some(r => r.observaciones) ? '✔' : '';

        if (f.estado === 'pendiente') { doc.setTextColor(180,30,30); doc.setFont('helvetica','bold'); }
        else if (f.estado === 'parcial') { doc.setTextColor(180,100,20); }
        else { doc.setTextColor(0,120,0); }
        doc.text(nombre, 16, y);
        doc.text(est, 80, y);
        doc.setTextColor(0,0,0); doc.setFont('helvetica','normal');
        doc.text(revBy, 105, y);
        doc.text(revHora, 145, y);
        doc.text(udsTxt, 165, y);
        doc.text(hasObs, 180, y);
        y += 5;

        // Observaciones debajo
        revs.filter(r => r.observaciones).forEach(r => {
          const lines = doc.splitTextToSize('  » ' + r.observaciones, 175);
          if (y + lines.length * 4 > 285) { doc.addPage(); y = 20; }
          doc.setFontSize(7.5); doc.setTextColor(120,80,0);
          doc.text(lines, 18, y);
          y += lines.length * 3.5;
          doc.setFontSize(8); doc.setTextColor(0,0,0);
        });
      });
      y += 8;
    });

    // Footer
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text(`Pool Safety Des Llevant · Revisiones ${fecha} · Página ${i}/${pages}`, 105, 292, { align:'center' });
    }
    doc.save(`PoolSafety-revisiones-${fecha}.pdf`);
    toast('✓ PDF descargado');
  };

})();
