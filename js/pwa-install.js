/* ==========================================================================
   PoolSafety · PWA install prompt + service worker registration
   ========================================================================== */

let deferredPrompt = null;

/* Registrar service worker + auto-update
   Cuando el server tiene una nueva versión del SW:
   1. registration.update() la detecta (llamado al cargar + cada 60s + al enfocar la pestaña).
   2. updatefound → cuando el nuevo SW pasa a 'installed' con controller existente = hay update lista.
   3. Mostramos banner "Nueva versión" con botón Actualizar; auto-recarga a los 12s si el
      usuario no está tocando ningún input/textarea/canvas (para no interrumpir firma o formulario).
*/
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // updateViaCache:'none' fuerza al navegador a NO cachear el propio sw.js
      // (por si algún proxy/CDN ignora el Cache-Control del _headers)
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });

      // Chequeos periódicos de actualización
      const check = () => reg.update().catch(() => {});
      setInterval(check, 60_000); // cada 60s
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });

      // Detecta un nuevo SW instalándose
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay nueva versión lista Y ya había SW previo → mostrar banner
            mostrarBannerUpdate(nuevo);
          }
        });
      });

      // Cuando el SW toma control (post-skipWaiting) → recargar
      let recargando = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recargando) return;
        recargando = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn('[SW]', err.message);
    }
  });
}

function usuarioEstaEscribiendo() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable) return true;
  // Canvas activo (firma)
  if (tag === 'canvas') return true;
  return false;
}

function mostrarBannerUpdate(nuevoSW) {
  if (document.getElementById('pwaUpdateBanner')) return; // ya mostrado
  const banner = document.createElement('div');
  banner.id = 'pwaUpdateBanner';
  banner.className = 'pwa-update-banner';
  banner.innerHTML = `
    <div class="pwa-update-icon">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15A9 9 0 1 1 5.64 5.64L23 10"></path>
      </svg>
    </div>
    <div class="pwa-update-text">
      <div class="pwa-update-title">Nueva versión disponible</div>
      <div class="pwa-update-sub" id="pwaUpdateSub">Se actualizará en <span id="pwaUpdateCount">12</span>s</div>
    </div>
    <button class="pwa-update-btn" id="pwaUpdateNow">Actualizar</button>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));

  const aplicar = () => {
    try { nuevoSW.postMessage({ type: 'SKIP_WAITING' }); }
    catch (_) {}
    // Fallback: si no responde, forzar recarga a los 2s
    setTimeout(() => window.location.reload(), 2000);
  };

  document.getElementById('pwaUpdateNow').addEventListener('click', aplicar);

  // Cuenta atrás con auto-reload solo si el usuario no está escribiendo
  let seg = 12;
  const countEl = document.getElementById('pwaUpdateCount');
  const subEl = document.getElementById('pwaUpdateSub');
  const tick = setInterval(() => {
    if (usuarioEstaEscribiendo()) {
      subEl.textContent = 'Actualiza cuando termines';
      return;
    }
    seg--;
    if (countEl) countEl.textContent = seg;
    if (seg <= 0) {
      clearInterval(tick);
      aplicar();
    }
  }, 1000);
}

/* Detectar prompt de instalación (Chrome/Edge/Android) */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(mostrarInstallModal, 1500);
});

/* Detectar si ya está instalada */
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  ocultarInstallModal();
  localStorage.setItem('pwa-installed', '1');
});

function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function esAndroid() {
  return /Android/.test(navigator.userAgent);
}
function esStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}
function fueDescartadoRecientemente() {
  const t = localStorage.getItem('pwa-install-dismissed');
  if (!t) return false;
  // Volver a mostrar tras 7 días
  return (Date.now() - parseInt(t)) < 7 * 24 * 60 * 60 * 1000;
}

function crearInstallModal() {
  if (document.getElementById('pwaInstallModal')) return;
  const modal = document.createElement('div');
  modal.id = 'pwaInstallModal';
  modal.className = 'pwa-install-modal';
  modal.innerHTML = `
    <div class="pwa-install-content">
      <button class="pwa-install-close" onclick="dismissPwaInstall()" aria-label="Cerrar">×</button>
      <div class="pwa-install-icon">
        <img src="assets/logo-blanco.png" alt="PoolSafety" />
      </div>
      <h3 class="pwa-install-title">Instala PoolSafety</h3>
      <p class="pwa-install-desc" id="pwaInstallDesc">Accede desde tu pantalla de inicio como una app nativa. Funciona sin conexión.</p>
      <div id="pwaInstallActions" class="pwa-install-actions"></div>
    </div>
  `;
  document.body.appendChild(modal);
}

function mostrarInstallModal() {
  if (esStandalone()) return;
  if (localStorage.getItem('pwa-installed')) return;
  if (fueDescartadoRecientemente()) return;

  crearInstallModal();
  const desc = document.getElementById('pwaInstallDesc');
  const actions = document.getElementById('pwaInstallActions');

  if (esIOS()) {
    desc.innerHTML = 'Para instalarla en tu iPhone / iPad:';
    actions.innerHTML = `
      <ol class="pwa-ios-steps">
        <li>Pulsa el botón <b>Compartir</b> <span class="ios-share">⬆️</span> abajo en Safari</li>
        <li>Desliza y elige <b>"Añadir a pantalla de inicio"</b></li>
        <li>Confirma pulsando <b>"Añadir"</b> arriba a la derecha</li>
      </ol>
      <button class="btn btn-outline btn-block" onclick="dismissPwaInstall()">Entendido</button>
    `;
  } else if (deferredPrompt) {
    desc.textContent = 'Instálala como app en tu dispositivo para acceso rápido y notificaciones.';
    actions.innerHTML = `
      <button class="btn btn-primary btn-block" onclick="lanzarInstallPrompt()">
        <svg class="ic ic-16"><use href="#ic-download"/></svg>
        Instalar app
      </button>
      <button class="btn btn-outline btn-block" onclick="dismissPwaInstall()" style="margin-top:8px;">
        Ahora no
      </button>
    `;
  } else if (esAndroid()) {
    desc.innerHTML = 'Para instalarla en tu Android:';
    actions.innerHTML = `
      <ol class="pwa-ios-steps">
        <li>Pulsa el menú <b>⋮</b> (arriba a la derecha de Chrome)</li>
        <li>Elige <b>"Instalar app"</b> o <b>"Añadir a pantalla de inicio"</b></li>
        <li>Confirma con <b>"Instalar"</b></li>
      </ol>
      <button class="btn btn-outline btn-block" onclick="dismissPwaInstall()">Entendido</button>
    `;
  } else {
    return; // desktop sin prompt: no mostrar
  }

  requestAnimationFrame(() => document.getElementById('pwaInstallModal').classList.add('show'));
}

function ocultarInstallModal() {
  const m = document.getElementById('pwaInstallModal');
  if (m) m.classList.remove('show');
}

window.lanzarInstallPrompt = async function () {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try {
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') localStorage.setItem('pwa-installed', '1');
  } catch (e) {}
  deferredPrompt = null;
  ocultarInstallModal();
};

window.dismissPwaInstall = function () {
  localStorage.setItem('pwa-install-dismissed', Date.now());
  ocultarInstallModal();
};

/* En iOS mostramos el modal automáticamente porque no hay beforeinstallprompt */
window.addEventListener('load', () => {
  if (esIOS() && !esStandalone()) {
    setTimeout(mostrarInstallModal, 4000);
  }
});
