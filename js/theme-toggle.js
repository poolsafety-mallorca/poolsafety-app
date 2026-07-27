/* ==========================================================================
   PoolSafety · Tema de marca (rojo) — aplicado por defecto
   ========================================================================== */

(function () {
  // Aplica tema rojo síncronamente antes de que se pinte la página
  document.documentElement.classList.add('theme-red');
  try { localStorage.setItem('ps-theme', 'red'); } catch (e) {}
})();
