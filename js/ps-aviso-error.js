/* ==========================================================================
   PoolSafety · Aviso visible cuando la app se rompe al cargar
   --------------------------------------------------------------------------
   POR QUÉ EXISTE
   El 2026-09-03 el panel del coordinador se quedó en "Cargando…" y sin lista
   de hoteles ni de empleados. La causa fue un único error de JavaScript al
   cargar `coordinador.js`: como todo el fichero es una sola función, ese error
   mató TODO lo que venía después — hoteles, empleados, el subtítulo y hasta el
   botón de salir. Y no se veía nada: ni un aviso, ni un mensaje. Adam tuvo que
   preguntar "¿qué está pasando?" mirando una pantalla que parecía normal.

   Esto no arregla los errores: hace que se VEAN. Si algo revienta al cargar,
   sale una franja roja arriba diciendo que la pantalla no ha cargado entera,
   con un botón para recargar. Mejor una pantalla que avisa que una que miente.
   ========================================================================== */
(function () {
  'use strict';

  var yaAvisado = false;

  function avisar(detalle) {
    if (yaAvisado) return;
    yaAvisado = true;
    // Si el error salta antes de que exista el <body>, se espera a que exista.
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { yaAvisado = false; avisar(detalle); });
      return;
    }
    var barra = document.createElement('div');
    barra.id = 'psAvisoError';
    barra.setAttribute('role', 'alert');
    barra.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
      'background:#7F1D1D', 'color:#fff', 'padding:calc(10px + env(safe-area-inset-top)) 14px 10px',
      'font:600 13.5px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      'box-shadow:0 2px 10px rgba(0,0,0,.35)', 'display:flex', 'gap:10px',
      'align-items:center', 'justify-content:space-between', 'flex-wrap:wrap'
    ].join(';');
    barra.innerHTML =
      '<span style="flex:1;min-width:200px;">Esta pantalla no ha cargado del todo. ' +
      'Puede que falten listas o botones. Recarga la página; si sigue igual, avisa.</span>' +
      '<span style="display:flex;gap:8px;">' +
      '<button type="button" id="psAvisoRecargar" style="background:#fff;color:#7F1D1D;border:0;border-radius:7px;padding:7px 12px;font-weight:700;cursor:pointer;">Recargar</button>' +
      '<button type="button" id="psAvisoCerrar" style="background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:7px;padding:7px 11px;font-weight:700;cursor:pointer;">✕</button>' +
      '</span>';
    document.body.appendChild(barra);
    document.getElementById('psAvisoRecargar').addEventListener('click', function () {
      window.location.reload();
    });
    document.getElementById('psAvisoCerrar').addEventListener('click', function () { barra.remove(); });
    // El detalle completo queda en la consola, para quien tenga que mirarlo.
    console.error('[PoolSafety] La página no cargó entera:', detalle);
  }

  window.addEventListener('error', function (e) {
    // Una imagen o un script de fuera que no carga NO rompe la app: eso no
    // merece asustar a nadie. Sólo interesan los errores de código.
    if (e && e.target && e.target !== window && e.target.tagName) return;
    avisar((e && e.message) || 'error desconocido');
  }, true);

  // A propósito NO se escucha 'unhandledrejection': la app hace muchas llamadas
  // a la red y una que se caiga (cobertura mala en la piscina, por ejemplo) no
  // es que la pantalla esté rota. Avisar de eso sería el cuento del lobo, y a
  // la tercera vez nadie miraría la franja roja.

  window.PSAvisoError = { avisar: avisar };
})();
