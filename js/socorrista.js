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

  const state = PS.getSocorristaState();
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

  async function obtenerGPS() {
    return new Promise((resolve, reject) => {
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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  function distanciaMetros(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  }

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

  async function insertarFichaje(tipo) {
    if (!empleadoReal) throw new Error('No tienes ficha de empleado (contacta con el coordinador)');
    const gps = await obtenerGPS();
    ultimaPosicion = gps;
    let distanciaM = null, gpsOk = null, fueraDeZona = false;
    if (puestoReal && puestoReal.gps_lat && puestoReal.gps_lng) {
      distanciaM = distanciaMetros(gps.lat, gps.lng, +puestoReal.gps_lat, +puestoReal.gps_lng);
      const radio = puestoReal.gps_radio_m || 50;
      gpsOk = distanciaM <= radio;
      fueraDeZona = !gpsOk;
    }
    const { error } = await window.sb.from('fichajes').insert({
      empleado_id: empleadoReal.id,
      puesto_id: empleadoReal.puesto_id,
      tipo,
      hora: new Date().toISOString(),
      gps_lat: gps.lat,
      gps_lng: gps.lng,
      gps_ok: gpsOk,
      fuera_de_zona: fueraDeZona,
      distancia_m: distanciaM
    });
    if (error) throw error;
    return { gps, distanciaM, fueraDeZona };
  }

  async function doPunchIn() {
    const btn = document.getElementById('punchInBtn');
    btn.innerHTML = `<svg class="ic ic-18"><use href="#ic-signal"/></svg> Obteniendo GPS…`;
    btn.disabled = true;
    try {
      const r = await insertarFichaje('entrada');
      state.fichado = true;
      state.horaEntrada = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      PS.setSocorristaState(state);
      renderPunch();
      if (r.fueraDeZona) {
        toast(`⚠️ Entrada FUERA de zona (${r.distanciaM}m del puesto). Registrada con aviso al coordinador.`);
      } else {
        toast(`✓ Entrada registrada · ${r.distanciaM != null ? r.distanciaM + 'm del puesto' : 'GPS OK'}`);
      }
      actualizarGpsChip(r.fueraDeZona ? 'warn' : 'ok',
        r.fueraDeZona ? `Fichaje fuera de zona` : 'Dentro del área del puesto',
        r.distanciaM != null ? `${r.distanciaM}m del puesto · precisión ±${Math.round(r.gps.accuracy)}m` : `Precisión ±${Math.round(r.gps.accuracy)}m`);
    } catch (err) {
      toast('Error: ' + err.message);
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
      state.horaSalida = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      state.fichado = false;
      PS.setSocorristaState(state);
      renderPunch();
      toast(`✓ Salida registrada · ¡Buen trabajo!${r.fueraDeZona ? ' (fuera de zona)' : ''}`);
    } catch (err) {
      toast('Error: ' + err.message);
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic ic-18"><use href="#ic-stop"/></svg> Fichar salida'; }
    }
  }

  async function cargarFichajesHoyDeBd() {
    if (!empleadoReal || !window.sb) return;
    const hoy = new Date().toISOString().slice(0,10);
    try {
      const { data, error } = await window.sb.from('fichajes')
        .select('*')
        .eq('empleado_id', empleadoReal.id)
        .gte('hora', hoy + 'T00:00:00')
        .order('hora', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        const ult = data[data.length - 1];
        if (ult.tipo === 'entrada') {
          state.fichado = true;
          state.horaEntrada = new Date(ult.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          state.horaSalida = null;
        } else if (ult.tipo === 'salida') {
          state.fichado = false;
          const ultEntrada = data.filter(f => f.tipo === 'entrada').pop();
          state.horaEntrada = ultEntrada ? new Date(ultEntrada.hora).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'}) : null;
          state.horaSalida = new Date(ult.hora).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'});
        }
        PS.setSocorristaState(state);
        renderPunch();
      }
    } catch (err) { console.warn('[Fichajes]', err.message); }
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
      // 1. Insertar firma del finiquito
      const { error: fErr } = await window.sb.from('firmas_documentos').insert({
        empleado_id: empId,
        documento_codigo: 'finiquito-' + new Date().toISOString().slice(0,10),
        firma_nombre: nombre,
        dni,
        dispositivo: 'móvil empleado · finiquito',
        firma_imagen: firmaImagen,
        ubicacion_lat: ultimaPosicion?.lat || null,
        ubicacion_lng: ultimaPosicion?.lng || null
      });
      if (fErr) throw fErr;

      // 2. Pasar empleado a BAJA (no 'finiquitado' — así se puede reactivar el año siguiente)
      await window.sb.from('empleados').update({
        estado: 'baja',
        fecha_baja: new Date().toISOString().slice(0,10)
      }).eq('id', empId);

      // 3. Desactivar usuario para cortar login
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
  async function renderTareas() {
    if (!tareasList) return;
    try {
      const empId = empleadoReal?.id;
      if (!empId || !window.sb) {
        tareasList.innerHTML = '<div class="text-muted small" style="padding:14px;text-align:center;">Sin tareas pendientes</div>';
        if (tareasProgress) tareasProgress.textContent = '';
        return;
      }
      const { data } = await window.sb.from('tareas')
        .select('id, titulo, descripcion, prioridad, fecha, hecha')
        .eq('empleado_id', empId).order('fecha', { ascending: true });
      const rows = data || [];
      if (rows.length === 0) {
        tareasList.innerHTML = '<div class="text-muted small" style="padding:14px;text-align:center;">Sin tareas del coordinador</div>';
        if (tareasProgress) tareasProgress.textContent = '';
        return;
      }
      const doneCount = rows.filter(t => t.hecha).length;
      if (tareasProgress) tareasProgress.textContent = `${doneCount} de ${rows.length} completadas`;
      tareasList.innerHTML = rows.map(t => {
        const done = t.hecha;
        const prBadge = t.prioridad === 'alta' ? 'badge-danger'
                      : t.prioridad === 'media' ? 'badge-warn' : 'badge-info';
        return `
          <div class="li ${done ? 'done' : ''}" data-task="${t.id}">
            <div class="check ${done ? 'done' : ''}">${done ? `<svg class="ic ic-14"><use href="#ic-check"/></svg>` : ''}</div>
            <div class="li-body">
              <div class="li-title">${t.titulo}</div>
              <div class="li-sub">${t.descripcion || ''}</div>
              <div class="row gap-1 mt-2">
                <span class="badge ${prBadge}"><span class="dot"></span>${t.prioridad || 'baja'}</span>
                ${t.fecha ? `<span class="badge badge-neutral"><svg class="ic ic-14"><use href="#ic-calendar"/></svg>${new Date(t.fecha).toLocaleDateString('es-ES')}</span>` : ''}
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

    // Comprobación botiquín: cuántos items del puesto están revisados HOY
    if (puestoId) {
      try {
        const desdeHoy = new Date();
        desdeHoy.setHours(0, 0, 0, 0);
        const { data } = await window.sb.from('inventario_puesto')
          .select('id, revisado_hoy, ultima_revision')
          .eq('puesto_id', puestoId);
        botiquinTotal = (data || []).length;
        botiquinRevHoy = (data || []).filter(r =>
          r.revisado_hoy && r.ultima_revision && new Date(r.ultima_revision) >= desdeHoy
        ).length;
      } catch (_) {}
    }
    const botiquinPendiente = botiquinTotal > 0 && botiquinRevHoy < botiquinTotal;

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

    // Notice Botiquín (visible solo si aún queda material sin revisar HOY)
    const noticeBotiquin = document.getElementById('noticeBotiquin');
    if (noticeBotiquin) {
      if (botiquinPendiente) {
        noticeBotiquin.style.display = '';
        const btit = document.getElementById('noticeBotiquinTitle');
        const bsub = document.getElementById('noticeBotiquinSub');
        if (btit) btit.textContent = 'Revisar botiquín';
        if (bsub) bsub.textContent = `${botiquinRevHoy}/${botiquinTotal} revisados hoy · pulsa para completar`;
      } else {
        noticeBotiquin.style.display = 'none';
      }
    }

    // Notice Docs pendiente
    const noticeDocs = document.getElementById('noticeDocs');
    if (noticeDocs) noticeDocs.style.display = kitAltaPendiente ? '' : 'none';

    // "Todo al día" cuando no hay ninguna alerta
    const allOk = document.getElementById('noticeAllOk');
    const nadaPendiente = !kitAltaPendiente && tareasPend === 0 && !botiquinPendiente;
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
  async function cargarInventarioBD() {
    const puestoId = puestoReal?.id || empleadoReal?.puesto_id;
    if (!puestoId || !window.sb) return;
    try {
      const { data, error } = await window.sb.from('inventario_puesto')
        .select('id, stock, minimo, revisado_hoy, ultima_revision, caducidad, carga_bala, item_id, inventario_items(id, nombre, seccion, categoria, unidad, obligatorio, normativa)')
        .eq('puesto_id', puestoId);
      if (error) throw error;
      inventarioCache = (data || []).map(r => ({
        id: r.item_id,
        rowId: r.id,
        nombre: r.inventario_items?.nombre || 'Material',
        seccion: r.inventario_items?.seccion || 'botiquin',
        categoria: r.inventario_items?.categoria || '',
        unidad: r.inventario_items?.unidad || 'ud',
        obligatorio: !!r.inventario_items?.obligatorio,
        normativa: r.inventario_items?.normativa || '',
        stock: r.stock || 0,
        minimo: r.minimo || 1,
        revisadoHoy: !!r.revisado_hoy,
        caducidad: r.caducidad || null,
        cargaBala: r.carga_bala || null
      }));
    } catch (err) { console.warn('[Inventario BD]', err.message); }
  }

  function itemsPorSeccion(sec) {
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

    if (items.length === 0) {
      inventarioList.innerHTML = `<div class="alert-strip warn"><svg class="ic ic-16"><use href="#ic-alert"/></svg>No hay material configurado en esta sección para tu puesto.</div>`;
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
    const allDone = revCount === totalCount;

    inventarioList.innerHTML = itemsHTML + `
      <div class="card" style="margin-top:16px;padding:14px;background:${allDone?'#ecfdf5':'#f8fafc'};border:2px solid ${allDone?'#10b981':'#cbd5e1'};">
        <div class="row between" style="align-items:center;">
          <div>
            <div style="font-weight:700;font-size:15px;">${revCount} de ${totalCount} revisados</div>
            <div class="small text-muted">Marca los ticks conforme compruebes cada material</div>
          </div>
          <button class="btn ${allDone?'btn-outline':'btn-primary'} btn-lg" id="btnComprobarTodo" style="min-width:160px;">
            <svg class="ic ic-18"><use href="#${allDone?'ic-check-circle':'ic-check'}"/></svg>
            ${allDone ? '✓ Todo comprobado' : 'Marcar todo comprobado'}
          </button>
        </div>
      </div>
    `;

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

    // Botón "Marcar todo comprobado" — marca todos los items de la sección como revisados
    const btnAll = inventarioList.querySelector('#btnComprobarTodo');
    if (btnAll) {
      btnAll.addEventListener('click', async () => {
        if (allDone) { toast('Ya está todo comprobado ✓'); return; }
        btnAll.disabled = true;
        btnAll.innerHTML = '<svg class="ic ic-18"><use href="#ic-signal"/></svg> Guardando…';
        try {
          const rowIds = items.filter(it => !it.revisadoHoy).map(it => it.rowId);
          if (rowIds.length) {
            const { error } = await window.sb.from('inventario_puesto').update({
              revisado_hoy: true,
              ultima_revision: new Date().toISOString()
            }).in('id', rowIds);
            if (error) throw error;
          }
          items.forEach(it => { it.revisadoHoy = true; });
          toast(`✓ ${totalCount} artículos comprobados`);
          renderInventario();
          renderRevisionSummary();
        } catch (err) {
          toast('Error: ' + err.message);
          btnAll.disabled = false;
        }
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

  function renderDocsHeader() {
    try {
      const firmas = misFirmas();
      const kitOk = !!firmas['kit-alta'];
      const jornadaPend = (PS.documentos || []).filter(d => d.grupo === 'mensual' && !firmas[d.id]).length;
      const total = (kitOk ? 0 : 1) + jornadaPend;
      if (docsSummary) {
        docsSummary.textContent = total === 0
          ? `${me.nombre} · toda la documentación al día`
          : `${me.nombre} · ${total} documento${total>1?'s':''} pendiente${total>1?'s':''} de firmar`;
      }
      if (docsPendingDot) docsPendingDot.style.display = total > 0 ? 'inline-block' : 'none';
      if (docAltaBadge) docAltaBadge.textContent = kitOk ? 'Firmado' : 'Pendiente';
    } catch (err) {
      console.warn('[renderDocsHeader]', err);
      if (docsSummary) docsSummary.textContent = `${me.nombre || 'Empleado'}`;
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

    let horasReales = 0, diasTrabajados = 0;
    try {
      const { data: fichajes } = await window.sb.from('fichajes')
        .select('id, tipo, hora').eq('empleado_id', empId)
        .gte('hora', desde).lt('hora', hastaCorte).order('hora', { ascending: true });
      let totalMins = 0, entrada = null;
      (fichajes || []).forEach(f => {
        if (f.tipo === 'entrada') entrada = new Date(f.hora);
        else if (f.tipo === 'salida' && entrada) {
          totalMins += Math.max(0, (new Date(f.hora) - entrada) / 60000);
          entrada = null;
        }
      });
      horasReales = Math.round(totalMins / 60);
      diasTrabajados = new Set((fichajes || []).filter(f => f.tipo === 'entrada').map(f => new Date(f.hora).toDateString())).size;
    } catch (_) {}

    // Regla cliente: firmas 40h/sem (máx 160/mes); si trabajaste menos, firmas lo real.
    const OBJ_MES = 160;
    const horasFirmadas = Math.min(horasReales, OBJ_MES);
    const nombreMes = new Date(anio, mes, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    document.getElementById('docViewBody').innerHTML = `
      <div class="jornada-summary">
        <div class="jornada-row"><span>Mes</span><b>${nombreMes}</b></div>
        <div class="jornada-row"><span>Días trabajados</span><b>${diasTrabajados}</b></div>
        <div class="jornada-row"><span>Horas trabajadas hasta hoy</span><b>${horasReales}h</b></div>
        <div class="jornada-row total"><span>Firmas por</span><b>${horasFirmadas}h ordinarias</b></div>
        ${horasReales > OBJ_MES ? '<div class="jornada-note small">El exceso sobre 160h queda registrado para tu coordinador (horas complementarias).</div>' : ''}
      </div>
      <div class="field mt-3">
        <label>Nombre completo</label>
        <input type="text" id="jornada-firma" placeholder="${(empleadoReal?.nombre || me?.nombre || '').replace(/"/g,'&quot;')}" />
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
          campos_json: { horas_firmadas: horasFirmadas, horas_reales: horasReales, dias_trabajados: diasTrabajados, motivo }
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
          ${sub.esListaEpis ? `
            <div class="wizard-doc-h" style="margin-top:14px;">EPIs entregados (ajusta las cantidades si te dieron distinto)</div>
            <div class="wizard-epi-table-wrap">
              <table class="wizard-epi-table">
                <thead><tr><th>Equipo</th><th>Color</th><th>Modelo</th><th style="width:90px;">Unidades</th></tr></thead>
                <tbody>
                  ${(sub.epis || []).map(e => {
                    const cantGuardada = (wizardData.campos.epis && wizardData.campos.epis[e.id] != null) ? wizardData.campos.epis[e.id] : e.unidades;
                    return `<tr>
                      <td><b>${e.nombre}</b></td>
                      <td>${e.color}</td>
                      <td>${e.modelo}</td>
                      <td><input type="number" min="0" step="1" class="wiz-epi-input" data-epi="${e.id}" value="${cantGuardada}" style="width:70px;text-align:center;padding:4px 6px;border:1px solid var(--ink-300,#D1D5DB);border-radius:6px;" /></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>` : ''}
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
        requiereCampos: sub.requiereCampos,
        esListaEpis: sub.esListaEpis
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
              <input type="text" id="wiz-firma" placeholder="${(empleadoReal?.nombre || me?.nombre || '').replace(/"/g,'&quot;')}" />
            </div>
            <div class="field">
              <label>DNI</label>
              <input type="text" id="wiz-dni" placeholder="00000000A" />
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
    document.getElementById('docViewActions').innerHTML = `
      <button class="btn btn-outline" onclick="closeDocView()">Cerrar</button>
      ${firmaId ? `<button class="btn btn-primary" onclick="descargarMiKitAlta('${firmaId}')">
        <svg class="ic ic-16"><use href="#ic-download"/></svg> Descargar PDF firmado
      </button>` : ''}`;
    document.getElementById('docViewModal').classList.add('open');
  }

  window.descargarMiKitAlta = async function (firmaId) {
    if (!window.PSPdf || !window.sb) { toast('Sistema no disponible'); return; }
    toast('Generando PDF…');
    try {
      const { data: firma, error } = await window.sb.from('firmas_documentos').select('*').eq('id', firmaId).single();
      if (error) throw error;
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
    } catch (err) { toast('Error: ' + err.message); }
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
        <input type="text" id="jornada-firma" placeholder="${me.nombre}" />
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
      const rows = (data || []).filter(u => u.disponible !== false); // si viene false explicito no lo mostramos
      if (rows.length === 0) {
        cont.innerHTML = '<div class="li"><div class="li-body"><div class="li-title text-muted">Ningún coordinador disponible ahora mismo</div><div class="li-sub">Vuelve a intentarlo más tarde</div></div></div>';
        return;
      }
      // Botón general "Enviar mensaje a coordinador" arriba de la lista
      const btnMsg = `<button class="btn btn-primary btn-block" onclick="openMsgCoord()" style="margin-bottom:10px;">
        <svg class="ic ic-16"><use href="#ic-message"/></svg>
        Enviar mensaje al coordinador
      </button>`;
      cont.innerHTML = btnMsg + rows.map(u => {
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

  /* ---------- Logout (real: cierra sesión en Supabase) ---------- */
  window.logout = function () {
    if (window.logoutReal) return window.logoutReal();
    PS.clearSession();
    window.location.href = 'index.html';
  };
  document.getElementById('logoutBtn').addEventListener('click', logout);
})();
