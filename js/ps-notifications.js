/* ==========================================================================
   PoolSafety · Push local (Notification API + Realtime)
   ==========================================================================
   Uso:
     PSNotif.init()                          → asegura permiso guardado
     PSNotif.pedirPermiso()                  → prompt navegador
     PSNotif.notify(titulo, opciones)        → dispara notificación si procede
     PSNotif.enabled()                       → true si permiso 'granted'
     PSNotif.suscribirCoordinador()          → engancha Realtime alertas+fichajes
   ========================================================================== */

(function () {
  const LS_KEY = 'ps_notif_enabled';
  const LS_LAST_SEEN = 'ps_notif_last_seen';
  // Anti-spam: no notificar dos veces el mismo id en la misma sesión
  const notifiedIds = new Set();

  const soporta = () => typeof window !== 'undefined' && 'Notification' in window;

  function permiso() {
    return soporta() ? Notification.permission : 'denied';
  }

  function habilitado() {
    if (!soporta()) return false;
    if (Notification.permission !== 'granted') return false;
    return localStorage.getItem(LS_KEY) !== '0';
  }

  async function pedirPermiso() {
    if (!soporta()) {
      alert('Este navegador no soporta notificaciones. En iPhone añade la app a pantalla de inicio primero.');
      return false;
    }
    if (Notification.permission === 'granted') {
      localStorage.setItem(LS_KEY, '1');
      return true;
    }
    if (Notification.permission === 'denied') {
      alert('Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del navegador (icono candado junto a la URL → Notificaciones).');
      return false;
    }
    try {
      const p = await Notification.requestPermission();
      const ok = p === 'granted';
      localStorage.setItem(LS_KEY, ok ? '1' : '0');
      if (ok) {
        // Notificación bienvenida para confirmar
        notify('Avisos activados', {
          body: 'Te avisaremos cuando entre una alerta nueva o alguien fiche.',
          tag: 'ps-welcome'
        });
      }
      return ok;
    } catch (err) {
      console.warn('[PSNotif] pedirPermiso', err);
      return false;
    }
  }

  function silenciar() {
    localStorage.setItem(LS_KEY, '0');
  }

  // Pequeño beep sintético — reproduce solo si el navegador lo permite tras la primera interacción del usuario
  let __audioCtx = null;
  function beepCorto(volumen) {
    try {
      if (!__audioCtx) __audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = __audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = Math.min(0.15, Math.max(0.02, volumen || 0.08));
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(() => { try { o.stop(); } catch (_) {} }, 160);
      // Segundo tono más agudo para el "ding-ding"
      setTimeout(() => {
        try {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.type = 'sine';
          o2.frequency.value = 1200;
          g2.gain.value = Math.min(0.12, (volumen || 0.08) * 0.9);
          o2.connect(g2); g2.connect(ctx.destination);
          o2.start();
          setTimeout(() => { try { o2.stop(); } catch (_) {} }, 160);
        } catch (_) {}
      }, 180);
    } catch (_) { /* silencioso si no hay audio */ }
  }

  // Toast in-app grande (parte superior) para cuando la app está VISIBLE
  // y no puede saltar la notificación nativa del SO.
  function toastInApp(titulo, body, url) {
    try {
      let cont = document.getElementById('__psnotif_toast');
      if (!cont) {
        cont = document.createElement('div');
        cont.id = '__psnotif_toast';
        cont.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;flex-direction:column;gap:8px;max-width:calc(100vw - 24px);width:380px;';
        document.body.appendChild(cont);
      }
      const t = document.createElement('div');
      t.style.cssText = 'background:#111827;color:#fff;border-left:4px solid #B91C1C;border-radius:10px;padding:12px 14px;box-shadow:0 12px 30px rgba(0,0,0,.35);cursor:pointer;animation:psSlideDown .25s ease;';
      t.innerHTML = `<div style="font-weight:800;font-size:13.5px;">${titulo}</div>${body ? `<div style="font-size:12.5px;opacity:.85;margin-top:2px;">${body}</div>` : ''}<div style="font-size:10.5px;opacity:.55;margin-top:4px;letter-spacing:.5px;">Pulsa para ver · se cierra en 8s</div>`;
      t.onclick = () => {
        if (url && url !== '#') location.hash = url;
        t.remove();
      };
      cont.prepend(t);
      setTimeout(() => t.remove(), 8000);
      // Añadir keyframes una sola vez
      if (!document.getElementById('__psnotif_kf')) {
        const s = document.createElement('style');
        s.id = '__psnotif_kf';
        s.textContent = '@keyframes psSlideDown{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(s);
      }
    } catch (_) {}
  }

  function notify(titulo, opciones) {
    if (!habilitado()) return null;
    const opts = opciones || {};
    const visible = document.visibilityState === 'visible';

    // Siempre: pitido y toast in-app (para que el coord se entere aunque la app
    // esté abierta en primer plano — el Notification API nativo NO dispara si
    // la app está visible).
    if (!opts.silent) beepCorto();
    toastInApp(titulo, opts.body || '', opts.url);

    // Notificación nativa del SO — solo si la app NO está visible o si se fuerza
    if (visible && !opts.forceVisible) return null;
    try {
      const nOpts = Object.assign({
        icon: '/assets/logo-blanco.png',
        badge: '/assets/logo-blanco.png',
        vibrate: [180, 90, 180],
        renotify: true,
        requireInteraction: false,
        silent: false
      }, opts);
      const n = new Notification(titulo, nOpts);
      if (nOpts.url) {
        n.onclick = () => {
          window.focus();
          if (nOpts.url && nOpts.url !== '#') location.hash = nOpts.url;
          n.close();
        };
      }
      return n;
    } catch (err) {
      console.warn('[PSNotif] notify', err);
      return null;
    }
  }

  function init() {
    // Si el usuario ya dio permiso en una sesión previa, marcamos habilitado por defecto
    if (soporta() && Notification.permission === 'granted' && localStorage.getItem(LS_KEY) === null) {
      localStorage.setItem(LS_KEY, '1');
    }
  }

  /* -------------------- Suscripción realtime para el coord --------------------
     Se llama desde coordinador.js una vez tenemos sb. Suscribe a INSERT en
     alertas (nuevas) y en fichajes (entradas), y notifica.
     Filtra duplicados por id y evita notificar al arranque (usa marca de tiempo).
  --------------------------------------------------------------------------- */
  function suscribirCoordinador({ empresaId } = {}) {
    if (!window.sb) return;
    // Marca de tiempo al inicio: solo notifica lo NUEVO tras cargar la app.
    // Evita bombardear con el histórico de alertas al abrir la pestaña por primera vez.
    const arrancoEn = Date.now();

    try {
      window.sb.channel('ps-notif-alertas')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas' }, async (payload) => {
          const a = payload.new;
          if (!a || notifiedIds.has('a-' + a.id)) return;
          notifiedIds.add('a-' + a.id);
          const created = a.fecha_creacion ? Date.parse(a.fecha_creacion) : Date.now();
          if (created < arrancoEn - 60_000) return; // más de 1 min anterior → histórico, ignorar
          if (a.resuelto) return;
          // Enriquecer con puesto/empleado (opcional, si tira lento vamos sin)
          let puestoNombre = '';
          let empleadoNombre = '';
          try {
            if (a.puesto_id) {
              const { data: p } = await window.sb.from('puestos').select('nombre').eq('id', a.puesto_id).single();
              if (p) puestoNombre = p.nombre;
            }
            if (a.empleado_id) {
              const { data: e } = await window.sb.from('empleados').select('nombre').eq('id', a.empleado_id).single();
              if (e) empleadoNombre = e.nombre;
            }
          } catch (_) { /* seguimos sin nombres */ }
          const critEmoji = a.criticidad === 'alta' ? '🔴' : a.criticidad === 'media' ? '🟠' : '🔵';
          const titulo = a.tipo === 'otro' ? `💬 Mensaje de ${empleadoNombre || 'un socorrista'}`
                       : a.tipo === 'manual' ? `${critEmoji} Falta material` + (puestoNombre ? ' · ' + puestoNombre : '')
                       : `${critEmoji} Alerta de botiquín` + (puestoNombre ? ' · ' + puestoNombre : '');
          const body = a.mensaje || `${empleadoNombre || 'Alguien'} ha reportado algo`;
          notify(titulo, { body, tag: 'alerta-' + a.id, url: '#alertas' });
        })
        .subscribe();
    } catch (err) { console.warn('[PSNotif] suscripción alertas falló', err); }

    try {
      window.sb.channel('ps-notif-fichajes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fichajes' }, async (payload) => {
          const f = payload.new;
          if (!f || notifiedIds.has('f-' + f.id)) return;
          notifiedIds.add('f-' + f.id);
          const created = f.hora ? Date.parse(f.hora) : Date.now();
          if (created < arrancoEn - 60_000) return;
          // Solo notificamos entradas fuera de zona, o cualquier entrada si se quiere
          // Por defecto: entrada + fuera_de_zona (aviso rojo), o entrada normal (aviso azul)
          let empleadoNombre = '';
          let puestoNombre = '';
          try {
            if (f.empleado_id) {
              const { data: e } = await window.sb.from('empleados').select('nombre').eq('id', f.empleado_id).single();
              if (e) empleadoNombre = e.nombre;
            }
            if (f.puesto_id) {
              const { data: p } = await window.sb.from('puestos').select('nombre').eq('id', f.puesto_id).single();
              if (p) puestoNombre = p.nombre;
            }
          } catch (_) {}
          if (f.tipo === 'entrada') {
            if (f.fuera_de_zona) {
              notify(`⚠️ Fichaje fuera de zona`, {
                body: `${empleadoNombre || 'Socorrista'} fichó en ${puestoNombre || 'un puesto'} a ${(f.distancia_m || 0).toFixed(0)}m del perímetro.`,
                tag: 'fichaje-' + f.id,
                url: '#general'
              });
            } else if (f.origen_manual) {
              // fichaje manual creado por el propio coord — no notificar
            } else {
              notify(`✅ ${empleadoNombre || 'Fichaje'} entró`, {
                body: puestoNombre ? `Puesto: ${puestoNombre}` : 'Entrada registrada',
                tag: 'fichaje-' + f.id,
                url: '#general',
                silent: true // más discreto, es lo normal
              });
            }
          }
        })
        .subscribe();
    } catch (err) { console.warn('[PSNotif] suscripción fichajes falló', err); }
  }

  window.PSNotif = { init, pedirPermiso, silenciar, notify, enabled: habilitado, permiso, soporta, suscribirCoordinador };
  init();
})();
