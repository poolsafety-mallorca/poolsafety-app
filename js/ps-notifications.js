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

  function notify(titulo, opciones) {
    if (!habilitado()) return null;
    // Si la pestaña está visible y NO se ha forzado, no molestamos
    if (!opciones?.forceVisible && document.visibilityState === 'visible') return null;
    try {
      const opts = Object.assign({
        icon: '/assets/logo-blanco.png',
        badge: '/assets/logo-blanco.png',
        vibrate: [180, 90, 180],
        renotify: true,
        requireInteraction: false,
        silent: false
      }, opciones || {});
      const n = new Notification(titulo, opts);
      if (opts.url) {
        n.onclick = () => {
          window.focus();
          if (opts.url && opts.url !== '#') {
            location.hash = opts.url;
          }
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
