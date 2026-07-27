/* ==========================================================================
   PoolSafety · Toggle de tema (azul actual ↔ rojo marca cliente)
   Aplica tema muy pronto para evitar flash + inyecta botón flotante
   ========================================================================== */

(function () {
  // 1. SÍNCRONO: aplica tema guardado ANTES de que se pinte la página
  try {
    if (localStorage.getItem('ps-theme') === 'red') {
      document.documentElement.classList.add('theme-red');
    }
  } catch (e) {}

  // 2. Inyecta botón flotante
  function crearToggle() {
    if (document.getElementById('themeToggleBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Cambiar tema');
    btn.innerHTML = `<span>🎨</span><span class="theme-toggle-label" id="themeToggleLabel"></span>`;
    btn.addEventListener('click', toggleTheme);
    document.body.appendChild(btn);
    actualizarLabel();
  }

  function actualizarLabel() {
    const label = document.getElementById('themeToggleLabel');
    if (!label) return;
    const esRojo = document.documentElement.classList.contains('theme-red');
    label.textContent = esRojo ? 'Cambiar a azul' : 'Cambiar a rojo (marca)';
  }

  function toggleTheme() {
    const html = document.documentElement;
    const nuevo = html.classList.contains('theme-red') ? 'blue' : 'red';
    if (nuevo === 'red') html.classList.add('theme-red');
    else html.classList.remove('theme-red');
    localStorage.setItem('ps-theme', nuevo);
    actualizarLabel();
    // Feedback visual pequeño
    const t = document.getElementById('toast');
    if (t) {
      const tt = document.getElementById('toastText');
      if (tt) tt.textContent = nuevo === 'red' ? '🔴 Tema rojo (marca cliente) activo' : '🔵 Tema azul original activo';
      t.classList.add('show');
      clearTimeout(window.__themeToast);
      window.__themeToast = setTimeout(() => t.classList.remove('show'), 2200);
    }
  }

  window.psToggleTheme = toggleTheme;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', crearToggle);
  } else {
    crearToggle();
  }
})();
