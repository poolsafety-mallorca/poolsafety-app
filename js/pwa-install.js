/* ==========================================================================
   PoolSafety · PWA install prompt + service worker registration
   ========================================================================== */

let deferredPrompt = null;

/* Registrar service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[SW]', err.message));
  });
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
