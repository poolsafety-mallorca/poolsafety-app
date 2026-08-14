/* ==========================================================================
   PoolSafety · App socorrista v2
   ========================================================================== */

(function () {
  // Botón logout SIEMPRE disponible aunque falle todo lo demás (safety net)
  document.addEventListener('click', function (e) {
    const t = e.target.closest('#logoutBtn');
    if (!t) return;
    try {
      if (window.sb) window.sb.auth.signOut().finally(() => {
        localStorage.removeItem('ps-session');
        window.location.replace('index.html');
      });
      else { localStorage.removeItem('ps-session'); window.location.replace('index.html'); }
    } catch (_) { window.location.replace('index.html'); }
  }, true);

  // Sesión real de Supabase (set por auth-guard.js). Fallback a mock por compatibilidad.
  const psSession = window.PS_SESSION || PS.getSession() || {};
  const email = psSession.email || 'maria@poolsafety.es';

  // Si es coord o admin y cayó en socorrista.html por error → fuera
  if (psSession.rol && !['socorrista','dueno'].includes(psSession.rol)) {
    window.location.replace('coordinador.html');
    return;
  }
  // (Admin puede probar la vista socorrista, pero coordinador no)

  function nombreDe(session) {
    let n = session.nombre;
    if (!n) {
      n = (session.email || 'usuario').split('@')[0];
      n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    }
    return n;
  }

  // Ficha 'me' minimalista — sin datos mock. Se rellenará con empleadoReal al cargar BD.
  const me = {
    id: psSession.userId || 'anonimo',
    nombre: nombreDe(psSession),
    iniciales: (nombreDe(psSession) || '?').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase(),
    puestoId: null,
    fotoUrl: null,
    horasNormales: 0, horasExtra: 0, diasTrabajados: 0
  };

  // Cuando llegue el nombre real de la BD, refresca cabecera + perfil
  document.addEventListener('ps-session-updated', (e) => {
    me.nombre = nombreDe(e.detail);
    me.iniciales = me.nombre.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
    const un = document.getElementById('userName');
    const ui = document.getElementById('userInitials');
    const pn = document.getElementById('profileName');
    const pa = document.getElementById('profileAvatarPhoto');
    if (un) un.textContent = me.nombre;
    if (ui && !ui.style.backgroundImage) ui.textContent = me.iniciales;
    if (pn) pn.textContent = me.nombre;
    if (pa && !pa.style.backgroundImage) pa.textContent = me.iniciales;
  });

  // Cabecera con placeholders — datos reales llegan tras cargarMiFicha()
  const uName = document.getElementById('userName');
  const uInit = document.getElementById('userInitials');
  const pName = document.getElementById('puestoName');
  const tText = document.getElementById('turnoText');
  if (uName) uName.textContent = me.nombre;
  if (uInit) uInit.textContent = me.iniciales;
  if (pName) pName.textContent = 'Cargando puesto…';
  if (tText) tText.textContent = '—';

  // Foto de perfil (compartida con la ficha del coordinador)
  function miFoto() {
    const raw = localStorage.getItem('poolsafety-empleados-v1');
    if (!raw) return null;
    return JSON.parse(raw)[me.id]?.fotoUrl || null;
  }
  function guardarMiFoto(url) {
    const raw = localStorage.getItem('poolsafety-empleados-v1');
    const all = raw ? JSON.parse(raw) : {};
    all[me.id] = { ...(all[me.id] || {}), fotoUrl: url };
    localStorage.setItem('poolsafety-empleados-v1', JSON.stringify(all));
  }
  function aplicarFotoEnUI() {
    const foto = miFoto();
    // Avatar de cabecera (redondo)
    const av = document.getElementById('userInitials');
    const profileAv = document.getElementById('profileAvatarPhoto');
    const profileName = document.getElementById('profileName');
    if (foto) {
      av.style.backgroundImage = `url('${foto}')`;
      av.style.backgroundSize = 'cover';
      av.style.backgroundPosition = 'center';
      av.textContent = '';
      if (profileAv) {
        profileAv.style.backgroundImage = `url('${foto}')`;
        profileAv.style.backgroundSize = 'cover';
        profileAv.style.backgroundPosition = 'center';
        profileAv.textContent = '';
      }
    } else {
      av.style.backgroundImage = '';
      av.textContent = me.iniciales;
      if (profileAv) {
        profileAv.style.backgroundImage = '';
        profileAv.textContent = me.iniciales;
      }
    }
    if (profileName) profileName.textContent = me.nombre;
  }
  aplicarFotoEnUI();

  document.addEventListener('change', e => {
    if (e.target.id !== 'profilePhotoInput') return;
    const f = e.target.files[0];
    if (!f || !f.type.startsWith('image/')) { toast('El archivo debe ser una imagen'); return; }
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

      // Subir a Storage (para que se vea desde cualquier dispositivo)
      try {
        if (empleadoReal && window.PSStorage) {
          toast('Subiendo foto...');
          const path = `fotos/${empleadoReal.id}.jpg`;
          const url = await window.PSStorage.subir(path, dataUrl, 'image/jpeg');
          // Guardamos URL pública en empleados.foto_url
          await window.sb.from('empleados').update({ foto_url: url }).eq('id', empleadoReal.id);
          empleadoReal.foto_url = url;
          guardarMiFoto(url);
          toast('✓ Foto guardada — visible desde cualquier dispositivo');
        } else {
          // Fallback local
          guardarMiFoto(dataUrl);
          toast('Foto actualizada (solo en este dispositivo)');
        }
        aplicarFotoEnUI();
      } catch (err) {
        toast('Error subiendo foto: ' + err.message);
      }
    };
    reader.readAsDataURL(f);
  });
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

  /* ==========================================================================
     FICHAJE REAL CON GPS + BD (Supabase)
     ========================================================================== */

  // Estado del fichaje: SIEMPRE se calcula a partir de los fichajes REALES de HOY en BD.
  // localStorage era el bug que hacía ver el turno del día anterior al día siguiente.
  const state = { fichado: false, horaEntrada: null, horaSalida: null };
  const punchActions = document.getElementById('punchActions');
  const punchBadge = document.getElementById('punchBadge');
  const punchWhen = document.getElementById('punchWhen');
  const gpsChip = document.getElementById('gpsChip');
  const gpsText = document.getElementById('gpsText');
  const gpsMeta = document.getElementById('gpsMeta');

  let empleadoReal = null;      // ficha del empleado logueado (de tabla empleados)
  let puestoReal = null;         // puesto asignado (de tabla puestos)
  let ultimaPosicion = null;     // GPS más reciente

  async function cargarMiFicha() {
    if (!window.sb) return null;
    const psSes = window.PS_SESSION || {};
    if (!psSes.userId) return null;
    try {
      const { data, error } = await window.sb
        .from('empleados')
        .select('*, puestos(id, nombre, zona, direccion, gps_lat, gps_lng, gps_radio_m, hora_inicio_default, hora_fin_default)')
        .eq('usuario_id', psSes.userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('[Socorrista] cargar ficha:', err.message);
      return null;
    }
  }

  // Reconstruye el state del fichaje leyendo los fichajes REALES de HOY desde BD.
  // Elimina el bug antiguo de localStorage que mostraba el turno del día anterior.
  async function sincronizarEstadoFichajeDesdeBD() {
    if (!empleadoReal || !window.sb) return;
    try {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();
      const { data } = await window.sb.from('fichajes')
        .select('tipo, hora').eq('empleado_id', empleadoReal.id)
        .gte('hora', desde).lt('hora', hasta)
        .order('hora', { ascending: true });
      const rows = data || [];
      const fmt = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      // Reset y reconstruir. Soporta VARIOS tramos el mismo día (turno partido).
      state.fichado = false;
      state.horaEntrada = null;
      state.horaSalida = null;
      state.tramos = [];      // [{entrada:'10:00', salida:'14:30'}, …] ya cerrados
      state.tramosMin = [];   // duración en minutos de cada tramo cerrado

      let entradaAbierta = null;
      for (const f of rows) {
        if (f.tipo === 'entrada') {
          entradaAbierta = f.hora;
        } else if (f.tipo === 'salida' && entradaAbierta) {
          state.tramos.push({ entrada: fmt(entradaAbierta), salida: fmt(f.hora) });
          state.tramosMin.push(Math.max(0, (new Date(f.hora) - new Date(entradaAbierta)) / 60000));
          entradaAbierta = null;
        }
      }

      if (entradaAbierta) {
        // Hay un tramo abierto ahora mismo → está trabajando
        state.fichado = true;
        state.horaEntrada = fmt(entradaAbierta);
      } else if (state.tramos.length) {
        // Todos los tramos cerrados → mostramos el último, pero se puede fichar otro
        const ultimo = state.tramos[state.tramos.length - 1];
        state.horaEntrada = ultimo.entrada;
        state.horaSalida = ultimo.salida;
      }
      if (typeof renderPunch === 'function') renderPunch();
    } catch (err) {
      console.warn('[sincronizarEstadoFichajeDesdeBD]', err.message);
    }
  }
  window.sincronizarEstadoFichajeDesdeBD = sincronizarEstadoFichajeDesdeBD;
  // Ejecutar al cargar la ficha, al recuperar foco y periódicamente
  document.addEventListener('ps-session-updated', () => setTimeout(sincronizarEstadoFichajeDesdeBD, 1200));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizarEstadoFichajeDesdeBD();
  });
  setInterval(sincronizarEstadoFichajeDesdeBD, 60_000);

  function aplicarPuestoEnUI() {
    const mapName = document.getElementById('mapName');
    const mapAddr = document.getElementById('mapAddr');
    const btnLlegar = document.getElementById('btnComoLlegar');
    if (puestoReal) {
      document.getElementById('puestoName').textContent = puestoReal.nombre;
      const hIni = (puestoReal.hora_inicio_default || '10:00:00').slice(0,5);
      const hFin = (puestoReal.hora_fin_default || '18:00:00').slice(0,5);
      document.getElementById('turnoText').textContent = `${hIni} – ${hFin}`;
      if (mapName) mapName.textContent = puestoReal.nombre;
      if (mapAddr) mapAddr.textContent = puestoReal.direccion || (puestoReal.zona || '') || '—';
      if (btnLlegar) btnLlegar.disabled = false;
    } else {
      document.getElementById('puestoName').textContent = 'Sin puesto asignado';
      document.getElementById('turnoText').textContent = '—';
      if (mapName) mapName.textContent = 'Sin puesto asignado';
      if (mapAddr) mapAddr.textContent = 'El coordinador debe asignarte un hotel';
      if (btnLlegar) btnLlegar.disabled = true;
    }
    pintarMapaMiPuesto();
  }

  // Mapa real (OSM embed) del puesto asignado.
  // Si el puesto no tiene coords, muestra placeholder textual con enlace a buscar en maps.
  function pintarMapaMiPuesto() {
    const cont = document.getElementById('miPuestoMapa');
    if (!cont) return;
    if (!puestoReal) {
      cont.innerHTML = `<div style="height:180px;display:flex;align-items:center;justify-content:center;color:#94A3B8;font-size:13px;text-align:center;padding:20px;">Sin puesto asignado.<br>El coordinador debe asignarte un hotel.</div>`;
      return;
    }
    const lat = parseFloat(puestoReal.gps_lat);
    const lng = parseFloat(puestoReal.gps_lng);
    if (!lat || !lng) {
      cont.innerHTML = `<div style="height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#64748B;font-size:13px;padding:20px;text-align:center;">
        <svg class="ic ic-22"><use href="#ic-pin"/></svg>
        <div>El puesto aún no tiene coordenadas GPS registradas.</div>
        <div class="small">Pídele al coordinador que las añada en el panel de puestos.</div>
      </div>`;
      return;
    }
    // Bbox pequeño alrededor del punto (~200m)
    const marg = 0.0015;
    const bbox = [lng - marg, lat - marg, lng + marg, lat + marg].join(',');
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
    cont.innerHTML = `
      <iframe src="${src}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
        style="width:100%;height:200px;border:0;display:block;" title="Mapa del puesto"></iframe>`;
  }

  window.comoLlegarPuesto = function () {
    if (!puestoReal) { toast('Aún no tienes un puesto asignado'); return; }
    let url;
    if (puestoReal.gps_lat && puestoReal.gps_lng) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${puestoReal.gps_lat},${puestoReal.gps_lng}&travelmode=driving`;
    } else if (puestoReal.direccion) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(puestoReal.direccion + ', ' + (puestoReal.zona || 'Mallorca'))}&travelmode=driving`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(puestoReal.nombre + ', ' + (puestoReal.zona || 'Mallorca'))}`;
    }
    window.open(url, '_blank');
  };

  // Obtiene GPS con reintento inteligente. Si el primer intento da accuracy
  // mala (>300m suele ser fallback A-GPS por celda), reintenta 1 vez más y
  // devuelve el MEJOR de los dos. Reduce mucho los "fuera de zona" fantasma.
  async function obtenerGPS() {
    const pedir = (timeout) => new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Tu dispositivo no soporta GPS'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        err => {
          let msg = 'Error GPS';
          if (err.code === 1) msg = 'Has bloqueado el permiso de GPS. Actívalo desde ajustes del navegador.';
          else if (err.code === 2) msg = 'GPS no disponible. Comprueba que tienes conexión y ubicación activada.';
          else if (err.code === 3) msg = 'GPS tarda demasiado. Prueba en un sitio más abierto.';
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout, maximumAge: 0 }
      );
    });
    const primero = await pedir(15000);
    // Si la precisión ya es buena, devolvemos ese
    if (primero.accuracy <= 300) return primero;
    // Precisión mala → intentamos uno más, breve, sin bloquear si falla
    try {
      const segundo = await pedir(8000);
      return segundo.accuracy < primero.accuracy ? segundo : primero;
    } catch (_) { return primero; }
  }

  function distanciaMetros(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  }

  // Diagnóstico de GPS para el propio socorrista (botón en Perfil > Ajustes).
  // Comprueba el permiso del navegador y hace un fix real. Muestra un modal
  // con el resultado + instrucciones concretas si el permiso está denegado
  // o si va a pedirlo cada vez.
  window.comprobarMiGps = async function () {
    const sub = document.getElementById('gpsCheckSub');
    if (sub) sub.textContent = 'Comprobando…';
    let permiso = 'unknown';
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const p = await navigator.permissions.query({ name: 'geolocation' });
        permiso = p.state; // 'granted' | 'denied' | 'prompt'
      }
    } catch (_) {}

    const iosSafari = /iP(hone|ad)/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    const instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    let posGps = null, gpsError = null;
    try { posGps = await obtenerGPS(); } catch (err) { gpsError = err.message; }

    // Construye el mensaje
    let icono = '✅', color = '#059669', titulo = 'GPS OK', detalle = '';
    if (posGps) {
      icono = posGps.accuracy < 50 ? '✅' : (posGps.accuracy < 200 ? '🟡' : '🟠');
      titulo = 'GPS funcionando';
      detalle = `Precisión ±${Math.round(posGps.accuracy)} m\nCoordenadas: ${posGps.lat.toFixed(5)}, ${posGps.lng.toFixed(5)}`;
      color = posGps.accuracy < 50 ? '#059669' : (posGps.accuracy < 200 ? '#D97706' : '#EA580C');
    } else {
      icono = '⚠️'; color = '#DC2626';
      titulo = 'GPS no disponible';
      detalle = gpsError || 'Sin señal';
    }

    let consejos = '';
    if (permiso === 'denied') {
      consejos = iosSafari
        ? '\n\n📱 iPhone/Safari:\n1. Ajustes → Safari → Ubicación → Permitir\n2. Cierra Safari y vuelve a abrirlo\n3. En la web, vuelve a intentarlo'
        : '\n\n🌐 Navegador:\n1. Icono candado ⓘ junto a la URL → Ubicación → Permitir\n2. Refresca la página';
    } else if (permiso === 'prompt') {
      consejos = iosSafari
        ? '\n\n⚠️ Safari te va a preguntar CADA VEZ. Solución:\n1. Instala la app en el escritorio (botón Compartir → Añadir a pantalla de inicio)\n2. Abre siempre desde el icono, no desde el navegador\n3. Al abrir la primera vez pulsa "Permitir mientras uso la app"'
        : '\n\n⚠️ El navegador te va a pedir permiso cada vez. Solución:\n1. La próxima vez que pregunte, dale "Permitir mientras uso el sitio"\n2. Si te ha preguntado hoy y le diste bloquear, revierte:\n   Icono candado ⓘ → Ubicación → Preguntar / Permitir';
    } else if (permiso === 'granted' && !instalada && iosSafari) {
      consejos = '\n\n💡 Consejo: instala la app en el escritorio (Compartir → Añadir a pantalla de inicio) para que no vuelva a pedirte el permiso.';
    }

    alert(`${icono} ${titulo}\n\n${detalle}${consejos}`);

    if (sub) {
      if (posGps && permiso !== 'prompt') sub.textContent = `✓ GPS OK · precisión ±${Math.round(posGps.accuracy)} m`;
      else if (permiso === 'denied') sub.textContent = '✗ Permiso GPS bloqueado — revisa ajustes del navegador';
      else if (permiso === 'prompt') sub.textContent = '⚠ Va a pedir permiso cada vez — instala la app';
      else sub.textContent = '⚠ Sin señal GPS ahora mismo';
    }
  };

  function actualizarGpsChip(estado, texto, meta) {
    if (!gpsChip) return;
    gpsChip.className = 'gps-chip ' + (estado || '');
    if (gpsText) gpsText.textContent = texto || '—';
    if (gpsMeta) gpsMeta.textContent = meta || '';
  }

  async function checkGpsPasivo() {
    // Comprueba GPS y actualiza el chip sin fichar (info al usuario)
    if (!puestoReal || !puestoReal.gps_lat) {
      actualizarGpsChip('', 'Sin puesto asignado con GPS', 'El coordinador debe asignarte un hotel');
      return;
    }
    try {
      const gps = await obtenerGPS();
      ultimaPosicion = gps;
      const dist = distanciaMetros(gps.lat, gps.lng, +puestoReal.gps_lat, +puestoReal.gps_lng);
      const radio = puestoReal.gps_radio_m || 50;
      if (dist <= radio) {
        actualizarGpsChip('ok', 'Dentro del área del puesto', `Precisión ±${Math.round(gps.accuracy)}m · ${puestoReal.nombre}`);
      } else {
        actualizarGpsChip('warn', `Fuera del área (${dist}m de ${puestoReal.nombre})`, `El radio permitido es ${radio}m`);
      }
    } catch (err) {
      actualizarGpsChip('warn', 'Sin GPS', err.message);
    }
  }

  function renderPunch() {
    // Resumen de los tramos ya cerrados hoy (turnos partidos: mañana + tarde)
    const tramos = state.tramos || [];
    const resumenTramos = tramos.length
      ? `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:10px;">
           ${tramos.map(t => `
             <span style="background:rgba(255,255,255,.18);color:#fff;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">
               ${t.entrada} – ${t.salida}
             </span>`).join('')}
         </div>`
      : '';

    if (!state.fichado && !state.horaSalida) {
      // Aún no ha fichado nada hoy
      punchBadge.innerHTML = `<span class="dot" style="background:#FCA5A5;"></span> No iniciado`;
      punchWhen.textContent = 'Pulsa para fichar tu entrada al turno';
      punchActions.innerHTML = `
        <button class="punch-cta" id="punchInBtn">
          <svg class="ic ic-18"><use href="#ic-play"/></svg>
          Fichar entrada
        </button>`;
      document.getElementById('punchInBtn').addEventListener('click', doPunchIn);

    } else if (state.fichado) {
      // Está dentro de un tramo
      punchBadge.innerHTML = `<span class="dot" style="background:#34D399;"></span> Trabajando`;
      punchWhen.textContent = tramos.length
        ? `Segundo tramo · entraste a las ${state.horaEntrada}`
        : `Fichaste entrada a las ${state.horaEntrada}`;
      punchActions.innerHTML = `
        <button class="punch-cta out" id="punchOutBtn">
          <svg class="ic ic-18"><use href="#ic-stop"/></svg>
          Fichar salida
        </button>
        ${resumenTramos}`;
      document.getElementById('punchOutBtn').addEventListener('click', doPunchOut);

    } else {
      // Tramo cerrado. IMPORTANTE: se deja fichar otra entrada el mismo día
      // porque muchos socorristas tienen turno partido (mañana y tarde).
      const totalHoy = calcularHorasHoy();
      punchBadge.innerHTML = `<span class="dot" style="background:#94A3B8;"></span> Turno registrado`;
      punchWhen.textContent = totalHoy
        ? `Llevas ${totalHoy} hoy · puedes fichar otro tramo si vuelves`
        : `${state.horaEntrada} – ${state.horaSalida} · registrado correctamente`;
      punchActions.innerHTML = `
        <button class="punch-cta" id="punchInBtn">
          <svg class="ic ic-18"><use href="#ic-play"/></svg>
          Fichar nueva entrada
        </button>
        ${resumenTramos}
        <div style="text-align:center;margin-top:8px;color:#fff;opacity:.75;font-size:12px;">
          Úsalo si tienes turno partido o vuelves al puesto
        </div>`;
      document.getElementById('punchInBtn').addEventListener('click', doPunchIn);
    }
  }

  // Suma de todos los tramos cerrados hoy, en formato "3h 30min"
  function calcularHorasHoy() {
    const tramos = state.tramosMin || [];
    if (!tramos.length) return '';
    const total = tramos.reduce((s, m) => s + m, 0);
    const h = Math.floor(total / 60), m = Math.round(total % 60);
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  }

  async function insertarFichaje(tipo) {
    if (!empleadoReal) throw new Error('No tienes ficha de empleado (contacta con el coordinador)');
    // 1) Determinar el puesto contra el que se ficha:
    //    - Si el empleado es correturnos o no tiene puesto principal → elegir hotel manualmente
    //    - Si ya eligió uno hoy (sessionStorage) → usar ese (para que salida coincida con entrada)
    let puestoDestino = puestoReal;
    const esCorreturnos = !!empleadoReal.es_correturnos;
    const hotelHoyKey = 'psHotelHoy_' + empleadoReal.id;
    const hotelHoyId = sessionStorage.getItem(hotelHoyKey);
    if (hotelHoyId) {
      // Ya eligió hotel hoy. Cargar sus datos completos si no es el asignado.
      if (!puestoDestino || puestoDestino.id !== hotelHoyId) {
        try {
          const { data } = await window.sb.from('puestos')
            .select('id, nombre, zona, direccion, gps_lat, gps_lng, gps_radio_m, hora_inicio_default')
            .eq('id', hotelHoyId).single();
          if (data) puestoDestino = data;
        } catch (_) {}
      }
    }
    // Si no hay puesto (correturnos sin elegir todavía) → pedirle que elija
    if (!puestoDestino || esCorreturnos && !hotelHoyId) {
      const gpsPrev = await obtenerGPS().catch(() => null);
      if (gpsPrev) ultimaPosicion = gpsPrev;
      const elegido = await elegirHotelParaFichar(gpsPrev);
      if (!elegido) throw new Error('cancelado');
      puestoDestino = elegido;
      sessionStorage.setItem(hotelHoyKey, elegido.id);
    }

    // GPS con fallback: si falla (permiso denegado, timeout, sin señal…) NO
    // bloqueamos el fichaje — sobre todo la SALIDA. El socorrista debe poder
    // cerrar su turno aunque el GPS esté roto. Se guarda sin coordenadas y
    // el motivo queda registrado para que el admin lo vea.
    let gps = null, gpsError = null;
    try {
      gps = await obtenerGPS();
      ultimaPosicion = gps;
    } catch (err) {
      gpsError = err.message || 'GPS no disponible';
      const seguir = confirm(
        `⚠ No se ha podido obtener tu GPS:\n\n${gpsError}\n\n` +
        `¿Quieres fichar ${tipo.toUpperCase()} SIN GPS?\n\n` +
        `Se registrará como fichaje sin ubicación y el coordinador lo verá marcado.`
      );
      if (!seguir) throw new Error('cancelado');
    }

    let distanciaM = null, gpsOk = null, fueraDeZona = false;
    if (gps && puestoDestino && puestoDestino.gps_lat && puestoDestino.gps_lng) {
      distanciaM = distanciaMetros(gps.lat, gps.lng, +puestoDestino.gps_lat, +puestoDestino.gps_lng);
      const radio = puestoDestino.gps_radio_m || 50;
      gpsOk = distanciaM <= radio;
      fueraDeZona = !gpsOk;
    } else if (!gps) {
      gpsOk = false;
      fueraDeZona = true;
    }
    // Intentamos guardar también accuracy_m. Si la columna no existe, hacemos
    // reintento sin ella (fallback silencioso).
    const payloadFull = {
      empleado_id: empleadoReal.id,
      puesto_id: puestoDestino ? puestoDestino.id : null,
      tipo,
      hora: new Date().toISOString(),
      gps_lat: gps ? gps.lat : null,
      gps_lng: gps ? gps.lng : null,
      gps_ok: gpsOk,
      fuera_de_zona: fueraDeZona,
      distancia_m: distanciaM,
      accuracy_m: gps && gps.accuracy ? Math.round(gps.accuracy) : null,
      motivo_manual: gpsError ? `[Sin GPS] ${gpsError}` : null
    };
    let { error } = await window.sb.from('fichajes').insert(payloadFull);
    if (error && /accuracy_m|column/i.test(error.message)) {
      const { accuracy_m, ...sinAcc } = payloadFull;
      const { error: e2 } = await window.sb.from('fichajes').insert(sinAcc);
      if (e2) throw e2;
    } else if (error) throw error;
    // Si es salida, limpiamos el hotel elegido para hoy — que mañana pregunte de nuevo
    if (tipo === 'salida' && esCorreturnos) {
      // Solo limpiamos si es la ULTIMA salida del día (turno terminado)
      // Aquí simple: limpiamos siempre en salida y si vuelve a entrar re-elige
      sessionStorage.removeItem(hotelHoyKey);
    }
    return { gps, distanciaM, fueraDeZona, puestoUsado: puestoDestino };
  }

  // Modal para elegir el hotel donde fichar. Prioriza el hotel del horario
  // del socorrista para HOY (badge verde "📅 TU HORARIO"), luego el resto
  // por cercanía GPS. Si elige un hotel que NO está en su horario de hoy,
  // pide confirmación para evitar que el puesto asignado quede vacante.
  async function elegirHotelParaFichar(gpsSugerido) {
    // Traer todos los hoteles activos
    let hoteles = [];
    try {
      const { data } = await window.sb.from('puestos')
        .select('id, nombre, zona, direccion, gps_lat, gps_lng, gps_radio_m')
        .eq('activo', true).order('nombre');
      hoteles = data || [];
    } catch (_) {}
    if (!hoteles.length) { alert('No hay hoteles configurados. Avisa al coordinador.'); return null; }

    // Cargar horarios activos del socorrista y marcar los que aplican HOY
    let horariosHoy = []; // [{ puesto_id, hora_inicio, hora_inicio_2 }]
    try {
      if (empleadoReal?.id) {
        const { data: hs } = await window.sb.from('horarios')
          .select('puesto_id, hora_inicio, hora_inicio_2, dias, fecha_desde, fecha_hasta')
          .eq('empleado_id', empleadoReal.id).eq('activo', true);
        const hoy = new Date();
        const jsDay = hoy.getDay();
        horariosHoy = (hs || []).filter(h =>
          horarioAplicaEnDia(h, jsDay) &&
          (!h.fecha_desde || new Date(h.fecha_desde) <= hoy) &&
          (!h.fecha_hasta || new Date(h.fecha_hasta) >= hoy)
        );
      }
    } catch (_) {}
    const horarioPorPuesto = {};
    horariosHoy.forEach(h => {
      const horaTxt = [h.hora_inicio, h.hora_inicio_2].filter(Boolean).map(t => t.slice(0,5)).join(' + ');
      horarioPorPuesto[h.puesto_id] = horaTxt || '';
    });

    // Añadir _dist a cada hotel y marcar los del horario
    hoteles.forEach(h => {
      h._horarioHoy = !!horarioPorPuesto[h.id];
      h._horaTxt = horarioPorPuesto[h.id] || '';
      if (gpsSugerido && h.gps_lat && h.gps_lng) {
        h._dist = Math.round(distanciaMetros(gpsSugerido.lat, gpsSugerido.lng, +h.gps_lat, +h.gps_lng));
      } else {
        h._dist = 999999;
      }
    });

    // Ordenar: primero los del horario hoy, luego el resto por distancia
    hoteles.sort((a, b) => {
      if (a._horarioHoy !== b._horarioHoy) return a._horarioHoy ? -1 : 1;
      return a._dist - b._dist;
    });

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:20000;display:flex;align-items:flex-end;justify-content:center;';
      const tieneHorarioHoy = hoteles.some(h => h._horarioHoy);
      modal.innerHTML = `
        <div style="background:#fff;border-radius:14px 14px 0 0;max-width:520px;width:100%;max-height:85vh;display:flex;flex-direction:column;">
          <div style="padding:16px 18px;background:#B91C1C;color:#fff;border-radius:14px 14px 0 0;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;opacity:.85;">Fichar entrada</div>
            <div style="font-size:16px;font-weight:800;margin-top:2px;">¿En qué hotel estás hoy?</div>
            <div style="font-size:12px;opacity:.9;margin-top:2px;">${tieneHorarioHoy ? 'Los primeros son los que tienes en tu horario de hoy' : (gpsSugerido ? 'Ordenados por cercanía a tu GPS' : 'Sin GPS · elige a mano')}</div>
          </div>
          <div style="padding:8px 12px;overflow-y:auto;flex:1;">
            ${hoteles.map(h => {
              const esHorario = h._horarioHoy;
              const cerca = h._dist != null && h._dist < 100;
              const bgIcon = esHorario ? '#DCFCE7' : (cerca ? '#DCFCE7' : '#F1F5F9');
              const colorIcon = esHorario ? '#065F46' : (cerca ? '#065F46' : '#64748B');
              const icono = esHorario ? '📅' : (cerca ? '📍' : '🏨');
              const borde = esHorario ? '2px solid #059669' : '1px solid #E2E8F0';
              const fondo = esHorario ? '#F0FDF4' : '#fff';
              return `
              <button data-hid="${h.id}" data-horario="${esHorario ? '1' : '0'}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:14px 12px;border:${borde};background:${fondo};border-radius:10px;margin:6px 0;cursor:pointer;">
                <div style="width:38px;height:38px;border-radius:50%;background:${bgIcon};color:${colorIcon};display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">
                  ${icono}
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;font-size:14px;color:#111827;">${h.nombre}</div>
                  <div style="font-size:12px;color:#64748B;">${h.zona || h.direccion || ''}</div>
                  ${esHorario ? `<div style="font-size:11.5px;color:#059669;font-weight:700;margin-top:2px;">📅 TU HORARIO HOY${h._horaTxt ? ' · ' + h._horaTxt : ''}</div>` : ''}
                </div>
                ${h._dist != null && h._dist < 99999 ? `
                  <div style="font-size:11.5px;color:${cerca ? '#059669' : h._dist < 500 ? '#D97706' : '#94A3B8'};font-weight:700;flex-shrink:0;">
                    ${h._dist < 1000 ? h._dist + ' m' : (h._dist/1000).toFixed(1) + ' km'}
                  </div>` : ''}
              </button>`;
            }).join('')}
          </div>
          <div style="padding:12px 16px;border-top:1px solid #E2E8F0;">
            <button id="hotelBoxCancel" style="width:100%;padding:12px;background:#F1F5F9;color:#64748B;border:0;border-radius:8px;font-weight:700;cursor:pointer;">Cancelar</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-hid]');
        if (b) {
          const h = hoteles.find(x => x.id === b.dataset.hid);
          const eraHorario = b.dataset.horario === '1';
          // Si tiene horario hoy y elige uno que NO está en su horario, confirmar
          if (tieneHorarioHoy && !eraHorario && h) {
            const hotelesHorarioNombres = hoteles.filter(x => x._horarioHoy).map(x => x.nombre).join(', ');
            if (!confirm(`⚠️ Hoy tienes asignado: ${hotelesHorarioNombres}\n\nHas elegido: ${h.nombre}\n\nSi fichas aquí, el puesto asignado quedará vacante en el panel del coordinador.\n\n¿Estás seguro de que estás en ${h.nombre}?`)) {
              return; // no cerrar el modal
            }
          }
          modal.remove();
          resolve(h || null);
        } else if (e.target.id === 'hotelBoxCancel' || e.target === modal) {
          modal.remove();
          resolve(null);
        }
      });
    });
  }

  async function doPunchIn() {
    const btn = document.getElementById('punchInBtn');
    btn.innerHTML = `<svg class="ic ic-18"><use href="#ic-signal"/></svg> Obteniendo GPS…`;
    btn.disabled = true;
    try {
      const r = await insertarFichaje('entrada');
      // Releemos de BD para que los tramos del día queden bien (turnos partidos)
      await sincronizarEstadoFichajeDesdeBD();
      renderMetricasMes();
      if (r.fueraDeZona) {
        toast(`⚠️ Entrada FUERA de zona (${r.distanciaM}m del puesto). Registrada con aviso al coordinador.`);
      } else {
        toast(`✓ Entrada registrada · ${r.distanciaM != null ? r.distanciaM + 'm del puesto' : 'GPS OK'}`);
      }
      actualizarGpsChip(r.fueraDeZona ? 'warn' : 'ok',
        r.fueraDeZona ? `Fichaje fuera de zona` : 'Dentro del área del puesto',
        r.distanciaM != null ? `${r.distanciaM}m del puesto · precisión ±${Math.round(r.gps.accuracy)}m` : `Precisión ±${Math.round(r.gps.accuracy)}m`);
    } catch (err) {
      if (err.message === 'cancelado') {
        toast('Fichaje cancelado');
      } else {
        toast('Error: ' + err.message);
      }
      btn.disabled = false;
      btn.innerHTML = `<svg class="ic ic-18"><use href="#ic-play"/></svg> Fichar entrada`;
    }
  }

  async function doPunchOut() {
    if (!confirm('¿Fichar salida ahora?')) return;
    const btn = document.getElementById('punchOutBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ic ic-18"><use href="#ic-signal"/></svg> Registrando salida…'; }
    try {
      const r = await insertarFichaje('salida');
      // Releemos de BD para recalcular los tramos del día (turnos partidos)
      await sincronizarEstadoFichajeDesdeBD();
      renderMetricasMes();
      toast(`✓ Salida registrada · ¡Buen trabajo!${r.fueraDeZona ? ' (fuera de zona)' : ''}`);
    } catch (err) {
      if (err.message === 'cancelado') {
        toast('Fichaje cancelado');
      } else {
        toast('Error: ' + err.message);
      }
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic ic-18"><use href="#ic-stop"/></svg> Fichar salida'; }
    }
  }

  // Alias histórico: antes había aquí una segunda implementación que NO
  // contemplaba turnos partidos y machacaba el estado. Ahora todo pasa por
  // sincronizarEstadoFichajeDesdeBD, que sí reconstruye los tramos del día.
  async function cargarFichajesHoyDeBd() {
    return sincronizarEstadoFichajeDesdeBD();
  }

  renderPunch();

  // Cargar datos reales del empleado en BD
  (async () => {
    empleadoReal = await cargarMiFicha();
    if (empleadoReal && empleadoReal.puestos) {
      puestoReal = empleadoReal.puestos;
    }
    if (empleadoReal && empleadoReal.nombre) {
      const un = document.getElementById('userName');
      if (un) un.textContent = empleadoReal.nombre;
    }
    // Si el empleado está en 'finiquito-pendiente', bloquea todo excepto firmar finiquito
    if (empleadoReal && empleadoReal.estado === 'finiquito-pendiente') {
      mostrarPantallaFiniquito(empleadoReal);
      return; // no seguimos con GPS, fichaje, etc.
    }
    aplicarPuestoEnUI();
    await cargarFichajesHoyDeBd();
    checkGpsPasivo();
  })();

  function mostrarPantallaFiniquito(emp) {
    // Reemplaza todo el body con pantalla exclusiva de finiquito con firma real
    document.body.innerHTML = `
      <div style="min-height:100vh;background:linear-gradient(135deg,#B91C1C,#7F1D1D);display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="background:#fff;color:#111827;border-radius:16px;max-width:560px;width:100%;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:95vh;overflow-y:auto;">
          <div style="text-align:center;margin-bottom:16px;">
            <div style="width:64px;height:64px;background:#FEE2E2;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;color:#B91C1C;font-size:32px;">📄</div>
          </div>
          <h1 style="margin:0 0 8px;font-size:22px;color:#111827;text-align:center;">Firma de finiquito</h1>
          <p style="margin:0 0 16px;color:#6B7280;font-size:14px;line-height:1.5;text-align:center;">
            Hola <b>${emp.nombre}</b>, la empresa ha iniciado tu finiquito. Lee y firma para completar el proceso.
          </p>

          <div style="background:#FAFBFC;border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;color:#374151;line-height:1.5;max-height:200px;overflow-y:auto;">
            <b style="color:#111827;">FINIQUITO Y EXTINCIÓN DE CONTRATO</b><br><br>
            Pool Safety Des Llevant, S.L. (CIF B75828418), con domicilio en C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, Baleares, y <b>${emp.nombre}</b> (con DNI que se aportará abajo), acuerdan la extinción de la relación laboral que mantenían.<br><br>
            Con la firma del presente documento:<br>
            • El trabajador declara <b>haber recibido las cantidades que legalmente le corresponden</b> por la finalización del contrato (última mensualidad, parte proporcional de pagas extras, vacaciones no disfrutadas e indemnización si procede).<br>
            • Ambas partes reconocen <b>no tener nada más que reclamarse</b> por concepto alguno derivado de la relación laboral finalizada, más allá de lo aquí firmado.<br>
            • El acceso a la app queda dado de baja tras esta firma; los datos se conservan por si se produce una nueva alta futura.<br><br>
            De acuerdo con el RGPD y la LOPDGDD, los datos personales conservados durante los 4 años posteriores por obligación legal (art. 45 ET).
          </div>

          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;color:#6B7280;font-weight:600;margin-bottom:4px;">Tu nombre completo</label>
            <input type="text" id="fin-nombre" value="${emp.nombre}" style="width:100%;padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;box-sizing:border-box;" />
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;color:#6B7280;font-weight:600;margin-bottom:4px;">DNI</label>
            <input type="text" id="fin-dni" value="${emp.dni || ''}" placeholder="00000000A" style="width:100%;padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:14px;box-sizing:border-box;" />
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;color:#6B7280;font-weight:600;margin-bottom:4px;">Firma manuscrita</label>
            <div style="border:2px dashed #CBD5E1;border-radius:8px;background:#F9FAFB;">
              <canvas id="fin-canvas" width="500" height="180" style="display:block;width:100%;height:180px;touch-action:none;"></canvas>
            </div>
            <button type="button" onclick="limpiarFinCanvas()" style="margin-top:6px;background:transparent;border:1px solid #E5E7EB;padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;color:#6B7280;">Limpiar firma</button>
          </div>
          <label style="display:flex;gap:8px;align-items:flex-start;padding:10px 12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:16px;">
            <input type="checkbox" id="fin-accept" style="margin-top:3px;flex-shrink:0;" />
            <span><b>He leído y acepto el finiquito. Reconozco no tener nada más que reclamar.</b></span>
          </label>

          <button onclick="firmarFiniquitoAhora('${emp.id}')" style="width:100%;background:#B91C1C;color:#fff;border:0;padding:14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
            Firmar finiquito
          </button>
          <button onclick="if(window.sb) window.sb.auth.signOut().finally(() => { localStorage.clear(); location.replace('index.html'); }); else { localStorage.clear(); location.replace('index.html'); }" style="width:100%;background:transparent;color:#6B7280;border:0;padding:12px;font-size:13px;cursor:pointer;margin-top:8px;">
            Cerrar sesión sin firmar
          </button>
          <div style="margin-top:16px;text-align:center;font-size:11px;color:#9CA3AF;">
            Pool Safety Des Llevant, S.L. · info@poolsafety.es
          </div>
        </div>
      </div>`;
    setTimeout(initFinCanvas, 100);
  }

  // Canvas firma finiquito
  let finCanvasCtx = null;
  let finDibujando = false;
  let finFirmaVacia = true;
  function initFinCanvas() {
    const canvas = document.getElementById('fin-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    finCanvasCtx = ctx; finFirmaVacia = true;
    let lastX = 0, lastY = 0;
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const cX = e.touches ? e.touches[0].clientX : e.clientX;
      const cY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (cX - rect.left) * canvas.width / rect.width, y: (cY - rect.top) * canvas.height / rect.height };
    }
    function start(e) { e.preventDefault(); finDibujando = true; const p = getPos(e); lastX = p.x; lastY = p.y; }
    function move(e) {
      if (!finDibujando) return; e.preventDefault();
      const p = getPos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      lastX = p.x; lastY = p.y; finFirmaVacia = false;
    }
    function end() { finDibujando = false; }
    canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
    canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  }
  window.limpiarFinCanvas = function () {
    const c = document.getElementById('fin-canvas');
    if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); finFirmaVacia = true; }
  };

  window.firmarFiniquitoAhora = async function (empId) {
    const nombre = document.getElementById('fin-nombre').value.trim();
    const dni = document.getElementById('fin-dni').value.trim();
    const accept = document.getElementById('fin-accept').checked;
    if (!nombre) { alert('Escribe tu nombre completo'); return; }
    if (!dni) { alert('Escribe tu DNI'); return; }
    if (!accept) { alert('Debes marcar la casilla para aceptar'); return; }
    if (finFirmaVacia) { alert('Firma con el dedo dentro del recuadro'); return; }

    const canvas = document.getElementById('fin-canvas');
    const firmaImagen = canvas.toDataURL('image/png');

    try {
      // 1. Insertar firma del finiquito (con .select() para recuperar el id)
      const codigo = 'finiquito-' + new Date().toISOString().slice(0,10);
      const { data: firmaIns, error: fErr } = await window.sb.from('firmas_documentos').insert({
        empleado_id: empId,
        documento_codigo: codigo,
        firma_nombre: nombre,
        dni,
        dispositivo: 'móvil empleado · finiquito',
        firma_imagen: firmaImagen,
        ubicacion_lat: ultimaPosicion?.lat || null,
        ubicacion_lng: ultimaPosicion?.lng || null
      }).select().single();
      if (fErr) throw fErr;

      // 2. Pasar empleado a BAJA (no 'finiquitado' — así se puede reactivar el año siguiente)
      await window.sb.from('empleados').update({
        estado: 'baja',
        fecha_baja: new Date().toISOString().slice(0,10)
      }).eq('id', empId);

      // 3. Generar+subir PDF del finiquito para que quede descargable
      try {
        if (window.PSPdf && firmaIns) {
          const empData = Object.assign({}, empleadoReal || {}, { nombre, dni });
          await window.PSPdf.generarYSubir(empData, firmaIns);
        }
      } catch (pdfErr) {
        console.warn('[finiquito] no se pudo subir el PDF, la firma quedó guardada:', pdfErr);
      }

      // 4. Desactivar usuario para cortar login
      const psSes = window.PS_SESSION || {};
      if (psSes.userId) await window.sb.from('usuarios').update({ activo: false }).eq('id', psSes.userId);

      // 4. Pantalla de éxito y cerrar sesión
      document.body.innerHTML = `
        <div style="min-height:100vh;background:linear-gradient(135deg,#059669,#047857);display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <div style="background:#fff;color:#111827;border-radius:16px;max-width:480px;width:100%;padding:32px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);">
            <div style="width:64px;height:64px;background:#DCFCE7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#059669;font-size:32px;margin-bottom:16px;">✓</div>
            <h1 style="margin:0 0 8px;font-size:22px;">Finiquito firmado</h1>
            <p style="margin:0 0 20px;color:#6B7280;font-size:14px;line-height:1.5;">Gracias por tu trabajo, ${nombre.split(' ')[0]}. El finiquito ha quedado registrado y tu cuenta se ha dado de baja. Si en el futuro vuelves a la empresa, podrán reactivarte con los mismos datos.</p>
            <button onclick="if(window.sb) window.sb.auth.signOut().finally(() => { localStorage.clear(); location.replace('index.html'); })" style="width:100%;background:#B91C1C;color:#fff;border:0;padding:14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
              Cerrar sesión
            </button>
            <div style="margin-top:16px;font-size:11px;color:#9CA3AF;">Pool Safety Des Llevant, S.L.</div>
          </div>
        </div>`;
    } catch (err) {
      alert('Error al firmar el finiquito: ' + err.message + '\n\nContacta con info@poolsafety.es');
    }
  };

  // Re-comprobar GPS cada 60 seg (info al usuario)
  setInterval(checkGpsPasivo, 60000);

  // También cuando llega la sesión con nombre real
  document.addEventListener('ps-session-updated', async () => {
    if (!empleadoReal) {
      empleadoReal = await cargarMiFicha();
      if (empleadoReal && empleadoReal.puestos) puestoReal = empleadoReal.puestos;
      aplicarPuestoEnUI();
      cargarFichajesHoyDeBd();
    }
  });

  /* ---------- Notas (real desde BD para el empleado logueado) ---------- */
  const notasList = document.getElementById('notasList');
  const notasCount = document.getElementById('notasCount');
  async function cargarMisNotas() {
    if (!notasList) return;
    try {
      const empId = empleadoReal?.id;
      if (!empId || !window.sb) { notasList.innerHTML = ''; if (notasCount) notasCount.textContent = ''; return; }
      const { data } = await window.sb.from('notas')
        .select('id, mensaje, autor_nombre, created_at')
        .eq('empleado_id', empId).order('created_at', { ascending: false }).limit(20);
      const rows = data || [];
      if (notasCount) notasCount.textContent = rows.length ? `${rows.length} nueva${rows.length === 1 ? '' : 's'}` : '';
      if (rows.length === 0) { notasList.innerHTML = '<div class="text-muted small" style="padding:14px;text-align:center;">Sin notas del coordinador</div>'; return; }
      notasList.innerHTML = rows.map(n => `
        <div class="note">
          <div class="note-head">
            <div class="note-avatar">${(n.autor_nombre || '?').split(' ').slice(-1)[0][0]}</div>
            <div class="note-author">${n.autor_nombre || 'Coordinador'}</div>
            <div class="note-time">${new Date(n.created_at).toLocaleDateString('es-ES')}</div>
          </div>
          <div class="note-body">${n.mensaje}</div>
        </div>
      `).join('');
    } catch (_) { notasList.innerHTML = ''; }
  }
  document.addEventListener('ps-session-updated', () => setTimeout(cargarMisNotas, 500));
  setTimeout(cargarMisNotas, 1000);

  /* ---------- Tareas (real desde BD) ---------- */
  const tareasList = document.getElementById('tareasList');
  const tareasProgress = document.getElementById('tareasProgress');
  let tareasFilter = 'pendientes'; // 'pendientes' | 'hechas' | 'todas'
  window.setTareasFilter = function (f) {
    tareasFilter = f;
    document.querySelectorAll('#tareasFilterTabs .chip-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === f);
    });
    renderTareas();
  };
  async function renderTareas() {
    if (!tareasList) return;
    try {
      const empId = empleadoReal?.id;
      if (!empId || !window.sb) {
        tareasList.innerHTML = '<div class="text-muted small" style="padding:14px;text-align:center;">Sin tareas</div>';
        if (tareasProgress) tareasProgress.textContent = '';
        return;
      }
      const { data } = await window.sb.from('tareas')
        .select('id, titulo, descripcion, prioridad, fecha, hecha, hecha_el')
        .eq('empleado_id', empId).order('fecha', { ascending: true });
      const rows = data || [];
      const pendientes = rows.filter(t => !t.hecha);
      const hechas = rows.filter(t => t.hecha);
      const cp = document.getElementById('cnt-tar-pend');
      const ch = document.getElementById('cnt-tar-hechas');
      if (cp) cp.textContent = pendientes.length;
      if (ch) ch.textContent = hechas.length;

      const filtradas = tareasFilter === 'hechas' ? hechas
                     : tareasFilter === 'todas' ? rows
                     : pendientes;

      if (filtradas.length === 0) {
        const vacio = tareasFilter === 'hechas'
          ? 'Aún no has completado ninguna tarea este mes.'
          : tareasFilter === 'todas'
          ? 'No tienes tareas del coordinador todavía.'
          : '✓ Sin tareas pendientes';
        tareasList.innerHTML = `<div class="text-muted small" style="padding:20px;text-align:center;">${vacio}</div>`;
        if (tareasProgress) tareasProgress.textContent = `${hechas.length} de ${rows.length} completadas`;
        return;
      }
      if (tareasProgress) tareasProgress.textContent = `${hechas.length} de ${rows.length} completadas`;
      tareasList.innerHTML = filtradas.map(t => {
        const done = t.hecha;
        const prBadge = t.prioridad === 'alta' ? 'badge-danger'
                      : t.prioridad === 'media' ? 'badge-warn' : 'badge-info';
        return `
          <div class="li ${done ? 'done' : ''}" data-task="${t.id}" style="${done?'opacity:0.7;':''}">
            <div class="check ${done ? 'done' : ''}">${done ? `<svg class="ic ic-14"><use href="#ic-check"/></svg>` : ''}</div>
            <div class="li-body">
              <div class="li-title" style="${done?'text-decoration:line-through;':''}">${t.titulo}</div>
              <div class="li-sub">${t.descripcion || ''}</div>
              <div class="row gap-1 mt-2">
                <span class="badge ${prBadge}"><span class="dot"></span>${t.prioridad || 'baja'}</span>
                ${t.fecha ? `<span class="badge badge-neutral"><svg class="ic ic-14"><use href="#ic-calendar"/></svg>${new Date(t.fecha).toLocaleDateString('es-ES')}</span>` : ''}
                ${done && t.hecha_el ? `<span class="badge badge-ok"><svg class="ic ic-14"><use href="#ic-check"/></svg>Hecha ${new Date(t.hecha_el).toLocaleDateString('es-ES')}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
      tareasList.querySelectorAll('.li').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.task;
          const t = rows.find(x => x.id === id);
          if (!t) return;
          try {
            await window.sb.from('tareas').update({ hecha: !t.hecha, hecha_el: t.hecha ? null : new Date().toISOString() }).eq('id', id);
            toast(t.hecha ? 'Tarea reabierta' : 'Tarea marcada como hecha');
            renderTareas();
            renderPendientesYCampana();
          } catch (err) { toast('Error: ' + err.message); }
        });
      });
    } catch (err) {
      tareasList.innerHTML = `<div class="text-muted small" style="padding:14px;text-align:center;color:var(--danger);">Error: ${err.message}</div>`;
    }
  }
  document.addEventListener('ps-session-updated', () => setTimeout(renderTareas, 500));
  setTimeout(renderTareas, 1000);

  /* ---------- Pendientes Hoy + Campana notificaciones (real) ---------- */
  async function renderPendientesYCampana() {
    if (!window.sb) return;
    const empId = empleadoReal?.id;
    const puestoId = puestoReal?.id || empleadoReal?.puesto_id;
    let tareasPend = 0, kitAltaPendiente = false;
    let botiquinTotal = 0, botiquinRevHoy = 0;

    if (empId) {
      try {
        const { count } = await window.sb.from('tareas')
          .select('id', { count: 'exact', head: true })
          .eq('empleado_id', empId).eq('hecha', false);
        tareasPend = count || 0;
      } catch (_) {}
      try {
        const { data } = await window.sb.from('firmas_documentos')
          .select('id').eq('empleado_id', empId).eq('documento_codigo', 'kit-alta').limit(1);
        kitAltaPendiente = !data || data.length === 0;
      } catch (_) {}
    }

    // Comprobación por sección: cuántos items de cada sección están revisados HOY.
    // La sección se considera "pendiente" si tiene al menos 1 item y hay al menos 1
    // no revisado hoy. Al día siguiente se resetea sola (ultima_revision es de ayer).
    const stats = { botiquin: { total: 0, rev: 0 }, desa: { total: 0, rev: 0 }, oxigeno: { total: 0, rev: 0 } };
    if (puestoId) {
      try {
        const desdeHoy = new Date();
        desdeHoy.setHours(0, 0, 0, 0);
        const { data } = await window.sb.from('inventario_puesto')
          .select('id, revisado_hoy, ultima_revision, inventario_items(seccion)')
          .eq('puesto_id', puestoId);
        (data || []).forEach(r => {
          const sec = r.inventario_items?.seccion;
          if (!stats[sec]) return;
          stats[sec].total++;
          if (r.revisado_hoy && r.ultima_revision && new Date(r.ultima_revision) >= desdeHoy) stats[sec].rev++;
        });
      } catch (_) {}
    }
    const pend = (s) => s.total > 0 && s.rev < s.total;
    const algunaSeccionPendiente = pend(stats.botiquin) || pend(stats.desa) || pend(stats.oxigeno);

    // Notice tareas
    const noticeTareas = document.getElementById('noticeTareas');
    if (noticeTareas) {
      if (tareasPend > 0) {
        noticeTareas.style.display = '';
        document.getElementById('noticeTareasTitle').textContent =
          `${tareasPend} tarea${tareasPend === 1 ? '' : 's'} del coordinador`;
        document.getElementById('noticeTareasSub').textContent = 'Pulsa para ver el detalle';
      } else {
        noticeTareas.style.display = 'none';
      }
    }

    // Notices independientes por sección (botiquín / DESA / oxigenoterapia)
    const pintarSeccion = (id, subId, s) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (pend(s)) {
        el.style.display = '';
        const sub = document.getElementById(subId);
        if (sub) sub.textContent = s.rev === 0
          ? `Pendiente de revisar hoy · ${s.total} artículos`
          : `${s.rev}/${s.total} marcados · pulsa para completar`;
      } else {
        el.style.display = 'none';
      }
    };
    pintarSeccion('noticeBotiquin', 'noticeBotiquinSub', stats.botiquin);
    pintarSeccion('noticeDesa',     'noticeDesaSub',     stats.desa);
    pintarSeccion('noticeOxigeno',  'noticeOxigenoSub',  stats.oxigeno);

    // Notice Docs pendiente
    const noticeDocs = document.getElementById('noticeDocs');
    if (noticeDocs) noticeDocs.style.display = kitAltaPendiente ? '' : 'none';

    // "Todo al día" cuando no hay ninguna alerta
    const allOk = document.getElementById('noticeAllOk');
    const nadaPendiente = !kitAltaPendiente && tareasPend === 0 && !algunaSeccionPendiente;
    if (allOk) allOk.style.display = nadaPendiente ? '' : 'none';

    // Punto rojo campana (tareas + kit alta pendiente)
    const notifDot = document.getElementById('notifDot');
    if (notifDot) notifDot.style.display = (tareasPend > 0 || kitAltaPendiente) ? '' : 'none';

    // Badge Docs en tabbar (rojo si kit alta pendiente)
    const dot = document.getElementById('docsPendingDot');
    if (dot) dot.style.display = kitAltaPendiente ? '' : 'none';
  }
  document.addEventListener('ps-session-updated', () => setTimeout(renderPendientesYCampana, 700));
  setTimeout(renderPendientesYCampana, 1200);
  setInterval(renderPendientesYCampana, 60_000);

  /* ---------- Métricas mes: días trabajados + horas trabajadas (real de BD) ---------- */
  async function renderMetricasMes() {
    if (!window.sb) return;
    const empId = empleadoReal?.id;
    const elDias = document.getElementById('mesDias');
    const elDiasSub = document.getElementById('mesDiasSub');
    const elHoras = document.getElementById('mesHoras');
    const elHorasSub = document.getElementById('mesHorasSub');
    if (!elDias || !elHoras) return;
    if (!empId) return;
    try {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
      const { data: fichs } = await window.sb.from('fichajes')
        .select('id, tipo, hora').eq('empleado_id', empId)
        .gte('hora', desde).lt('hora', hasta).order('hora', { ascending: true });
      const arr = fichs || [];
      // Días distintos con al menos una entrada
      const diasSet = new Set(arr.filter(f => f.tipo === 'entrada').map(f => new Date(f.hora).toDateString()));
      // Horas: emparejar entrada+salida
      let mins = 0, entrada = null;
      arr.forEach(f => {
        if (f.tipo === 'entrada') entrada = new Date(f.hora);
        else if (f.tipo === 'salida' && entrada) {
          mins += Math.max(0, (new Date(f.hora) - entrada) / 60000);
          entrada = null;
        }
      });
      const horas = Math.round(mins / 60);
      const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long' });
      if (elDias) elDias.textContent = String(diasSet.size);
      if (elDiasSub) elDiasSub.textContent = `en ${nombreMes}`;
      if (elHoras) elHoras.innerHTML = `${horas}<span class="unit">h</span>`;
      if (elHorasSub) elHorasSub.textContent = `en ${nombreMes}`;
    } catch (_) {
      if (elDias) elDias.textContent = '0';
      if (elHoras) elHoras.innerHTML = '0<span class="unit">h</span>';
    }
  }
  document.addEventListener('ps-session-updated', () => setTimeout(renderMetricasMes, 900));
  setTimeout(renderMetricasMes, 1400);
  setInterval(renderMetricasMes, 60_000);

  /* ---------- Ranking de puntualidad del mes ----------
     Compara cada fichaje de ENTRADA con la hora de inicio del turno
     asignado (puestos.hora_inicio_default). Tolerancia: 5 min.
     · A tiempo → fichó a la hora o antes (o hasta 5 min tarde)
     · Tarde   → fichó con más de 5 min de retraso
     Se muestra el % y motivador según nivel. ---------- */
  // Helper: dado un array de horarios y un jsDay (0=domingo, 1=lunes, …, 6=sábado),
  // devuelve el que aplica ese día (o null). Reconoce "Lun-Vie", "L-S",
  // "Lun-Dom", "Dom", "L,M,X,J,V,S,D", "Sábado", etc.
  function horarioAplicaEnDia(horario, jsDay) {
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

  async function renderRankingPuntualidad() {
    const card = document.getElementById('rankingCard');
    if (!card || !window.sb) return;
    const empId = empleadoReal?.id;
    if (!empId) return;
    try {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
      // Traemos entradas del mes + los horarios del socorrista (para saber la
      // hora esperada según día de la semana, no el default único del hotel).
      const [fichsRes, horariosRes] = await Promise.all([
        window.sb.from('fichajes')
          .select('hora, tipo, puesto_id, puestos(hora_inicio_default)')
          .eq('empleado_id', empId).eq('tipo', 'entrada')
          .gte('hora', desde).lt('hora', hasta).order('hora'),
        window.sb.from('horarios')
          .select('puesto_id, hora_inicio, hora_inicio_2, dias, activo, fecha_desde, fecha_hasta')
          .eq('empleado_id', empId).eq('activo', true)
      ]);
      const entradas = fichsRes.data || [];
      const horariosEmp = horariosRes.data || [];
      const totalEntradas = entradas.length;
      if (totalEntradas === 0) {
        card.style.display = 'none';
        return;
      }
      // Cuenta días distintos y cuántas entradas son "a tiempo"
      const TOL_MIN = 5;
      const diasSet = new Set();
      let aTiempo = 0, tarde = 0;
      entradas.forEach(f => {
        const d = new Date(f.hora);
        diasSet.add(d.toDateString());
        // 1) Buscar el horario del socorrista para ese día+puesto
        const jsDay = d.getDay();
        const candidatos = horariosEmp.filter(h =>
          h.puesto_id === f.puesto_id && horarioAplicaEnDia(h, jsDay) &&
          (!h.fecha_desde || new Date(h.fecha_desde) <= d) &&
          (!h.fecha_hasta || new Date(h.fecha_hasta) >= d)
        );
        // 2) Elegir la hora prevista: si hay horario del socorrista, la más cercana
        //    (por si tiene turno partido: hora_inicio o hora_inicio_2). Si no hay,
        //    fallback al hora_inicio_default del puesto.
        let horaTurno = null;
        if (candidatos.length) {
          const opciones = [];
          candidatos.forEach(h => {
            if (h.hora_inicio) opciones.push(h.hora_inicio);
            if (h.hora_inicio_2) opciones.push(h.hora_inicio_2);
          });
          // Elegir la que esté más cerca de la hora del fichaje
          let mejor = null, mejorDiff = Infinity;
          opciones.forEach(hs => {
            const [oh, om] = hs.split(':').map(Number);
            const p = new Date(d); p.setHours(oh, om || 0, 0, 0);
            const diff = Math.abs(d - p);
            if (diff < mejorDiff) { mejorDiff = diff; mejor = hs; }
          });
          horaTurno = mejor;
        }
        if (!horaTurno) horaTurno = (f.puestos && f.puestos.hora_inicio_default) || null;
        if (!horaTurno) return; // sin hora prevista no cuenta
        const [th, tm] = horaTurno.split(':').map(Number);
        const previsto = new Date(d); previsto.setHours(th, tm || 0, 0, 0);
        const diffMin = (d - previsto) / 60000;
        if (diffMin <= TOL_MIN) aTiempo++;
        else tarde++;
      });
      const contados = aTiempo + tarde;
      if (contados === 0) {
        card.style.display = 'none';
        return;
      }
      const pct = Math.round((aTiempo / contados) * 100);
      let titulo, sub, gradFrom, gradTo, borde;
      if (pct >= 95) { titulo = '¡Impecable!'; sub = 'Estás en lo más alto del ranking del equipo 🏆'; gradFrom = '#DCFCE7'; gradTo = '#BBF7D0'; borde = '#059669'; }
      else if (pct >= 85) { titulo = '¡Vas muy bien!'; sub = 'Sigue así, prácticamente ninguna incidencia 👏'; gradFrom = '#DBEAFE'; gradTo = '#BFDBFE'; borde = '#2563EB'; }
      else if (pct >= 70) { titulo = 'Bien, pero puedes mejorar'; sub = 'Intenta llegar unos minutos antes cada día 💪'; gradFrom = '#FEF3C7'; gradTo = '#FDE68A'; borde = '#F59E0B'; }
      else                { titulo = 'Ojo con la puntualidad'; sub = 'Muchos fichajes con retraso — revísalo esta semana ⏰'; gradFrom = '#FEE2E2'; gradTo = '#FECACA'; borde = '#DC2626'; }

      card.style.display = '';
      card.style.background = `linear-gradient(135deg, ${gradFrom}, ${gradTo})`;
      card.style.borderColor = borde;
      document.getElementById('rankingTitulo').textContent = titulo;
      document.getElementById('rankingSub').textContent = sub;
      document.getElementById('rankingPct').innerHTML = pct + '<span style="font-size:16px;">%</span>';
      document.getElementById('rankingDias').textContent = String(diasSet.size);
      document.getElementById('rankingATiempo').textContent = String(aTiempo);
      document.getElementById('rankingTarde').textContent = String(tarde);
    } catch (err) {
      console.warn('[ranking]', err.message);
      card.style.display = 'none';
    }
  }
  document.addEventListener('ps-session-updated', () => setTimeout(renderRankingPuntualidad, 1500));
  setTimeout(renderRankingPuntualidad, 2200);
  setInterval(renderRankingPuntualidad, 120_000);

  /* ---------- Subir mi documentación (socorrista) ---------- */
  let misubidaBlob = null, misubidaTipo = null;
  window.onMisubidaFile = function (e) {
    const f = e.target.files[0];
    if (!f) return;
    const MAX_MB = 20;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast(`Archivo demasiado grande (${(f.size/1048576).toFixed(1)} MB, máx ${MAX_MB} MB)`);
      e.target.value = ''; return;
    }
    misubidaBlob = f;
    misubidaTipo = f.type;
    const btn = document.getElementById('misubidaBtn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Subir "${f.name}" (${(f.size/1048576).toFixed(1)} MB)`;
    }
  };

  window.subirMiDocumento = async function () {
    if (!misubidaBlob) { toast('Elige un archivo primero'); return; }
    const empId = empleadoReal?.id;
    if (!empId) { toast('Aún no tienes ficha creada — contacta con tu coordinador'); return; }
    const tipo = document.getElementById('misubidaTipo').value;
    const notas = document.getElementById('misubidaNotas').value.trim();
    const btn = document.getElementById('misubidaBtn');
    btn.disabled = true;
    btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Subiendo…';
    try {
      const ext = (misubidaBlob.name.split('.').pop() || 'bin').toLowerCase();
      const path = `docs-socorrista/${empId}/${Date.now()}-${tipo}.${ext}`;
      const url = await window.PSStorage.subir(path, misubidaBlob, misubidaBlob.type);
      const { error } = await window.sb.from('documentos_subidos').insert({
        empleado_id: empId,
        subido_por: (window.PS_SESSION||{}).userId || null,
        tipo,
        nombre_archivo: (notas || misubidaBlob.name).substring(0, 200),
        url_storage: url
      });
      if (error) throw error;
      toast('✓ Documento subido y visible para tu coordinador');
      document.getElementById('misubidaFile').value = '';
      document.getElementById('misubidaNotas').value = '';
      misubidaBlob = null;
      btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Subir a mi ficha';
      renderMisSubidas();
    } catch (err) {
      toast('Error: ' + err.message);
      btn.disabled = false;
      btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Reintentar';
    }
  };

  async function renderMisSubidas() {
    const cont = document.getElementById('misubidasList');
    if (!cont) return;
    const empId = empleadoReal?.id;
    if (!empId || !window.sb) { cont.innerHTML = ''; return; }
    try {
      const { data } = await window.sb.from('documentos_subidos')
        .select('id, tipo, nombre_archivo, url_storage, subido_el')
        .eq('empleado_id', empId).order('subido_el', { ascending: false });
      const rows = data || [];
      if (rows.length === 0) { cont.innerHTML = ''; return; }
      cont.innerHTML = '<div class="section-eyebrow" style="margin-top:16px;"><span class="eyebrow">Ya subidos</span></div>' +
        '<div class="list">' + rows.map(r => `
          <a class="li interactive" href="${r.url_storage}" target="_blank" style="text-decoration:none;color:inherit;">
            <div class="li-icon"><svg class="ic ic-18"><use href="#ic-file-text"/></svg></div>
            <div class="li-body">
              <div class="li-title">${r.nombre_archivo}</div>
              <div class="li-sub">${r.tipo} · ${new Date(r.subido_el).toLocaleDateString('es-ES')}</div>
            </div>
            <svg class="ic ic-18 notice-arrow"><use href="#ic-chevron-right"/></svg>
          </a>
        `).join('') + '</div>';
    } catch (_) { cont.innerHTML = ''; }
  }
  document.addEventListener('ps-session-updated', () => setTimeout(renderMisSubidas, 800));
  setTimeout(renderMisSubidas, 1400);

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

  // Cache local del inventario del puesto (cargado de BD)
  let inventarioCache = [];
  let unidadesCache = {};   // { 'botiquin': [{id, nombre, numero}], 'desa': […], 'oxigeno': […] }
  let unidadActiva = {};    // { 'botiquin': id | null, 'desa': id, 'oxigeno': id }

  async function cargarInventarioBD() {
    const puestoId = puestoReal?.id || empleadoReal?.puesto_id;
    if (!puestoId || !window.sb) return;
    try {
      // Con fallback si la columna `unidad_id` aún no existe (BD antigua)
      let data = null, error = null;
      const sel1 = await window.sb.from('inventario_puesto')
        .select('id, stock, minimo, revisado_hoy, ultima_revision, caducidad, carga_bala, item_id, unidad_id, inventario_items(id, nombre, seccion, categoria, unidad, obligatorio, normativa)')
        .eq('puesto_id', puestoId);
      if (sel1.error && /unidad_id|column/i.test(sel1.error.message)) {
        // Fallback: sin unidad_id
        const sel2 = await window.sb.from('inventario_puesto')
          .select('id, stock, minimo, revisado_hoy, ultima_revision, caducidad, carga_bala, item_id, inventario_items(id, nombre, seccion, categoria, unidad, obligatorio, normativa)')
          .eq('puesto_id', puestoId);
        data = sel2.data; error = sel2.error;
      } else {
        data = sel1.data; error = sel1.error;
      }
      if (error) throw error;

      // Traer también las unidades del puesto (para el selector desplegable)
      try {
        const { data: uds } = await window.sb.from('unidades_material')
          .select('id, seccion, nombre, numero')
          .eq('puesto_id', puestoId).eq('activo', true)
          .order('seccion').order('numero');
        unidadesCache = { botiquin: [], desa: [], oxigeno: [] };
        (uds || []).forEach(u => {
          if (unidadesCache[u.seccion]) unidadesCache[u.seccion].push(u);
        });
      } catch (_) { unidadesCache = { botiquin: [], desa: [], oxigeno: [] }; }

      const inicioHoy = new Date(); inicioHoy.setHours(0,0,0,0);
      inventarioCache = (data || []).map(r => {
        const ur = r.ultima_revision ? new Date(r.ultima_revision) : null;
        const revisadoHoy = ur ? ur >= inicioHoy : false;
        return {
          id: r.item_id,
          rowId: r.id,
          unidadId: r.unidad_id || null,
          nombre: r.inventario_items?.nombre || 'Material',
          seccion: r.inventario_items?.seccion || 'botiquin',
          categoria: r.inventario_items?.categoria || '',
          unidad: r.inventario_items?.unidad || 'ud',
          obligatorio: !!r.inventario_items?.obligatorio,
          normativa: r.inventario_items?.normativa || '',
          stock: r.stock || 0,
          minimo: r.minimo || 1,
          revisadoHoy,
          ultimaRevision: ur,
          caducidad: r.caducidad || null,
          cargaBala: r.carga_bala || null
        };
      });

      // Inicializar unidad activa por sección → la primera con items no revisados hoy,
      // o si todas están revisadas la primera a secas.
      ['botiquin','desa','oxigeno'].forEach(sec => {
        if (unidadActiva[sec]) return; // respeta la selección del usuario
        const uds = unidadesCache[sec] || [];
        if (uds.length === 0) return;
        // Buscar la primera unidad con items pendientes
        const pendiente = uds.find(u => {
          const items = inventarioCache.filter(it => it.seccion === sec && it.unidadId === u.id);
          return items.length && items.some(it => !it.revisadoHoy);
        });
        unidadActiva[sec] = (pendiente || uds[0]).id;
      });
    } catch (err) { console.warn('[Inventario BD]', err.message); }
  }

  // Items de una sección — si hay unidad activa, filtra por ella.
  // Compat con BD antigua: items sin unidad_id se muestran siempre en la primera "vista".
  function itemsPorSeccion(sec) {
    const activaId = unidadActiva[sec];
    const uds = unidadesCache[sec] || [];
    // Si no hay unidades cargadas (schema antiguo) o solo hay 1 → devolver todo
    if (uds.length <= 1 || !activaId) {
      return inventarioCache.filter(it => it.seccion === sec);
    }
    // Filtrar por unidad activa; items sin unidad_id se muestran en la unidad #1
    const primeraId = uds[0].id;
    return inventarioCache.filter(it =>
      it.seccion === sec && (it.unidadId === activaId || (!it.unidadId && activaId === primeraId))
    );
  }

  // Todos los items de la sección (sin filtrar por unidad) — usado para calcular
  // "revisada hoy" globalmente para la home
  function itemsPorSeccionGlobal(sec) {
    return inventarioCache.filter(it => it.seccion === sec);
  }

  function alertasAutomaticas() {
    return inventarioCache.filter(it => it.stock < it.minimo);
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
    const total = inventarioCache.length;
    const revisados = inventarioCache.filter(it => it.revisadoHoy).length;
    if (revisionSummary) {
      const nombrePuesto = puestoReal?.nombre || empleadoReal?.puesto?.nombre || 'Tu puesto';
      revisionSummary.textContent = total === 0
        ? `${nombrePuesto} · sin material configurado`
        : `${nombrePuesto} · revisión diaria ${revisados}/${total} comprobados`;
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

    // Selector de UNIDAD si el hotel tiene más de una para esta sección
    // (p.ej. hoteles con 2 botiquines: pool grande vs pool infantil)
    const unidadesSec = unidadesCache[seccionActual] || [];
    let selectorHtml = '';
    if (unidadesSec.length > 1) {
      const opts = unidadesSec.map(u => {
        // Marcar cuáles ya están revisadas hoy (checkmark verde en el label)
        const itemsU = inventarioCache.filter(it => it.seccion === seccionActual && (it.unidadId === u.id || (!it.unidadId && u === unidadesSec[0])));
        const rev = itemsU.filter(it => it.revisadoHoy).length;
        const yaOk = itemsU.length > 0 && rev === itemsU.length;
        const marca = yaOk ? '✓ ' : '';
        return `<option value="${u.id}" ${unidadActiva[seccionActual] === u.id ? 'selected' : ''}>${marca}${u.nombre} (${rev}/${itemsU.length})</option>`;
      }).join('');
      selectorHtml = `
        <div style="padding:12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;margin-bottom:10px;">
          <label style="font-weight:700;font-size:12.5px;color:#1E40AF;display:block;margin-bottom:6px;">📋 Elige cuál estás revisando</label>
          <select id="selectorUnidad" style="width:100%;padding:10px;font-size:14px;border:1px solid #BFDBFE;border-radius:8px;background:#fff;font-weight:600;">
            ${opts}
          </select>
          <div class="small" style="margin-top:4px;color:#1E3A8A;">✓ = ya revisada hoy · aún faltan: ${unidadesSec.filter(u => {
            const its = inventarioCache.filter(it => it.seccion === seccionActual && (it.unidadId === u.id || (!it.unidadId && u === unidadesSec[0])));
            return its.length > 0 && its.some(it => !it.revisadoHoy);
          }).length}</div>
        </div>`;
    }

    if (items.length === 0) {
      inventarioList.innerHTML = selectorHtml + `<div class="alert-strip warn"><svg class="ic ic-16"><use href="#ic-alert"/></svg>No hay material configurado en esta sección para tu puesto.</div>`;
      const sel = document.getElementById('selectorUnidad');
      if (sel) sel.addEventListener('change', e => { unidadActiva[seccionActual] = e.target.value; renderInventario(); });
      return;
    }

    const itemsHTML = items.map(it => {
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
              <div class="inv-bar"><span class="${level}" style="width:${pct}%"></span></div>
            </div>
            <div class="row gap-2 mt-2" style="align-items:center;flex-wrap:wrap;">
              <label class="small text-muted" style="margin:0;">Cantidad actual:</label>
              <button class="btn btn-outline btn-sm inv-minus" data-id="${it.id}" style="padding:4px 10px;font-weight:700;">−</button>
              <input type="number" class="inv-stock-input" data-id="${it.id}" value="${it.stock}" min="0" style="width:70px;text-align:center;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-weight:600;" />
              <button class="btn btn-outline btn-sm inv-plus" data-id="${it.id}" style="padding:4px 10px;font-weight:700;">+</button>
              <span class="small text-muted">${it.unidad} · mín. ${it.minimo}</span>
              <button class="btn btn-primary btn-sm inv-save" data-id="${it.id}" style="margin-left:auto;">
                <svg class="ic ic-14"><use href="#ic-check"/></svg> Guardar
              </button>
            </div>
            ${extra}
          </div>
        </div>
      `;
    }).join('');

    const revCount = items.filter(it => it.revisadoHoy).length;
    const totalCount = items.length;
    const allDone = revCount === totalCount && totalCount > 0;
    // Última revisión de la sección = fecha más reciente entre todos los items
    const ultimaRevSec = items
      .map(it => it.ultimaRevision)
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null;
    const seccionYaRevisadaHoy = allDone && ultimaRevSec;
    const nombreSeccion = SECCION_INFO[seccionActual]?.titulo || seccionActual;

    // Bloque final: cambia según si la sección ya está revisada hoy o no
    inventarioList.innerHTML = selectorHtml + itemsHTML + (seccionYaRevisadaHoy ? `
      <div class="card" style="margin-top:16px;padding:16px;background:#ecfdf5;border:2px solid #10b981;">
        <div style="text-align:center;">
          <div style="font-size:36px;line-height:1;">✅</div>
          <div style="font-weight:800;font-size:16px;margin-top:6px;color:#065F46;">${nombreSeccion} revisado hoy</div>
          <div class="small" style="color:#047857;margin-top:2px;">Última revisión: ${ultimaRevSec.toLocaleString('es-ES', { hour:'2-digit', minute:'2-digit' })} · ${totalCount}/${totalCount} artículos</div>
          <div class="small text-muted" style="margin-top:8px;">Mañana volverá a aparecer la revisión pendiente.</div>
          <button class="btn btn-outline btn-sm" id="btnRevisarOtraVez" style="margin-top:10px;">Revisar de nuevo ahora</button>
        </div>
      </div>` : `
      <div class="card" style="margin-top:16px;padding:14px;background:#fffbeb;border:2px solid #F59E0B;">
        <div style="font-weight:700;font-size:15px;color:#78350F;">Revisión de ${nombreSeccion.toLowerCase()} pendiente</div>
        <div class="small" style="color:#92400E;margin-top:2px;">${revCount} de ${totalCount} artículos marcados. Marca los ticks conforme compruebes cada material. Cuando termines, pulsa <b>Guardar revisión</b>.</div>
        <button class="btn btn-primary btn-lg" id="btnGuardarRevision" style="width:100%;margin-top:12px;background:#B91C1C;">
          <svg class="ic ic-18"><use href="#ic-check-circle"/></svg>
          Guardar revisión de ${nombreSeccion.toLowerCase()}
        </button>
        <div class="small text-muted" style="margin-top:8px;text-align:center;">Se te preguntará por observaciones (opcional) para el coordinador.</div>
      </div>
    `);

    // Selector de unidad (Botiquín 1 / 2 / 3…)
    const selUn = document.getElementById('selectorUnidad');
    if (selUn) selUn.addEventListener('change', e => { unidadActiva[seccionActual] = e.target.value; renderInventario(); });

    // Checkbox revisión diaria (guarda en BD)
    inventarioList.querySelectorAll('.inv-check').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const it = inventarioCache.find(x => x.id === id);
        if (!it) return;
        const nuevo = !it.revisadoHoy;
        it.revisadoHoy = nuevo;
        renderInventario();
        renderRevisionSummary();
        try {
          await window.sb.from('inventario_puesto').update({
            revisado_hoy: nuevo,
            ultima_revision: nuevo ? new Date().toISOString() : null
          }).eq('id', it.rowId);
          if (nuevo) toast(`Revisado ✓ ${it.nombre}`);
        } catch (err) { toast('Error: ' + err.message); }
      });
    });

    // Botones + / − para modificar stock localmente
    inventarioList.querySelectorAll('.inv-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = inventarioList.querySelector(`.inv-stock-input[data-id="${btn.dataset.id}"]`);
        if (inp) inp.value = (parseInt(inp.value) || 0) + 1;
      });
    });
    inventarioList.querySelectorAll('.inv-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = inventarioList.querySelector(`.inv-stock-input[data-id="${btn.dataset.id}"]`);
        if (inp) inp.value = Math.max(0, (parseInt(inp.value) || 0) - 1);
      });
    });

    // Guardar stock editado (persistir en BD)
    inventarioList.querySelectorAll('.inv-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const it = inventarioCache.find(x => x.id === id);
        const inp = inventarioList.querySelector(`.inv-stock-input[data-id="${id}"]`);
        if (!it || !inp) return;
        const nuevoStock = Math.max(0, parseInt(inp.value) || 0);
        btn.disabled = true; btn.innerHTML = '<svg class="ic ic-14"><use href="#ic-signal"/></svg> Guardando…';
        try {
          const { error } = await window.sb.from('inventario_puesto').update({
            stock: nuevoStock,
            revisado_hoy: true,
            ultima_revision: new Date().toISOString()
          }).eq('id', it.rowId);
          if (error) throw error;
          it.stock = nuevoStock;
          it.revisadoHoy = true;
          toast(`✓ ${it.nombre}: ${nuevoStock} ${it.unidad}`);
          renderInventario();
          renderRevisionSummary();
          renderAlertasStock();
        } catch (err) {
          toast('Error: ' + err.message);
          btn.disabled = false;
          btn.innerHTML = '<svg class="ic ic-14"><use href="#ic-check"/></svg> Guardar';
        }
      });
    });

    // ------ Botón "Guardar revisión" de la sección ------
    // Marca TODOS los items del puesto+sección con ultima_revision = ahora,
    // registra observaciones (si las hay) como alerta informativa para el coord,
    // y bloquea el bloque final con "Revisado hoy" hasta el día siguiente.
    const btnGuardar = inventarioList.querySelector('#btnGuardarRevision');
    if (btnGuardar) {
      btnGuardar.addEventListener('click', async () => {
        const parcial = revCount < totalCount;
        const nombreLabel = nombreSeccion.toLowerCase();
        // Preguntar por observaciones (opcional pero recomendado)
        const obs = prompt(
          `Guardar revisión de ${nombreLabel}` +
          (parcial ? `\n\n⚠️ Solo has marcado ${revCount} de ${totalCount} artículos. Se guardará como revisión igualmente. ` : '\n\n') +
          `Observaciones para el coordinador (opcional):\n\nEj: "Todo correcto", "Falta agua oxigenada", "DESA con batería al 30%", "Ambú desgastado"…`, ''
        );
        if (obs === null) return; // cancelado
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<svg class="ic ic-18"><use href="#ic-signal"/></svg> Guardando revisión…';
        try {
          // 1) Sellar ultima_revision de TODOS los items de la sección (aunque no tuvieran tick — la revisión abarca la sección entera)
          const rowIds = items.map(it => it.rowId);
          if (rowIds.length) {
            const { error } = await window.sb.from('inventario_puesto').update({
              revisado_hoy: true,
              ultima_revision: new Date().toISOString()
            }).in('id', rowIds);
            if (error) throw error;
          }
          // 2) Auditar la revisión en revisiones_diarias (quién, cuándo,
          // en qué hotel y unidad, cuántos items ok/total, observaciones).
          // Fallback silencioso si la tabla no existe todavía (sql/20).
          try {
            const puestoIdRev = puestoReal?.id || empleadoReal?.puesto_id || null;
            const unidadIdRev = unidadActiva[seccionActual] || null;
            const empresaIdRev = empleadoReal?.empresa_id || (window.PS_SESSION || {}).empresaId || null;
            if (puestoIdRev && empresaIdRev) {
              const { error: revErr } = await window.sb.from('revisiones_diarias').insert({
                empresa_id: empresaIdRev,
                puesto_id: puestoIdRev,
                unidad_id: unidadIdRev,
                seccion: seccionActual,
                empleado_id: empleadoReal?.id || null,
                empleado_nombre: empleadoReal?.nombre || null,
                items_ok: revCount,
                items_total: totalCount,
                parcial: revCount < totalCount,
                observaciones: obs.trim() || null
              });
              if (revErr) {
                console.warn('[revisión] no se auditó en revisiones_diarias:', revErr.message);
              }
            }
          } catch (auditErr) {
            console.warn('[revisión] auditoría falló (no bloquea):', auditErr.message);
          }
          // 3) Registrar alerta informativa SOLO si hay observaciones (para no ensuciar el feed del coord)
          if (obs.trim()) {
            try {
              const psSes = window.PS_SESSION || {};
              const puestoId = puestoReal?.id || empleadoReal?.puesto_id || null;
              await window.sb.from('alertas').insert({
                empleado_id: empleadoReal?.id || null,
                puesto_id: puestoId,
                tipo: 'otro',
                origen: 'socorrista',
                criticidad: 'baja',
                mensaje: `[Revisión ${nombreSeccion.toUpperCase()}] ${revCount}/${totalCount} artículos · Observaciones: ${obs.trim()}`,
                resuelto: false
              });
            } catch (aErr) {
              console.warn('[revisión] no se pudo notificar observaciones al coord:', aErr.message);
              // No es bloqueante — la revisión ya quedó registrada en inventario_puesto
            }
          }
          // 3) Actualizar cache local: todos revisados hoy
          const nowD = new Date();
          items.forEach(it => { it.revisadoHoy = true; it.ultimaRevision = nowD; });
          toast(`✓ Revisión de ${nombreLabel} guardada`);
          renderInventario();
          renderRevisionSummary();
          // Refrescar el home para que la tarjeta correspondiente desaparezca
          if (typeof renderPendientesYCampana === 'function') renderPendientesYCampana();
        } catch (err) {
          toast('Error guardando la revisión: ' + err.message);
          btnGuardar.disabled = false;
          btnGuardar.innerHTML = `<svg class="ic ic-18"><use href="#ic-check-circle"/></svg> Guardar revisión de ${nombreLabel}`;
        }
      });
    }

    // Botón "Revisar de nuevo ahora" — desbloquea la sección para forzar otra revisión el mismo día.
    // Útil si el coord pide una segunda comprobación en el turno, o si se cambió material.
    const btnOtraVez = inventarioList.querySelector('#btnRevisarOtraVez');
    if (btnOtraVez) {
      btnOtraVez.addEventListener('click', async () => {
        if (!confirm(`¿Volver a revisar ${nombreSeccion.toLowerCase()}? Se resetearán los ticks para esta sección.`)) return;
        try {
          const rowIds = items.map(it => it.rowId);
          if (rowIds.length) {
            await window.sb.from('inventario_puesto').update({
              revisado_hoy: false,
              ultima_revision: null
            }).in('id', rowIds);
          }
          items.forEach(it => { it.revisadoHoy = false; it.ultimaRevision = null; });
          renderInventario();
          renderRevisionSummary();
          if (typeof renderPendientesYCampana === 'function') renderPendientesYCampana();
          toast('Sección desbloqueada — revísala de nuevo');
        } catch (err) { toast('Error: ' + err.message); }
      });
    }
  }

  // Recargar inventario cuando llegue el puesto real
  document.addEventListener('ps-session-updated', async () => {
    setTimeout(async () => {
      await cargarInventarioBD();
      renderTabs();
      renderRevisionSummary();
      renderAlertasStock();
      renderInventario();
    }, 1500);
  });
  setTimeout(async () => {
    await cargarInventarioBD();
    renderTabs();
    renderRevisionSummary();
    renderAlertasStock();
    renderInventario();
  }, 2000);

  document.querySelectorAll('#botiquinTabs .chip-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      seccionActual = btn.dataset.sec;
      renderTabs();
      renderInventario();
    });
  });

  // Salto directo desde la home a la sección concreta pendiente
  window.irARevisarSeccion = function (sec) {
    if (['botiquin','desa','oxigeno'].indexOf(sec) === -1) sec = 'botiquin';
    seccionActual = sec;
    showView('botiquin');
    setTimeout(() => { renderTabs(); renderInventario(); }, 60);
  };

  renderTabs();
  renderRevisionSummary();
  renderAlertasStock();
  renderInventario();

  // Cache de items para el modal reportar + mapa de selección {itemId: cantidad}
  let reportItemsCache = [];
  let reportSelection = {}; // { itemId: qty }

  // Recalcular reporte modal → carga items REALES desde BD del puesto del socorrista
  window.updateReportOptions = async function () {
    const cont = document.getElementById('reportItemList');
    if (!cont || !window.sb) return;
    const puestoId = puestoReal?.id || empleadoReal?.puesto_id;
    if (!puestoId) {
      cont.innerHTML = '<div class="alert-strip warn" style="margin:6px;"><svg class="ic ic-16"><use href="#ic-alert"/></svg>Sin puesto asignado — pide al coordinador tu puesto</div>';
      return;
    }
    cont.innerHTML = '<div class="text-muted small" style="padding:14px;text-align:center;">Cargando material del hotel…</div>';
    try {
      const { data, error } = await window.sb.from('inventario_puesto')
        .select('item_id, stock, minimo, inventario_items(id, nombre, unidad, categoria, seccion)')
        .eq('puesto_id', puestoId);
      if (error) throw error;
      const items = (data || []).sort((a,b) => {
        const ra = a.minimo > 0 ? a.stock/a.minimo : 999;
        const rb = b.minimo > 0 ? b.stock/b.minimo : 999;
        return ra - rb; // bajo mínimo primero
      });
      reportItemsCache = items.map(r => ({
        id: r.inventario_items?.id,
        nombre: r.inventario_items?.nombre || 'Material',
        unidad: r.inventario_items?.unidad || 'ud',
        categoria: r.inventario_items?.categoria || '',
        seccion: r.inventario_items?.seccion || 'botiquin',
        stock: r.stock || 0,
        minimo: r.minimo || 1
      }));
      reportSelection = {}; // resetear selección al recargar
      if (reportItemsCache.length === 0) {
        cont.innerHTML = '<div class="alert-strip warn" style="margin:6px;">No hay inventario configurado para tu puesto</div>';
        return;
      }
      renderReportItemList('');
    } catch (err) {
      cont.innerHTML = `<div class="alert-strip warn" style="margin:6px;">Error: ${err.message}</div>`;
    }
  };

  function actualizarInfoSeleccion() {
    const info = document.getElementById('reportSelectionInfo');
    if (!info) return;
    const ids = Object.keys(reportSelection);
    if (ids.length === 0) {
      info.textContent = 'Sin selección';
      info.style.color = '';
    } else {
      const totalUds = ids.reduce((s, id) => s + (reportSelection[id] || 0), 0);
      info.textContent = `${ids.length} producto${ids.length===1?'':'s'} · ${totalUds} unidades en total`;
      info.style.color = '#059669';
      info.style.fontWeight = '600';
    }
  }

  function renderReportItemList(filtro) {
    const cont = document.getElementById('reportItemList');
    if (!cont) return;
    const q = (filtro || '').toLowerCase().trim();
    const list = q ? reportItemsCache.filter(it => it.nombre.toLowerCase().includes(q) || (it.categoria||'').toLowerCase().includes(q)) : reportItemsCache;
    if (list.length === 0) {
      cont.innerHTML = '<div class="text-muted small" style="padding:14px;text-align:center;">Ningún material coincide con la búsqueda</div>';
      actualizarInfoSeleccion();
      return;
    }
    cont.innerHTML = list.map(it => {
      const bajo = it.stock < it.minimo;
      const sinStock = it.stock === 0;
      const badge = sinStock
        ? '<span class="badge badge-danger"><span class="dot"></span>Sin stock</span>'
        : bajo
        ? '<span class="badge badge-warn"><span class="dot"></span>Bajo mínimo</span>'
        : '';
      const isSel = reportSelection[it.id] != null;
      const qty = isSel ? reportSelection[it.id] : 1;
      return `
        <div class="report-item ${isSel?'selected':''}" data-id="${it.id}"
          style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;margin:4px 0;border:2px solid ${isSel?'#B91C1C':'#e2e8f0'};border-radius:8px;background:${isSel?'#fef2f2':'#fff'};">
          <button type="button" class="rep-check" data-id="${it.id}" title="Marcar / desmarcar"
            style="width:26px;height:26px;border-radius:6px;border:2px solid ${isSel?'#B91C1C':'#cbd5e1'};background:${isSel?'#B91C1C':'#fff'};display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;padding:0;">
            ${isSel?'<svg class="ic ic-16" style="color:#fff;"><use href="#ic-check"/></svg>':''}
          </button>
          <div style="flex:1;min-width:0;cursor:pointer;" class="rep-label" data-id="${it.id}">
            <div style="font-weight:600;font-size:14px;">${it.nombre}</div>
            <div class="small text-muted">Quedan ${it.stock} ${it.unidad} · mín. ${it.minimo} ${badge?' · ':''}</div>
          </div>
          ${badge ? `<div style="flex-shrink:0;">${badge}</div>` : ''}
          <div class="row gap-1" style="align-items:center;flex-shrink:0;${isSel?'':'opacity:0.4;pointer-events:none;'}">
            <button type="button" class="btn btn-outline btn-sm rep-minus" data-id="${it.id}" style="padding:2px 8px;font-weight:700;min-width:28px;">−</button>
            <input type="number" class="rep-qty" data-id="${it.id}" value="${qty}" min="1" style="width:56px;text-align:center;padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-weight:600;" />
            <button type="button" class="btn btn-outline btn-sm rep-plus" data-id="${it.id}" style="padding:2px 8px;font-weight:700;min-width:28px;">+</button>
          </div>
        </div>
      `;
    }).join('');

    // Toggle selección al pulsar checkbox o etiqueta
    const toggle = (id) => {
      if (reportSelection[id] != null) delete reportSelection[id];
      else reportSelection[id] = 1;
      renderReportItemList(document.getElementById('reportSearch')?.value || '');
    };
    cont.querySelectorAll('.rep-check').forEach(b => b.addEventListener('click', () => toggle(b.dataset.id)));
    cont.querySelectorAll('.rep-label').forEach(b => b.addEventListener('click', () => toggle(b.dataset.id)));

    // + / - / input de cantidad (solo para seleccionados)
    cont.querySelectorAll('.rep-plus').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (reportSelection[id] == null) return;
      reportSelection[id] = (reportSelection[id] || 0) + 1;
      const inp = cont.querySelector(`.rep-qty[data-id="${id}"]`);
      if (inp) inp.value = reportSelection[id];
      actualizarInfoSeleccion();
    }));
    cont.querySelectorAll('.rep-minus').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (reportSelection[id] == null) return;
      reportSelection[id] = Math.max(1, (reportSelection[id] || 1) - 1);
      const inp = cont.querySelector(`.rep-qty[data-id="${id}"]`);
      if (inp) inp.value = reportSelection[id];
      actualizarInfoSeleccion();
    }));
    cont.querySelectorAll('.rep-qty').forEach(inp => inp.addEventListener('input', () => {
      const id = inp.dataset.id;
      if (reportSelection[id] == null) return;
      reportSelection[id] = Math.max(1, parseInt(inp.value) || 1);
      actualizarInfoSeleccion();
    }));

    actualizarInfoSeleccion();
  }

  window.filterReportList = function (v) { renderReportItemList(v); };

  setTimeout(updateReportOptions, 1500);
  document.addEventListener('ps-session-updated', () => setTimeout(updateReportOptions, 1000));

  /* ---------- Mensaje al coordinador (socorrista → alerta tipo 'otro') ---------- */
  window.openMsgCoord = function () {
    document.getElementById('msgCoordText').value = '';
    document.getElementById('msgCoordModal').classList.add('open');
  };
  window.closeMsgCoord = () => document.getElementById('msgCoordModal').classList.remove('open');

  window.enviarMsgCoord = async function () {
    const txt = document.getElementById('msgCoordText').value.trim();
    if (!txt) { toast('Escribe un mensaje'); return; }
    const empId = empleadoReal?.id;
    if (!empId) { toast('Aún no tienes ficha creada'); return; }
    const puestoId = puestoReal?.id || empleadoReal?.puesto_id || null;
    try {
      const { error } = await window.sb.from('alertas').insert({
        puesto_id: puestoId,
        empleado_id: empId,
        tipo: 'otro',
        origen: 'socorrista',
        criticidad: 'media',
        mensaje: `[Mensaje de ${empleadoReal?.nombre || 'socorrista'}] ${txt}`,
        resuelto: false
      });
      if (error) throw error;
      closeMsgCoord();
      toast('✓ Mensaje enviado al coordinador');
    } catch (err) { toast('Error: ' + err.message); }
  };

  /* ---------- Modal reportar (guarda alerta REAL en BD + notifica coord) ---------- */
  window.openReportModal = () => {
    const modal = document.getElementById('reportModal');
    if (!modal) { toast('Modal no disponible'); return; }
    // 1) Abrir modal INMEDIATO
    modal.classList.add('open');
    // 2) Cargar items después (async — que no bloquee la apertura)
    const sel = document.getElementById('reportItem');
    if (sel) sel.innerHTML = '<option value="">Cargando material del hotel…</option>';
    setTimeout(() => updateReportOptions(), 50);
  };
  window.closeReportModal = () => document.getElementById('reportModal').classList.remove('open');

  window.submitReport = async function () {
    const ids = Object.keys(reportSelection);
    if (ids.length === 0) { toast('Marca al menos un producto que falte'); return; }
    const puestoId = puestoReal?.id || empleadoReal?.puesto_id;
    const empId = empleadoReal?.id;
    if (!puestoId || !empId) { toast('Aún no tienes puesto asignado. Contacta con el coordinador.'); return; }
    const notas = document.getElementById('reportNotes').value.trim();

    const btn = document.querySelector('#reportModal .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Enviando…'; }

    try {
      // Un INSERT por cada producto seleccionado (para que el coord pueda resolverlos por separado)
      const rows = ids.map(itemId => {
        const it = reportItemsCache.find(x => x.id === itemId);
        const qty = reportSelection[itemId] || 1;
        const nombre = it?.nombre || 'material';
        const criticidad = qty >= 5 ? 'alta' : 'media';
        const mensaje = `Falta ${qty}× ${nombre}${notas ? ' — ' + notas : ''}${puestoReal?.nombre ? ' (' + puestoReal.nombre + ')' : ''}`;
        return {
          puesto_id: puestoId,
          empleado_id: empId,
          item_id: itemId,
          tipo: 'manual',
          origen: 'socorrista',
          criticidad,
          mensaje,
          cantidad_pedida: qty,
          resuelto: false
        };
      });
      const { error } = await window.sb.from('alertas').insert(rows);
      if (error) throw error;
      closeReportModal();
      const totalUds = ids.reduce((s, id) => s + (reportSelection[id] || 0), 0);
      toast(`✓ Aviso enviado · ${ids.length} producto${ids.length===1?'':'s'} (${totalUds} uds). Coordinador y dirección lo verán.`);
      document.getElementById('reportNotes').value = '';
      reportSelection = {};
      const search = document.getElementById('reportSearch');
      if (search) search.value = '';
    } catch (err) {
      toast('Error: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg> Avisar al coordinador'; }
    }
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

  // Cache de firmas reales desde BD (mucho más fiable que localStorage)
  let firmasBDCache = {};
  async function cargarFirmasBD() {
    try {
      const empId = empleadoReal?.id;
      if (!empId || !window.sb) return;
      const { data, error } = await window.sb.from('firmas_documentos')
        .select('*').eq('empleado_id', empId).order('fecha_firma', { ascending: false });
      if (error) throw error;
      const map = {};
      (data || []).forEach(f => {
        // Solo la más reciente por documento_codigo
        if (!map[f.documento_codigo]) {
          map[f.documento_codigo] = {
            completado: true,
            firma: f.firma_nombre,
            dni: f.dni,
            fecha: f.fecha_firma,
            dispositivo: f.dispositivo,
            aceptados: f.aceptados_json || {},
            campos: f.campos_json || {},
            firmaImagen: f.firma_imagen,
            archivoPdfUrl: f.archivo_pdf_url,
            idBD: f.id
          };
        }
      });
      firmasBDCache = map;
    } catch (err) { console.warn('[cargarFirmasBD]', err.message); }
  }
  function misFirmas() {
    // Mezcla: BD (prioridad) + localStorage (fallback si aún no cargó)
    const local = PS.firmasDeSocorrista(me.id) || {};
    return { ...local, ...firmasBDCache };
  }

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

  async function renderDocsHeader() {
    try {
      const firmas = misFirmas();
      const kitOk = !!firmas['kit-alta'];
      // Solo cuenta solicitudes REALES de jornada mensual (tarea pendiente del coord)
      let jornadaPend = 0;
      const empId = empleadoReal?.id;
      if (empId && window.sb) {
        try {
          const { count } = await window.sb.from('tareas')
            .select('id', { count: 'exact', head: true })
            .eq('empleado_id', empId)
            .eq('titulo', 'Firmar registro mensual pendiente')
            .eq('hecha', false);
          jornadaPend = count || 0;
        } catch (_) {}
      }
      const total = (kitOk ? 0 : 1) + jornadaPend;
      const nom = empleadoReal?.nombre || me?.nombre || 'Empleado';
      if (docsSummary) {
        docsSummary.textContent = total === 0
          ? `${nom} · toda la documentación al día`
          : `${nom} · ${total} documento${total>1?'s':''} pendiente${total>1?'s':''} de firmar`;
      }
      if (docsPendingDot) docsPendingDot.style.display = total > 0 ? 'inline-block' : 'none';
      if (docAltaBadge) docAltaBadge.textContent = kitOk ? 'Firmado' : 'Pendiente';
    } catch (err) {
      console.warn('[renderDocsHeader]', err);
      if (docsSummary) docsSummary.textContent = `${empleadoReal?.nombre || me?.nombre || 'Empleado'}`;
    }
  }
  // Fallback: si a los 3 seg sigue en "Cargando…", forzar re-render
  setTimeout(() => {
    if (docsSummary && docsSummary.textContent.startsWith('Cargando')) renderDocsHeader();
  }, 3000);

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

    // 2) Jornadas mensuales — solo REALES de BD.
    // Se muestran: (a) firmadas del historial, (b) solicitud pendiente si admin/coord
    // le pidió firmar (tarea "Firmar registro mensual pendiente"), (c) último día del mes
    // si trabajó al menos un día. NUNCA se inventan meses.
    renderJornadasReales();

    // 3) Baja / finiquito (oculto salvo estado baja)
    if (docsBajaSection) docsBajaSection.style.display = 'none';
  }

  async function renderJornadasReales() {
    if (!docsJornadaList) return;
    docsJornadaList.innerHTML = '<div class="text-muted small" style="padding:10px;">Cargando…</div>';
    const empId = empleadoReal?.id;
    if (!empId || !window.sb) {
      docsJornadaList.innerHTML = '<div class="text-muted small" style="padding:10px;">Sin firmas mensuales aún. Se firma el último día trabajado del mes o cuando tu coordinador te lo solicite.</div>';
      return;
    }
    try {
      // (a) Jornadas ya firmadas
      const { data: firmadas } = await window.sb.from('firmas_documentos')
        .select('id, documento_codigo, fecha_firma, campos_json')
        .eq('empleado_id', empId)
        .like('documento_codigo', 'jornada-%')
        .order('fecha_firma', { ascending: false });
      // (b) Solicitud pendiente del coordinador/admin
      const { data: solic } = await window.sb.from('tareas')
        .select('id, titulo, descripcion, fecha')
        .eq('empleado_id', empId)
        .eq('titulo', 'Firmar registro mensual pendiente')
        .eq('hecha', false)
        .order('fecha', { ascending: false }).limit(1);
      // (c) ¿Hoy es último día del mes? + ¿trabajó algún día este mes?
      const hoy = new Date();
      const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const esUltimoDia = hoy.getDate() === ultimoDiaMes;
      let trabajadoEsteMes = false;
      let codigoMesActual = `jornada-${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
      const yaFirmoEsteMes = (firmadas || []).some(f => f.documento_codigo === codigoMesActual);
      if (esUltimoDia && !yaFirmoEsteMes) {
        const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
        const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
        const { data: f } = await window.sb.from('fichajes')
          .select('id').eq('empleado_id', empId).gte('hora', desde).lt('hora', hasta).limit(1);
        trabajadoEsteMes = (f || []).length > 0;
      }

      docsJornadaList.innerHTML = '';

      // Solicitud pendiente (prioridad máxima)
      const tieneSolicitud = solic && solic.length > 0;
      if (tieneSolicitud) {
        const card = docCard({
          titulo: 'Registro mensual solicitado',
          subtitulo: (solic[0].descripcion || 'Tu coordinador ha solicitado que firmes tu jornada con las horas trabajadas hasta la fecha.'),
          estado: 'warn',
          badge: `<span class="badge badge-warn"><span class="dot"></span>Solicitado</span>`,
          cta: 'Firmar ahora',
          onClick: () => openJornadaSignReal({ codigo: codigoMesActual, motivo: 'solicitud', tareaId: solic[0].id })
        });
        docsJornadaList.appendChild(card);
      }

      // Último día del mes con fichajes → aparece card
      if (esUltimoDia && trabajadoEsteMes && !tieneSolicitud) {
        const nombreMes = hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const card = docCard({
          titulo: `Registro jornada · ${nombreMes}`,
          subtitulo: 'Es el último día del mes y has trabajado. Firma tu registro mensual antes del cierre.',
          estado: 'warn',
          badge: `<span class="badge badge-warn"><span class="dot"></span>Firma hoy</span>`,
          cta: 'Firmar',
          onClick: () => openJornadaSignReal({ codigo: codigoMesActual, motivo: 'cierre-mes' })
        });
        docsJornadaList.appendChild(card);
      }

      // Historial de firmadas
      (firmadas || []).forEach(f => {
        const m = f.documento_codigo.match(/jornada-(\d{4})-(\d{2})/);
        const nombreMes = m
          ? new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
          : f.documento_codigo;
        const c = f.campos_json || {};
        const hh = c.horas_firmadas ? `${c.horas_firmadas}h firmadas` : 'firmado';
        const card = docCard({
          titulo: `Registro jornada · ${nombreMes}`,
          subtitulo: `Firmado el ${new Date(f.fecha_firma).toLocaleDateString('es-ES')} · ${hh}`,
          estado: 'ok',
          badge: `<span class="badge badge-ok"><span class="dot"></span>Firmado</span>`,
          cta: 'Descargar PDF',
          onClick: () => descargarMiJornada(f.id)
        });
        docsJornadaList.appendChild(card);
      });

      // Si no hay nada
      if (docsJornadaList.children.length === 0) {
        docsJornadaList.innerHTML = '<div class="text-muted small" style="padding:10px;">Sin firmas mensuales aún. Se firma el último día trabajado del mes o cuando tu coordinador te lo solicite.</div>';
      }
    } catch (err) {
      console.warn('[renderJornadasReales]', err.message);
      docsJornadaList.innerHTML = '<div class="text-muted small" style="padding:10px;">No se pudo cargar el registro mensual.</div>';
    }
  }

  // Cálculo de semanas ISO del mes (lunes-domingo) con cap 40h/sem.
  // Empareja entrada+salida; agrupa por semana en la que cayó la entrada.
  // Devuelve { semanas:[{lunes, domingo, rangoTxt, dias, horas_reales, horas_firmadas}],
  //           horasReales, horasFirmadas (suma capada), diasTrabajados }
  function calcularSemanasMes(fichajes, anio, mesIdx) {
    const pares = [];
    let entrada = null;
    (fichajes || []).forEach(f => {
      if (f.tipo === 'entrada') entrada = new Date(f.hora);
      else if (f.tipo === 'salida' && entrada) {
        pares.push({ entrada, salida: new Date(f.hora) });
        entrada = null;
      }
    });

    // Devuelve el lunes 00:00 de la semana a la que pertenece la fecha
    const lunesDe = (d) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dia = (x.getDay() + 6) % 7; // 0=lun … 6=dom
      x.setDate(x.getDate() - dia);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

    const mapSem = new Map(); // keyLunesISO -> {lunes, minutos, dias:Set}
    pares.forEach(p => {
      const lun = lunesDe(p.entrada);
      const key = lun.toISOString();
      const mins = Math.max(0, (p.salida - p.entrada) / 60000);
      const dia = p.entrada.toDateString();
      const cur = mapSem.get(key) || { lunes: lun, minutos: 0, dias: new Set() };
      cur.minutos += mins;
      cur.dias.add(dia);
      mapSem.set(key, cur);
    });

    const semanas = Array.from(mapSem.values())
      .sort((a, b) => a.lunes - b.lunes)
      .map(s => {
        const dom = new Date(s.lunes); dom.setDate(dom.getDate() + 6);
        const horas = Math.round(s.minutos / 60);
        return {
          lunes: s.lunes.toISOString().slice(0, 10),
          domingo: dom.toISOString().slice(0, 10),
          rangoTxt: `${fmt(s.lunes)}–${fmt(dom)}`,
          dias: s.dias.size,
          horas_reales: horas,
          horas_firmadas: Math.min(40, horas)
        };
      });

    const horasReales = semanas.reduce((s, x) => s + x.horas_reales, 0);
    const horasFirmadas = semanas.reduce((s, x) => s + x.horas_firmadas, 0);
    const diasTrabajados = semanas.reduce((s, x) => s + x.dias, 0);
    return { semanas, horasReales, horasFirmadas, diasTrabajados };
  }
  window.PSJornada = { calcularSemanasMes };

  // Firmar jornada real (usa el modal docViewModal + canvas + fichajes del mes hasta hoy)
  async function openJornadaSignReal({ codigo, motivo, tareaId }) {
    const empId = empleadoReal?.id;
    if (!empId || !window.sb) { toast('Aún no hay ficha lista'); return; }
    document.getElementById('docViewTitle').textContent = 'Firmar registro mensual';
    document.getElementById('docViewSub').textContent = motivo === 'solicitud'
      ? 'Tu coordinador ha solicitado la firma con las horas trabajadas hasta hoy.'
      : 'Firma tu registro mensual antes del cierre.';
    document.getElementById('docViewModal').classList.add('open');

    // Detectar mes/año del código (formato jornada-YYYY-MM)
    const mm = codigo.match(/jornada-(\d{4})-(\d{2})/);
    const anio = mm ? parseInt(mm[1]) : new Date().getFullYear();
    const mes = mm ? parseInt(mm[2]) - 1 : new Date().getMonth();
    const desde = new Date(anio, mes, 1).toISOString();
    const hastaFin = new Date(anio, mes + 1, 1).toISOString();
    // Para "solicitud" el corte es HOY (horas hasta la fecha); para cierre de mes es fin de mes.
    const hastaCorte = motivo === 'solicitud' ? new Date().toISOString() : hastaFin;

    // Cargar fichajes y calcular horas REALES agrupadas por semana ISO (lunes-domingo)
    // con cap de 40h/sem (las extras no se firman por el trabajador, quedan para admin).
    let semanas = [], horasReales = 0, horasFirmadas = 0, diasTrabajados = 0;
    try {
      const { data: fichajes } = await window.sb.from('fichajes')
        .select('id, tipo, hora').eq('empleado_id', empId)
        .gte('hora', desde).lt('hora', hastaCorte).order('hora', { ascending: true });
      const res = calcularSemanasMes(fichajes || [], anio, mes);
      semanas = res.semanas;
      horasReales = res.horasReales;
      horasFirmadas = res.horasFirmadas;
      diasTrabajados = res.diasTrabajados;
    } catch (_) {}

    const nombreMes = new Date(anio, mes, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const filasSemanas = semanas.length === 0
      ? '<div class="jornada-note small">Este mes aún no tienes ningún fichaje registrado.</div>'
      : semanas.map(s => {
          const cap = s.horas_reales > 40 ? ` <span class="small" style="color:#B45309;">(${s.horas_reales - 40}h extra no firmadas)</span>` : '';
          return `<div class="jornada-row">
            <span>Semana ${s.rangoTxt} · ${s.dias} día${s.dias===1?'':'s'}</span>
            <b>${s.horas_firmadas}h</b>${cap}
          </div>`;
        }).join('');

    document.getElementById('docViewBody').innerHTML = `
      <div class="jornada-summary">
        <div class="jornada-row"><span>Mes</span><b>${nombreMes}</b></div>
        <div class="jornada-row"><span>Días trabajados</span><b>${diasTrabajados}</b></div>
        <div style="margin:8px 0;padding-top:8px;border-top:1px dashed #cbd5e1;"><b>Desglose semanal (cap 40h/sem)</b></div>
        ${filasSemanas}
        <div class="jornada-row total" style="border-top:1px solid #cbd5e1;padding-top:6px;margin-top:6px;">
          <span>Total del mes que firmas</span>
          <b>${horasFirmadas}h ordinarias</b>
        </div>
        ${horasReales > horasFirmadas ? `<div class="jornada-note small">Horas reales trabajadas: ${horasReales}h. Las ${horasReales - horasFirmadas}h de exceso son horas complementarias (solo visibles para tu coordinador en el informe oficial de inspección).</div>` : ''}
      </div>
      <div class="field mt-3">
        <label>Nombre completo</label>
        <input type="text" id="jornada-firma" value="${(empleadoReal?.nombre || me?.nombre || '').replace(/"/g,'&quot;')}" />
      </div>
      <div class="field">
        <label>Firma manuscrita</label>
        <div class="firma-canvas-wrap">
          <canvas id="firmaCanvas" width="500" height="180"></canvas>
          <div class="firma-canvas-hint">Firma aquí dentro con el dedo o ratón</div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" onclick="limpiarFirma()" style="margin-top:8px;">
          <svg class="ic ic-14"><use href="#ic-x"/></svg> Limpiar firma
        </button>
      </div>`;
    document.getElementById('docViewActions').innerHTML = `
      <button class="btn btn-outline" onclick="closeDocView()">Cancelar</button>
      <button class="btn btn-primary" id="btnFirmarJornadaReal">
        <svg class="ic ic-16"><use href="#ic-pen"/></svg> Firmar registro
      </button>`;
    setTimeout(initFirmaCanvas, 60);
    document.getElementById('btnFirmarJornadaReal').addEventListener('click', async () => {
      const nombre = document.getElementById('jornada-firma').value.trim();
      if (!nombre) { toast('Escribe tu nombre completo'); return; }
      if (firmaEstaVacia()) { toast('Firma dentro del recuadro'); return; }
      const firmaImagen = getFirmaImagen();
      const btn = document.getElementById('btnFirmarJornadaReal');
      btn.disabled = true; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-signal"/></svg> Guardando…';
      try {
        const { error } = await window.sb.from('firmas_documentos').insert({
          empleado_id: empId,
          documento_codigo: codigo,
          firma_nombre: nombre,
          dni: empleadoReal?.dni || '',
          dispositivo: 'móvil empleado · registro mensual',
          firma_imagen: firmaImagen,
          ubicacion_lat: ultimaPosicion?.lat || null,
          ubicacion_lng: ultimaPosicion?.lng || null,
          campos_json: { horas_firmadas: horasFirmadas, horas_reales: horasReales, dias_trabajados: diasTrabajados, motivo, semanas }
        });
        if (error) throw error;
        // Cerrar tarea si venía de solicitud
        if (tareaId) {
          try { await window.sb.from('tareas').update({ hecha: true, hecha_el: new Date().toISOString() }).eq('id', tareaId); } catch (_) {}
        }
        closeDocView();
        toast('✓ Registro mensual firmado');
        await cargarFirmasBD();
        renderDocsHeader();
        renderDocsLists();
      } catch (err) {
        toast('Error: ' + err.message);
        btn.disabled = false; btn.innerHTML = '<svg class="ic ic-16"><use href="#ic-pen"/></svg> Firmar registro';
      }
    });
  }
  window.openJornadaSignReal = openJornadaSignReal;

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
          ${sub.textoCompleto ? `
            <div class="wizard-doc-full">${sub.textoCompleto.split('\n').map(l => {
              const t = l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              if (!t.trim()) return '<div class="wizard-doc-blank"></div>';
              if (/^[A-ZÁÉÍÓÚÑ0-9· ,\.\(\)\/]+$/.test(t.trim()) && t.trim().length > 4 && t.trim().length < 90) return `<div class="wizard-doc-h">${t}</div>`;
              return `<div class="wizard-doc-p">${t}</div>`;
            }).join('')}</div>
          ` : ''}
          ${sub.esListaEpis ? (() => {
            const epis = (sub.epis || []).filter(e => (e.tipo || 'epi') === 'epi');
            const uniforme = (sub.epis || []).filter(e => e.tipo === 'uniforme');
            const renderFila = e => {
              const cantGuardada = (wizardData.campos.epis && wizardData.campos.epis[e.id] != null) ? wizardData.campos.epis[e.id] : e.unidades;
              return `<tr>
                <td><b>${e.nombre}</b></td>
                <td>${e.color}</td>
                <td>${e.modelo}</td>
                <td><input type="number" min="0" step="1" class="wiz-epi-input" data-epi="${e.id}" value="${cantGuardada}" style="width:70px;text-align:center;padding:4px 6px;border:1px solid var(--ink-300,#D1D5DB);border-radius:6px;" /></td>
              </tr>`;
            };
            return `
              ${epis.length ? `
                <div class="wizard-doc-h" style="margin-top:14px;color:#B91C1C;">EPIs · Equipos de Protección Individual (RD 773/1997)</div>
                <div class="small text-muted" style="margin-bottom:6px;">Elementos de protección frente a la radiación solar. Uso obligatorio durante el servicio.</div>
                <div class="wizard-epi-table-wrap">
                  <table class="wizard-epi-table">
                    <thead><tr><th>Equipo</th><th>Color</th><th>Modelo</th><th style="width:90px;">Unidades</th></tr></thead>
                    <tbody>${epis.map(renderFila).join('')}</tbody>
                  </table>
                </div>` : ''}
              ${uniforme.length ? `
                <div class="wizard-doc-h" style="margin-top:16px;color:#0F172A;">Uniforme / ropa de trabajo</div>
                <div class="small text-muted" style="margin-bottom:6px;">Ropa identificativa corporativa. Propiedad de la empresa, se devuelve al finalizar el contrato.</div>
                <div class="wizard-epi-table-wrap">
                  <table class="wizard-epi-table">
                    <thead><tr><th>Prenda</th><th>Color</th><th>Modelo</th><th style="width:90px;">Unidades</th></tr></thead>
                    <tbody>${uniforme.map(renderFila).join('')}</tbody>
                  </table>
                </div>` : ''}
              <div class="small text-muted" style="margin-top:8px;">Puedes ajustar las cantidades si te han entregado más o menos unidades de las indicadas.</div>
            `;
          })() : ''}
          ${sub.requiereCampos ? `
            <div class="field mt-3">
              <label>Correo electrónico personal</label>
              <input type="email" id="wiz-emailPersonal" placeholder="tu@correo.com" value="${wizardData.campos.emailPersonal || ''}" />
            </div>
            <div class="field">
              <label>Teléfono móvil personal</label>
              <input type="tel" id="wiz-telefonoPersonal" placeholder="+34 6XX XXX XXX" value="${wizardData.campos.telefonoPersonal || ''}" />
            </div>` : ''}
          ${sub.id === 'ka-vigilancia-salud' ? `
            <div class="wizard-highlight" style="margin-top:14px;background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px;border-radius:6px;">
              <div style="font-weight:700;margin-bottom:10px;">Reconocimiento médico laboral (obligatorio elegir)</div>
              <div class="small" style="margin-bottom:12px;color:#78350F;">Según art. 22 Ley 31/1995 el reconocimiento médico es <b>voluntario</b> salvo los casos exentos indicados en el texto. Indica si deseas o no realizártelo:</div>
              <label style="display:flex;gap:10px;padding:10px;border:2px solid ${wizardData.campos.reconocimientoMedico==='si'?'#059669':'#e2e8f0'};border-radius:8px;background:${wizardData.campos.reconocimientoMedico==='si'?'#ecfdf5':'#fff'};cursor:pointer;margin-bottom:8px;">
                <input type="radio" name="wiz-reconocimiento" value="si" ${wizardData.campos.reconocimientoMedico==='si'?'checked':''} style="margin-top:2px;" />
                <div>
                  <div style="font-weight:600;">SÍ deseo realizarme el reconocimiento médico</div>
                  <div class="small text-muted">Autorizo a la empresa a citarme con PREVIS Gestión de Riesgos S.L.U. para el examen de salud laboral.</div>
                </div>
              </label>
              <label style="display:flex;gap:10px;padding:10px;border:2px solid ${wizardData.campos.reconocimientoMedico==='no'?'#DC2626':'#e2e8f0'};border-radius:8px;background:${wizardData.campos.reconocimientoMedico==='no'?'#fef2f2':'#fff'};cursor:pointer;">
                <input type="radio" name="wiz-reconocimiento" value="no" ${wizardData.campos.reconocimientoMedico==='no'?'checked':''} style="margin-top:2px;" />
                <div>
                  <div style="font-weight:600;">NO deseo realizarme el reconocimiento médico</div>
                  <div class="small text-muted">Renuncio expresamente al reconocimiento voluntario. Esta decisión no exime los reconocimientos obligatorios legalmente establecidos.</div>
                </div>
              </label>
            </div>
          ` : ''}
          <label class="wizard-accept-line">
            <input type="checkbox" id="wiz-accept" ${wizardData.aceptados[sub.id] ? 'checked' : ''} />
            <span>${sub.obligatorio
              ? 'He leído y acepto expresamente este documento.'
              : 'Doy mi consentimiento (opcional, puedo revocarlo en cualquier momento).'}</span>
          </label>
        `,
        obligatorio: sub.obligatorio,
        requiereCampos: sub.requiereCampos,
        esListaEpis: sub.esListaEpis,
        esSaludReconocimiento: sub.id === 'ka-vigilancia-salud'
      })),
      {
        titulo: 'Firma manuscrita',
        subtitulo: 'Firma con el dedo o lápiz digital dentro del recuadro. Vale con firma manuscrita normal.',
        contenido: `
          <div class="wizard-sign-box">
            <div class="wizard-sign-info">
              📅 Fecha: <b>${new Date().toLocaleString('es-ES')}</b><br>
              📱 Desde: <b>Dispositivo del empleado</b> · dispositivo, IP y GPS registrados
            </div>
            <div class="field mt-3">
              <label>Nombre y apellidos</label>
              <input type="text" id="wiz-firma" value="${(empleadoReal?.nombre || me?.nombre || '').replace(/"/g,'&quot;')}" placeholder="Escribe tu nombre completo" />
            </div>
            <div class="field">
              <label>DNI</label>
              <input type="text" id="wiz-dni" value="${(empleadoReal?.dni || '').replace(/"/g,'&quot;')}" placeholder="00000000A" />
            </div>
            <div class="field">
              <label>Firma manuscrita</label>
              <div class="firma-canvas-wrap">
                <canvas id="firmaCanvas" width="600" height="240"></canvas>
                <div class="firma-canvas-hint">Firma aquí dentro con el dedo, lápiz o ratón</div>
              </div>
              <button type="button" class="btn btn-outline btn-sm" onclick="limpiarFirma()" style="margin-top:8px;">
                <svg class="ic ic-14"><use href="#ic-x"/></svg> Limpiar firma
              </button>
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

    // Iniciar canvas de firma si estamos en el paso final
    if (step.esFirma) {
      setTimeout(initFirmaCanvas, 50);
    }
  }

  /* ==== FIRMA MANUSCRITA (canvas) ==== */
  function initFirmaCanvas() {
    const canvas = document.getElementById('firmaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let drawing = false, lastX = 0, lastY = 0;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * canvas.width / rect.width,
        y: (clientY - rect.top) * canvas.height / rect.height
      };
    }
    function start(e) { e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
      lastX = p.x; lastY = p.y;
    }
    function end() { drawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    window.__firmaCanvas = canvas;
  }

  window.limpiarFirma = function () {
    const c = window.__firmaCanvas;
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  };

  function firmaEstaVacia() {
    const c = window.__firmaCanvas;
    if (!c) return true;
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false;
    }
    return true;
  }

  function getFirmaImagen() {
    const c = window.__firmaCanvas;
    return c ? c.toDataURL('image/png') : null;
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
      if (step.esSaludReconocimiento) {
        const radio = document.querySelector('input[name="wiz-reconocimiento"]:checked');
        if (!radio) { toast('Elige SÍ o NO al reconocimiento médico para continuar'); return; }
        wizardData.campos.reconocimientoMedico = radio.value;
      }
      if (step.requiereCampos) {
        const email = document.getElementById('wiz-emailPersonal')?.value.trim();
        const tel = document.getElementById('wiz-telefonoPersonal')?.value.trim();
        if (!email || !tel) { toast('Rellena email y teléfono para continuar'); return; }
        wizardData.campos.emailPersonal = email;
        wizardData.campos.telefonoPersonal = tel;
      }
      if (step.esListaEpis) {
        wizardData.campos.epis = wizardData.campos.epis || {};
        document.querySelectorAll('.wiz-epi-input').forEach(inp => {
          wizardData.campos.epis[inp.dataset.epi] = parseInt(inp.value) || 0;
        });
      }
    }

    if (step.esFirma) {
      const firma = document.getElementById('wiz-firma')?.value.trim();
      const dni = document.getElementById('wiz-dni')?.value.trim();
      if (!firma) { toast('Escribe tu nombre completo para firmar'); return; }
      if (!dni) { toast('Escribe tu DNI para firmar'); return; }
      if (firmaEstaVacia()) { toast('Firma con el dedo dentro del recuadro'); return; }

      const firmaImagen = getFirmaImagen();
      const empleadoId = empleadoReal?.id || me.id;
      const ubicacion = ultimaPosicion || null;

      // Guardar en BD (Supabase) + fallback a localStorage
      (async () => {
        try {
          if (empleadoReal && window.sb) {
            const { error } = await window.sb.from('firmas_documentos').insert({
              empleado_id: empleadoId,
              documento_codigo: 'kit-alta',
              firma_nombre: firma,
              dni,
              dispositivo: 'móvil empleado · ' + (navigator.userAgent.split(' ')[0] || 'web'),
              aceptados_json: wizardData.aceptados,
              campos_json: wizardData.campos,
              firma_imagen: firmaImagen,
              ubicacion_lat: ubicacion?.lat || null,
              ubicacion_lng: ubicacion?.lng || null
            });
            if (error) throw error;
          }
          // Marcar como completada la tarea "Firmar Kit Alta pendiente" si existía
          try {
            await window.sb.from('tareas')
              .update({ hecha: true, hecha_el: new Date().toISOString() })
              .eq('empleado_id', empleadoId)
              .eq('titulo', 'Firmar Kit Alta pendiente');
          } catch (_) {}
          // También en localStorage para respuesta inmediata
          PS.firmarDocumento(me.id, 'kit-alta', {
            completado: true,
            firma, dni,
            dispositivo: 'móvil empleado',
            aceptados: wizardData.aceptados,
            campos: wizardData.campos,
            firmaImagen
          });
          document.getElementById('kitAltaModal').classList.remove('open');
          toast('✓ Kit Alta firmado y guardado en el sistema');
          await cargarFirmasBD();
          renderDocsHeader();
          renderDocsLists();
          // Si vino desde el panel del coord (?kit=1&volver=coord), redirige de vuelta
          try {
            const q = new URLSearchParams(window.location.search);
            if (q.get('volver') === 'coord' || q.get('kit') === '1') {
              setTimeout(() => { window.location.replace('coordinador.html'); }, 1200);
            }
          } catch (_) {}
        } catch (err) {
          toast('Error al guardar la firma: ' + err.message);
        }
      })();
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

  window.wizardLogout = function () {
    const ok = confirm('¿Salir sin firmar? Podrás firmar el Kit Alta más adelante al volver a entrar.');
    if (!ok) return;
    document.getElementById('kitAltaModal').classList.remove('open');
    if (typeof window.logout === 'function') window.logout();
    else window.location.href = 'index.html';
  };

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
    const firmaId = f.idBD;
    const pdfUrl = f.archivoPdfUrl;
    document.getElementById('docViewActions').innerHTML = `
      <button class="btn btn-outline" onclick="closeDocView()">Cerrar</button>
      ${pdfUrl ? `<a class="btn btn-outline" href="${pdfUrl}" target="_blank" style="text-decoration:none;">
        <svg class="ic ic-16"><use href="#ic-download"/></svg> PDF guardado
      </a>` : ''}
      <button class="btn btn-primary" onclick="descargarMiKitAlta('${firmaId || ''}')" style="background:#B91C1C;">
        <svg class="ic ic-16"><use href="#ic-download"/></svg> Descargar PDF firmado
      </button>`;
    document.getElementById('docViewModal').classList.add('open');
  }

  window.descargarMiKitAlta = async function (firmaId) {
    if (!window.PSPdf || !window.sb) { toast('Sistema no disponible'); return; }
    toast('Generando PDF…');
    try {
      let firma = null;
      // Si viene id lo usamos; si no, buscamos la firma kit-alta más reciente del empleado
      if (firmaId) {
        const { data, error } = await window.sb.from('firmas_documentos').select('*').eq('id', firmaId).single();
        if (error) throw error;
        firma = data;
      } else {
        const empId = empleadoReal?.id;
        if (!empId) throw new Error('Tu ficha aún no está cargada. Espera unos segundos y vuelve a intentarlo.');
        const { data, error } = await window.sb.from('firmas_documentos')
          .select('*').eq('empleado_id', empId).eq('documento_codigo', 'kit-alta')
          .order('fecha_firma', { ascending: false }).limit(1);
        if (error) throw error;
        if (!data || !data.length) throw new Error('No se encuentra tu firma del Kit Alta en la BD.');
        firma = data[0];
      }
      const empData = {
        nombre: empleadoReal?.nombre || me.nombre,
        dni: empleadoReal?.dni || firma.dni,
        email: empleadoReal?.email || null,
        telefono: empleadoReal?.telefono || null,
        puesto_nombre: puestoReal?.nombre || null
      };
      const subdocs = (window.PS && PS.kitAltaSubdocs) || [];
      await window.PSPdf.descargar(empData, firma, subdocs, `PoolSafety-KitAlta-${(empData.nombre||'yo').replace(/\s+/g,'_')}.pdf`);
      toast('✓ PDF descargado');
    } catch (err) { toast('Error: ' + err.message); alert('No se pudo descargar el PDF:\n\n' + err.message); }
  };

  window.descargarMiJornada = async function (firmaId, oficial) {
    if (!window.PSPdf || !window.sb) { toast('Sistema no disponible'); return; }
    toast('Generando PDF…');
    try {
      const { data: firma, error } = await window.sb.from('firmas_documentos').select('*').eq('id', firmaId).single();
      if (error) throw error;
      const empData = {
        nombre: empleadoReal?.nombre || me.nombre,
        dni: empleadoReal?.dni || firma.dni,
        puesto_nombre: puestoReal?.nombre || null
      };
      await window.PSPdf.descargar(empData, firma, [], `PoolSafety-Jornada-${firma.documento_codigo}.pdf`);
      toast('✓ PDF descargado');
    } catch (err) { toast('Error: ' + err.message); }
  };

  async function openJornadaSign(d) {
    document.getElementById('docViewTitle').textContent = d.titulo;
    document.getElementById('docViewSub').textContent = 'Firma obligatoria antes del cierre del mes';
    document.getElementById('docViewModal').classList.add('open');

    // Detectar mes de la jornada desde el id: 'jornada-YYYY-MM'
    const mm = d.id.match(/jornada-(\d{4})-(\d{2})/);
    const anio = mm ? parseInt(mm[1]) : new Date().getFullYear();
    const mes = mm ? parseInt(mm[2]) - 1 : new Date().getMonth();
    const desde = new Date(anio, mes, 1).toISOString();
    const hasta = new Date(anio, mes + 1, 1).toISOString();

    // Cargar fichajes reales del mes (silencioso — si no hay, seguimos con objetivo)
    let horasReales = 0, diasTrabajados = 0;
    try {
      const empId = empleadoReal?.id;
      if (empId && window.sb) {
        const { data } = await window.sb.from('fichajes')
          .select('id, tipo, hora')
          .eq('empleado_id', empId)
          .gte('hora', desde).lt('hora', hasta)
          .order('hora', { ascending: true });
        const fichajes = data || [];
        let totalMins = 0, entrada = null;
        fichajes.forEach(f => {
          if (f.tipo === 'entrada') entrada = new Date(f.hora);
          else if (f.tipo === 'salida' && entrada) {
            totalMins += Math.max(0, (new Date(f.hora) - entrada) / 60000);
            entrada = null;
          }
        });
        horasReales = Math.round(totalMins / 60);
        diasTrabajados = new Set(fichajes.filter(f => f.tipo === 'entrada').map(f => new Date(f.hora).toDateString())).size;
      }
    } catch (_) {}

    // Regla del cliente: siempre 40h/sem · 160h/mes; solo mostrar menos si trabajó menos.
    // Si trabajó más de 40h/sem, las extras solo las ve admin — el socorrista firma 160h.
    const OBJ_MES = 160;
    let horasMostradas;
    let mensajeExtra = '';
    if (horasReales <= 0) {
      // Sin fichajes o mes futuro: se firma la jornada estándar
      horasMostradas = OBJ_MES;
    } else if (horasReales < OBJ_MES) {
      horasMostradas = horasReales;
      mensajeExtra = `Trabajaste menos de las 40h/semana (${horasReales}h reales). Firmas por las horas realmente trabajadas.`;
    } else {
      horasMostradas = OBJ_MES;
      mensajeExtra = 'Tú firmas por las 40h/semana ordinarias. Las horas complementarias, si las hay, las ve tu coordinador.';
    }

    document.getElementById('docViewBody').innerHTML = `
      <div class="jornada-summary">
        <div class="jornada-row">
          <span>Horas ordinarias (40h/sem · 160h/mes)</span>
          <b>${horasMostradas}h</b>
        </div>
        ${mensajeExtra ? `<div class="jornada-note small">${mensajeExtra}</div>` : ''}
        <div class="jornada-row total">
          <span>Total del mes</span>
          <b>${horasMostradas}h</b>
        </div>
      </div>
      <div class="field mt-3">
        <label>Firma (nombre completo)</label>
        <input type="text" id="jornada-firma" value="${(empleadoReal?.nombre || me?.nombre || '').replace(/"/g,'&quot;')}" />
      </div>
      <div class="field">
        <label>Firma manuscrita</label>
        <div class="firma-canvas-wrap">
          <canvas id="firmaCanvas" width="500" height="180"></canvas>
          <div class="firma-canvas-hint">Firma aquí dentro con el dedo o ratón</div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" onclick="limpiarFirma()" style="margin-top:8px;">
          <svg class="ic ic-14"><use href="#ic-x"/></svg> Limpiar firma
        </button>
      </div>
      <label class="wizard-accept-line mt-2">
        <input type="checkbox" id="jornada-accept" />
        <span>Confirmo que los datos del registro de jornada son correctos y firmo el documento mensual.</span>
      </label>
    `;
    document.getElementById('docViewActions').innerHTML = `
      <button class="btn btn-outline" onclick="closeDocView()">Cancelar</button>
      <button class="btn btn-primary" onclick="submitJornada('${d.id}', ${horasMostradas}, ${horasReales}, ${diasTrabajados})">
        <svg class="ic ic-16"><use href="#ic-pen"/></svg>
        Firmar jornada
      </button>
    `;
    setTimeout(initFirmaCanvas, 50);
  }

  window.submitJornada = async function (docId, horasFirmadas, horasReales, diasTrabajados) {
    const firma = document.getElementById('jornada-firma')?.value.trim();
    const accept = document.getElementById('jornada-accept')?.checked;
    if (!firma || !accept) { toast('Firma, marca la casilla y dibuja tu firma'); return; }
    if (firmaEstaVacia()) { toast('Dibuja tu firma manuscrita en el recuadro'); return; }

    const firmaImagen = getFirmaImagen();
    const empleadoId = empleadoReal?.id || me.id;

    try {
      if (empleadoReal && window.sb) {
        const { error } = await window.sb.from('firmas_documentos').insert({
          empleado_id: empleadoId,
          documento_codigo: docId,
          firma_nombre: firma,
          dispositivo: 'móvil empleado',
          firma_imagen: firmaImagen,
          ubicacion_lat: ultimaPosicion?.lat || null,
          ubicacion_lng: ultimaPosicion?.lng || null,
          campos_json: {
            horas_firmadas: horasFirmadas || 0,   // lo que ve el trabajador y firma (40h/sem cap)
            horas_reales: horasReales || 0,       // lo real (solo admin)
            dias_trabajados: diasTrabajados || 0
          }
        });
        if (error) throw error;
      }
      PS.firmarDocumento(me.id, docId, { firma, dispositivo: 'móvil empleado', firmaImagen });
      await cargarFirmasBD();
      closeDocView();
      toast('✓ Jornada mensual firmada y guardada');
      renderDocsHeader();
      renderDocsLists();
    } catch (err) {
      toast('Error: ' + err.message);
    }
  };

  window.closeDocView = () => document.getElementById('docViewModal').classList.remove('open');
  window.openDocView = openJornadaSign;

  // Render inicial de docs
  renderDocsHeader();
  renderDocsLists();

  // Al primer login (o si aún no ha firmado kit-alta en BD): mostrar wizard bloqueante.
  // Se ejecuta periódicamente para detectar cuando admin archiva la firma antigua
  // (equivalente a "solicitar nueva firma en la app").
  async function comprobarKitAltaObligatorio(motivo) {
    if (!window.sb) return;
    // Si empleadoReal aún no está, intentamos leer desde auth
    let empId = empleadoReal?.id;
    if (!empId) {
      try {
        const { data: { user } } = await window.sb.auth.getUser();
        if (user) {
          const { data: emp } = await window.sb.from('empleados')
            .select('id').eq('usuario_id', user.id).maybeSingle();
          if (emp) empId = emp.id;
        }
      } catch (_) {}
    }
    if (!empId) return;
    try {
      // Comprobar firma kit-alta existente
      const { data: firmas } = await window.sb.from('firmas_documentos')
        .select('id').eq('empleado_id', empId)
        .eq('documento_codigo', 'kit-alta').limit(1);
      // Comprobar tarea pendiente "Firmar Kit Alta"
      const { data: tareas } = await window.sb.from('tareas')
        .select('id').eq('empleado_id', empId)
        .eq('titulo', 'Firmar Kit Alta pendiente')
        .eq('hecha', false).limit(1);
      const modalEl = document.getElementById('kitAltaModal');
      const yaAbierto = modalEl?.classList.contains('open');
      const sinFirma = !firmas || firmas.length === 0;
      const tienePendiente = tareas && tareas.length > 0;
      // Si vino un coord/dueño con ?kit=1 y YA ha firmado → redirige a coord
      const q = new URLSearchParams(window.location.search);
      if (q.get('kit') === '1' && !sinFirma && !tienePendiente) {
        window.location.replace('coordinador.html');
        return;
      }
      if ((sinFirma || tienePendiente) && !yaAbierto) {
        await cargarFirmasBD();
        renderDocsHeader();
        renderDocsLists();
        setTimeout(() => openKitAltaWizard(), 250);
        if (motivo === 'realtime') toast('📋 Debes firmar tu Kit Alta ahora');
      }
    } catch (_) {}
  }
  window.comprobarKitAltaObligatorio = comprobarKitAltaObligatorio;
  document.addEventListener('ps-session-updated', () => setTimeout(() => comprobarKitAltaObligatorio('session'), 1000));
  setTimeout(() => comprobarKitAltaObligatorio('init'), 1500);

  // Polling cada 10s (antes 30s — muy lento para piloto real)
  setInterval(() => comprobarKitAltaObligatorio('polling'), 10_000);

  // Realtime: escucha cambios de firmas_documentos y tareas del empleado
  // Cuando admin archiva firma o inserta tarea → dispara comprobación INMEDIATA
  async function suscribirRealtimeKit() {
    if (!window.sb || !empleadoReal?.id) {
      setTimeout(suscribirRealtimeKit, 1500);
      return;
    }
    try {
      window.sb.channel('kit-alta-' + empleadoReal.id)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'firmas_documentos', filter: `empleado_id=eq.${empleadoReal.id}` },
          () => setTimeout(() => comprobarKitAltaObligatorio('realtime'), 400))
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tareas', filter: `empleado_id=eq.${empleadoReal.id}` },
          () => setTimeout(() => comprobarKitAltaObligatorio('realtime'), 400))
        .subscribe();
    } catch (err) { console.warn('[Realtime kit-alta]', err.message); }
  }
  document.addEventListener('ps-session-updated', () => setTimeout(suscribirRealtimeKit, 1500));
  setTimeout(suscribirRealtimeKit, 2500);

  // Al recuperar foco de la pestaña (móvil PWA la trae de background)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      comprobarKitAltaObligatorio('visibility');
      cargarFirmasBD().then(() => { renderDocsHeader(); renderDocsLists(); });
    }
  });
  // Al pulsar cualquier tab de la app (por si estaban navegando)
  document.querySelectorAll('.tabbar button').forEach(b => {
    b.addEventListener('click', () => setTimeout(() => comprobarKitAltaObligatorio('tab'), 300));
  });

  /* ==========================================================================
     TITULACIONES Y DOCUMENTACIÓN LABORAL (DNI, SVB, DEA, PRL, contrato…)
     ========================================================================== */

  const titulacionesList = document.getElementById('titulacionesList');

  async function renderMisTitulaciones() {
    if (!titulacionesList) return;
    const empId = empleadoReal?.id;
    if (!empId) {
      titulacionesList.innerHTML = '<div class="tit-empty">Tu ficha aún no está lista en la BD. Contacta con tu coordinador.</div>';
      return;
    }
    titulacionesList.innerHTML = '<div class="tit-empty">Cargando documentación…</div>';
    const items = await window.PSTit.cargar(empId);
    titulacionesList.innerHTML = window.PSTit.renderLista(items, { canEdit: true });
    avisarTitulacionesCaducadas(items);
    // Wire acciones
    titulacionesList.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
      const t = items.find(x => x.id === b.dataset.editar);
      openTitulacionModal(t);
    }));
    titulacionesList.querySelectorAll('[data-eliminar]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este documento?')) return;
      try {
        await window.PSTit.eliminar(b.dataset.eliminar);
        toast('Eliminado');
        renderMisTitulaciones();
      } catch (err) { toast('Error: ' + err.message); }
    }));
  }

  // Aviso destacado en Inicio si tiene titulaciones caducadas o a punto de caducar.
  // Es importante para él: sin la titulación en vigor no puede prestar servicio.
  function avisarTitulacionesCaducadas(items) {
    const cont = document.getElementById('pendientesHoy');
    if (!cont) return;
    let aviso = document.getElementById('noticeTitulaciones');
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const conCaducidad = (items || []).filter(t => t.fecha_caducidad);
    const caducadas = [], proximas = [];
    conCaducidad.forEach(t => {
      const dias = Math.floor((new Date(t.fecha_caducidad) - hoy) / 86400000);
      const nombre = (window.PSTit?.TIPOS[t.tipo]?.label) || t.nombre || 'Documento';
      if (dias < 0) caducadas.push({ nombre, dias });
      else if (dias <= 45) proximas.push({ nombre, dias });
    });

    if (caducadas.length === 0 && proximas.length === 0) {
      if (aviso) aviso.remove();
      return;
    }
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'noticeTitulaciones';
      aviso.className = 'notice interactive';
      aviso.onclick = () => showView('perfil');
      cont.insertBefore(aviso, cont.firstChild); // arriba del todo
    }
    const esCaducada = caducadas.length > 0;
    const lista = esCaducada ? caducadas : proximas;
    aviso.innerHTML = `
      <div class="notice-icon" style="background:${esCaducada ? '#FEE2E2' : '#FEF3C7'};color:${esCaducada ? '#B91C1C' : '#B45309'};">
        <svg class="ic ic-22"><use href="#ic-alert"/></svg>
      </div>
      <div class="notice-body">
        <div class="notice-title" style="color:${esCaducada ? '#B91C1C' : '#B45309'};">
          ${esCaducada
            ? (caducadas.length === 1 ? 'Tienes una titulación caducada' : `Tienes ${caducadas.length} titulaciones caducadas`)
            : (proximas.length === 1 ? 'Una titulación caduca pronto' : `${proximas.length} titulaciones caducan pronto`)}
        </div>
        <div class="notice-sub">
          ${lista.slice(0,2).map(x => x.dias < 0
            ? `${x.nombre} (hace ${Math.abs(x.dias)} d)`
            : `${x.nombre} (en ${x.dias} d)`).join(' · ')}${lista.length > 2 ? ' y más' : ''}
          — avisa a tu coordinador
        </div>
      </div>
      <svg class="ic ic-18 notice-arrow"><use href="#ic-chevron-right"/></svg>`;
  }

  window.openTitulacionModal = function (t) {
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
    reader.onload = ev => {
      document.getElementById('titFileData').value = ev.target.result;
    };
    reader.readAsDataURL(f);
  };

  window.submitTitulacion = async function () {
    const empId = empleadoReal?.id;
    if (!empId) { toast('Tu ficha aún no está cargada'); return; }
    const tipo = document.getElementById('titTipo').value;
    const fileData = document.getElementById('titFileData').value;
    const fileName = document.getElementById('titFile').files[0]?.name || null;
    try {
      await window.PSTit.guardar(empId, {
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
      renderMisTitulaciones();
    } catch (err) { toast('Error: ' + err.message); }
  };

  // Cargar mis titulaciones cuando el empleado esté disponible
  const _origCargarMiFicha = null; // solo por documentar
  // renderMisTitulaciones se llama cuando ya se cargó empleadoReal
  document.addEventListener('ps-session-updated', () => setTimeout(async () => {
    await cargarFirmasBD();
    renderDocsHeader();
    renderDocsLists();
    renderMisTitulaciones();
  }, 400));
  setTimeout(renderMisTitulaciones, 800); // primera carga

  /* ---------- Contactar coordinador (lee usuarios reales de BD) ---------- */
  async function renderContactCoord() {
    const cont = document.getElementById('contactCoordList');
    if (!cont || !window.sb) return;
    try {
      const { data, error } = await window.sb.from('usuarios')
        .select('id, nombre, email, rol, telefono, disponible')
        .in('rol', ['dueno','coordinador'])
        .eq('activo', true)
        .order('rol', { ascending: true })
        .order('nombre', { ascending: true });
      if (error) throw error;
      // Regla: preferimos siempre los COORDINADORES disponibles.
      // Solo si no hay ningún coord disponible, mostramos al administrador
      // como fallback para que el socorrista siempre tenga a quién contactar.
      const activos = (data || []).filter(u => u.disponible !== false);
      const coords = activos.filter(u => u.rol === 'coordinador');
      const admins = activos.filter(u => u.rol === 'dueno');
      const rows = coords.length > 0 ? coords : admins;
      const fallbackAdmin = coords.length === 0 && admins.length > 0;

      if (rows.length === 0) {
        cont.innerHTML = '<div class="li"><div class="li-body"><div class="li-title text-muted">No hay coordinadores ni administración disponibles ahora</div><div class="li-sub">Vuelve a intentarlo más tarde</div></div></div>';
        return;
      }
      // Botón general "Enviar mensaje a coordinador" arriba de la lista
      const btnMsg = `<button class="btn btn-primary btn-block" onclick="openMsgCoord()" style="margin-bottom:10px;">
        <svg class="ic ic-16"><use href="#ic-message"/></svg>
        Enviar mensaje al coordinador
      </button>`;
      // Aviso ámbar si estamos cayendo al admin porque no hay coord disponible
      const avisoFallback = fallbackAdmin ? `
        <div style="padding:10px 12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;font-size:12.5px;color:#78350F;margin-bottom:10px;">
          ⚠️ Ningún coordinador está disponible ahora — te mostramos administración como alternativa.
        </div>` : '';
      cont.innerHTML = btnMsg + avisoFallback + rows.map(u => {
        const rolLabel = u.rol === 'dueno' ? 'Administrador' : 'Coordinador';
        const iniciales = (u.nombre || u.email).split(' ').map(s => s[0]).join('').substring(0,2).toUpperCase();
        const tel = u.telefono ? u.telefono.replace(/\s/g,'') : '';
        return `
        <div class="li">
          <div class="li-icon" style="background:#DCFCE7;color:#166534;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;">${iniciales}</div>
          <div class="li-body">
            <div class="li-title">${u.nombre || u.email.split('@')[0]} · <span class="text-muted" style="font-weight:400;">${rolLabel}</span></div>
            <div class="li-sub">${u.email}${tel ? ' · ' + u.telefono : ''}</div>
          </div>
          ${tel ? `<a href="tel:${tel}" class="btn-icon" title="Llamar" style="text-decoration:none;"><svg class="ic ic-16"><use href="#ic-phone"/></svg></a>` : ''}
          <a href="mailto:${u.email}" class="btn-icon" title="Email" style="text-decoration:none;margin-left:4px;"><svg class="ic ic-16"><use href="#ic-arrow-up-right"/></svg></a>
        </div>`;
      }).join('');
    } catch (err) {
      cont.innerHTML = `<div class="li"><div class="li-body"><div class="li-title text-muted">Error cargando coordinadores</div></div></div>`;
    }
  }
  document.addEventListener('ps-session-updated', () => setTimeout(renderContactCoord, 300));
  setTimeout(renderContactCoord, 900);
  // Refresca cada 2 min para reflejar quién está Libre
  setInterval(renderContactCoord, 120_000);

  /* ==========================================================================
     PARTE DE INCIDENCIA · wizard 6 pasos con silueta + material + firma
     Al enviar: insert incidencias, descuento stock inventario_puesto,
     genera PDF, sube a Storage, guarda url en archivo_pdf_url.
     ========================================================================== */
  const INC_PASOS = [
    { titulo: 'Paso 1 de 7 · Qué ha pasado' },
    { titulo: 'Paso 2 de 7 · Datos de la víctima' },
    { titulo: 'Paso 3 de 7 · Estado y zonas afectadas' },
    { titulo: 'Paso 4 de 7 · Actuación y material usado' },
    { titulo: 'Paso 5 de 7 · Derivación / traslado' },
    { titulo: 'Paso 6 de 7 · Firma del cliente o testigo' },
    { titulo: 'Paso 7 de 7 · Firma del socorrista' }
  ];
  let incState = null; // objeto con todos los datos del parte en curso
  let incPasoActual = 0;

  function incInicializar() {
    incState = {
      fecha_incidente: new Date().toISOString(),
      tipo_incidente: '',
      ubicacion_descripcion: '',
      circunstancias: '',
      testigos: '',
      victima_nombre: '',
      victima_edad: null,
      victima_sexo: '',
      victima_dni: '',
      victima_telefono: '',
      victima_nacionalidad: '',
      victima_hotel_habitacion: '',
      es_menor: false,
      familiar_avisado: false,
      familiar_nombre: '',
      familiar_hora: null,
      consciente: null,
      respira: null,
      sangrado: null,
      dolor_zonas: [],
      observaciones_medicas: '',
      actuacion: '',
      tecnicas_aplicadas: [],
      material_usado: [], // [{item_id, nombre, unidad, cantidad}]
      derivacion: '',
      ambulancia_numero: '',
      ambulancia_hora: null,
      hospital: '',
      firma_nombre: '',
      firma_dni: '',
      firma_imagen: null,
      firma_gps_lat: null,
      firma_gps_lng: null,
      // Segunda firma — cliente atendido / familiar / hotel / otro testigo
      firma_testigo_tipo: '',           // 'victima' | 'familiar' | 'hotel' | 'otro' | 'ninguno'
      firma_testigo_nombre: '',
      firma_testigo_dni: '',
      firma_testigo_relacion: '',
      firma_testigo_imagen: null,
      firma_testigo_motivo_ausencia: ''
    };
  }

  window.abrirNuevaIncidencia = function () {
    if (!empleadoReal) { toast('Espera unos segundos a que cargue tu ficha'); return; }
    incInicializar();
    incState.firma_nombre = empleadoReal.nombre || '';
    incState.firma_dni = empleadoReal.dni || '';
    incPasoActual = 0;
    document.getElementById('incidenciaModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    incRender();
  };
  window.cerrarNuevaIncidencia = function () {
    // Si hay datos rellenos, confirmar antes de perder
    const tieneAlgo = incState && (incState.tipo_incidente || incState.victima_nombre || incState.circunstancias);
    if (tieneAlgo && !confirm('¿Cerrar el parte? Se perderán los datos no enviados.')) return;
    document.getElementById('incidenciaModal').style.display = 'none';
    document.body.style.overflow = '';
    incState = null;
  };

  function incRender() {
    document.getElementById('incTituloPaso').textContent = INC_PASOS[incPasoActual].titulo;
    document.getElementById('incProgressBar').style.width = ((incPasoActual + 1) / INC_PASOS.length * 100).toFixed(0) + '%';
    const body = document.getElementById('incBody');
    const paso = [incPasoQue, incPasoVictima, incPasoEstado, incPasoActuacion, incPasoDerivacion, incPasoFirmaTestigo, incPasoFirma][incPasoActual];
    body.innerHTML = paso();
    incBindPaso();
    document.getElementById('incBtnPrev').style.visibility = incPasoActual === 0 ? 'hidden' : 'visible';
    document.getElementById('incBtnNext').textContent = incPasoActual === INC_PASOS.length - 1 ? '✓ Enviar parte' : 'Siguiente →';
    document.getElementById('incBtnPrev').onclick = () => { incGuardarPasoActual(); if (incPasoActual > 0) { incPasoActual--; incRender(); } };
    document.getElementById('incBtnNext').onclick = () => { if (incGuardarPasoActual({ validar: true })) {
      if (incPasoActual === INC_PASOS.length - 1) return incEnviar();
      incPasoActual++; incRender();
    } };
    // Scroll top del contenido
    document.getElementById('incBody').scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  /* ---------- PASO 1: Qué ha pasado ---------- */
  function incPasoQue() {
    const hotelNombre = puestoReal?.nombre || empleadoReal?.puesto?.nombre || null;
    const hotelZona = puestoReal?.zona || '';
    return `
      <!-- Hotel autodetectado (no editable — se coge del puesto asignado al socorrista) -->
      <div style="padding:10px 12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
        <svg class="ic ic-18" style="color:#1D4ED8;flex-shrink:0;"><use href="#ic-pin"/></svg>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#1E40AF;">Hotel · registrado automáticamente</div>
          <div style="font-size:14.5px;font-weight:700;color:#111827;margin-top:2px;">${hotelNombre || '⚠️ No tienes hotel asignado — habla con el coordinador'}</div>
          ${hotelZona ? `<div style="font-size:12px;color:#64748B;">${hotelZona}</div>` : ''}
        </div>
      </div>

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Tipo de incidencia *</label>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:16px;">
        ${window.PSInc.TIPOS_INCIDENTE.map(t => `
          <label style="display:flex;gap:8px;align-items:center;padding:10px;border:2px solid ${incState.tipo_incidente === t.value ? t.color : '#E2E8F0'};background:${incState.tipo_incidente === t.value ? t.color + '15' : '#fff'};border-radius:10px;cursor:pointer;font-size:13px;">
            <input type="radio" name="inc_tipo" value="${t.value}" ${incState.tipo_incidente === t.value ? 'checked' : ''} style="margin:0;" />
            <span style="font-weight:${incState.tipo_incidente === t.value ? 700 : 500};color:${incState.tipo_incidente === t.value ? t.color : '#334155'};">${t.label}</span>
          </label>
        `).join('')}
      </div>

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">¿Cuándo ocurrió?</label>
      <input type="datetime-local" id="inc_fecha" value="${incState.fecha_incidente.slice(0,16)}"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:14px;" />

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Zona exacta dentro de <b>${hotelNombre || 'el hotel'}</b></label>
      <input type="text" id="inc_ubicacion" value="${incState.ubicacion_descripcion || ''}"
        placeholder="Ej: Piscina infantil, esquina noreste"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:14px;" />

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Circunstancias — cuenta qué pasó *</label>
      <textarea id="inc_circunstancias" rows="5" placeholder="Ej: La víctima resbaló al salir de la piscina. Se golpeó la cabeza contra el bordillo. Testigos ayudaron a incorporarla."
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:14px;resize:vertical;">${incState.circunstancias || ''}</textarea>

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Testigos (opcional)</label>
      <input type="text" id="inc_testigos" value="${incState.testigos || ''}"
        placeholder="Nombres o descripción de quién lo vio"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;" />
    `;
  }

  /* ---------- PASO 2: Víctima ---------- */
  function incPasoVictima() {
    return `
      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Nombre y apellidos *</label>
      <input type="text" id="inc_v_nombre" value="${incState.victima_nombre || ''}"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:12px;" />

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Edad *</label>
          <input type="number" min="0" max="120" id="inc_v_edad" value="${incState.victima_edad || ''}"
            style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;" />
        </div>
        <div>
          <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Sexo</label>
          <select id="inc_v_sexo" style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;">
            <option value="" ${!incState.victima_sexo?'selected':''}>—</option>
            <option value="hombre" ${incState.victima_sexo==='hombre'?'selected':''}>Hombre</option>
            <option value="mujer"  ${incState.victima_sexo==='mujer'?'selected':''}>Mujer</option>
            <option value="otro"   ${incState.victima_sexo==='otro'?'selected':''}>Otro</option>
            <option value="ns"     ${incState.victima_sexo==='ns'?'selected':''}>Prefiere no decir</option>
          </select>
        </div>
      </div>

      <div style="margin-top:12px;">
        <label style="display:flex;gap:8px;align-items:center;padding:10px;background:${incState.es_menor?'#FEF3C7':'#F8FAFC'};border:1px solid ${incState.es_menor?'#F59E0B':'#E2E8F0'};border-radius:8px;cursor:pointer;">
          <input type="checkbox" id="inc_es_menor" ${incState.es_menor?'checked':''} style="width:18px;height:18px;" />
          <span style="font-weight:600;font-size:13.5px;">⚠️ La víctima es menor de edad</span>
        </label>
      </div>

      <label class="field-label" style="font-weight:700;display:block;margin:14px 0 6px;">DNI / Pasaporte</label>
      <input type="text" id="inc_v_dni" value="${incState.victima_dni || ''}"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;" />

      <label class="field-label" style="font-weight:700;display:block;margin:12px 0 6px;">Teléfono de contacto</label>
      <input type="tel" id="inc_v_telefono" value="${incState.victima_telefono || ''}"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;" />

      <label class="field-label" style="font-weight:700;display:block;margin:12px 0 6px;">Nacionalidad</label>
      <input type="text" id="inc_v_nacionalidad" value="${incState.victima_nacionalidad || ''}"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;" />

      <label class="field-label" style="font-weight:700;display:block;margin:12px 0 6px;">Hotel / habitación (si es huésped)</label>
      <input type="text" id="inc_v_hotel_hab" value="${incState.victima_hotel_habitacion || ''}"
        placeholder="Ej: Hab. 214"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;" />

      <div style="margin-top:16px;padding:12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;">
        <label style="display:flex;gap:8px;align-items:center;font-weight:700;font-size:13.5px;color:#1E40AF;">
          <input type="checkbox" id="inc_familia_avisada" ${incState.familiar_avisado?'checked':''} style="width:18px;height:18px;" />
          Se ha avisado a un familiar / responsable
        </label>
        <div id="inc_familia_extra" style="display:${incState.familiar_avisado?'block':'none'};margin-top:8px;">
          <input type="text" id="inc_familia_nombre" value="${incState.familiar_nombre || ''}"
            placeholder="Nombre del familiar avisado"
            style="width:100%;padding:10px;border:1px solid #BFDBFE;border-radius:6px;font-size:13px;margin-bottom:6px;" />
          <input type="time" id="inc_familia_hora" value="${incState.familiar_hora ? new Date(incState.familiar_hora).toTimeString().slice(0,5) : ''}"
            style="width:100%;padding:10px;border:1px solid #BFDBFE;border-radius:6px;font-size:13px;" />
        </div>
      </div>
    `;
  }

  /* ---------- PASO 3: Estado + silueta ---------- */
  function incPasoEstado() {
    const btnBool = (id, campo, textoSi, textoNo) => `
      <div style="margin-bottom:14px;">
        <div class="field-label" style="font-weight:700;margin-bottom:6px;">${textoSi}</div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-bool="${campo}" data-v="true"
            style="flex:1;padding:12px;border-radius:8px;border:2px solid ${incState[campo]===true?'#059669':'#E2E8F0'};background:${incState[campo]===true?'#DCFCE7':'#fff'};font-weight:700;cursor:pointer;color:${incState[campo]===true?'#065F46':'#64748B'};">Sí</button>
          <button type="button" data-bool="${campo}" data-v="false"
            style="flex:1;padding:12px;border-radius:8px;border:2px solid ${incState[campo]===false?'#DC2626':'#E2E8F0'};background:${incState[campo]===false?'#FEE2E2':'#fff'};font-weight:700;cursor:pointer;color:${incState[campo]===false?'#7F1D1D':'#64748B'};">${textoNo}</button>
        </div>
      </div>`;
    return `
      ${btnBool(null, 'consciente', '¿Está consciente?', 'No, inconsciente')}
      ${btnBool(null, 'respira',    '¿Respira?',         'No respira')}
      ${btnBool(null, 'sangrado',   '¿Hay sangrado activo?', 'Sin sangrado')}

      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #F1F5F9;">
        <div class="field-label" style="font-weight:700;margin-bottom:6px;">Zonas afectadas · pulsa donde le duele o tiene lesión</div>
        <div class="chip-tabs" style="margin-bottom:8px;">
          <button type="button" class="chip-tab active" data-inc-side="front">Frontal</button>
          <button type="button" class="chip-tab" data-inc-side="back">Espalda</button>
        </div>
        <div id="inc_silueta_frontal">${window.PSInc.siluetaSVG(incState.dolor_zonas, true, 'front')}</div>
        <div id="inc_silueta_posterior" style="display:none;">${window.PSInc.siluetaSVG(incState.dolor_zonas, true, 'back')}</div>
        <div id="inc_zonas_lista" style="margin-top:8px;padding:8px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;font-size:12.5px;color:#7F1D1D;min-height:32px;">
          ${incState.dolor_zonas.length === 0 ? 'Sin zonas marcadas.' : '<b>Marcadas:</b> ' + incState.dolor_zonas.map(z => window.PSInc.zonaLabel(z)).join(', ')}
        </div>
      </div>

      <label class="field-label" style="font-weight:700;display:block;margin:14px 0 6px;">Observaciones médicas (opcional)</label>
      <textarea id="inc_obs_medicas" rows="3" placeholder="Ej: refiere dolor 7/10, no puede apoyar el pie, náuseas…"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;resize:vertical;">${incState.observaciones_medicas || ''}</textarea>
    `;
  }

  /* ---------- PASO 4: Actuación + material usado ---------- */
  function incPasoActuacion() {
    const materiales = inventarioCache || [];
    return `
      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Qué hiciste (descripción de la actuación) *</label>
      <textarea id="inc_actuacion" rows="4" placeholder="Ej: Se aplicó agua limpia sobre la herida, se comprimió con gasa estéril, se colocó vendaje compresivo. Víctima estable."
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:16px;resize:vertical;">${incState.actuacion || ''}</textarea>

      <div class="field-label" style="font-weight:700;margin-bottom:6px;">Técnicas aplicadas (marca las que uses)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;">
        ${window.PSInc.TECNICAS.map(t => `
          <label style="display:flex;gap:6px;align-items:center;padding:8px;border:1px solid ${incState.tecnicas_aplicadas.includes(t.value)?'#059669':'#E2E8F0'};background:${incState.tecnicas_aplicadas.includes(t.value)?'#DCFCE7':'#fff'};border-radius:6px;font-size:12px;cursor:pointer;">
            <input type="checkbox" data-tec="${t.value}" ${incState.tecnicas_aplicadas.includes(t.value)?'checked':''} style="width:16px;height:16px;" />
            <span>${t.label}</span>
          </label>
        `).join('')}
      </div>

      <div style="padding:12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;margin-bottom:8px;">
        <div style="font-weight:700;font-size:13.5px;color:#78350F;">⚠️ Material del botiquín usado</div>
        <div style="font-size:12px;color:#92400E;margin-top:2px;">Se DESCONTARÁ del stock automáticamente al enviar el parte.</div>
      </div>
      ${materiales.length === 0 ? `
        <div class="text-muted small" style="padding:14px;text-align:center;">No hay inventario cargado. Puedes describir el material usado en las observaciones o volver más tarde.</div>
      ` : `
        <div id="inc_mat_lista" style="max-height:280px;overflow-y:auto;border:1px solid #E2E8F0;border-radius:8px;">
          ${materiales.map(m => {
            const usado = incState.material_usado.find(x => x.item_id === m.id);
            const cant = usado ? usado.cantidad : 0;
            return `
              <div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #F1F5F9;">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;">${m.nombre}</div>
                  <div class="small text-muted">Stock: ${m.stock} ${m.unidad}</div>
                </div>
                <button type="button" data-mat-minus="${m.id}"
                  style="width:32px;height:32px;border-radius:6px;border:1px solid #CBD5E1;background:#fff;font-weight:700;cursor:pointer;">−</button>
                <input type="number" min="0" max="${m.stock}" data-mat-cant="${m.id}" value="${cant}"
                  style="width:56px;text-align:center;padding:6px;border:1px solid #CBD5E1;border-radius:6px;font-weight:700;" />
                <button type="button" data-mat-plus="${m.id}"
                  style="width:32px;height:32px;border-radius:6px;border:1px solid #CBD5E1;background:#fff;font-weight:700;cursor:pointer;">+</button>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;
  }

  /* ---------- PASO 5: Derivación ---------- */
  function incPasoDerivacion() {
    return `
      <div class="field-label" style="font-weight:700;margin-bottom:8px;">¿Cómo termina la atención? *</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
        ${window.PSInc.DERIVACIONES.map(d => `
          <label style="display:flex;gap:10px;align-items:center;padding:12px;border:2px solid ${incState.derivacion === d.value ? d.color : '#E2E8F0'};background:${incState.derivacion === d.value ? d.color + '15' : '#fff'};border-radius:10px;cursor:pointer;">
            <input type="radio" name="inc_deriv" value="${d.value}" ${incState.derivacion === d.value ? 'checked' : ''} />
            <span style="font-weight:${incState.derivacion === d.value ? 700 : 500};font-size:13.5px;color:${incState.derivacion === d.value ? d.color : '#334155'};">${d.label}</span>
          </label>
        `).join('')}
      </div>

      <div id="inc_amb_extra" style="display:${(incState.derivacion === 'ambulancia' || incState.derivacion === 'hospital') ? 'block' : 'none'};padding:14px;background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;">
        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;color:#7F1D1D;">Nº ambulancia / matrícula</label>
        <input type="text" id="inc_amb_num" value="${incState.ambulancia_numero || ''}"
          style="width:100%;padding:10px;border:1px solid #FCA5A5;border-radius:6px;font-size:13.5px;margin-bottom:10px;" />

        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;color:#7F1D1D;">Hora de llegada de la ambulancia</label>
        <input type="time" id="inc_amb_hora" value="${incState.ambulancia_hora ? new Date(incState.ambulancia_hora).toTimeString().slice(0,5) : ''}"
          style="width:100%;padding:10px;border:1px solid #FCA5A5;border-radius:6px;font-size:13.5px;margin-bottom:10px;" />

        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;color:#7F1D1D;">Hospital de destino</label>
        <input type="text" id="inc_hospital" value="${incState.hospital || ''}"
          placeholder="Ej: Hospital Manacor"
          style="width:100%;padding:10px;border:1px solid #FCA5A5;border-radius:6px;font-size:13.5px;" />
      </div>
    `;
  }

  /* ---------- PASO 6: Firma ---------- */
  // Segunda firma: cliente atendido / familiar / responsable hotel / otro
  // testigo. Refuerza el valor probatorio del parte. Puede saltarse indicando
  // por qué no hay firma (víctima inconsciente y sin acompañantes, traslado
  // urgente, etc.).
  function incPasoFirmaTestigo() {
    const tipo = incState.firma_testigo_tipo || '';
    const opciones = [
      { v: 'victima',  txt: 'La persona atendida firma',              sub: 'Recomendado si está consciente y puede firmar', color: '#059669' },
      { v: 'familiar', txt: 'Firma un familiar / acompañante',        sub: 'Cónyuge, hijo/a, amigo, tutor de un menor…',    color: '#2563EB' },
      { v: 'hotel',    txt: 'Firma responsable del hotel / recepción', sub: 'Director, jefe de recepción, encargado de turno', color: '#7C3AED' },
      { v: 'otro',     txt: 'Firma otro testigo',                     sub: 'Bañista, otro socorrista, personal externo…',    color: '#0891B2' },
      { v: 'ninguno',  txt: 'No hay firma posible (justificar abajo)', sub: 'Víctima inconsciente sin acompañantes, traslado urgente…', color: '#DC2626' }
    ];
    return `
      <div style="padding:12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:13.5px;color:#78350F;">Segunda firma como testigo</div>
        <div style="font-size:12.5px;color:#78350F;margin-top:4px;">
          Refuerza legalmente el parte. Preferentemente firma la propia persona atendida; si no puede, un familiar o responsable del hotel.
        </div>
      </div>

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">¿Quién firma?</label>
      <div style="display:grid;gap:8px;margin-bottom:16px;">
        ${opciones.map(o => `
          <label style="display:flex;gap:10px;align-items:flex-start;padding:12px;border:2px solid ${tipo===o.v?o.color:'#E2E8F0'};background:${tipo===o.v?o.color+'15':'#fff'};border-radius:10px;cursor:pointer;">
            <input type="radio" name="inc_test_tipo" value="${o.v}" ${tipo===o.v?'checked':''} style="margin-top:2px;" />
            <div style="flex:1;">
              <div style="font-weight:700;font-size:13.5px;color:${tipo===o.v?o.color:'#111827'};">${o.txt}</div>
              <div style="font-size:12px;color:#64748B;margin-top:2px;">${o.sub}</div>
            </div>
          </label>
        `).join('')}
      </div>

      <div id="inc_test_bloque_datos" style="display:${(tipo && tipo!=='ninguno')?'block':'none'};">
        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Nombre y apellidos del firmante *</label>
        <input type="text" id="inc_test_nombre" value="${incState.firma_testigo_nombre || ''}"
          placeholder="${tipo==='victima' ? (incState.victima_nombre || 'Nombre de la persona atendida') : 'Nombre completo del firmante'}"
          style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:10px;" />

        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">DNI / pasaporte (opcional)</label>
        <input type="text" id="inc_test_dni" value="${incState.firma_testigo_dni || ''}"
          style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:10px;" />

        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">${tipo==='familiar' ? 'Relación con la víctima *' : tipo==='hotel' ? 'Cargo / puesto en el hotel *' : tipo==='otro' ? 'Rol / relación con lo sucedido' : 'Aclaración (opcional)'}</label>
        <input type="text" id="inc_test_relacion" value="${incState.firma_testigo_relacion || ''}"
          placeholder="${tipo==='familiar' ? 'p.ej. Esposa, Padre, Tutor legal' : tipo==='hotel' ? 'p.ej. Director, Jefa de recepción' : tipo==='otro' ? 'p.ej. Bañista testigo, formador externo' : ''}"
          style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:14px;" />

        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Firma dentro del recuadro</label>
        <div style="border:2px dashed #0EA5E9;border-radius:10px;background:#fff;padding:6px;">
          <canvas id="inc_test_canvas" width="560" height="180" style="width:100%;height:180px;background:#fff;touch-action:none;display:block;"></canvas>
        </div>
        <button type="button" onclick="incLimpiarFirmaTestigo()" class="btn btn-outline btn-sm" style="margin-top:8px;">↺ Limpiar firma</button>
      </div>

      <div id="inc_test_bloque_ausencia" style="display:${tipo==='ninguno'?'block':'none'};">
        <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Motivo por el que nadie puede firmar *</label>
        <textarea id="inc_test_motivo" rows="3" placeholder="Ej: La víctima estaba inconsciente y fue trasladada en ambulancia sin acompañantes. La recepción del hotel estaba cerrada."
          style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;resize:vertical;">${incState.firma_testigo_motivo_ausencia || ''}</textarea>
      </div>
    `;
  }

  function incPasoFirma() {
    return `
      <div style="padding:12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:13.5px;color:#1E40AF;">Confirmación del socorrista</div>
        <div style="font-size:12.5px;color:#1E3A8A;margin-top:4px;">
          Al firmar declaras que los datos son ciertos y que has prestado la atención conforme a tu formación (socorrismo acuático).
        </div>
      </div>

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Tu nombre completo</label>
      <input type="text" id="inc_firm_nombre" value="${incState.firma_nombre || ''}"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:10px;" />

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Tu DNI</label>
      <input type="text" id="inc_firm_dni" value="${incState.firma_dni || ''}"
        style="width:100%;padding:12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-bottom:14px;" />

      <label class="field-label" style="font-weight:700;display:block;margin-bottom:6px;">Firma dentro del recuadro</label>
      <div style="border:2px dashed #B91C1C;border-radius:10px;background:#fff;padding:6px;">
        <canvas id="inc_canvas" width="560" height="180" style="width:100%;height:180px;background:#fff;touch-action:none;display:block;"></canvas>
      </div>
      <button type="button" onclick="incLimpiarFirma()" class="btn btn-outline btn-sm" style="margin-top:8px;">↺ Limpiar firma</button>

      <div style="margin-top:14px;padding:12px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;font-size:12.5px;color:#166534;">
        Al pulsar <b>Enviar parte</b>: se guarda en el sistema, se descuenta el material del botiquín, se avisa al coordinador y se genera un PDF descargable.
      </div>
    `;
  }

  /* ---------- Bind listeners de cada paso ---------- */
  function incBindPaso() {
    if (incPasoActual === 0) {
      document.querySelectorAll('input[name="inc_tipo"]').forEach(r => r.addEventListener('change', () => {
        incState.tipo_incidente = r.value; incRender();
      }));
    } else if (incPasoActual === 1) {
      const cbMenor = document.getElementById('inc_es_menor');
      cbMenor?.addEventListener('change', () => { incState.es_menor = cbMenor.checked; incRender(); });
      const cbFam = document.getElementById('inc_familia_avisada');
      cbFam?.addEventListener('change', () => {
        incState.familiar_avisado = cbFam.checked;
        document.getElementById('inc_familia_extra').style.display = cbFam.checked ? 'block' : 'none';
      });
    } else if (incPasoActual === 2) {
      // Botones sí/no
      document.querySelectorAll('button[data-bool]').forEach(b => b.addEventListener('click', () => {
        const c = b.dataset.bool; incState[c] = b.dataset.v === 'true'; incRender();
      }));
      // Toggle silueta frontal/posterior
      document.querySelectorAll('button[data-inc-side]').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('button[data-inc-side]').forEach(x => x.classList.toggle('active', x === b));
        const front = b.dataset.incSide === 'front';
        document.getElementById('inc_silueta_frontal').style.display  = front ? 'block' : 'none';
        document.getElementById('inc_silueta_posterior').style.display = front ? 'none' : 'block';
      }));
      // Silueta editable — engancharSilueta usa delegación y protege duplicados
      ['inc_silueta_frontal', 'inc_silueta_posterior'].forEach(id => {
        window.PSInc.engancharSilueta(document.getElementById(id), incState.dolor_zonas, () => {
          // Solo re-pintar las siluetas y la lista, NO llamar a incBindPaso
          // (evita re-adjuntar todos los listeners del paso)
          const cf = document.getElementById('inc_silueta_frontal');
          const cb = document.getElementById('inc_silueta_posterior');
          if (cf) cf.innerHTML = window.PSInc.siluetaSVG(incState.dolor_zonas, true, 'front');
          if (cb) cb.innerHTML = window.PSInc.siluetaSVG(incState.dolor_zonas, true, 'back');
          const lista = document.getElementById('inc_zonas_lista');
          if (lista) lista.innerHTML = incState.dolor_zonas.length === 0
            ? 'Sin zonas marcadas.'
            : '<b>Marcadas:</b> ' + incState.dolor_zonas.map(z => window.PSInc.zonaLabel(z)).join(', ');
        });
      });
    } else if (incPasoActual === 3) {
      // Técnicas
      document.querySelectorAll('input[data-tec]').forEach(cb => cb.addEventListener('change', () => {
        const v = cb.dataset.tec;
        if (cb.checked && !incState.tecnicas_aplicadas.includes(v)) incState.tecnicas_aplicadas.push(v);
        else if (!cb.checked) incState.tecnicas_aplicadas = incState.tecnicas_aplicadas.filter(x => x !== v);
      }));
      // Materiales
      const actualizarMat = (id, nuevaCant) => {
        const m = (inventarioCache || []).find(x => x.id === id);
        if (!m) return;
        nuevaCant = Math.max(0, Math.min(m.stock, parseInt(nuevaCant) || 0));
        incState.material_usado = incState.material_usado.filter(x => x.item_id !== id);
        if (nuevaCant > 0) {
          incState.material_usado.push({ item_id: id, nombre: m.nombre, unidad: m.unidad, cantidad: nuevaCant });
        }
        const inp = document.querySelector(`input[data-mat-cant="${id}"]`);
        if (inp) inp.value = nuevaCant;
      };
      document.querySelectorAll('button[data-mat-plus]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.matPlus;
        const inp = document.querySelector(`input[data-mat-cant="${id}"]`);
        actualizarMat(id, (parseInt(inp.value) || 0) + 1);
      }));
      document.querySelectorAll('button[data-mat-minus]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.matMinus;
        const inp = document.querySelector(`input[data-mat-cant="${id}"]`);
        actualizarMat(id, (parseInt(inp.value) || 0) - 1);
      }));
      document.querySelectorAll('input[data-mat-cant]').forEach(inp => inp.addEventListener('change', () => {
        actualizarMat(inp.dataset.matCant, inp.value);
      }));
    } else if (incPasoActual === 4) {
      document.querySelectorAll('input[name="inc_deriv"]').forEach(r => r.addEventListener('change', () => {
        incState.derivacion = r.value; incRender();
      }));
    } else if (incPasoActual === 5) {
      // Radio elegir quién firma como testigo
      document.querySelectorAll('input[name="inc_test_tipo"]').forEach(r => r.addEventListener('change', () => {
        // Guardar lo tecleado del bloque actual antes de re-render
        const nomEl = document.getElementById('inc_test_nombre');
        const dniEl = document.getElementById('inc_test_dni');
        const relEl = document.getElementById('inc_test_relacion');
        const motEl = document.getElementById('inc_test_motivo');
        if (nomEl) incState.firma_testigo_nombre = nomEl.value.trim();
        if (dniEl) incState.firma_testigo_dni = dniEl.value.trim();
        if (relEl) incState.firma_testigo_relacion = relEl.value.trim();
        if (motEl) incState.firma_testigo_motivo_ausencia = motEl.value.trim();
        incState.firma_testigo_tipo = r.value;
        // Autocompletar nombre víctima si eligió "víctima firma"
        if (r.value === 'victima' && !incState.firma_testigo_nombre && incState.victima_nombre) {
          incState.firma_testigo_nombre = incState.victima_nombre;
        }
        if (r.value === 'victima' && !incState.firma_testigo_dni && incState.victima_dni) {
          incState.firma_testigo_dni = incState.victima_dni;
        }
        incRender();
      }));
      // Canvas firma testigo (si hay bloque visible)
      if (incState.firma_testigo_tipo && incState.firma_testigo_tipo !== 'ninguno') {
        setTimeout(incInitCanvasTestigo, 50);
      }
    } else if (incPasoActual === 6) {
      // Canvas firma socorrista
      setTimeout(incInitCanvasFirma, 50);
    }
  }

  /* ---------- Canvas firma ---------- */
  let incCanvasCtx = null, incFirmaVacia = true;
  function incInitCanvasFirma() {
    const canvas = document.getElementById('inc_canvas');
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = 180 * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    incCanvasCtx = ctx;
    incFirmaVacia = !incState.firma_imagen;
    if (incState.firma_imagen) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.offsetWidth, 180);
      img.src = incState.firma_imagen;
    }
    let dib = false, lastX = 0, lastY = 0;
    const start = (x, y) => { dib = true; lastX = x; lastY = y; incFirmaVacia = false; };
    const move  = (x, y) => {
      if (!dib) return;
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke();
      lastX = x; lastY = y;
    };
    const end = () => { dib = false; };
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return [t.clientX - r.left, t.clientY - r.top];
    };
    canvas.addEventListener('mousedown', e => { const [x,y] = pos(e); start(x,y); });
    canvas.addEventListener('mousemove', e => { const [x,y] = pos(e); move(x,y); });
    canvas.addEventListener('mouseup',   end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); const [x,y] = pos(e); start(x,y); });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); const [x,y] = pos(e); move(x,y); });
    canvas.addEventListener('touchend',   e => { e.preventDefault(); end(); });
  }
  window.incLimpiarFirma = function () {
    const canvas = document.getElementById('inc_canvas');
    if (!canvas || !incCanvasCtx) return;
    incCanvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    incFirmaVacia = true;
    incState.firma_imagen = null;
  };

  // Canvas del testigo (paso 6). Mismo comportamiento que el del socorrista
  // pero con su propio ctx y bandera.
  let incTestCanvasCtx = null, incTestFirmaVacia = true;
  function incInitCanvasTestigo() {
    const canvas = document.getElementById('inc_test_canvas');
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = 180 * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#0EA5E9'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    incTestCanvasCtx = ctx;
    incTestFirmaVacia = !incState.firma_testigo_imagen;
    if (incState.firma_testigo_imagen) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.offsetWidth, 180);
      img.src = incState.firma_testigo_imagen;
    }
    let dib = false, lastX = 0, lastY = 0;
    const start = (x, y) => { dib = true; lastX = x; lastY = y; incTestFirmaVacia = false; };
    const move  = (x, y) => {
      if (!dib) return;
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke();
      lastX = x; lastY = y;
    };
    const end = () => { dib = false; };
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return [t.clientX - r.left, t.clientY - r.top];
    };
    canvas.addEventListener('mousedown', e => { const [x,y] = pos(e); start(x,y); });
    canvas.addEventListener('mousemove', e => { const [x,y] = pos(e); move(x,y); });
    canvas.addEventListener('mouseup',   end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); const [x,y] = pos(e); start(x,y); });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); const [x,y] = pos(e); move(x,y); });
    canvas.addEventListener('touchend',   e => { e.preventDefault(); end(); });
  }
  window.incLimpiarFirmaTestigo = function () {
    const canvas = document.getElementById('inc_test_canvas');
    if (!canvas || !incTestCanvasCtx) return;
    incTestCanvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    incTestFirmaVacia = true;
    incState.firma_testigo_imagen = null;
  };

  /* ---------- Guardar valores del paso actual en incState ---------- */
  function incGuardarPasoActual({ validar } = {}) {
    if (incPasoActual === 0) {
      incState.fecha_incidente = document.getElementById('inc_fecha')?.value ? new Date(document.getElementById('inc_fecha').value).toISOString() : incState.fecha_incidente;
      incState.ubicacion_descripcion = document.getElementById('inc_ubicacion')?.value.trim() || '';
      incState.circunstancias = document.getElementById('inc_circunstancias')?.value.trim() || '';
      incState.testigos = document.getElementById('inc_testigos')?.value.trim() || '';
      if (validar) {
        if (!incState.tipo_incidente) { toast('Selecciona el tipo de incidencia'); return false; }
        if (!incState.circunstancias) { toast('Cuenta brevemente qué pasó'); return false; }
      }
    } else if (incPasoActual === 1) {
      incState.victima_nombre = document.getElementById('inc_v_nombre')?.value.trim() || '';
      const ed = document.getElementById('inc_v_edad')?.value;
      incState.victima_edad = ed ? parseInt(ed) : null;
      incState.victima_sexo = document.getElementById('inc_v_sexo')?.value || '';
      incState.victima_dni = document.getElementById('inc_v_dni')?.value.trim() || '';
      incState.victima_telefono = document.getElementById('inc_v_telefono')?.value.trim() || '';
      incState.victima_nacionalidad = document.getElementById('inc_v_nacionalidad')?.value.trim() || '';
      incState.victima_hotel_habitacion = document.getElementById('inc_v_hotel_hab')?.value.trim() || '';
      incState.familiar_nombre = document.getElementById('inc_familia_nombre')?.value.trim() || '';
      const fh = document.getElementById('inc_familia_hora')?.value;
      if (fh) { const d = new Date(); const [h,m] = fh.split(':'); d.setHours(+h,+m,0,0); incState.familiar_hora = d.toISOString(); }
      if (validar) {
        if (!incState.victima_nombre) { toast('Escribe el nombre de la víctima'); return false; }
        if (!incState.victima_edad && incState.victima_edad !== 0) { toast('Indica la edad'); return false; }
      }
    } else if (incPasoActual === 2) {
      incState.observaciones_medicas = document.getElementById('inc_obs_medicas')?.value.trim() || '';
      // consciente/respira/sangrado ya se guardan por click
    } else if (incPasoActual === 3) {
      incState.actuacion = document.getElementById('inc_actuacion')?.value.trim() || '';
      if (validar && !incState.actuacion) { toast('Describe qué hiciste'); return false; }
    } else if (incPasoActual === 4) {
      incState.ambulancia_numero = document.getElementById('inc_amb_num')?.value.trim() || '';
      const ah = document.getElementById('inc_amb_hora')?.value;
      if (ah) { const d = new Date(); const [h,m] = ah.split(':'); d.setHours(+h,+m,0,0); incState.ambulancia_hora = d.toISOString(); }
      incState.hospital = document.getElementById('inc_hospital')?.value.trim() || '';
      if (validar && !incState.derivacion) { toast('Elige cómo termina la atención'); return false; }
    } else if (incPasoActual === 5) {
      // Paso segunda firma (cliente / familiar / hotel / otro / ninguno)
      incState.firma_testigo_nombre = document.getElementById('inc_test_nombre')?.value.trim() || '';
      incState.firma_testigo_dni = document.getElementById('inc_test_dni')?.value.trim() || '';
      incState.firma_testigo_relacion = document.getElementById('inc_test_relacion')?.value.trim() || '';
      incState.firma_testigo_motivo_ausencia = document.getElementById('inc_test_motivo')?.value.trim() || '';
      const canvasT = document.getElementById('inc_test_canvas');
      if (canvasT && !incTestFirmaVacia) incState.firma_testigo_imagen = canvasT.toDataURL('image/png');
      if (validar) {
        if (!incState.firma_testigo_tipo) { toast('Elige quién firma (o "No hay firma posible" si nadie puede)'); return false; }
        if (incState.firma_testigo_tipo === 'ninguno') {
          if (!incState.firma_testigo_motivo_ausencia) { toast('Explica por qué nadie ha podido firmar'); return false; }
        } else {
          if (!incState.firma_testigo_nombre) { toast('Escribe el nombre del firmante'); return false; }
          if ((incState.firma_testigo_tipo === 'familiar' || incState.firma_testigo_tipo === 'hotel') && !incState.firma_testigo_relacion) {
            toast(incState.firma_testigo_tipo === 'familiar' ? 'Indica la relación con la víctima' : 'Indica el cargo en el hotel');
            return false;
          }
          if (incTestFirmaVacia || !incState.firma_testigo_imagen) { toast('Firma en el recuadro'); return false; }
        }
      }
    } else if (incPasoActual === 6) {
      incState.firma_nombre = document.getElementById('inc_firm_nombre')?.value.trim() || '';
      incState.firma_dni = document.getElementById('inc_firm_dni')?.value.trim() || '';
      const canvas = document.getElementById('inc_canvas');
      if (canvas && !incFirmaVacia) incState.firma_imagen = canvas.toDataURL('image/png');
      if (validar) {
        if (!incState.firma_nombre) { toast('Escribe tu nombre'); return false; }
        if (!incState.firma_dni)    { toast('Escribe tu DNI'); return false; }
        if (incFirmaVacia || !incState.firma_imagen) { toast('Firma en el recuadro'); return false; }
      }
    }
    return true;
  }

  /* ---------- Enviar parte ---------- */
  async function incEnviar() {
    const btn = document.getElementById('incBtnNext');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const psSes = window.PS_SESSION || {};
      const puestoId = puestoReal?.id || empleadoReal?.puesto_id || null;

      // empresa_id: puede no estar en la sesión. Si no está, la buscamos de la BD.
      // Es imprescindible: la policy de INSERT lo requiere.
      let empresaId = psSes.empresaId || empleadoReal?.empresa_id || null;
      if (!empresaId && psSes.userId) {
        try {
          const { data: u } = await window.sb.from('usuarios').select('empresa_id').eq('id', psSes.userId).single();
          empresaId = u?.empresa_id || null;
        } catch (_) {}
      }
      if (!empresaId && empleadoReal?.id) {
        try {
          const { data: e } = await window.sb.from('empleados').select('empresa_id').eq('id', empleadoReal.id).single();
          empresaId = e?.empresa_id || null;
        } catch (_) {}
      }
      if (!empresaId) {
        alert('No se ha podido determinar tu empresa. Cierra sesión y vuelve a entrar. Si sigue fallando avisa al coordinador.');
        btn.disabled = false; btn.textContent = '✓ Enviar parte';
        return;
      }
      if (!empleadoReal?.id) {
        alert('Tu ficha de empleado no está cargada. Espera unos segundos y vuelve a intentarlo.');
        btn.disabled = false; btn.textContent = '✓ Enviar parte';
        return;
      }

      const payload = {
        empresa_id: empresaId,
        empleado_id: empleadoReal?.id || null,
        puesto_id: puestoId,
        fecha_incidente: incState.fecha_incidente || new Date().toISOString(),
        victima_nombre: incState.victima_nombre,
        victima_edad: incState.victima_edad,
        victima_sexo: incState.victima_sexo || null,
        victima_dni: incState.victima_dni || null,
        victima_telefono: incState.victima_telefono || null,
        victima_nacionalidad: incState.victima_nacionalidad || null,
        victima_hotel_habitacion: incState.victima_hotel_habitacion || null,
        es_menor: !!incState.es_menor,
        familiar_avisado: !!incState.familiar_avisado,
        familiar_hora: incState.familiar_hora,
        familiar_nombre: incState.familiar_nombre || null,
        tipo_incidente: incState.tipo_incidente,
        ubicacion_descripcion: incState.ubicacion_descripcion || null,
        circunstancias: incState.circunstancias,
        testigos: incState.testigos || null,
        consciente: incState.consciente,
        respira: incState.respira,
        sangrado: incState.sangrado,
        dolor_zonas: incState.dolor_zonas,
        observaciones_medicas: incState.observaciones_medicas || null,
        actuacion: incState.actuacion,
        tecnicas_aplicadas: incState.tecnicas_aplicadas,
        material_usado: incState.material_usado,
        derivacion: incState.derivacion || null,
        ambulancia_numero: incState.ambulancia_numero || null,
        ambulancia_hora: incState.ambulancia_hora,
        hospital: incState.hospital || null,
        firma_nombre: incState.firma_nombre,
        firma_dni: incState.firma_dni,
        firma_imagen: incState.firma_imagen,
        firma_gps_lat: ultimaPosicion?.lat || null,
        firma_gps_lng: ultimaPosicion?.lng || null,
        firma_testigo_tipo: incState.firma_testigo_tipo || null,
        firma_testigo_nombre: incState.firma_testigo_nombre || null,
        firma_testigo_dni: incState.firma_testigo_dni || null,
        firma_testigo_relacion: incState.firma_testigo_relacion || null,
        firma_testigo_imagen: incState.firma_testigo_imagen || null,
        firma_testigo_motivo_ausencia: incState.firma_testigo_motivo_ausencia || null,
        dispositivo: 'móvil socorrista',
        estado: 'firmada'
      };
      // Fallback: si las columnas nuevas no existen aún (sql/18 sin ejecutar),
      // reintentamos sin ellas para no bloquear el parte entero.
      let ins, error;
      const primerTry = await window.sb.from('incidencias').insert(payload).select().single();
      ins = primerTry.data; error = primerTry.error;
      if (error && /firma_testigo_/i.test(error.message)) {
        console.warn('[incidencia] sql/18 no ejecutado — guardo sin segunda firma');
        Object.keys(payload).forEach(k => { if (k.startsWith('firma_testigo_')) delete payload[k]; });
        const segundoTry = await window.sb.from('incidencias').insert(payload).select().single();
        ins = segundoTry.data; error = segundoTry.error;
      }
      if (error) throw error;

      // Descontar material del stock (via RPC si existe, si no update en cliente)
      if (incState.material_usado.length && puestoId) {
        try {
          await window.sb.rpc('descontar_material_incidencia', { p_puesto_id: puestoId, p_material: incState.material_usado });
        } catch (rpcErr) {
          // Fallback: update por cada item
          for (const m of incState.material_usado) {
            const inv = (inventarioCache || []).find(x => x.id === m.item_id);
            if (!inv) continue;
            const nuevo = Math.max(0, (inv.stock || 0) - (m.cantidad || 0));
            try { await window.sb.from('inventario_puesto').update({ stock: nuevo }).eq('id', inv.rowId); } catch (_) {}
          }
        }
      }

      // Generar PDF y subir
      try {
        if (window.PSPdf && window.PSPdf.generarIncidencia) {
          const doc = await window.PSPdf.generarIncidencia(ins, { nombre: empleadoReal?.nombre, dni: empleadoReal?.dni, puesto_nombre: puestoReal?.nombre });
          const blob = doc.output('blob');
          const path = `incidencias/${ins.id}.pdf`;
          const url = await window.PSStorage.subir(path, blob, 'application/pdf');
          await window.sb.from('incidencias').update({ archivo_pdf_url: url }).eq('id', ins.id);
        }
      } catch (pdfErr) { console.warn('[incidencia] PDF falló:', pdfErr.message); }

      // Recargar botiquín para reflejar stock bajado
      await cargarInventarioBD();
      renderInventario && renderInventario();

      toast(`✓ Parte ${ins.numero_parte || ''} enviado al coordinador`);
      cerrarNuevaIncidencia();
    } catch (err) {
      console.error('[incidencia] Error al enviar:', err);
      // Mensajes comunes traducidos a algo entendible por el socorrista
      let msg = err.message || String(err);
      if (/relation.*incidencias.*does not exist/i.test(msg)) {
        msg = 'La tabla de incidencias no existe en la BD.\n\nEl coordinador debe ejecutar el SQL sql/06-incidencias.sql en Supabase antes de que puedas enviar partes.';
      } else if (/row-level security|violates.*policy/i.test(msg)) {
        msg = 'No tienes permisos para guardar este parte.\n\nAvisa al coordinador para que revise las políticas RLS de la tabla incidencias.';
      } else if (/column.*does not exist/i.test(msg)) {
        msg = 'La tabla de incidencias está incompleta:\n\n' + err.message + '\n\nEl coordinador debe volver a ejecutar sql/06-incidencias.sql.';
      }
      alert('No se pudo enviar el parte.\n\n' + msg + '\n\nTus datos siguen escritos: vuelve a intentarlo o cierra y avisa.');
      btn.disabled = false; btn.textContent = '✓ Enviar parte';
    }
  }

  /* ---------- Logout (real: cierra sesión en Supabase) ---------- */
  window.logout = function () {
    if (window.logoutReal) return window.logoutReal();
    PS.clearSession();
    window.location.href = 'index.html';
  };
  document.getElementById('logoutBtn').addEventListener('click', logout);
})();
